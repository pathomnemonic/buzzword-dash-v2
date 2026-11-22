#!/bin/sh
# Download the pinned MedQA train split (GBaker/MedQA-USMLE-4-options, listed CC BY 4.0) to $1 (default ./raw/train.jsonl)
OUT=${1:-raw/train.jsonl}; mkdir -p "$(dirname "$OUT")"
curl -sSL -m 300 -o "$OUT" https://huggingface.co/datasets/GBaker/MedQA-USMLE-4-options/resolve/0fb93dd23a7339b6dcd27e241cb9b5eca62d4d18/phrases_no_exclude_train.jsonl
sha256sum "$OUT"   # expect 3a65baf760f17c395058d6699315a7ce8aa767c50cb193fea87ceb94dd790324 (10178 lines)
