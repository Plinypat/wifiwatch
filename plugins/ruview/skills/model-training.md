---
name: model-training
description: >
  Train, evaluate, fine-tune, and publish RuView sensing models locally or on
  Google Cloud GPU. Covers dataset preparation, training configuration, metric
  evaluation, model export (TFLite / ONNX / WASM), and registry publishing.
trigger: /ruview-train
---

# Model Training

## Prerequisites

```bash
pip install -r ml/requirements.txt
# Core deps: tensorflow>=2.14, torch>=2.1, scikit-learn, wandb (optional)
```

For GPU training on Google Cloud:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

## 1 — Prepare dataset

```bash
# Record a labelled dataset from a live session
npx ruview record --app presence --label occupied --duration 300s \
  --out data/presence_occupied.csv

# Or convert existing CSI captures
python3 ml/tools/convert_csi.py --input raw_captures/ --output data/processed/
```

Dataset format: each row is one CSI frame — columns `subcarrier_0..N`, `label`, `ts`.

Split automatically (80/10/10):

```bash
python3 ml/tools/split.py --input data/processed/ --ratio 0.8 0.1 0.1
```

## 2 — Configure training

Edit `ml/configs/<app>.yaml` or pass flags:

```yaml
# ml/configs/presence.yaml
model: cnn_1d          # cnn_1d | lstm | transformer | xgboost
epochs: 50
batch_size: 128
learning_rate: 1e-3
dropout: 0.3
subcarriers: 64
augment: true          # time-shift, amplitude jitter, phase roll
early_stopping_patience: 5
```

## 3 — Train

### Local CPU / GPU

```bash
python3 ml/train.py \
  --config ml/configs/presence.yaml \
  --data   data/processed/           \
  --out    models/presence_v2/
```

### Google Cloud (GPU — A100)

```bash
python3 ml/train_gcloud.py \
  --config ml/configs/presence.yaml \
  --data-gcs gs://my-bucket/csi-data/ \
  --out-gcs  gs://my-bucket/models/   \
  --machine  a2-highgpu-1g \
  --region   us-central1
```

Progress is streamed back via `gcloud ai custom-jobs stream-logs`.

## 4 — Evaluate

```bash
python3 ml/eval.py \
  --model  models/presence_v2/model.h5 \
  --data   data/processed/test/

# Outputs:
#   accuracy, precision, recall, F1
#   confusion matrix (PNG)
#   ROC / AUC curve (PNG)
#   latency_ms (p50, p95, p99)
```

Minimum passing bar (CI gate): accuracy ≥ 0.90, F1 ≥ 0.88.

## 5 — Export

```bash
# TFLite (ESP32 inference)
python3 ml/export.py --model models/presence_v2/model.h5 --format tflite

# ONNX (server inference)
python3 ml/export.py --model models/presence_v2/model.h5 --format onnx

# WASM (browser inference)
python3 ml/export.py --model models/presence_v2/model.h5 --format wasm
# → dist/presence_v2.wasm  +  dist/presence_v2.js
```

## 6 — Publish to model registry

```bash
python3 ml/publish.py \
  --model  models/presence_v2/ \
  --name   presence \
  --version 2.0.0   \
  --registry local   # or: gcs | huggingface

# local registry path: ~/.ruview/models/
```

The server auto-loads the highest semver model for each app on startup.

## Hyperparameter sweep (optional)

```bash
python3 ml/sweep.py \
  --config ml/configs/presence.yaml \
  --param  learning_rate=1e-4,1e-3,1e-2 \
  --param  dropout=0.1,0.3,0.5 \
  --trials 20 \
  --strategy random   # or: grid | bayesian
```

Results land in `sweeps/<timestamp>/` with a `summary.csv`.
