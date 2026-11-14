"""Stable Diffusion 1.5 generation worker: one process per GPU.

Started by the notebook with CUDA_VISIBLE_DEVICES set to one GPU. Takes every
`--num-workers`-th spec starting at `--worker`, skips specs already done
(a PNG, or a "flagged" marker when the safety checker blocked the image),
and stops at `--deadline` (a Unix time). Each image is written to a temporary
file first and renamed, so a stopped run never leaves half a PNG behind.
"""

import argparse
import json
import os
import sys
import time
import traceback


def _log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def _done(out_dir, spec_id):
    return os.path.exists(os.path.join(out_dir, "images", spec_id + ".png")) or os.path.exists(
        os.path.join(out_dir, "flagged", spec_id + ".txt")
    )


def _load_pipeline(model, variant):
    import torch
    from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline

    last_error = None
    for attempt in ([variant, None] if variant else [None]):
        try:
            kwargs = {"torch_dtype": torch.float16}
            if attempt:
                kwargs["variant"] = attempt
            pipe = StableDiffusionPipeline.from_pretrained(model, **kwargs)
            break
        except Exception as error:  # a missing fp16 variant falls back to the full weights
            last_error = error
            _log(f"loading with variant={attempt!r} failed: {error!r}")
    else:
        raise last_error
    if getattr(pipe, "safety_checker", None) is None:
        _log("WARNING: this pipeline has no safety checker; flagged images cannot be dropped")
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    pipe.set_progress_bar_config(disable=True)
    return pipe.to("cuda")


def _save(out_dir, spec, image):
    path = os.path.join(out_dir, "images", spec["id"] + ".png")
    image.save(path + ".tmp", format="PNG")
    os.replace(path + ".tmp", path)
    spec_path = os.path.join(out_dir, "specs", spec["id"] + ".json")
    with open(spec_path + ".tmp", "w", encoding="utf-8") as handle:
        json.dump(spec, handle, indent=1)
    os.replace(spec_path + ".tmp", spec_path)


def _flag(out_dir, spec):
    with open(os.path.join(out_dir, "flagged", spec["id"] + ".txt"), "w", encoding="utf-8") as handle:
        handle.write("blocked by the safety checker\n")


def _generate(pipe, batch, args):
    import torch

    return pipe(
        prompt=[spec["prompt"] for spec in batch],
        negative_prompt=[spec["negative_prompt"] for spec in batch],
        width=args.width,
        height=args.height,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance,
        generator=[torch.Generator(device="cuda").manual_seed(int(spec["seed"])) for spec in batch],
    )


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--specs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--worker", type=int, default=0)
    parser.add_argument("--num-workers", type=int, default=1)
    parser.add_argument("--deadline", type=float, default=0.0)
    parser.add_argument("--model", default="stable-diffusion-v1-5/stable-diffusion-v1-5")
    parser.add_argument("--variant", default="fp16")
    parser.add_argument("--steps", type=int, default=22)
    parser.add_argument("--guidance", type=float, default=7.0)
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--batch", type=int, default=2)
    args = parser.parse_args(argv)

    import torch

    for sub in ("images", "specs", "flagged"):
        os.makedirs(os.path.join(args.out, sub), exist_ok=True)
    with open(args.specs, encoding="utf-8") as handle:
        specs = json.load(handle)
    mine = specs[args.worker:: args.num_workers]
    todo = [spec for spec in mine if not _done(args.out, spec["id"])]
    _log(f"worker {args.worker}: {len(mine)} specs, {len(todo)} to do, GPU {torch.cuda.get_device_name(0)}")
    if not todo:
        return 0

    pipe = _load_pipeline(args.model, args.variant)
    saved = flagged = failed = 0
    start = time.time()
    batch_size = max(1, args.batch)
    position = 0
    while position < len(todo):
        if args.deadline and time.time() > args.deadline:
            _log(f"worker {args.worker}: time budget reached, stopping")
            break
        batch = todo[position: position + batch_size]
        try:
            result = _generate(pipe, batch, args)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            if batch_size > 1:
                batch_size = 1
                _log(f"worker {args.worker}: out of GPU memory, batch size -> 1")
                continue
            _log(f"worker {args.worker}: out of GPU memory on {batch[0]['id']}, skipping it")
            failed += 1
            position += 1
            continue
        except Exception:
            _log(f"worker {args.worker}: generation failed for {[s['id'] for s in batch]}:\n{traceback.format_exc()}")
            failed += len(batch)
            position += len(batch)
            if failed > 20 and saved == 0:
                _log("too many failures and nothing saved; giving up")
                return 1
            continue
        nsfw = getattr(result, "nsfw_content_detected", None) or [False] * len(batch)
        for spec, image, blocked in zip(batch, result.images, nsfw):
            if blocked:
                _flag(args.out, spec)
                flagged += 1
            else:
                _save(args.out, spec, image)
                saved += 1
        position += len(batch)
        done = saved + flagged
        if done and (done % 10 < len(batch) or position >= len(todo)):
            seconds = (time.time() - start) / done
            left = (len(todo) - position) * seconds / 60.0
            _log(f"worker {args.worker}: {position}/{len(todo)} done ({saved} saved, {flagged} flagged, {failed} failed), {seconds:.1f} s/image, about {left:.0f} min left")
    _log(f"worker {args.worker}: finished: {saved} saved, {flagged} flagged by the safety checker, {failed} failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
