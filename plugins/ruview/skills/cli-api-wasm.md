---
name: cli-api-wasm
description: >
  Reference for the three RuView integration surfaces: the CLI (`npx ruview`),
  the REST/WebSocket API, and the browser WASM runtime. Covers installation,
  authentication, key endpoints, streaming patterns, and embedding inference
  in a web page.
---

# CLI, REST API, and WASM Runtime

## CLI — `npx ruview`

No install required; always runs the latest version:

```bash
npx ruview --help
```

### Common commands

```bash
npx ruview start                     # start sensing server (default port 3000)
npx ruview start --port 8080 --tls   # custom port with TLS

npx ruview app start <app-id>        # start a sensing app
npx ruview app stop                  # stop active app
npx ruview app status                # show current app + metrics

npx ruview device list               # list connected ESP32 nodes
npx ruview device info <slot>        # NVS dump for a specific node

npx ruview model list                # list installed models
npx ruview model import <path>       # import .tflite / .onnx model
npx ruview model set <name>@<ver>    # activate a specific model version

npx ruview record --app <id> --label <l> --duration <t>  # record labelled data
npx ruview export --format csv|json|parquet              # export CSI frames
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RUVIEW_PORT` | `3000` | HTTP/WS server port |
| `RUVIEW_HOST` | `0.0.0.0` | Bind address |
| `RUVIEW_API_KEY` | — | Enable API key auth |
| `RUVIEW_TLS_CERT` | — | Path to TLS cert PEM |
| `RUVIEW_TLS_KEY` | — | Path to TLS key PEM |
| `RUVIEW_MODEL_DIR` | `~/.ruview/models` | Model registry path |
| `RUVIEW_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## REST API

Base URL: `http://localhost:3000`

Authentication (when `RUVIEW_API_KEY` is set):
```
Authorization: Bearer <api-key>
```

### Core endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Server health + active app |
| POST | `/api/app/start` | Start a sensing app |
| POST | `/api/app/stop` | Stop the active app |
| GET | `/api/app/stream` | NDJSON frame stream (SSE) |
| GET | `/api/devices` | List connected nodes |
| GET | `/api/devices/:slot` | Node details + CSI stats |
| GET | `/api/models` | List installed models |
| POST | `/api/models/activate` | Activate a model version |
| POST | `/api/advanced/multistatic` | Configure multistatic mode |
| POST | `/api/tomo/start` | Start tomography |
| POST | `/api/security/monitor` | Enable mesh security |
| POST | `/api/provision` | Provision device (AP mode) |

### WebSocket

```
ws://localhost:3000/ws/sensing
```

Frame schema:
```typescript
interface SensingFrame {
  app:     string;          // "presence" | "vitals" | ...
  ts:      number;          // Unix epoch seconds (float)
  seq:     number;          // monotonic counter
  node:    number;          // mesh slot
  payload: Record<string, unknown>;  // app-specific
}
```

---

## WASM Runtime (browser inference)

Run model inference directly in the browser — no server required for the ML layer.

### Install

```bash
npm install @ruview/wasm
```

### Usage

```javascript
import { RuViewWasm } from "@ruview/wasm";

const rv = await RuViewWasm.load({
  model: "/models/presence_v2.wasm",
  subcarriers: 64,
});

// Feed a raw CSI frame (Float32Array of length 64)
const result = await rv.infer(csiFrame);
// result: { label: "occupied", confidence: 0.94 }
```

### Connect to live WebSocket feed

```javascript
const ws = new WebSocket("ws://localhost:3000/ws/sensing");
ws.onmessage = async ({ data }) => {
  const frame = JSON.parse(data);
  if (frame.app === "pointcloud") {
    const pred = await rv.infer(new Float32Array(frame.payload.csi));
    console.log(pred);
  }
};
```

### Supported export formats

| Format | Use case | File |
|--------|----------|------|
| `.tflite` | ESP32 on-device inference | `model.tflite` |
| `.onnx` | Server-side (Node / Python) | `model.onnx` |
| `.wasm` + `.js` | Browser inference | `model.wasm`, `model.js` |
