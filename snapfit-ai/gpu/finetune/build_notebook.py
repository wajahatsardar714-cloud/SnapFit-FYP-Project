"""Builds finetune_segformer.ipynb from notebook_cells.py and the helper
modules, so the notebook is self-contained (the modules are written to
/kaggle/working/snapfit_ft/ by %%writefile cells).

    python build_notebook.py            # writes finetune_segformer.ipynb here
    python build_notebook.py --check    # fails if the notebook is out of date
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CELLS_FILE = os.path.join(HERE, "notebook_cells.py")
NOTEBOOK_FILE = os.path.join(HERE, "finetune_segformer.ipynb")
# Written in this order by %%writefile cells, then imported by the notebook.
MODULES = ["prompts.py", "labels.py", "metrics.py", "augment.py", "viz.py", "gen_worker.py"]
TARGET_DIR = "/kaggle/working/snapfit_ft"
MODULES_MARKER = "# %% [modules]"
MARKDOWN_MARKER = "# %% [markdown]"
CODE_MARKER = "# %%"


def read_text(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read().replace("\r\n", "\n")


def parse_cells(text):
    """[(kind, source)] from the percent-format cells file; kind is
    "markdown", "code" or "modules". Lines before the first marker are
    comments about the file itself and are skipped."""
    cells, kind, lines = [], None, []

    def flush():
        if kind is None:
            return
        body = "\n".join(lines).strip("\n")
        if kind == "markdown":
            body = "\n".join(line[2:] if line.startswith("# ") else line.lstrip("#") for line in body.split("\n"))
        if body or kind == "modules":
            cells.append((kind, body))

    for line in text.split("\n"):
        stripped = line.rstrip()
        if stripped == MODULES_MARKER:
            flush()
            kind, lines = "modules", []
        elif stripped == MARKDOWN_MARKER:
            flush()
            kind, lines = "markdown", []
        elif stripped == CODE_MARKER:
            flush()
            kind, lines = "code", []
        elif kind is not None:
            lines.append(line)
    flush()
    return cells


def module_cell(name):
    return f"%%writefile {TARGET_DIR}/{name}\n" + read_text(os.path.join(HERE, name))


def _source_lines(text):
    lines = text.split("\n")
    return [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])


def _cell(kind, text, number):
    # nbformat 4.5 needs a unique id per cell.
    cell = {"cell_type": kind, "id": f"cell-{number:03d}", "metadata": {}, "source": _source_lines(text)}
    if kind == "code":
        cell["execution_count"] = None
        cell["outputs"] = []
    return cell


def build():
    """The notebook as a dict (nbformat 4)."""
    cells = []
    for kind, body in parse_cells(read_text(CELLS_FILE)):
        if kind == "modules":
            for name in MODULES:
                cells.append(_cell("code", module_cell(name), len(cells)))
        else:
            cells.append(_cell(kind, body, len(cells)))
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "pygments_lexer": "ipython3"},
            "kaggle": {"accelerator": "nvidiaTeslaT4", "isInternetEnabled": True, "isGpuEnabled": True,
                       "language": "python", "sourceType": "notebook"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def render(notebook):
    return json.dumps(notebook, indent=1, ensure_ascii=False) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="exit 1 if the notebook is not up to date")
    parser.add_argument("--out", default=NOTEBOOK_FILE)
    args = parser.parse_args(argv)
    text = render(build())
    if args.check:
        current = read_text(args.out) if os.path.exists(args.out) else ""
        if current != text:
            print(f"{args.out} is out of date; run build_notebook.py")
            return 1
        print("notebook is up to date")
        return 0
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    print(f"wrote {args.out} ({len(json.loads(text)['cells'])} cells)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
