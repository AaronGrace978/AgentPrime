#!/usr/bin/env python3
"""
Download an open-weights model from Hugging Face for Colab (or any machine).

Google Colab — run in a cell:

    !pip install -q "huggingface_hub>=0.26.0"
    !python pull_model.py --repo-id Qwen/Qwen2.5-Coder-7B-Instruct --local-dir ./models/qwen2.5-coder-7b

Optional: set a token for gated models (Secrets → HF_TOKEN, or env var).

    import os
    os.environ["HF_TOKEN"] = "hf_..."

Suggested bases to specialize *for AgentPrime* (LoRA/SFT later):
  - Qwen/Qwen2.5-Coder-7B-Instruct  — fits free Colab T4; strong code + instruction following.
  - Qwen/Qwen2.5-Coder-14B-Instruct — better quality if you have more VRAM.
Train on *your* traces: tool calls, file edits, diffs, rejections — that is what makes it
“AgentPrime-native”, not the base name alone.
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pull (download) a Hugging Face model repo via snapshot_download."
    )
    parser.add_argument(
        "--repo-id",
        default="Qwen/Qwen2.5-Coder-7B-Instruct",
        help="Hugging Face model id, e.g. Qwen/Qwen2.5-Coder-7B-Instruct",
    )
    parser.add_argument(
        "--revision",
        default=None,
        help="Git revision: branch name, tag, or commit hash (optional).",
    )
    parser.add_argument(
        "--local-dir",
        default="./models/hf-model",
        help="Directory to download into (created if missing).",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Hugging Face token (or set HF_TOKEN / HUGGING_FACE_HUB_TOKEN in the environment).",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Parallel download workers (default 8).",
    )
    args = parser.parse_args()

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print(
            "Missing dependency. Install with:\n"
            '  pip install "huggingface_hub>=0.26.0"\n',
            file=sys.stderr,
        )
        return 1

    token = args.token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

    os.makedirs(args.local_dir, exist_ok=True)

    print(f"Repo:     {args.repo_id}")
    print(f"Revision: {args.revision or 'main (default)'}")
    print(f"Target:   {os.path.abspath(args.local_dir)}")
    print("Downloading (resumable)...")

    path = snapshot_download(
        repo_id=args.repo_id,
        revision=args.revision,
        local_dir=args.local_dir,
        local_dir_use_symlinks=False,
        token=token,
        max_workers=args.max_workers,
        resume_download=True,
    )

    print(f"Done.\nSnapshot path: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
