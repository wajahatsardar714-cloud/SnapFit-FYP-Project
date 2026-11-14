"""CatVTON try-on server for a GPU notebook (Kaggle / Colab).

Runs inside a clone of https://github.com/Zheng-Chong/CatVTON and exposes the
endpoints the SnapFit AI service calls (all need X-Token: <SNAPFIT_TRYON_TOKEN>):

    POST /tryon    multipart: person, garment, mask (+ steps, guidance, seed)
                   returns:   image/jpeg, 768x1024
    POST /parse    multipart: image
                   returns:   image/png, one ATR clothes label id per pixel
    POST /inpaint  multipart: image, mask (+ prompt, negative_prompt, steps,
                   guidance, seed); returns image/jpeg, same size as the input

The clothing mask comes from SnapFit (built from its MediaPipe pose, widened
with /parse so old long sleeves or a long kameez are covered too), so
CatVTON's AutoMasker -- and its heavy DensePose/detectron2 dependency -- is
not needed. Setup steps: gpu/README.md.
"""

import glob
import io
import json
import os
import threading

import torch
from diffusers import StableDiffusionInpaintPipeline
from diffusers.image_processor import VaeImageProcessor
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from PIL import Image
from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

from model.pipeline import CatVTONPipeline
from utils import resize_and_crop, resize_and_padding

WIDTH, HEIGHT = 768, 1024
# The original runwayml repo was taken down; this is the official mirror.
BASE_MODEL = "stable-diffusion-v1-5/stable-diffusion-inpainting"
TRYON_WEIGHTS = "zhengchong/CatVTON"
# SegFormer-B2 fine-tuned on ATR for clothes parsing (MIT licence). Label ids:
#   0 Background, 1 Hat, 2 Hair, 3 Sunglasses, 4 Upper-clothes, 5 Skirt,
#   6 Pants, 7 Dress, 8 Belt, 9 Left-shoe, 10 Right-shoe, 11 Face,
#   12 Left-leg, 13 Right-leg, 14 Left-arm, 15 Right-arm, 16 Bag, 17 Scarf
BASE_SEGMENT_MODEL = "mattmdjaga/segformer_b2_clothes"
FEATURES = ["tryon", "parse", "inpaint"]
TOKEN = os.environ["SNAPFIT_TRYON_TOKEN"]


def _segment_model():
    """(model path or repo id, name for /health). SnapFit's fine-tuned parser
    (Western + shalwar kameez, gpu/finetune/) when its training notebook's
    output is attached (Add Input -> Your Work) and passed its quality gate;
    otherwise the base model. SNAPFIT_SEGMENT_MODEL overrides both."""
    override = os.environ.get("SNAPFIT_SEGMENT_MODEL", "").strip()
    if override:
        return override, "override"
    for model_dir in sorted(glob.glob("/kaggle/input/**/segformer-snapfit", recursive=True)):
        metrics = os.path.join(os.path.dirname(model_dir), "report", "metrics.json")
        try:
            with open(metrics) as f:
                recommended = json.load(f).get("recommended") is True
        except (OSError, ValueError):
            recommended = False
        if recommended:
            return model_dir, "snapfit-finetuned"
        print(f"Fine-tuned parser at {model_dir} did not pass its quality gate; using the base model")
    return BASE_SEGMENT_MODEL, "base"


SEGMENT_MODEL, PARSER = _segment_model()
print(f"Clothes parser: {PARSER} ({SEGMENT_MODEL})")

pipeline = CatVTONPipeline(
    base_ckpt=BASE_MODEL,
    attn_ckpt=snapshot_download(repo_id=TRYON_WEIGHTS),
    attn_ckpt_version="mix",
    weight_dtype=torch.float16,  # T4/P100 have no bf16
    use_tf32=True,
    device="cuda",
)
# CatVTON's UNet has its cross-attention replaced (it looks at the garment,
# not at text), so text-guided repainting needs the plain SD inpainting
# pipeline. Same base repo, so the UNet files are already in the cache.
# No safety checker: the inputs are shoppers' own full-body photos with only
# the clothing area masked, and a false positive would return a black image.
# No attention slicing: PyTorch 2's built-in attention is already
# memory-efficient, and slicing would swap it for a slower path.
inpaint_pipeline = StableDiffusionInpaintPipeline.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.float16,
    safety_checker=None,
    requires_safety_checker=False,
).to("cuda")
# The parser is small (~27M parameters), so it stays in fp32 for simplicity.
segment_processor = SegformerImageProcessor.from_pretrained(SEGMENT_MODEL)
segment_model = AutoModelForSemanticSegmentation.from_pretrained(SEGMENT_MODEL).to("cuda").eval()
mask_processor = VaeImageProcessor(vae_scale_factor=8, do_normalize=False, do_binarize=True, do_convert_grayscale=True)
# One generation at a time: the GPU has room for a single 768x1024 run.
gpu_lock = threading.Lock()
# Steps for the start-up warm-up run: enough to load the CUDA kernels and
# allocate memory at full size, so the first shopper doesn't pay for it.
WARM_UP_STEPS = 2


def _parse(image):
    inputs = segment_processor(images=image, return_tensors="pt").to("cuda")
    logits = segment_model(**inputs).logits  # (1, 18, h/4, w/4) at the processor's 512x512
    # Back to the input's own size, so every pixel of the photo gets a label.
    logits = torch.nn.functional.interpolate(logits, size=(image.height, image.width), mode="bilinear", align_corners=False)
    labels = logits.argmax(dim=1)[0].to(torch.uint8).cpu().numpy()
    return Image.fromarray(labels)  # 2-D uint8 -> 8-bit single-channel ("L")


def _inpaint(image, mask, prompt, negative_prompt, steps, guidance, seed):
    # SD works in 8x smaller latents, so the size must be a multiple of 8.
    width, height = image.width // 8 * 8, image.height // 8 * 8
    result = inpaint_pipeline(
        prompt=prompt,
        negative_prompt=negative_prompt or None,
        image=image,
        mask_image=mask_processor.blur(mask, blur_factor=9),
        height=height,
        width=width,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=torch.Generator(device="cuda").manual_seed(seed),
    ).images[0]
    return result if result.size == image.size else result.resize(image.size, Image.LANCZOS)


def _warm_up():
    blank = Image.new("RGB", (WIDTH, HEIGHT), "white")
    full_mask = Image.new("L", (WIDTH, HEIGHT), 255)
    with torch.inference_mode():
        pipeline(
            image=blank,
            condition_image=blank,
            mask=full_mask,
            num_inference_steps=WARM_UP_STEPS,
            guidance_scale=2.5,
            generator=torch.Generator(device="cuda").manual_seed(0),
        )
        _parse(blank)
        _inpaint(blank, full_mask, "trousers", "", WARM_UP_STEPS, 7.5, 0)


_warm_up()

app = FastAPI(title="SnapFit CatVTON")


def _open(upload, mode):
    return Image.open(io.BytesIO(upload.file.read())).convert(mode)


def _check(x_token):
    if x_token != TOKEN:
        raise HTTPException(status_code=401, detail="BAD_TOKEN")


def _jpeg(image):
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=92)
    return Response(buffer.getvalue(), media_type="image/jpeg")


@app.get("/health")
def health():
    return {"status": "ok", "gpu": torch.cuda.get_device_name(0), "features": FEATURES, "parser": PARSER}


@app.post("/tryon")
def tryon(
    person: UploadFile = File(...),
    garment: UploadFile = File(...),
    mask: UploadFile = File(...),
    steps: int = Form(30),
    guidance: float = Form(2.5),
    seed: int = Form(42),
    x_token: str = Header(None),
):
    _check(x_token)

    person_image = resize_and_crop(_open(person, "RGB"), (WIDTH, HEIGHT))
    mask_image = mask_processor.blur(resize_and_crop(_open(mask, "L"), (WIDTH, HEIGHT)), blur_factor=9)
    garment_image = resize_and_padding(_open(garment, "RGB"), (WIDTH, HEIGHT))

    with gpu_lock, torch.inference_mode():
        result = pipeline(
            image=person_image,
            condition_image=garment_image,
            mask=mask_image,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=torch.Generator(device="cuda").manual_seed(seed),
        )[0]

    return _jpeg(result)


@app.post("/parse")
def parse(image: UploadFile = File(...), x_token: str = Header(None)):
    _check(x_token)

    photo = _open(image, "RGB")
    with gpu_lock, torch.inference_mode():
        labels = _parse(photo)

    buffer = io.BytesIO()
    labels.save(buffer, "PNG")
    return Response(buffer.getvalue(), media_type="image/png")


@app.post("/inpaint")
def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    steps: int = Form(30),
    guidance: float = Form(7.5),
    seed: int = Form(42),
    x_token: str = Header(None),
):
    _check(x_token)

    photo = _open(image, "RGB")
    mask_image = _open(mask, "L")
    with gpu_lock, torch.inference_mode():
        result = _inpaint(photo, mask_image, prompt, negative_prompt, steps, guidance, seed)

    return _jpeg(result)
