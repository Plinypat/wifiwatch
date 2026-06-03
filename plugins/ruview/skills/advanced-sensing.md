---
name: advanced-sensing
description: >
  Advanced multi-node sensing modes: multistatic radar (distributed TX/RX),
  WiFi tomography, cross-viewpoint fusion, and mesh-level security monitoring.
  Covers synchronisation, topology configuration, and interpretation of fused
  output.
trigger: /ruview-advanced
---

# Advanced Multistatic Sensing

## Overview

Standard RuView uses a single ESP32 node in monostatic mode (TX = RX same device).
Advanced modes require ≥ 2 nodes sharing a sync clock over the mesh.

```
Node 0 (slot=0, sync master)
  └─ TX probe frames on ch 6
Node 1 (slot=1)  ←  receives from Node 0 (bistatic pair 0→1)
Node 2 (slot=2)  ←  receives from Node 0 (bistatic pair 0→2)
Node 3 (slot=3)  ←  receives from Node 1 (bistatic pair 1→3)
```

## 1 — Multistatic radar

### Configure

Assign slots (see `/ruview-provision`), then enable multistatic mode:

```bash
curl -X POST http://localhost:3000/api/advanced/multistatic \
  -d '{
    "nodes": [
      {"slot": 0, "ip": "192.168.1.10", "role": "master"},
      {"slot": 1, "ip": "192.168.1.11", "role": "slave"},
      {"slot": 2, "ip": "192.168.1.12", "role": "slave"}
    ],
    "sync_method": "ntp",   // "ntp" | "ptp" | "gpio"
    "pairs": "all"          // "all" | [[0,1],[0,2]]
  }'
```

### Interpret output

The server fuses bistatic pairs and emits:

```json
{
  "mode": "multistatic",
  "ts": 1700000000.123,
  "targets": [
    { "id": 0, "x": 1.2, "y": 0.8, "z": 0.0, "velocity_mps": 0.3,
      "azimuth_deg": 34.1, "elevation_deg": 5.0, "snr_db": 18.2 }
  ]
}
```

Position accuracy improves with more bistatic pairs: ~0.5 m (2 nodes) → ~0.15 m (4 nodes).

## 2 — WiFi Tomography

Reconstruct a 2-D attenuation map of the monitored space.

```bash
# Collect baseline (empty room, 60 s)
curl -X POST http://localhost:3000/api/tomo/baseline --data '{"duration_s": 60}'

# Start live tomography
curl -X POST http://localhost:3000/api/tomo/start \
  -d '{
    "grid_m": [5.0, 4.0],    // room dimensions in metres
    "resolution_m": 0.1,
    "algorithm": "tv_min"    // "tv_min" | "tikhonov" | "kaczmarz"
  }'
```

Output is a 2-D float32 array streamed as `application/octet-stream` at ~2 Hz,
or rendered live in the Observatory UI under **Tomography** tab.

## 3 — Cross-viewpoint fusion

Combine CSI from orthogonal node pairs to resolve left/right and
front/back ambiguity in pose estimation.

```bash
curl -X POST http://localhost:3000/api/advanced/crossview \
  -d '{
    "pairs": [[0,1],[2,3]],
    "fusion": "late",        // "early" | "late" | "hybrid"
    "app": "pose"
  }'
```

`late` fusion runs independent pose estimators per pair then averages skeletons.
`early` fusion concatenates CSI tensors before inference (requires retrained model).

## 4 — Mesh security monitoring

Use multi-node CSI anomaly detection to flag physical intrusions independent
of authentication layer.

```bash
curl -X POST http://localhost:3000/api/security/monitor \
  -d '{
    "mode": "perimeter",       // "perimeter" | "zone" | "full"
    "sensitivity": 0.7,        // 0.0–1.0
    "alert_webhook": "https://hooks.example.com/ruview-alert"
  }'
```

Alert payload sent to webhook on detection:

```json
{
  "event":  "intrusion_detected",
  "ts":     1700000000.456,
  "zone":   "perimeter-north",
  "confidence": 0.91,
  "snapshot_url": "http://localhost:3000/api/security/snapshot/latest"
}
```

## Synchronisation notes

| Method | Accuracy | Requirements |
|--------|----------|--------------|
| `ntp` | ±5–10 ms | Both nodes on same LAN with NTP server |
| `ptp` | ±100 µs | IEEE 1588-capable switch |
| `gpio` | ±1 µs | Physical GPIO sync wire between nodes |

For tomography and cross-viewpoint fusion `gpio` or `ptp` is strongly recommended.
