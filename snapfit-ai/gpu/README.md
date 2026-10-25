# GPU try-on (CatVTON on Kaggle)

SnapFit's photorealistic try-on runs [CatVTON](https://github.com/Zheng-Chong/CatVTON)
(a diffusion virtual try-on model, free for research / non-commercial use) on a
free Kaggle GPU. The AI service sends the shopper photo, the product photo and
a clothing mask built from its own MediaPipe pose; when the GPU is not running
it falls back to the local warp try-on automatically.

## One-time setup

1. Kaggle account with phone verification (needed for GPU + internet).
2. New notebook → Session options: **Accelerator: GPU T4 x2**, **Internet: On**.

## Each time (about 5–10 minutes the first run, 2–3 after)

Run these cells in order.

**1. Setup**
```python
%cd /kaggle/working
!git clone -q https://github.com/Zheng-Chong/CatVTON.git || echo "already cloned"
%cd /kaggle/working/CatVTON
!pip install -q fastapi uvicorn python-multipart
!wget -q -O /kaggle/working/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /kaggle/working/cloudflared
```

**2. Server** — paste the contents of `catvton_server.py` (this folder) into a cell
starting with:
```python
%%writefile /kaggle/working/CatVTON/snapfit_server.py
```

**3. Load the model and start the server** (use the token from `snapfit-ai/.env`)
```python
import os, sys, threading, uvicorn
os.environ["SNAPFIT_TRYON_TOKEN"] = "<TRYON_GPU_TOKEN>"
sys.path.insert(0, "/kaggle/working/CatVTON")
import snapfit_server
threading.Thread(target=uvicorn.run, args=(snapfit_server.app,), kwargs={"host": "0.0.0.0", "port": 7860}, daemon=True).start()
```

**4. Public tunnel**
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

**5. Connect SnapFit** — put the printed URL in `snapfit-ai/.env`:
```
TRYON_GPU_URL=https://<words>.trycloudflare.com
TRYON_GPU_TOKEN=<same token as cell 3>
```
and start the AI service with `--env-file .env`:
```
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
```

## Notes

- The tunnel URL changes on every notebook restart; update `.env` each time.
- About 30 free GPU hours/week; stop the session when done.
- ~15–35 s per try-on on a T4 (40 inference steps).
- SnapFit sends the photo letterboxed to 768x1024 (so the server's crop cuts
  nothing), then colour-corrects the generated garment toward the product
  photo and blends only the clothing region back into the shopper's own photo
  (`app/try_on_compositing.py`).
- Shopper photos are processed in memory on the notebook and not stored.
- No DensePose/detectron2 needed: SnapFit sends the mask.
