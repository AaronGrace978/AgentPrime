#!/usr/bin/env python3
"""
Convert the AgentPrime training corpus (markdown) into an SFT JSONL file
compatible with train_lora.py.

Input : training-corpus/*.md  (each file has '## Heading' sections)
Output: data/primecoder_sft.jsonl

Each '##' section becomes one training row where:
  system    = "You are PrimeCoderV1, the AgentPrime coding model."
  user      = a prompt synthesized from the heading and filename
  assistant = the section body (trimmed)

Also optionally blends a filtered slice of a public code-instruct dataset
to reach a healthy row count. Quality > quantity; aim for 2-10k rows.

Usage:

    !python corpus_to_sft.py \
        --corpus-dir ./training-corpus \
        --out ./data/primecoder_sft.jsonl \
        --blend-public 3000
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Iterable

SYSTEM_PROMPT = "You are PrimeCoderV1, the AgentPrime coding model."

PROMPT_TEMPLATES = [
    "Explain the AgentPrime-style approach to: {topic}. Include code where it helps.",
    "How should I handle {topic} in a TypeScript / Electron codebase like AgentPrime?",
    "What is the recommended pattern for {topic}? Show concise, production-ready examples.",
    "Walk through {topic}, the do's and don'ts, and give a short code example.",
    "Write a short guide to {topic} using the AgentPrime conventions.",
]


def split_sections(md: str) -> list[tuple[str, str]]:
    """Return list of (heading, body) from top-level '## Heading' sections."""
    lines = md.splitlines()
    sections: list[tuple[str, list[str]]] = []
    cur: tuple[str, list[str]] | None = None

    for line in lines:
        if line.startswith("## ") and not line.startswith("### "):
            if cur is not None:
                sections.append(cur)
            cur = (line[3:].strip(), [])
        elif cur is not None:
            cur[1].append(line)

    if cur is not None:
        sections.append(cur)

    return [(h, "\n".join(body).strip()) for h, body in sections if body]


def topic_from(heading: str, filename: str) -> str:
    base = re.sub(r"^\d+-", "", os.path.splitext(os.path.basename(filename))[0])
    base = base.replace("-", " ")
    return f"{heading} ({base})"


def corpus_rows(corpus_dir: str) -> Iterable[dict]:
    files = sorted(
        os.path.join(corpus_dir, f)
        for f in os.listdir(corpus_dir)
        if f.endswith(".md")
    )
    for i, path in enumerate(files):
        with open(path, "r", encoding="utf-8") as f:
            md = f.read()
        for j, (heading, body) in enumerate(split_sections(md)):
            if len(body) < 80:
                continue
            tmpl = PROMPT_TEMPLATES[(i + j) % len(PROMPT_TEMPLATES)]
            topic = topic_from(heading, path)
            yield {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": tmpl.format(topic=topic)},
                    {"role": "assistant", "content": body},
                ]
            }


def public_rows(limit: int) -> Iterable[dict]:
    """Best-effort blend of a public code-instruct set. Skips silently if offline."""
    if limit <= 0:
        return
    try:
        from datasets import load_dataset
    except ImportError:
        print("[blend] 'datasets' not installed, skipping public blend", file=sys.stderr)
        return

    try:
        ds = load_dataset(
            "ise-uiuc/Magicoder-Evol-Instruct-110K",
            split=f"train[:{limit}]",
        )
    except Exception as e:
        print(f"[blend] public dataset unavailable ({e}); skipping", file=sys.stderr)
        return

    for r in ds:
        instr = (r.get("instruction") or "").strip()
        resp = (r.get("response") or "").strip()
        if not instr or not resp:
            continue
        yield {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": instr},
                {"role": "assistant", "content": resp},
            ]
        }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-dir", default="./training-corpus")
    ap.add_argument("--out", default="./data/primecoder_sft.jsonl")
    ap.add_argument("--blend-public", type=int, default=0,
                    help="How many rows from a public code-instruct dataset to blend in.")
    args = ap.parse_args()

    if not os.path.isdir(args.corpus_dir):
        print(f"Corpus dir not found: {args.corpus_dir}", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    n_corpus = 0
    n_public = 0
    with open(args.out, "w", encoding="utf-8") as f:
        for row in corpus_rows(args.corpus_dir):
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n_corpus += 1
        for row in public_rows(args.blend_public):
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n_public += 1

    print(f"Wrote {n_corpus + n_public} rows to {args.out}")
    print(f"  corpus: {n_corpus}")
    print(f"  public: {n_public}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
