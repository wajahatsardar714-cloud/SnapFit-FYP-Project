# Source of finetune_segformer.ipynb (built by build_notebook.py).
# "# %% [markdown]" starts a text cell (its lines start with "# "),
# "# %%" starts a code cell, and "# %% [modules]" is where the helper
# modules (prompts.py, labels.py, ...) are inserted as %%writefile cells.

# %% [markdown]
# # SnapFit clothes parser fine-tuning (SegFormer-B2, Western + South Asian wear)
#
# This notebook teaches SnapFit's clothes parser (`mattmdjaga/segformer_b2_clothes`)
# to label a **kameez / kurta as one top** (label 4 Upper-clothes), a **shalwar as
# pants** (6) and a **dupatta as a scarf** (17), without forgetting Western clothes.
# Nobody has to draw labels by hand:
#
# 1. **Specs** – a balanced list of ~1200 outfits (kameez, kurta, and Western shirts
#    and t-shirts as controls).
# 2. **Generate** – Stable Diffusion 1.5 draws one full-body photo per spec, on both GPUs.
# 3. **Auto-label** – the current parser labels each photo; its known mistakes are fixed
#    using the spec (we know what the person wears); unclear photos are dropped.
# 4. **Western data** – the ATR clothes dataset, with a fixed held-out test set.
# 5. **Train** – fine-tune on a 50/50 mix (synthetic + Western).
# 6. **Evaluate** – base vs fine-tuned on Western photos and on held-out synthetic photos.
# 7. **Gate + save** – the model is marked *recommended* only if Western quality stays
#    within 1 mIoU point and the kameez result improves.
#
# **How to run:** Session options → Accelerator **GPU T4 x2**, Internet **On**. Then
# **Save Version → Save & Run All (Commit)**. It takes about 3–4 hours. Every stage
# prints its progress. Results: `/kaggle/working/report/` and
# `/kaggle/working/segformer-snapfit/`. Guide: `snapfit-ai/gpu/finetune/README.md`.

# %% [markdown]
# ## Settings
# The numbers at the top control the run time. The defaults fit a T4 x2 session in
# about 3–4 hours (Kaggle's limit is 12 hours).

# %%
import glob
import json
import math
import os
import random
import shutil
import subprocess
import sys
import tarfile
import time
import traceback

RUN_START = time.time()

# ---- How much work (main time controls) ----
NUM_IMAGES = 1200             # synthetic photos to generate (both GPUs share them)
GEN_TIME_BUDGET_MIN = 80      # generation stops after this many minutes, however many are done
GEN_STEPS = 22                # Stable Diffusion steps per photo (DPM++ 2M scheduler)
GEN_GUIDANCE = 7.0
GEN_WIDTH, GEN_HEIGHT = 512, 768   # portrait
GEN_BATCH = 2                 # photos per GPU call
TRAIN_TIME_BUDGET_MIN = 75    # training stops after this many minutes (or MAX_EPOCHS)
MAX_EPOCHS = 15
TOTAL_TIME_BUDGET_H = 5.0     # whole notebook; training is shortened if earlier stages ran long

# ---- Data ----
SPEC_SEED = 1234
USE_SAM = True                # optional SAM edge refinement (any SAM error = skipped)
WESTERN_TEST_SIZE = 500       # fixed held-out ATR test set (never trained on)
WESTERN_VAL_SIZE = 300        # ATR set used to pick the best epoch
WESTERN_SPLIT_SEED = 2026
MIN_WESTERN_TRAIN, MAX_WESTERN_TRAIN = 500, 3000
MIN_SYNTH_TRAIN = 50          # fewer kept synthetic photos than this = no training

# ---- Training ----
BATCH_PER_GPU = 8             # halved automatically if it does not fit
LEARNING_RATE = 6e-5
WEIGHT_DECAY = 0.01
WARMUP_STEPS = 100
POLY_POWER = 0.9

# ---- Gate ----
MAX_WESTERN_DROP = 1.0        # Western mIoU may drop by at most 1.0 point

# ---- End of run ----
CLEANUP_AT_END = True         # pack the synthetic data into one archive, delete the work folder
KEEP_SYNTH_ARCHIVE = True     # keep that archive in the output (~1 GB)

# ---- Models and data (all openly licensed) ----
SD_MODEL = "stable-diffusion-v1-5/stable-diffusion-v1-5"   # CreativeML OpenRAIL-M
BASE_PARSER = "mattmdjaga/segformer_b2_clothes"            # MIT
SAM_MODEL = "facebook/sam-vit-base"                        # Apache-2.0
WESTERN_DATASET = "mattmdjaga/human_parsing_dataset"       # ATR copy on Hugging Face

# ---- Folders ----
WORK = "/kaggle/working"
LIB = os.path.join(WORK, "snapfit_ft")            # helper modules (written below)
FT = os.path.join(WORK, "ft_work")                # intermediate files (resumable)
SYNTH = os.path.join(FT, "synth")
LOGS = os.path.join(FT, "logs")
CKPT = os.path.join(FT, "checkpoints")
MODEL_OUT = os.path.join(WORK, "segformer-snapfit")
REPORT = os.path.join(WORK, "report")
for folder in (LIB, FT, SYNTH, LOGS, CKPT, REPORT):
    os.makedirs(folder, exist_ok=True)
for sub in ("images", "specs", "flagged", "parsed", "target"):
    os.makedirs(os.path.join(SYNTH, sub), exist_ok=True)
open(os.path.join(LIB, "__init__.py"), "a").close()

TIMINGS = {}


def elapsed_min():
    return (time.time() - RUN_START) / 60.0


def stage(title):
    line = f"[{elapsed_min():6.1f} min] ===== {title} ====="
    print("\n" + line, flush=True)
    with open(os.path.join(REPORT, "progress.log"), "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
    return time.time()


def minutes_left():
    return TOTAL_TIME_BUDGET_H * 60.0 - elapsed_min()


print("Settings ready. Work folder:", FT)

# %% [markdown]
# ## Check the session (GPU, packages, internet)

# %%
stage("Checking the session")
import torch

if not torch.cuda.is_available():
    raise RuntimeError("No GPU found. Session options -> Accelerator -> GPU T4 x2, then run again.")
N_GPUS = torch.cuda.device_count()
for index in range(N_GPUS):
    props = torch.cuda.get_device_properties(index)
    print(f"GPU {index}: {props.name}, {props.total_memory / 2**30:.1f} GB")
if N_GPUS < 2:
    print("NOTE: only one GPU. Everything still works, but generation takes about twice as long;"
          " it stops at GEN_TIME_BUDGET_MIN with fewer photos.")

for package in ("diffusers", "transformers", "datasets", "accelerate"):
    try:
        __import__(package)
    except ImportError:
        print(f"{package} missing, installing it ...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", package], check=False)
import datasets
import diffusers
import transformers

print("torch", torch.__version__, "| diffusers", diffusers.__version__, "| transformers", transformers.__version__,
      "| datasets", datasets.__version__)

try:
    from huggingface_hub import model_info

    model_info(BASE_PARSER, timeout=30)
    print("Internet: OK (Hugging Face reachable)")
except Exception as error:
    raise RuntimeError("Cannot reach Hugging Face. Session options -> Internet: On, then run again. "
                       f"({error!r})")

free_gb = shutil.disk_usage(WORK).free / 2**30
print(f"Free disk in {WORK}: {free_gb:.0f} GB")

# %% [markdown]
# ## Helper modules
# The next cells save small helper files (the same files as in
# `snapfit-ai/gpu/finetune/` in the SnapFit repo). They are plain Python and are
# tested there with pytest.

# %% [modules]

# %%
import importlib

if WORK not in sys.path:
    sys.path.insert(0, WORK)
import snapfit_ft.augment as ftaugment
import snapfit_ft.labels as ftlabels
import snapfit_ft.metrics as ftmetrics
import snapfit_ft.prompts as prompts
import snapfit_ft.viz as ftviz

for module in (prompts, ftlabels, ftmetrics, ftaugment, ftviz):
    importlib.reload(module)
print("Helper modules loaded.")

# %% [markdown]
# ## Stage 1 – Generation specs (a few seconds)

# %%
started = stage("Stage 1/7 - generation specs")
specs = prompts.build_specs(NUM_IMAGES, SPEC_SEED)
SPEC_BY_ID = {spec["id"]: spec for spec in specs}
SPECS_PATH = os.path.join(FT, "specs.json")
with open(SPECS_PATH, "w", encoding="utf-8") as handle:
    json.dump(specs, handle)
for key, counts in prompts.summary(specs).items():
    print(f"{key:8s}", counts)
print("Longest prompt (rough CLIP tokens):", max(prompts.approx_token_count(s["prompt"]) for s in specs))
for spec in specs[:3]:
    print("-", spec["id"], spec["split"], "|", spec["prompt"])
TIMINGS["specs_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Stage 2 – Generate the photos (about 80 minutes)
# One Stable Diffusion 1.5 process per GPU. The safety checker is on; blocked
# images are dropped. Already generated photos are skipped, so the cell can be run
# again after an interruption. Logs: `/kaggle/working/ft_work/logs/gen_gpu*.log`.

# %%
started = stage("Stage 2/7 - generating photos with Stable Diffusion 1.5")
GEN_DONE = os.path.join(FT, "generation_done.json")


def count_generated():
    images = len(glob.glob(os.path.join(SYNTH, "images", "*.png")))
    flagged = len(glob.glob(os.path.join(SYNTH, "flagged", "*.txt")))
    return images, flagged


def log_tail(path, lines=15):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return "".join(handle.readlines()[-lines:])
    except OSError:
        return "(no log)"


if os.path.exists(GEN_DONE):
    print("Already done:", open(GEN_DONE).read())
else:
    variant = "fp16"
    try:
        from diffusers import StableDiffusionPipeline

        print("Downloading Stable Diffusion 1.5 once (both workers then load it from the cache) ...")
        try:
            StableDiffusionPipeline.download(SD_MODEL, variant="fp16")
        except Exception as error:
            print("fp16 files not available, downloading the full weights:", repr(error)[:200])
            variant = ""
            StableDiffusionPipeline.download(SD_MODEL)
    except Exception as error:
        print("Pre-download did not work; each worker downloads by itself:", repr(error)[:300])

    deadline = time.time() + GEN_TIME_BUDGET_MIN * 60
    workers = max(1, N_GPUS)
    processes = []
    try:
        for worker in range(workers):
            env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(worker), PYTHONUNBUFFERED="1")
            log_path = os.path.join(LOGS, f"gen_gpu{worker}.log")
            command = [
                sys.executable, os.path.join(LIB, "gen_worker.py"),
                "--specs", SPECS_PATH, "--out", SYNTH,
                "--worker", str(worker), "--num-workers", str(workers),
                "--deadline", str(deadline), "--model", SD_MODEL, "--variant", variant,
                "--steps", str(GEN_STEPS), "--guidance", str(GEN_GUIDANCE),
                "--width", str(GEN_WIDTH), "--height", str(GEN_HEIGHT), "--batch", str(GEN_BATCH),
            ]
            log_file = open(log_path, "a", encoding="utf-8")
            processes.append((subprocess.Popen(command, env=env, stdout=log_file, stderr=subprocess.STDOUT), log_file, log_path))
            print(f"Started worker {worker} on GPU {worker}; log: {log_path}")

        first = sum(count_generated())
        watch_start = time.time()
        last_tail = time.time()
        while any(process.poll() is None for process, _, _ in processes):
            time.sleep(60)
            images, flagged = count_generated()
            new = images + flagged - first
            minutes = (time.time() - watch_start) / 60
            per_min = new / minutes if minutes > 0 else 0.0
            left = (len(specs) - images - flagged) / per_min if per_min > 0 else float("nan")
            budget_left = max(0.0, (deadline - time.time()) / 60)
            print(f"[{elapsed_min():6.1f} min] {images} saved + {flagged} blocked of {len(specs)} | "
                  f"{per_min:.1f} photos/min | about {min(left, budget_left):.0f} min left "
                  f"(budget {budget_left:.0f} min)", flush=True)
            if time.time() - last_tail > 600:
                last_tail = time.time()
                for _, _, log_path in processes:
                    print("   ", log_tail(log_path, 1).strip())
    finally:
        for process, log_file, _ in processes:
            if process.poll() is None:
                process.terminate()
            log_file.close()

    for worker, (process, _, log_path) in enumerate(processes):
        code = process.wait()
        print(f"Worker {worker} exit code {code}. Last log lines:\n{log_tail(log_path, 4)}")
        if code != 0:
            print(f"Worker {worker} failed. Log tail:\n{log_tail(log_path, 40)}")
    images, flagged = count_generated()
    if images == 0:
        raise RuntimeError("No photos were generated. Send the log lines printed above to the lead.")
    with open(GEN_DONE, "w") as handle:
        json.dump({"images": images, "blocked_by_safety_checker": flagged, "minutes": (time.time() - started) / 60}, handle)

GENERATED, BLOCKED = count_generated()
print(f"Photos: {GENERATED} saved, {BLOCKED} blocked by the safety checker.")
TIMINGS["generation_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Stage 3 – Automatic labels (about 10 minutes)
# The current parser labels each photo. The labels are then corrected using the
# spec (`labels.py`): the whole kameez / kurta becomes 4, a shalwar 6, a dupatta 17.
# Photos with unclear labels are dropped; the reasons are counted below.

# %%
started = stage("Stage 3/7 - automatic labels")
import numpy as np
import torch.nn.functional as F
from PIL import Image
from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

DEVICE = "cuda:0"
LABEL_LOG = os.path.join(FT, "label_log.jsonl")
LABEL_DONE = os.path.join(FT, "labels_done.json")
processor = SegformerImageProcessor.from_pretrained(BASE_PARSER)
GARMENT_IDS = list(ftlabels.GARMENT_LABELS)


def load_rgb(path):
    with Image.open(path) as image:
        return image.convert("RGB")


def parse_with_confidence(model, images):
    """(labels, top probability, clothing probability) per PIL image, at the
    image's own size, exactly as the try-on server parses (processor at 512,
    logits upsampled, argmax)."""
    inputs = processor(images=images, return_tensors="pt")
    with torch.inference_mode():
        logits = model(pixel_values=inputs["pixel_values"].to(DEVICE)).logits
        results = []
        for i, image in enumerate(images):
            up = F.interpolate(logits[i: i + 1].float(), size=(image.height, image.width), mode="bilinear", align_corners=False)
            probs = up.softmax(dim=1)[0]
            confidence, labels = probs.max(dim=0)
            garment = probs[GARMENT_IDS].sum(dim=0)
            results.append((labels.to(torch.uint8).cpu().numpy(), confidence.cpu().numpy(), garment.cpu().numpy()))
    return results


def read_label_log():
    records = {}
    if os.path.exists(LABEL_LOG):
        with open(LABEL_LOG, encoding="utf-8") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                    records[record["id"]] = record
                except (ValueError, KeyError):
                    pass  # a line cut off by an interruption
    return records


records = read_label_log()
image_ids = sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(SYNTH, "images", "*.png")))
todo = [i for i in image_ids if i not in records]
print(f"{len(image_ids)} photos, {len(records)} already labelled, {len(todo)} to label")

if todo:
    base_model = AutoModelForSemanticSegmentation.from_pretrained(BASE_PARSER).to(DEVICE).eval()
    sam_model = sam_processor = None
    if USE_SAM:
        try:
            from transformers import SamModel, SamProcessor

            sam_processor = SamProcessor.from_pretrained(SAM_MODEL)
            sam_model = SamModel.from_pretrained(SAM_MODEL).to(DEVICE).eval()
            print("SAM loaded for edge refinement.")
        except Exception as error:
            print("SAM not available, labels are used without it:", repr(error)[:200])
            sam_model = None

    def sam_top_mask(image, box):
        inputs = sam_processor(image, input_boxes=[[list(box)]], return_tensors="pt").to(DEVICE)
        with torch.inference_mode():
            outputs = sam_model(**inputs, multimask_output=True)
        masks = sam_processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu())
        best = int(outputs.iou_scores[0, 0].argmax())
        return masks[0][0, best].numpy().astype(bool)

    sam_errors = 0
    with open(LABEL_LOG, "a", encoding="utf-8") as log:
        for start in range(0, len(todo), 16):
            chunk = todo[start: start + 16]
            pictures = [load_rgb(os.path.join(SYNTH, "images", i + ".png")) for i in chunk]
            for spec_id, picture, (raw, confidence, garment_prob) in zip(chunk, pictures, parse_with_confidence(base_model, pictures)):
                spec = SPEC_BY_ID.get(spec_id)
                if spec is None:
                    continue
                corrected, info = ftlabels.correct_labels(raw, spec)
                sam_used = False
                if sam_model is not None:
                    try:
                        box = ftlabels.top_box(corrected)
                        if box is not None:
                            corrected, sam_used = ftlabels.refine_with_sam(corrected, sam_top_mask(picture, box))
                    except Exception as error:
                        sam_errors += 1
                        if sam_errors <= 3:
                            print("SAM skipped for", spec_id, repr(error)[:200])
                strict = ftlabels.quality_check(corrected, spec, garment_prob, info)
                relaxed = ftlabels.quality_check(corrected, spec, garment_prob, info, relaxed=True)
                target = ftlabels.training_target(corrected, confidence, garment_prob)
                Image.fromarray(raw).save(os.path.join(SYNTH, "parsed", spec_id + ".png"))
                Image.fromarray(target).save(os.path.join(SYNTH, "target", spec_id + ".png"))
                record = {
                    "id": spec_id, "split": spec["split"], "top": spec["top"], "long_top": spec["long_top"],
                    "dupatta": spec["dupatta"], "ok_strict": strict["ok"], "reasons_strict": strict["reasons"],
                    "ok_relaxed": relaxed["ok"], "reasons_relaxed": relaxed["reasons"],
                    "hem_source": info["hem_source"], "changed_pixels": info["changed"], "sam_used": sam_used,
                    "stats": strict["stats"],
                }
                log.write(json.dumps(record) + "\n")
                records[spec_id] = record
            log.flush()
            if (start // 16) % 10 == 0:
                print(f"[{elapsed_min():6.1f} min] labelled {min(start + 16, len(todo))}/{len(todo)}", flush=True)
    del base_model, sam_model
    torch.cuda.empty_cache()

all_records = [records[i] for i in image_ids if i in records]
strict_rate = sum(r["ok_strict"] for r in all_records) / max(1, len(all_records))
USE_RELAXED = strict_rate < 0.5
OK_KEY = "ok_relaxed" if USE_RELAXED else "ok_strict"
if USE_RELAXED:
    print(f"Strict check kept only {strict_rate:.0%}; using the relaxed check instead.")
kept = [r for r in all_records if r[OK_KEY]]
SYNTH_TRAIN = [r["id"] for r in kept if r["split"] == "train"]
SYNTH_VAL = [r["id"] for r in kept if r["split"] == "val"]
SYNTH_TEST = [r["id"] for r in kept if r["split"] == "test"]

reason_counts = {}
for record in all_records:
    for reason in record["reasons_relaxed" if USE_RELAXED else "reasons_strict"]:
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
by_top = {}
for record in all_records:
    entry = by_top.setdefault(record["top"], [0, 0])
    entry[0] += 1
    entry[1] += bool(record[OK_KEY])
print(f"Kept {len(kept)} of {len(all_records)} photos ({len(kept) / max(1, len(all_records)):.0%}): "
      f"train {len(SYNTH_TRAIN)}, val {len(SYNTH_VAL)}, test {len(SYNTH_TEST)}")
for top, (total, ok) in sorted(by_top.items()):
    print(f"  {top:7s} kept {ok}/{total}")
print("Drop reasons (a photo can have several):")
for reason, count in sorted(reason_counts.items(), key=lambda kv: -kv[1]):
    print(f"  {reason:22s} {count}")
print("SAM refinement used on", sum(r["sam_used"] for r in all_records), "photos")
if len(kept) < 0.6 * max(1, len(all_records)):
    print("NOTE: fewer than 60% kept. Training still runs; see the drop reasons above.")
LABEL_SUMMARY = {
    "photos": len(all_records), "kept": len(kept), "strict_keep_rate": strict_rate, "relaxed_check_used": USE_RELAXED,
    "train": len(SYNTH_TRAIN), "val": len(SYNTH_VAL), "test": len(SYNTH_TEST),
    "kept_by_top": {top: {"total": t, "kept": k} for top, (t, k) in by_top.items()},
    "drop_reasons": reason_counts,
}
with open(LABEL_DONE, "w") as handle:
    json.dump(LABEL_SUMMARY, handle, indent=1)
TIMINGS["labels_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Stage 4 – Western data (about 5 minutes)
# The ATR clothes dataset (the one the base parser was trained on). A fixed set of
# 500 photos is held out for testing and never used in training.

# %%
started = stage("Stage 4/7 - Western data (ATR)")
from datasets import load_dataset

western = None
for attempt in range(3):
    try:
        western = load_dataset(WESTERN_DATASET, split="train")
        break
    except Exception as error:
        print(f"Loading the dataset failed (try {attempt + 1}/3):", repr(error)[:300])
        time.sleep(20)
if western is None:
    raise RuntimeError("Could not load the ATR dataset. Check that Internet is On, then run this cell again.")
print(western)
columns = western.column_names
IMAGE_COLUMN = "image" if "image" in columns else columns[0]
MASK_COLUMN = "mask" if "mask" in columns else [c for c in columns if c != IMAGE_COLUMN][0]
print("Using columns:", IMAGE_COLUMN, "(photo) and", MASK_COLUMN, "(labels)")


def western_item(index):
    """(PIL RGB photo, uint8 label map at the photo's size)."""
    row = western[int(index)]
    image = row[IMAGE_COLUMN].convert("RGB")
    mask = np.array(row[MASK_COLUMN])
    if mask.ndim == 3:
        mask = mask[..., 0]
    mask = mask.astype(np.uint8)
    if mask.shape != (image.height, image.width):
        mask = np.array(Image.fromarray(mask).resize((image.width, image.height), Image.NEAREST))
    mask[(mask >= ftlabels.NUM_LABELS) & (mask != ftlabels.IGNORE)] = ftlabels.IGNORE
    return image, mask


sample_ids = sorted({int(v) for index in range(5) for v in np.unique(western_item(index)[1])})
print("Label ids in the first photos:", sample_ids)
if max(sample_ids) >= ftlabels.NUM_LABELS and max(sample_ids) != ftlabels.IGNORE:
    print("WARNING: unexpected label ids in the dataset")

order = np.random.default_rng(WESTERN_SPLIT_SEED).permutation(len(western))
WESTERN_TEST = [int(i) for i in order[:WESTERN_TEST_SIZE]]
WESTERN_VAL = [int(i) for i in order[WESTERN_TEST_SIZE: WESTERN_TEST_SIZE + WESTERN_VAL_SIZE]]
pool = order[WESTERN_TEST_SIZE + WESTERN_VAL_SIZE:]
n_western_train = int(min(MAX_WESTERN_TRAIN, max(MIN_WESTERN_TRAIN, len(SYNTH_TRAIN))))
WESTERN_TRAIN = [int(i) for i in pool[:n_western_train]]
with open(os.path.join(FT, "western_split.json"), "w") as handle:
    json.dump({"seed": WESTERN_SPLIT_SEED, "test": WESTERN_TEST, "val": WESTERN_VAL, "train": WESTERN_TRAIN}, handle)
print(f"Western: test {len(WESTERN_TEST)}, val {len(WESTERN_VAL)}, train {len(WESTERN_TRAIN)} "
      f"(synthetic train {len(SYNTH_TRAIN)})")
TIMINGS["western_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Shared helpers for training and evaluation

# %%
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

IMAGE_MEAN = processor.image_mean
IMAGE_STD = processor.image_std
BEST_DIR = os.path.join(CKPT, "best")
LAST_CKPT = os.path.join(CKPT, "last.pt")
TRAIN_DONE = os.path.join(CKPT, "train_done.json")


class MixDataset(Dataset):
    """Synthetic photos with their corrected labels + ATR photos."""

    def __init__(self, items):
        self.items = items

    def __len__(self):
        return len(self.items)

    def __getitem__(self, index):
        source, key = self.items[index]
        if source == "synth":
            image = np.array(load_rgb(os.path.join(SYNTH, "images", key + ".png")))
            with Image.open(os.path.join(SYNTH, "target", key + ".png")) as target:
                labels = np.array(target)
        else:
            picture, labels = western_item(key)
            image = np.array(picture)
        rng = np.random.default_rng([torch.initial_seed() % 2**32, index])
        image, labels = ftaugment.train_transform(image, labels, rng)
        x = torch.from_numpy(ftaugment.normalize(image, IMAGE_MEAN, IMAGE_STD))
        y = torch.from_numpy(labels.astype(np.int64))
        return x, y


class LogitsOnly(nn.Module):
    """Returns plain logits (so DataParallel can gather them); autocast is
    inside forward because it is per thread."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixel_values):
        with torch.autocast("cuda", dtype=torch.float16):
            return self.model(pixel_values=pixel_values).logits


def predict_labels(model, images, batch_size=16):
    """Label map per PIL image at its own size, as the try-on server does."""
    model.eval()
    out = []
    for start in range(0, len(images), batch_size):
        chunk = images[start: start + batch_size]
        inputs = processor(images=chunk, return_tensors="pt")
        with torch.inference_mode():
            logits = model(pixel_values=inputs["pixel_values"].to(DEVICE)).logits
            for i, image in enumerate(chunk):
                up = F.interpolate(logits[i: i + 1].float(), size=(image.height, image.width), mode="bilinear", align_corners=False)
                out.append(up.argmax(dim=1)[0].to(torch.uint8).cpu().numpy())
    return out


def evaluate(model, western_ids, synth_ids, keep_western=(), keep_synth=(), chunk=32):
    """Scores on Western photos (ATR labels) and synthetic photos (automatic
    labels). Returns a dict; predictions for the keep_* ids are included
    for the picture grids."""
    keep_western, keep_synth = set(keep_western), set(keep_synth)
    western_cm = np.zeros((ftmetrics.NUM_LABELS, ftmetrics.NUM_LABELS), np.int64)
    synth_cm = np.zeros_like(western_cm)
    kameez_flags, kept = [], {}
    for start in range(0, len(western_ids), chunk):
        ids = western_ids[start: start + chunk]
        pairs = [western_item(i) for i in ids]
        for i, (picture, truth), pred in zip(ids, pairs, predict_labels(model, [p for p, _ in pairs])):
            western_cm += ftmetrics.confusion_matrix(pred, truth)
            if i in keep_western:
                kept[("western", i)] = pred
    for start in range(0, len(synth_ids), chunk):
        ids = synth_ids[start: start + chunk]
        pictures = [load_rgb(os.path.join(SYNTH, "images", i + ".png")) for i in ids]
        for i, pred in zip(ids, predict_labels(model, pictures)):
            with Image.open(os.path.join(SYNTH, "target", i + ".png")) as target:
                truth = np.array(target)
            synth_cm += ftmetrics.confusion_matrix(pred, truth)
            if SPEC_BY_ID[i]["long_top"]:
                kameez_flags.append(ftmetrics.kameez_consistent(pred, truth == ftlabels.UPPER))
            if i in keep_synth:
                kept[("synth", i)] = pred
    return {
        "western_miou": ftmetrics.mean_iou(western_cm),
        "western_iou": [None if math.isnan(v) else float(v) for v in ftmetrics.per_class_iou(western_cm)],
        "western_pixel_accuracy": ftmetrics.pixel_accuracy(western_cm),
        "synthetic_miou": ftmetrics.mean_iou(synth_cm),
        "synthetic_iou": [None if math.isnan(v) else float(v) for v in ftmetrics.per_class_iou(synth_cm)],
        "kameez": ftmetrics.rate(kameez_flags),
        "kameez_photos": len(kameez_flags),
        "predictions": kept,
    }


print("Helpers ready.")

# %% [markdown]
# ## Stage 5 – Fine-tune (about 75 minutes)
# Starts from the base parser (same 18 labels). Each epoch is saved, so the cell
# can be run again after an interruption and continues where it stopped. The best
# epoch is picked on the validation sets (never on the test sets).

# %%
started = stage("Stage 5/7 - fine-tuning")
TRAINED = False
TRAIN_SUMMARY = {}
if os.path.exists(TRAIN_DONE):
    TRAIN_SUMMARY = json.load(open(TRAIN_DONE))
    TRAINED = os.path.isdir(BEST_DIR)
    print("Already trained:", {k: v for k, v in TRAIN_SUMMARY.items() if k != "history"})
elif len(SYNTH_TRAIN) < MIN_SYNTH_TRAIN:
    TRAIN_SUMMARY = {"skipped": f"only {len(SYNTH_TRAIN)} synthetic training photos (need {MIN_SYNTH_TRAIN})"}
    print("Training skipped:", TRAIN_SUMMARY["skipped"])
else:
    torch.manual_seed(0)
    random.seed(0)
    model = AutoModelForSemanticSegmentation.from_pretrained(BASE_PARSER).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    try:
        scaler = torch.amp.GradScaler("cuda")
    except (AttributeError, TypeError):
        scaler = torch.cuda.amp.GradScaler()
    state = {"epoch": 0, "step": 0, "history": [], "planned_epochs": MAX_EPOCHS, "base_val": None,
             "train_seconds": 0.0, "batch_per_gpu": BATCH_PER_GPU, "best_index": None}
    if os.path.exists(LAST_CKPT):
        checkpoint = torch.load(LAST_CKPT, map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        scaler.load_state_dict(checkpoint["scaler"])
        state = checkpoint["state"]
        print(f"Resuming after epoch {state['epoch']} (step {state['step']}).")

    net = LogitsOnly(model)
    if N_GPUS > 1:
        net = nn.DataParallel(net)

    def validation_scores():
        scores = evaluate(model, WESTERN_VAL, SYNTH_VAL)
        model.train()
        return {k: scores[k] for k in ("western_miou", "synthetic_miou", "kameez", "kameez_photos")}

    if state["base_val"] is None:
        state["base_val"] = validation_scores()
        print("Base parser on the validation sets:", state["base_val"])

    # Find a batch size that fits (halve on out-of-memory).
    batch_per_gpu = state["batch_per_gpu"]
    while True:
        try:
            model.train()
            dummy = torch.randn(batch_per_gpu * max(1, N_GPUS), 3, 512, 512, device=DEVICE)
            dummy_logits = net(dummy)
            dummy_logits.float().mean().backward()
            optimizer.zero_grad(set_to_none=True)
            del dummy, dummy_logits
            torch.cuda.empty_cache()
            break
        except torch.cuda.OutOfMemoryError:
            optimizer.zero_grad(set_to_none=True)
            torch.cuda.empty_cache()
            if batch_per_gpu <= 2:
                raise
            batch_per_gpu //= 2
            print("Out of GPU memory; batch per GPU ->", batch_per_gpu)
    state["batch_per_gpu"] = batch_per_gpu

    items = [("synth", i) for i in SYNTH_TRAIN] + [("western", i) for i in WESTERN_TRAIN]
    loader = DataLoader(MixDataset(items), batch_size=batch_per_gpu * max(1, N_GPUS), shuffle=True,
                        num_workers=min(4, os.cpu_count() or 2), pin_memory=True, drop_last=True,
                        persistent_workers=True)
    steps_per_epoch = len(loader)
    budget_seconds = max(10 * 60, min(TRAIN_TIME_BUDGET_MIN * 60, (minutes_left() - 30) * 60))
    print(f"{len(items)} training photos ({len(SYNTH_TRAIN)} synthetic + {len(WESTERN_TRAIN)} Western), "
          f"batch {batch_per_gpu * max(1, N_GPUS)}, {steps_per_epoch} steps per epoch, "
          f"time budget {budget_seconds / 60:.0f} min")

    def learning_rate(step):
        total = max(1, state["planned_epochs"] * steps_per_epoch)
        warm = min(1.0, (step + 1) / float(WARMUP_STEPS))
        return LEARNING_RATE * warm * max(0.0, 1.0 - step / float(total)) ** POLY_POWER

    out_of_time = False
    for epoch in range(state["epoch"] + 1, MAX_EPOCHS + 1):
        if epoch > state["planned_epochs"] or out_of_time:
            break
        model.train()
        epoch_start = time.time()
        losses = []
        for x, y in loader:
            if (y != ftlabels.IGNORE).sum() == 0:
                continue
            for group in optimizer.param_groups:
                group["lr"] = learning_rate(state["step"])
            logits = net(x.to(DEVICE, non_blocking=True))
            y = y.to(DEVICE, non_blocking=True)
            logits = F.interpolate(logits.float(), size=y.shape[-2:], mode="bilinear", align_corners=False)
            loss = F.cross_entropy(logits, y, ignore_index=ftlabels.IGNORE)
            optimizer.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            state["step"] += 1
            if math.isfinite(loss.item()):
                losses.append(loss.item())
            if state["step"] % 50 == 0:
                print(f"[{elapsed_min():6.1f} min] epoch {epoch} step {state['step']} "
                      f"loss {np.mean(losses[-50:]):.4f} lr {learning_rate(state['step']):.2e}", flush=True)
            if state["train_seconds"] + (time.time() - epoch_start) > budget_seconds:
                out_of_time = True
                print("Training time budget reached; finishing this epoch early.")
                break
        scores = validation_scores()
        epoch_seconds = time.time() - epoch_start
        state["train_seconds"] += epoch_seconds
        state["epoch"] = epoch
        state["history"].append({"epoch": epoch, "loss": float(np.mean(losses)) if losses else None,
                                 "seconds": epoch_seconds, **scores})
        if epoch == 1 or len(state["history"]) == 1:
            fit = int(budget_seconds // max(1.0, epoch_seconds))
            state["planned_epochs"] = int(min(MAX_EPOCHS, max(1, fit)))
            print(f"One epoch takes {epoch_seconds / 60:.1f} min -> planning {state['planned_epochs']} epochs")
        best = ftmetrics.choose_best(state["history"], state["base_val"]["western_miou"], MAX_WESTERN_DROP)
        if best == len(state["history"]) - 1:
            model.save_pretrained(BEST_DIR)
            processor.save_pretrained(BEST_DIR)
            state["best_index"] = best
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                    "scaler": scaler.state_dict(), "state": state}, LAST_CKPT + ".tmp")
        os.replace(LAST_CKPT + ".tmp", LAST_CKPT)
        print(f"[{elapsed_min():6.1f} min] epoch {epoch} done in {epoch_seconds / 60:.1f} min | "
              f"Western val mIoU {scores['western_miou']:.2f} (base {state['base_val']['western_miou']:.2f}) | "
              f"kameez val {scores['kameez']:.1f}% (base {state['base_val']['kameez']:.1f}%) | "
              f"best epoch so far: {state['history'][state['best_index']]['epoch'] if state['best_index'] is not None else '-'}",
              flush=True)
    TRAINED = os.path.isdir(BEST_DIR)
    TRAIN_SUMMARY = {"epochs": state["epoch"], "steps": state["step"], "minutes": state["train_seconds"] / 60,
                     "batch": state["batch_per_gpu"] * max(1, N_GPUS), "base_val": state["base_val"],
                     "best_epoch": state["history"][state["best_index"]]["epoch"] if state["best_index"] is not None else None,
                     "history": state["history"], "train_photos": {"synthetic": len(SYNTH_TRAIN), "western": len(WESTERN_TRAIN)}}
    with open(TRAIN_DONE, "w") as handle:
        json.dump(TRAIN_SUMMARY, handle, indent=1)
    del loader, net, model, optimizer
    torch.cuda.empty_cache()
TIMINGS["training_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Stage 6 – Evaluate base vs fine-tuned (about 5–10 minutes)
# Western: the 500 held-out ATR photos. South Asian: the held-out synthetic photos
# (never trained on), scored against the **automatic** labels.

# %%
started = stage("Stage 6/7 - evaluation")
GRID_SYNTH = []
for wanted in (("kameez", True), ("kameez", False), ("kurta", True), ("kurta", False)):
    GRID_SYNTH += [i for i in SYNTH_TEST if (SPEC_BY_ID[i]["top"], SPEC_BY_ID[i]["dupatta"]) == wanted][:3]
GRID_SYNTH = (GRID_SYNTH + [i for i in SYNTH_TEST if SPEC_BY_ID[i]["long_top"] and i not in GRID_SYNTH])[:12]
GRID_WESTERN = WESTERN_TEST[:6]

base_model = AutoModelForSemanticSegmentation.from_pretrained(BASE_PARSER).to(DEVICE).eval()
RESULTS = {"base": evaluate(base_model, WESTERN_TEST, SYNTH_TEST, GRID_WESTERN, GRID_SYNTH)}
del base_model
print(f"Base:       Western mIoU {RESULTS['base']['western_miou']:.2f} | kameez {RESULTS['base']['kameez']:.1f}% "
      f"of {RESULTS['base']['kameez_photos']} | synthetic mIoU {RESULTS['base']['synthetic_miou']:.2f}")
if TRAINED:
    tuned_model = AutoModelForSemanticSegmentation.from_pretrained(BEST_DIR).to(DEVICE).eval()
    RESULTS["finetuned"] = evaluate(tuned_model, WESTERN_TEST, SYNTH_TEST, GRID_WESTERN, GRID_SYNTH)
    print(f"Fine-tuned: Western mIoU {RESULTS['finetuned']['western_miou']:.2f} | kameez {RESULTS['finetuned']['kameez']:.1f}% "
          f"| synthetic mIoU {RESULTS['finetuned']['synthetic_miou']:.2f}")
else:
    tuned_model = None
    print("No fine-tuned model to evaluate.")

for kind, ids in (("south_asian", GRID_SYNTH), ("western", GRID_WESTERN)):
    try:
        rows, captions = [], []
        for i in ids:
            key = ("synth", i) if kind == "south_asian" else ("western", i)
            if key not in RESULTS["base"]["predictions"]:
                continue
            if kind == "south_asian":
                photo = np.array(load_rgb(os.path.join(SYNTH, "images", i + ".png")))
                spec = SPEC_BY_ID[i]
                captions.append(f"{i}: {spec['top']} + {spec['bottom']}" + (" + dupatta" if spec["dupatta"] else ""))
            else:
                photo = np.array(western_item(i)[0])
                captions.append(f"ATR test photo {i}")
            base_pred = RESULTS["base"]["predictions"][key]
            tuned_pred = RESULTS["finetuned"]["predictions"][key] if TRAINED else np.full_like(base_pred, ftlabels.IGNORE)
            rows.append((photo, base_pred, tuned_pred))
        if rows:
            grid = ftviz.comparison_grid(rows, captions=captions)
            Image.fromarray(grid).save(os.path.join(REPORT, f"grid_{kind}.png"))
            print("Saved", os.path.join(REPORT, f"grid_{kind}.png"))
    except Exception:
        print(f"Could not draw the {kind} grid (the scores are not affected):\n{traceback.format_exc()}")
TIMINGS["evaluation_min"] = (time.time() - started) / 60

# %% [markdown]
# ## Stage 7 – Gate, save and report
# The fine-tuned parser is **recommended** only if the Western mIoU drops by at most
# 1.0 point **and** the kameez consistency improves.

# %%
started = stage("Stage 7/7 - gate, save and report")
base, tuned = RESULTS["base"], RESULTS.get("finetuned")
if tuned is not None:
    GATE = ftmetrics.gate(base["western_miou"], tuned["western_miou"], base["kameez"], tuned["kameez"], MAX_WESTERN_DROP)
else:
    GATE = {"recommended": False, "western_drop": None, "kameez_gain": None,
            "reasons": ["no fine-tuned model (" + TRAIN_SUMMARY.get("skipped", "training did not finish") + ")"]}
RECOMMENDED = bool(GATE["recommended"])


def number(value, digits=2):
    return None if value is None or not math.isfinite(value) else round(float(value), digits)


METRICS = {
    "recommended": RECOMMENDED,
    "western_miou_base": number(base["western_miou"]),
    "western_miou_finetuned": number(tuned["western_miou"]) if tuned else None,
    "kameez_consistency_base": number(base["kameez"]),
    "kameez_consistency_finetuned": number(tuned["kameez"]) if tuned else None,
    "synthetic_miou_base": number(base["synthetic_miou"]),
    "synthetic_miou_finetuned": number(tuned["synthetic_miou"]) if tuned else None,
    "units": "mIoU and kameez consistency are percentages (0-100)",
    "gate": {"rule": f"Western mIoU drop <= {MAX_WESTERN_DROP} points AND kameez consistency improves",
             "western_drop": number(GATE["western_drop"]), "kameez_gain": number(GATE["kameez_gain"]),
             "reasons_not_recommended": GATE["reasons"]},
    "test_sets": {"western_atr_photos": len(WESTERN_TEST), "synthetic_photos": len(SYNTH_TEST),
                  "synthetic_kameez_kurta_photos": base["kameez_photos"],
                  "synthetic_labels": "automatic (base parser + spec-based correction), not hand-drawn"},
    "per_class_iou_western": {"labels": ftlabels.LABEL_NAMES, "base": base["western_iou"],
                              "finetuned": tuned["western_iou"] if tuned else None},
    "per_class_iou_synthetic": {"labels": ftlabels.LABEL_NAMES, "base": base["synthetic_iou"],
                                "finetuned": tuned["synthetic_iou"] if tuned else None},
    "data": {"generated": GENERATED, "blocked_by_safety_checker": BLOCKED, "labels": LABEL_SUMMARY,
             "western_split_seed": WESTERN_SPLIT_SEED},
    "training": {k: v for k, v in TRAIN_SUMMARY.items()},
    "timings_min": {k: round(v, 1) for k, v in TIMINGS.items()},
    "models": {"base_parser": BASE_PARSER, "generator": SD_MODEL, "sam": SAM_MODEL if USE_SAM else None,
               "western_data": WESTERN_DATASET},
}

if tuned_model is not None:
    tuned_model.save_pretrained(MODEL_OUT)
    processor.save_pretrained(MODEL_OUT)
    with open(os.path.join(MODEL_OUT, "snapfit_finetune.json"), "w") as handle:
        json.dump({k: METRICS[k] for k in ("recommended", "western_miou_base", "western_miou_finetuned",
                                           "kameez_consistency_base", "kameez_consistency_finetuned")}, handle, indent=1)
    print("Model saved to", MODEL_OUT, "(recommended)" if RECOMMENDED else "(NOT recommended)")
def json_safe(value):
    """NaN / infinity -> None (strict JSON), recursively."""
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (np.floating, np.integer, np.bool_)):
        return json_safe(value.item())
    return value


METRICS = json_safe(METRICS)
with open(os.path.join(REPORT, "metrics.json"), "w") as handle:
    json.dump(METRICS, handle, indent=1, allow_nan=False)


def show(value, suffix=""):
    return "n/a" if value is None else f"{value:.1f}{suffix}"


lines = [
    "# SnapFit clothes parser fine-tuning – results",
    "",
    f"**Verdict: {'USE IT' if RECOMMENDED else 'DO NOT USE IT, keep the base model'}**",
    "",
    "| Test | Base parser | Fine-tuned | Change |",
    "|---|---|---|---|",
]
for title, key in (("Western photos: mIoU (ATR, %d held-out photos)" % len(WESTERN_TEST), "western_miou"),
                   ("Kameez / kurta labelled as one top (%d synthetic test photos)" % base["kameez_photos"], "kameez_consistency"),
                   ("Synthetic photos: mIoU against the automatic labels", "synthetic_miou")):
    b, t = METRICS[key + "_base"], METRICS[key + "_finetuned"]
    unit = "%" if key == "kameez_consistency" else ""
    change = None if b is None or t is None else f"{t - b:+.1f}"
    lines.append(f"| {title} | {show(b, unit)} | {show(t, unit)} | {change or 'n/a'} |")
lines += [
    "",
    f"**Rule:** the fine-tuned parser is used only if the Western mIoU drops by at most {MAX_WESTERN_DROP} point "
    "and the kameez result gets better.",
]
if GATE["reasons"]:
    lines += ["", "Why it is not recommended:"] + [f"- {r}" for r in GATE["reasons"]]
lines += [
    "",
    "## What the numbers mean",
    "- **mIoU** (mean intersection over union): for each label, how much the predicted area and the true area "
    "overlap, averaged over the labels. 100 = perfect.",
    "- **Kameez / kurta labelled as one top**: share of kameez and kurta photos where at least 90% of the garment "
    "is labelled *Upper-clothes* and less than 5% *Skirt* or *Dress*. SnapFit needs this to remove the old top fully.",
    "- The synthetic test photos were generated by Stable Diffusion and labelled **automatically** (the base parser "
    "plus fixes based on what each photo was asked to show). Scores against them show the direction of the change, "
    "not an exact accuracy. Only photos that passed the label quality check are in the test set.",
    "- The base parser was trained on ATR, so it may have seen some of the Western test photos before. The Western "
    "score mainly shows whether fine-tuning made it forget anything.",
    "",
    "## Data",
    f"- Generated photos: {GENERATED} (and {BLOCKED} blocked by the safety checker).",
    f"- Kept after the label check: {LABEL_SUMMARY['kept']} ({LABEL_SUMMARY['kept'] / max(1, LABEL_SUMMARY['photos']):.0%})"
    f"{' using the relaxed check' if LABEL_SUMMARY['relaxed_check_used'] else ''}: "
    f"train {LABEL_SUMMARY['train']}, validation {LABEL_SUMMARY['val']}, test {LABEL_SUMMARY['test']}.",
    f"- Western (ATR) photos: train {len(WESTERN_TRAIN)}, validation {len(WESTERN_VAL)}, test {len(WESTERN_TEST)} (seed {WESTERN_SPLIT_SEED}).",
    "- Most common drop reasons: " + ", ".join(f"{k} ({v})" for k, v in sorted(LABEL_SUMMARY["drop_reasons"].items(), key=lambda kv: -kv[1])[:6]),
    "",
    "## Training",
]
if TRAIN_SUMMARY.get("history"):
    lines.append(f"- {TRAIN_SUMMARY['epochs']} epochs in {TRAIN_SUMMARY['minutes']:.0f} min, batch {TRAIN_SUMMARY['batch']}; "
                 f"best epoch (picked on the validation sets): {TRAIN_SUMMARY['best_epoch']}.")
    lines += ["", "| Epoch | Loss | Western val mIoU | Kameez val | Synthetic val mIoU |", "|---|---|---|---|---|"]
    for row in TRAIN_SUMMARY["history"]:
        lines.append(f"| {row['epoch']} | {show(row['loss'])} | {show(row['western_miou'])} | {show(row['kameez'], '%')} | {show(row['synthetic_miou'])} |")
else:
    lines.append("- " + TRAIN_SUMMARY.get("skipped", "No training was done."))
lines += ["", "## Western per-label IoU (%)", "",
          ftmetrics.iou_table(ftlabels.LABEL_NAMES, base["western_iou"], tuned["western_iou"] if tuned else [None] * 18),
          "", "## Pictures", "- `grid_south_asian.png` and `grid_western.png`: photo | base parser | fine-tuned. "
          "Red = Upper-clothes, orange = Skirt, blue = Pants, purple = Dress, green = Scarf.",
          "", "## Licences",
          "- Base parser `mattmdjaga/segformer_b2_clothes`: MIT. The fine-tuned model is a derivative of it.",
          "- Photo generator `stable-diffusion-v1-5/stable-diffusion-v1-5`: CreativeML OpenRAIL-M (its use restrictions apply "
          "to the generated photos).",
          "- Edge refinement `facebook/sam-vit-base`: Apache-2.0.",
          "- Western data `mattmdjaga/human_parsing_dataset` (ATR): see its dataset card; used for research / evaluation.",
          "", f"Total run time: {elapsed_min():.0f} min."]
with open(os.path.join(REPORT, "summary.md"), "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")
TIMINGS["report_min"] = (time.time() - started) / 60
print("\n".join(lines[:12]))

# %% [markdown]
# ## Tidy up the output
# Kaggle keeps everything in `/kaggle/working` as this notebook's output. The many
# small work files are packed into one archive (`synthetic_data.tar`) and the work
# folder is deleted, so the output stays small and easy to attach.

# %%
stage("Tidying up the output")
try:
    os.makedirs(os.path.join(REPORT, "logs"), exist_ok=True)
    for path in glob.glob(os.path.join(LOGS, "*.log")) + [LABEL_LOG, os.path.join(FT, "western_split.json"), TRAIN_DONE]:
        if os.path.exists(path):
            shutil.copy(path, os.path.join(REPORT, "logs", os.path.basename(path)))
    if CLEANUP_AT_END:
        if KEEP_SYNTH_ARCHIVE:
            archive = os.path.join(WORK, "synthetic_data.tar")
            with tarfile.open(archive + ".tmp", "w") as tar:
                for sub in ("images", "specs", "target"):
                    tar.add(os.path.join(SYNTH, sub), arcname=sub)
                tar.add(SPECS_PATH, arcname="specs.json")
            os.replace(archive + ".tmp", archive)
            print(f"Synthetic photos and labels packed into {archive} ({os.path.getsize(archive) / 2**30:.2f} GB)")
        shutil.rmtree(FT, ignore_errors=True)
        print("Work folder removed.")
except Exception:
    print("Tidying up failed (the results are not affected):\n" + traceback.format_exc())

# %% [markdown]
# ## Verdict and next steps

# %%
print("=" * 70)
if RECOMMENDED:
    print("VERDICT: USE IT - the fine-tuned parser is better on kameez/kurta and keeps Western quality.")
else:
    print("VERDICT: DO NOT USE IT, keep the base model.")
    for reason in GATE["reasons"]:
        print("  -", reason)
print(f"Western mIoU: base {show(METRICS['western_miou_base'])} -> fine-tuned {show(METRICS['western_miou_finetuned'])}")
print(f"Kameez/kurta as one top: base {show(METRICS['kameez_consistency_base'], '%')} -> "
      f"fine-tuned {show(METRICS['kameez_consistency_finetuned'], '%')}")
print("=" * 70)
print("Next steps:")
print(" 1. If you ran this interactively: Save Version (the Save & Run All commit keeps the output).")
print(" 2. In the try-on server notebook: Add Input -> Your Work -> this notebook.")
print("    The server uses /kaggle/input/<this notebook>/segformer-snapfit/ only when")
print("    report/metrics.json says \"recommended\": true; otherwise it keeps the base parser.")
print(" 3. Send report/summary.md and the two grid pictures to the lead.")
print(f"Output: {REPORT} and {MODEL_OUT if os.path.isdir(MODEL_OUT) else '(no model folder)'}")
