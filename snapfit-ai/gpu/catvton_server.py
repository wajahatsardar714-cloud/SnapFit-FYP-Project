"""CatVTON try-on server for a GPU notebook (Kaggle / Colab).

Runs inside a clone of https://github.com/Zheng-Chong/CatVTON and exposes one
endpoint the SnapFit AI service calls:

    POST /tryon   multipart: person, garment, mask (+ steps, guidance, seed)
                  header:    X-Token: <SNAPFIT_TRYON_TOKEN>
                  returns:   image/jpeg, 768x1024

The clothing mask comes from SnapFit (built from its MediaPipe pose), so
CatVTON's AutoMasker -- and its heavy DensePose/detectron2 dependency -- is
not needed. Setup steps: gpu/README.md.
"""

import io
import os
import threading

import torch
from diffusers.image_processor import VaeImageProcessor
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from PIL import Image

from model.pipeline import CatVTONPipeline
from utils import resize_and_crop, resize_and_padding

WIDTH, HEIGHT = 768, 1024
# The original runwayml repo was taken down; this is the official mirror.
BASE_MODEL = "stable-diffusion-v1-5/stable-diffusion-inpainting"
TRYON_WEIGHTS = "zhengchong/CatVTON"
TOKEN = os.environ["SNAPFIT_TRYON_TOKEN"]

pipeline = CatVTONPipeline(
    base_ckpt=BASE_MODEL,
    attn_ckpt=snapshot_download(repo_id=TRYON_WEIGHTS),
    attn_ckpt_version="mix",
    weight_dtype=torch.float16,  # T4/P100 have no bf16
    use_tf32=True,
    device="cuda",
)
mask_processor = VaeImageProcessor(vae_scale_factor=8, do_normalize=False, do_binarize=True, do_convert_grayscale=True)
# One generation at a time: the GPU has room for a single 768x1024 run.
gpu_lock = threading.Lock()
# Steps for the start-up warm-up run: enough to load the CUDA kernels and
# allocate memory at full size, so the first shopper doesn't pay for it.
WARM_UP_STEPS = 2


def _warm_up():
    blank = Image.new("RGB", (WIDTH, HEIGHT), "white")
    with torch.inference_mode():
        pipeline(
            image=blank,
            condition_image=blank,
            mask=Image.new("L", (WIDTH, HEIGHT), 255),
            num_inference_steps=WARM_UP_STEPS,
            guidance_scale=2.5,
            generator=torch.Generator(device="cuda").manual_seed(0),
        )


_warm_up()

app = FastAPI(title="SnapFit CatVTON")


def _open(upload, mode):
    return Image.open(io.BytesIO(upload.file.read())).convert(mode)


@app.get("/health")
def health():
    return {"status": "ok", "gpu": torch.cuda.get_device_name(0)}


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
    if x_token != TOKEN:
        raise HTTPException(status_code=401, detail="BAD_TOKEN")

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

    buffer = io.BytesIO()
    result.save(buffer, "JPEG", quality=92)
    return Response(buffer.getvalue(), media_type="image/jpeg")
