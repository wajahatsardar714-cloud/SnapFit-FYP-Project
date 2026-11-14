# Fine-tuning the clothes parser for South Asian wear (Kaggle)

SnapFit's GPU server uses the clothes parser **SegFormer-B2 Clothes**
(`mattmdjaga/segformer_b2_clothes`) to find the shopper's own clothes. It was
trained on Western photos, so it often splits a **kameez or kurta** into
"upper clothes", "skirt" and "dress", and that leaves pieces of the old top
behind in a try-on.

The notebook `finetune_segformer.ipynb` (this folder) fixes that **without
anyone drawing labels**:

1. It writes ~1200 outfit descriptions (kameez, kurta, plus Western shirts and
   t-shirts as controls).
2. **Stable Diffusion 1.5** draws one full-body photo for each.
3. The current parser labels each photo, and its known mistakes are corrected
   from the description (we know what each person wears). Unclear photos are
   dropped.
4. It mixes these photos 50/50 with Western photos from the ATR dataset and
   fine-tunes the parser.
5. It compares the old and new parser and only **recommends** the new one if
   it is clearly better on kameez / kurta and not worse on Western clothes.

The labels stay the same 18 ATR labels, so nothing else in SnapFit changes:
the whole kameez / kurta (with its long lower part and sleeves) = **4
Upper-clothes**, shalwar = **6 Pants**, dupatta = **17 Scarf**.

## How to run it

1. Go to [kaggle.com](https://www.kaggle.com) → **Create → New Notebook**, then
   **File → Import Notebook** and choose `finetune_segformer.ipynb` from this
   folder.
2. In the right-hand panel, **Session options**:
   - **Accelerator: GPU T4 x2**
   - **Internet: On** (needs a phone-verified account)
3. Click **Save Version** (top right) → choose **Save & Run All (Commit)** →
   **Save**. Kaggle runs the whole notebook in the background (you can close
   the browser) and keeps everything it writes to `/kaggle/working` as the
   notebook's output.
   - You can also click **Run All** to watch it live, but Kaggle keeps
     `/kaggle/working` as an attachable output only for a saved version, and
     *Save & Run All* then runs everything again. So start with the commit
     and watch its progress in the version's **Logs**.
4. Wait about **3 to 4 hours**. Open the version (the notebook's
   **Versions / Output** tab) when it shows "Successful".

### Time per stage (T4 x2)

| Stage | What happens | Time |
|---|---|---|
| Check | GPU, packages, internet | 1 min |
| 1. Specs | outfit list | seconds |
| 2. Generate | Stable Diffusion download (~3–5 min) + photos on both GPUs; stops after 80 min at the latest | 80–85 min |
| 3. Auto-label | parser + corrections + optional SAM edges + quality check | 10–15 min |
| 4. Western data | download ATR from Hugging Face, fixed test split | about 5 min |
| 5. Train | fine-tune; stops after 75 min at the latest | 75 min |
| 6. Evaluate | base vs fine-tuned on both test sets, picture grids | 5–10 min |
| 7. Report + tidy | gate, save, summary, pack the work files | 3–5 min |
| **Total** | | **about 3–3.5 h** (Kaggle's limit is 12 h) |

The main time controls are at the top of the Settings cell
(`NUM_IMAGES`, `GEN_TIME_BUDGET_MIN`, `TRAIN_TIME_BUDGET_MIN`). Each stage
skips work already saved in `/kaggle/working/ft_work`, so in an interactive
session you can run a failed cell again and it continues.

## What success looks like

At the end the last cell prints a clear verdict:

```
VERDICT: USE IT - the fine-tuned parser is better on kameez/kurta and keeps Western quality.
Western mIoU: base 7x.x -> fine-tuned 7x.x
Kameez/kurta as one top: base xx.x% -> fine-tuned xx.x%
```

or `VERDICT: DO NOT USE IT, keep the base model.` with the reasons.

**The rule (gate):** the fine-tuned parser is *recommended* only if
- its Western mIoU (500 held-out ATR photos) is at most **1.0 point** lower
  than the base parser's, **and**
- its **kameez consistency** is higher than the base parser's (share of
  held-out synthetic kameez / kurta photos where at least 90% of the garment is
  labelled Upper-clothes and less than 5% Skirt / Dress).

Along the way, healthy signs are: stage 2 printing about 12–16 photos/min
with both GPUs; stage 3 keeping roughly 60% or more of the photos (it prints
the drop reasons); the training loss going down; the per-epoch "Western val
mIoU" staying close to the base value.

## The output

```
/kaggle/working/
  segformer-snapfit/          fine-tuned model (save_pretrained: config.json,
                              model.safetensors, preprocessor_config.json,
                              snapfit_finetune.json with the verdict)
  report/
    metrics.json              "recommended": true/false, "western_miou_base",
                              "western_miou_finetuned", "kameez_consistency_base",
                              "kameez_consistency_finetuned" (all in percent),
                              plus per-label IoU, data counts, training history
    summary.md                easy-English results with a before/after table
    grid_south_asian.png      photo | base | fine-tuned, 12 kameez/kurta photos
    grid_western.png          the same for 6 Western test photos
    progress.log, logs/       stage times, generation logs, label log
  synthetic_data.tar          the generated photos, specs and labels (~1 GB)
  snapfit_ft/                 the helper modules the notebook wrote
```

The model folder is written whenever training finished, but the try-on server
uses it **only when `report/metrics.json` says `"recommended": true`**.

## Use it in the try-on server notebook

1. Open the SnapFit try-on server notebook on Kaggle.
2. Right panel → **Add Input** → **Your Work** → **Notebooks** → pick this
   fine-tuning notebook → **Add**.
3. Its output appears under `/kaggle/input/<this-notebook-name>/` (with
   `segformer-snapfit/` and `report/metrics.json` inside). The server picks it
   up if it is recommended; otherwise it keeps the base parser. Run the server
   notebook as usual.

## If a cell fails

Send the lead:
- the **stage name** printed above the error (for example
  `===== Stage 3/7 - automatic labels =====`),
- the **last 30–40 lines** of that cell's output (for a commit run: the
  version's **Logs** tab),
- for stage 2: the last lines of `ft_work/logs/gen_gpu0.log` and
  `gen_gpu1.log` (they are also printed when a worker fails),
- `report/progress.log` if it exists.

Common fixes: "No GPU found" → set Accelerator to GPU T4 x2; "Cannot reach
Hugging Face" → turn Internet on; out of GPU memory in training → it halves
the batch by itself, but you can also set `BATCH_PER_GPU = 4`. Optional parts
(SAM edges, the picture grids, the final tidy-up) never stop the run: they
print a message and carry on.

## Licences

Only openly licensed models and data are used; no scraped photos.

- `stable-diffusion-v1-5/stable-diffusion-v1-5` — CreativeML OpenRAIL-M
  (its use restrictions apply to the generated photos). The safety checker is
  on; blocked images are dropped.
- `mattmdjaga/segformer_b2_clothes` — MIT. The fine-tuned model is a
  derivative and keeps the MIT terms.
- `facebook/sam-vit-base` (optional edge refinement) — Apache-2.0.
- `mattmdjaga/human_parsing_dataset` — the ATR human parsing dataset on
  Hugging Face; see its dataset card. Used for training and evaluation in this
  research project.

## For developers

The notebook is generated; do not edit the `.ipynb` by hand.

- `prompts.py`, `labels.py`, `metrics.py`, `augment.py`, `viz.py` — the logic
  (numpy / OpenCV only), tested by `snapfit-ai/tests/test_finetune_*.py`.
- `gen_worker.py` — the Stable Diffusion worker (one process per GPU).
- `notebook_cells.py` — the notebook's own cells.
- `build_notebook.py` — rebuilds `finetune_segformer.ipynb` (the modules are
  embedded as `%%writefile` cells, so the notebook is self-contained):

```
.venv\Scripts\python.exe gpu\finetune\build_notebook.py
.venv\Scripts\python.exe -m pytest -o addopts="" -q tests\test_finetune_notebook.py
```

The test fails if the `.ipynb` is out of date.
