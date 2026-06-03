---
name: sensing-apps
description: >
  Launch and operate the six RuView sensing applications: presence detection,
  vital-signs monitoring, human pose estimation, sleep quality, Multi-Antenna
  Tracking (MAT), and raw point-cloud streaming. Handles app selection,
  parameter tuning, live output interpretation, and graceful shutdown.
trigger: /ruview-app
---

# Sensing Applications

Start the sensing server first if not already running:

```bash
npm run dev          # or: docker compose up
```

## App catalogue

| ID | Application | Key output | Typical latency |
|----|-------------|-----------|-----------------|
| `presence` | Presence detection | binary + confidence (0–1) | < 50 ms |
| `vitals` | Vital signs | bpm (heart), brpm (breath) | 1–2 s |
| `pose` | Human pose estimation | 17-keypoint skeleton JSON | 100–200 ms |
| `sleep` | Sleep quality | sleep stage (REM/NREM/wake) | 30 s epoch |
| `mat` | Multi-Antenna Tracking | 2-D trajectory, ID, velocity | 80 ms |
| `pointcloud` | Raw CSI point cloud | XYZ amplitude array | < 20 ms |

## Launch an app

```bash
# HTTP API
curl -X POST http://localhost:3000/api/app/start \
  -H "Content-Type: application/json" \
  -d '{"app": "presence"}'

# CLI shorthand
npx ruview app start presence
```

## App-specific parameters

### presence
```json
{ "threshold": 0.6, "hysteresis_ms": 500 }
```

### vitals
```json
{ "window_s": 30, "algorithm": "fft", "filter_cutoff_hz": [0.1, 0.5] }
```
`algorithm`: `"fft"` (default) or `"wavelet"`.

### pose
```json
{ "model": "lite", "skeleton": "coco17", "min_confidence": 0.4 }
```
`model`: `"lite"` (fast) | `"full"` (accurate) | `"hd"` (best, GPU required).

### sleep
```json
{ "epoch_s": 30, "classifier": "lstm", "channels": [0,1,2] }
```

### mat
```json
{ "max_targets": 4, "kalman_q": 0.01, "kalman_r": 0.1 }
```

### pointcloud
```json
{ "subcarriers": 64, "normalize": true, "output_format": "json" }
```
`output_format`: `"json"` | `"msgpack"` | `"numpy"` (binary blob).

## Reading live output

Subscribe to the WebSocket stream:

```javascript
const ws = new WebSocket("ws://localhost:3000/ws/sensing");
ws.onmessage = (e) => {
  const frame = JSON.parse(e.data);
  // frame.app, frame.ts, frame.payload
};
```

Or tail the NDJSON log:

```bash
curl -N http://localhost:3000/api/app/stream
```

## Stop an app

```bash
curl -X POST http://localhost:3000/api/app/stop
# or
npx ruview app stop
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `confidence` always 0 | No CSI frames arriving | Check device provisioning & WS connection |
| Pose keypoints all zero | Model not loaded | Ensure `npm run dev` completed model download |
| Vitals NaN | Window too short | Increase `window_s` or move closer to device |
| Sleep stage stuck at `wake` | Insufficient channels | Use ≥ 3 CSI subcarrier groups |
