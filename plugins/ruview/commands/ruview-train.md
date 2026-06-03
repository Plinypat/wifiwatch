---
name: ruview-train
skill: model-training
description: >
  Train, evaluate, export, and publish a RuView sensing model. Supports local
  CPU/GPU training and Google Cloud A100 jobs. Outputs TFLite, ONNX, and WASM
  artefacts.
usage: /ruview-train [--app <app-id>] [--config <path>] [--cloud]
examples:
  - /ruview-train
  - /ruview-train --app presence
  - /ruview-train --app vitals --config ml/configs/vitals_custom.yaml
  - /ruview-train --app pose --cloud
---

Invoke the **model-training** skill. If `--app` is specified pre-select the
app's default config. If `--cloud` is present use the Google Cloud training
path. Walk the user through data preparation → training → evaluation → export
→ publish in order, pausing at each stage to confirm.
