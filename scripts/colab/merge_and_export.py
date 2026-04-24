#!/usr/bin/env python3
"""
Merge a LoRA adapter into its base model and export merged safetensors weights.

Usage:
    !pip install -q "transformers>=4.43" "peft>=0.11" accelerate safetensors

    !python merge_and_export.py \
        --base-model ./models/qwen2.5-coder-7b \
        --adapter ./adapters/primecoder-v1 \
        --output-dir ./models/primecoder-v1-merged

Optional — convert merged weights to GGUF so Ollama can serve it.
Run once in Colab:

    !git clone https://github.com/ggerganov/llama.cpp
    !pip install -q -r llama.cpp/requirements.txt
    !python llama.cpp/convert_hf_to_gguf.py ./models/primecoder-v1-merged \
        --outfile ./models/primecoder-v1.gguf --outtype q4_k_m

Then on your machine: `ollama create primecoder-v1 -f Modelfile.primecoder`.
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base-model", required=True)
    p.add_argument("--adapter", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--dtype", default="bfloat16",
                   choices=["bfloat16", "float16", "float32"])
    args = p.parse_args()

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
    except ImportError as e:
        print(
            'pip install "transformers>=4.43" "peft>=0.11" accelerate safetensors\n'
            f"Import error: {e}",
            file=sys.stderr,
        )
        return 1

    dtype = {"bfloat16": torch.bfloat16, "float16": torch.float16, "float32": torch.float32}[args.dtype]
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"[Merge] Base:    {args.base_model}")
    print(f"[Merge] Adapter: {args.adapter}")
    print(f"[Merge] Output:  {args.output_dir}")
    print(f"[Merge] dtype:   {args.dtype}")

    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=dtype,
        device_map="auto",
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, args.adapter)
    print("[Merge] merging adapter...")
    model = model.merge_and_unload()
    model.save_pretrained(args.output_dir, safe_serialization=True, max_shard_size="4GB")

    tok = AutoTokenizer.from_pretrained(args.adapter if os.path.isdir(args.adapter) else args.base_model)
    tok.save_pretrained(args.output_dir)

    print(f"[Merge] done. Merged model at: {os.path.abspath(args.output_dir)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
