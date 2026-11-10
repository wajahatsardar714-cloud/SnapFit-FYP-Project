# SnapFit GPU server — Kaggle notebook

This is the whole Kaggle notebook. Make one code cell for each part below and
paste the code in. Run the cells in order. What each part does is explained in
[`README.md`](README.md).

Before you start: **Session options → Accelerator: GPU T4 x2, Internet: On.**

You need two secrets. Type them in where you see the placeholders:

- `<TRYON_GPU_TOKEN>` — the `TRYON_GPU_TOKEN` value from `snapfit-ai/.env`
  (cell 3).
- `<NGROK_AUTHTOKEN>` — your authtoken from the ngrok dashboard (cell 4).

Do not save the notebook as public with your secrets in it.

## Cell 1 — Setup

Downloads CatVTON's code and installs the web server packages. `torch`,
`diffusers` and `transformers` are already on Kaggle.

```python
%cd /kaggle/working
!git clone -q https://github.com/Zheng-Chong/CatVTON.git || echo "already cloned"
%cd /kaggle/working/CatVTON
!pip install -q fastapi uvicorn python-multipart
!wget -q -O /kaggle/working/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /kaggle/working/cloudflared
```

## Cell 2 — Write the server file

This saves the server code next to CatVTON's code. It is the same as
`catvton_server.py` in this folder.

```python
%%writefile /kaggle/working/CatVTON/snapfit_server.py
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

import io
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
SEGMENT_MODEL = "mattmdjaga/segformer_b2_clothes"
FEATURES = ["tryon", "parse", "inpaint"]
TOKEN = os.environ["SNAPFIT_TRYON_TOKEN"]

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
    return {"status": "ok", "gpu": torch.cuda.get_device_name(0), "features": FEATURES}


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
```

## Cell 3 — Load the models and start the server

The import loads CatVTON, the inpaint pipeline and the clothes parser, and runs
each one once as a warm-up. The first time this takes several minutes (model
downloads); after that about 2–3 minutes.

```python
import os, sys, threading, uvicorn
os.environ["SNAPFIT_TRYON_TOKEN"] = "<TRYON_GPU_TOKEN>"
sys.path.insert(0, "/kaggle/working/CatVTON")
import snapfit_server
threading.Thread(target=uvicorn.run, args=(snapfit_server.app,), kwargs={"host": "0.0.0.0", "port": 7860}, daemon=True).start()
```

## Cell 4 — Public tunnel (ngrok)

Prints the public URL. Put it in `snapfit-ai/.env` as `TRYON_GPU_URL`.

```python
!pip install -q pyngrok
from pyngrok import ngrok
ngrok.set_auth_token("<NGROK_AUTHTOKEN>")
print("TRYON URL:", ngrok.connect(7860, "http").public_url)
```

If it fails with "only one agent session", an old notebook still has a tunnel
open: stop that session first, then run this cell again.

## Cell 4b — Backup tunnel (cloudflared, optional)

Only use this if ngrok is not working. Its URL changes every time.

```python
import subprocess, re, time
log = open("/kaggle/working/tunnel.log", "w")
tunnel = subprocess.Popen(["/kaggle/working/cloudflared", "tunnel", "--url", "http://localhost:7860"], stdout=log, stderr=log)
for _ in range(60):
    time.sleep(1)
    found = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open("/kaggle/working/tunnel.log").read())
    if found:
        print("TRYON URL:", found.group(0)); break
```

## Cell 5 — Quick self-test

Checks that the server answers and has all three features. It should print
`features: ['tryon', 'parse', 'inpaint']`.

```python
import os, requests
reply = requests.get("http://localhost:7860/health", headers={"X-Token": os.environ["SNAPFIT_TRYON_TOKEN"]}, timeout=30)
print(reply.status_code, reply.json())
print("features:", reply.json().get("features"))
```

## Then connect SnapFit

In `snapfit-ai/.env`:

```
TRYON_GPU_URL=https://<words>.ngrok-free.dev
TRYON_GPU_TOKEN=<same token as cell 3>
```

Start the AI service with `--env-file .env`. It logs
`GPU try-on server reachable (<GPU name>)` when it can reach the notebook.
Stop the Kaggle session when you are done to save GPU hours.
