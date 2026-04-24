#!/usr/bin/env python3
"""
QLoRA SFT for PrimeCoderV1 on top of Qwen2.5-Coder using Unsloth.

Google Colab (A100/L4/T4) recipe — one cell per block:

    # Install (Colab-friendly)
    !pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
    !pip install -q "trl>=0.9.6" "transformers>=4.43" "accelerate>=0.33" "peft>=0.11" "datasets>=2.19" bitsandbytes

    # Train
    !python train_lora.py \
        --base-model ./models/qwen2.5-coder-7b \
        --data-path ./data/primecoder_sft.jsonl \
        --output-dir ./adapters/primecoder-v1 \
        --epochs 2 --batch-size 2 --grad-accum 8 --lr 2e-4 --max-seq 4096

Dataset format (one JSON object per line, OpenAI-style messages):

    {"messages": [
        {"role": "system", "content": "You are PrimeCoderV1, the AgentPrime coding model."},
        {"role": "user", "content": "Refactor this function to be O(n)."},
        {"role": "assistant", "content": "Here is the refactor:\\n```python\\n..."}
    ]}

Tip: start with a few thousand *high-quality* rows (your own AgentPrime traces + a
filtered open code-instruct set). Quality > quantity for a 7B LoRA.
"""

from __future__ import annotations

import argparse
import json
import os
import sys


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="QLoRA SFT for PrimeCoderV1 (Unsloth + TRL).")
    p.add_argument("--base-model", required=True,
                   help="Path or HF id of base model (e.g. ./models/qwen2.5-coder-7b).")
    p.add_argument("--data-path", required=True,
                   help="JSONL file with {'messages': [...]} per line.")
    p.add_argument("--output-dir", default="./adapters/primecoder-v1")
    p.add_argument("--max-seq", type=int, default=4096)
    p.add_argument("--epochs", type=float, default=2.0)
    p.add_argument("--batch-size", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--lora-dropout", type=float, default=0.0)
    p.add_argument("--load-4bit", action="store_true", default=True,
                   help="QLoRA (default). Use --no-load-4bit to disable.")
    p.add_argument("--no-load-4bit", dest="load_4bit", action="store_false")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main() -> int:
    args = parse_args()

    try:
        from unsloth import FastLanguageModel
        from unsloth.chat_templates import get_chat_template
        from datasets import load_dataset
        from trl import SFTTrainer, SFTConfig
    except ImportError as e:
        print(
            "Missing deps. Install with:\n"
            '  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"\n'
            '  pip install "trl>=0.9.6" "transformers>=4.43" "accelerate>=0.33" "peft>=0.11" "datasets>=2.19" bitsandbytes\n'
            f"Import error: {e}",
            file=sys.stderr,
        )
        return 1

    os.makedirs(args.output_dir, exist_ok=True)

    print(f"[PrimeCoder] Base:     {args.base_model}")
    print(f"[PrimeCoder] Data:     {args.data_path}")
    print(f"[PrimeCoder] Output:   {args.output_dir}")
    print(f"[PrimeCoder] 4-bit:    {args.load_4bit}  |  max_seq: {args.max_seq}")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base_model,
        max_seq_length=args.max_seq,
        load_in_4bit=args.load_4bit,
        dtype=None,
    )

    tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        use_gradient_checkpointing="unsloth",
        random_state=args.seed,
    )

    ds = load_dataset("json", data_files=args.data_path, split="train")

    def to_text(example):
        msgs = example["messages"]
        text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=False)
        return {"text": text}

    ds = ds.map(to_text, remove_columns=[c for c in ds.column_names if c != "messages"])

    print(f"[PrimeCoder] Rows:     {len(ds)}")
    print(f"[PrimeCoder] Sample:   {json.dumps(ds[0]['text'][:400])}")

    sft_cfg = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_ratio=args.warmup_ratio,
        logging_steps=10,
        save_steps=200,
        save_total_limit=2,
        bf16=True,
        optim="adamw_8bit",
        lr_scheduler_type="cosine",
        seed=args.seed,
        dataset_text_field="text",
        max_seq_length=args.max_seq,
        packing=False,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        args=sft_cfg,
    )

    trainer.train()

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print(f"[PrimeCoder] Adapter saved to: {os.path.abspath(args.output_dir)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
