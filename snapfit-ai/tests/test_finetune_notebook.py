"""The Kaggle fine-tuning notebook is built from its source files
(snapfit-ai/gpu/finetune/build_notebook.py): valid nbformat 4 JSON, helper
modules embedded byte for byte, cells in order, every code cell compiles,
and the committed .ipynb is up to date."""

import importlib.util
import json
import os

import pytest

FINETUNE_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "gpu", "finetune")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"finetune_{name}", os.path.join(FINETUNE_DIR, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = _load("build_notebook")
NOTEBOOK = build.build()


def _source(cell):
    return "".join(cell["source"])


def test_valid_nbformat_4_json():
    text = build.render(NOTEBOOK)
    parsed = json.loads(text)
    assert parsed["nbformat"] == 4 and parsed["nbformat_minor"] >= 4
    assert parsed["metadata"]["kernelspec"]["name"] == "python3"
    ids = [cell["id"] for cell in parsed["cells"]]
    assert len(set(ids)) == len(ids)
    for cell in parsed["cells"]:
        assert cell["cell_type"] in ("markdown", "code")
        assert isinstance(cell["source"], list)
        assert all(isinstance(line, str) for line in cell["source"])
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None


def test_committed_notebook_is_up_to_date():
    with open(build.NOTEBOOK_FILE, encoding="utf-8") as handle:
        committed = handle.read().replace("\r\n", "\n")
    assert committed == build.render(NOTEBOOK), "run gpu/finetune/build_notebook.py"


def test_modules_are_embedded_byte_for_byte_in_order():
    writefile = [c for c in NOTEBOOK["cells"] if _source(c).startswith("%%writefile ")]
    assert [_source(c).split("\n", 1)[0] for c in writefile] == [
        f"%%writefile /kaggle/working/snapfit_ft/{name}" for name in build.MODULES
    ]
    for cell, name in zip(writefile, build.MODULES):
        with open(os.path.join(FINETUNE_DIR, name), "rb") as handle:
            original = handle.read().decode("utf-8").replace("\r\n", "\n")
        assert _source(cell).split("\n", 1)[1] == original, name


def test_cells_follow_the_source_file_in_order():
    parsed = build.parse_cells(build.read_text(build.CELLS_FILE))
    expected = []
    for kind, body in parsed:
        if kind == "modules":
            expected += [("code", build.module_cell(name)) for name in build.MODULES]
        else:
            expected.append((kind, body))
    actual = [(c["cell_type"], _source(c)) for c in NOTEBOOK["cells"]]
    assert actual == expected


def test_stages_are_all_there_in_order():
    code = [_source(c) for c in NOTEBOOK["cells"] if c["cell_type"] == "code"]
    positions = []
    for n in range(1, 8):
        found = [i for i, source in enumerate(code) if f'stage("Stage {n}/7' in source]
        assert len(found) == 1, n
        positions.append(found[0])
    assert positions == sorted(positions)
    # The modules are written before they are imported.
    first_import = next(i for i, s in enumerate(code) if "import snapfit_ft" in s)
    last_writefile = max(i for i, s in enumerate(code) if s.startswith("%%writefile"))
    assert last_writefile < first_import < positions[0]


def test_output_names_the_try_on_server_expects():
    code = "\n".join(_source(c) for c in NOTEBOOK["cells"] if c["cell_type"] == "code")
    assert 'MODEL_OUT = os.path.join(WORK, "segformer-snapfit")' in code
    assert 'REPORT = os.path.join(WORK, "report")' in code
    assert 'os.path.join(REPORT, "metrics.json")' in code
    for key in ("recommended", "western_miou_base", "western_miou_finetuned",
                "kameez_consistency_base", "kameez_consistency_finetuned"):
        assert f'"{key}":' in code, key


CODE_CELLS = [i for i, c in enumerate(NOTEBOOK["cells"]) if c["cell_type"] == "code"]


@pytest.mark.parametrize("index", CODE_CELLS)
def test_every_code_cell_compiles(index):
    source = _source(NOTEBOOK["cells"][index])
    if source.startswith("%%writefile"):
        source = source.split("\n", 1)[1]
    assert not any(line.lstrip().startswith(("!", "%")) for line in source.split("\n")), "no shell/magic lines outside %%writefile"
    compile(source, f"<cell {index}>", "exec")
