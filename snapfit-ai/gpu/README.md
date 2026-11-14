# GPU try-on (CatVTON on Kaggle)

SnapFit's photorealistic try-on runs [CatVTON](https://github.com/Zheng-Chong/CatVTON)
(a diffusion virtual try-on model, free for research / non-commercial use) on a
free Kaggle GPU. The AI service sends the shopper photo, the product photo and
a clothing mask; when the GPU is not running it falls back to the local warp
try-on automatically.

The full notebook, ready to paste cell by cell, is in
[`kaggle_notebook.md`](kaggle_notebook.md). The steps below explain it.

## What the server does

| Endpoint | Sends | Gets back | Used for |
|---|---|---|---|
| `GET /health` | – | `{"status", "gpu", "features": ["tryon", "parse", "inpaint"], "parser"}` | the AI service checks the server is up and which endpoints it has |
| `POST /tryon` | `person`, `garment`, `mask` files; `steps`, `guidance`, `seed` | JPEG, 768x1024 | the try-on itself (CatVTON) |
| `POST /parse` | `image` file | PNG, same size, one clothes label per pixel | finding the shopper's own clothes (old long sleeves, a long kameez) so the mask covers them, not only the pose area |
| `POST /inpaint` | `image`, `mask` files (white = repaint); `prompt`, `negative_prompt`, `steps`, `guidance`, `seed` | JPEG, same size as the input | repainting the lower part of a long kameez as trousers before a shorter shirt is tried on |

Every endpoint except `/health` needs the header `X-Token: <TRYON_GPU_TOKEN>`
and answers `401 BAD_TOKEN` without it.

`/parse` labels (ATR): 0 Background, 1 Hat, 2 Hair, 3 Sunglasses,
4 Upper-clothes, 5 Skirt, 6 Pants, 7 Dress, 8 Belt, 9 Left-shoe, 10 Right-shoe,
11 Face, 12 Left-leg, 13 Right-leg, 14 Left-arm, 15 Right-arm, 16 Bag, 17 Scarf.

## Models

- **CatVTON** (`zhengchong/CatVTON`, "mix" weights) on the
  **Stable Diffusion 1.5 inpainting** base
  (`stable-diffusion-v1-5/stable-diffusion-inpainting`) — for `/tryon`.
- **SD 1.5 inpainting**, the same base repo, as a plain text-guided pipeline —
  for `/inpaint`. CatVTON's copy cannot be reused for text, because CatVTON
  replaces its text attention with garment attention. The UNet files are
  already downloaded for CatVTON; only the small text encoder and VAE are new
  (under 1 GB). The safety checker is turned off: the inputs are shoppers' own
  full-body photos with only the clothing area masked.
- **SegFormer-B2 Clothes** (`mattmdjaga/segformer_b2_clothes`, MIT licence,
  trained on the ATR dataset) — for `/parse`. A new download, about 110 MB.
  SnapFit can fine-tune it on Western and South Asian wear (shalwar kameez,
  kurta, dupatta) with `finetune/` (see `finetune/README.md`). When that
  notebook's output is attached to this one and passed its quality gate, the
  server loads it instead; `/health` reports `"parser": "base"` or
  `"snapfit-finetuned"`. `SNAPFIT_SEGMENT_MODEL` (a path or repo id) overrides
  both.

Kaggle's GPU image already has `torch`, `diffusers` and `transformers`, so the
setup cell only adds the web server packages. `transformers` does not need to
be installed again (SegFormer has been in it for years); install it only if the
import fails on an unusual image.

## One-time setup

1. Kaggle account with phone verification (needed for GPU + internet).
2. New notebook → Session options: **Accelerator: GPU T4 x2**, **Internet: On**.
3. A free [ngrok](https://ngrok.com) account; copy your authtoken from the
   ngrok dashboard (Your Authtoken).

## Each time (about 6–12 minutes the first run, 3–4 after)

Run these cells in order (full code: `kaggle_notebook.md`).

**1. Setup**
```python
%cd /kaggle/working
!git clone -q https://github.com/Zheng-Chong/CatVTON.git || echo "already cloned"
%cd /kaggle/working/CatVTON
!pip install -q fastapi uvicorn python-multipart
!wget -q -O /kaggle/working/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /kaggle/working/cloudflared
```
(The cloudflared download is only needed for the backup tunnel, cell 4b.)

**2. Server** — paste the contents of `catvton_server.py` (this folder) into a cell
starting with:
```python
%%writefile /kaggle/working/CatVTON/snapfit_server.py
```

**3. Load the models and start the server** (use the token from `snapfit-ai/.env`;
the import also runs one short warm-up of each model, so the first shopper
isn't slow)
```python
import os, sys, threading, uvicorn
os.environ["SNAPFIT_TRYON_TOKEN"] = "<TRYON_GPU_TOKEN>"
sys.path.insert(0, "/kaggle/working/CatVTON")
import snapfit_server
threading.Thread(target=uvicorn.run, args=(snapfit_server.app,), kwargs={"host": "0.0.0.0", "port": 7860}, daemon=True).start()
```

**4. Public tunnel (ngrok)**
```python
!pip install -q pyngrok
from pyngrok import ngrok
ngrok.set_auth_token("<NGROK_AUTHTOKEN>")
print("TRYON URL:", ngrok.connect(7860, "http").public_url)
```

**4b. Backup tunnel (cloudflared)** — only if ngrok is not working
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

**5. Self-test** — see `kaggle_notebook.md`; it calls `/health` and prints
the features (`['tryon', 'parse', 'inpaint']`).

**6. Connect SnapFit** — put the printed URL in `snapfit-ai/.env`:
```
TRYON_GPU_URL=https://<words>.ngrok-free.dev
TRYON_GPU_TOKEN=<same token as cell 3>
```
and start the AI service with `--env-file .env`:
```
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
```
On startup the AI service calls the server's `/health` in the background and
logs `GPU try-on server reachable (<GPU name>)` or an "unreachable" warning.
The AI service sends the `ngrok-skip-browser-warning` header, so ngrok's
free-plan warning page never gets in the way.

## Notes

- A free ngrok account gets one fixed `*.ngrok-free.dev` address, so the URL
  usually stays the same between sessions; check the printed URL anyway. The
  cloudflared URL changes on every restart. Update `.env` if it changed.
- The free ngrok plan allows one tunnel at a time: stop the old notebook
  session before starting a new one, or `ngrok.connect` fails.
- About 30 free GPU hours/week; stop the session when done.
- GPU memory (one T4, 16 GB): CatVTON, the inpaint pipeline and SegFormer
  together use about 5–6 GB for weights and up to about 11–12 GB while a
  768x1024 job runs. Jobs run one at a time (a lock), so they never add up.
- Measured on a Kaggle T4 through ngrok (2026-11-11): `/tryon` took 83–97 s
  at 40 steps, `/inpaint` about 22 s at 30 steps, `/parse` a few seconds.
  SnapFit now asks for 30 and 20 steps. All GPU calls of one size check share
  a 160 s budget from the request's start (the backend and the phone wait
  180 s); optional steps are skipped when it runs short, and SnapFit sends one
  try-on at a time.
- Tuning: set `SNAPFIT_TRYON_DEBUG_DIR=tryon-debug` in `snapfit-ai/.env` and
  each GPU try-on saves its clothes map, masks (red: CatVTON, blue: repaint)
  and results there. Use it with test photos only and empty the folder after:
  the images contain the photo. Leave it unset otherwise.
- SnapFit sends the photo letterboxed to 768x1024 (so the server's crop cuts
  nothing), then colour-corrects the generated garment toward the product
  photo and blends only the clothing region back into the shopper's own photo
  (`app/try_on_compositing.py`).
- Shopper photos are processed in memory on the notebook and not stored.
- No DensePose/detectron2 needed: SnapFit sends the mask.
