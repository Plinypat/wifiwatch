---
name: mmwave-radar
description: >
  Configure and use RuView alongside or as a drop-in for a TI mmWave radar
  (IWR6843, AWR2944). Covers radar bring-up, CSI/radar data fusion, range-
  Doppler interpretation, and combined WiFi-mmWave sensing pipelines.
---

# mmWave Radar Integration

RuView can ingest data from TI IWR/AWR mmWave radar modules alongside WiFi CSI,
or operate purely on mmWave for scenarios requiring higher range resolution.

## Supported hardware

| Board | Interface | SDK | Notes |
|-------|-----------|-----|-------|
| TI IWR6843ISK | UART (921600 baud) | mmWave SDK 3.5 | Best for indoor tracking |
| TI AWR2944 | Ethernet (DCA1000) | mmWave SDK 5.x | High-bandwidth, 4D imaging |
| TI IWR1843 | UART | mmWave SDK 3.5 | Cost-optimised, 3 TX |

## 1 — Flash TI firmware

Use TI UniFlash or the RuView helper:

```bash
python3 tools/mmwave_flash.py \
  --device IWR6843ISK \
  --cfg    radar/configs/indoor_3d.cfg \
  --port   /dev/ttyACM0   # control port
```

## 2 — Connect to RuView server

```bash
# Add mmWave source alongside WiFi CSI
curl -X POST http://localhost:3000/api/sources/add \
  -d '{
    "type":   "mmwave",
    "device": "IWR6843ISK",
    "port":   "/dev/ttyACM0",
    "data_port": "/dev/ttyACM1",
    "cfg":    "radar/configs/indoor_3d.cfg"
  }'
```

The server parses TLV frames (Type-Length-Value) emitted by the mmWave SDK
and converts them to the standard RuView `SensingFrame` schema.

## 3 — Radar configuration profiles

RuView ships three built-in `.cfg` profiles:

| Profile | Range | Velocity res | Use case |
|---------|-------|-------------|---------|
| `indoor_3d.cfg` | 0.1–5 m | 0.13 m/s | Presence + pose |
| `vital_signs.cfg` | 0.3–1.5 m | 0.02 m/s | Breath + heartbeat |
| `long_range.cfg` | 0.5–15 m | 0.25 m/s | Perimeter security |

Customise a profile:

```bash
# Key parameters in .cfg
profileCfg 0 60 7 3 57.14 0 0 70 1 256 5209 0 0 30
# ↑ start_freq(GHz) idle_t ramp_end_t freq_slope samples adc_rate ...
```

Refer to `docs/mmwave-cfg-reference.md` for full parameter descriptions.

## 4 — WiFi + mmWave fusion pipeline

Run both sources simultaneously and fuse their outputs:

```bash
curl -X POST http://localhost:3000/api/advanced/fusion \
  -d '{
    "sources": ["wifi_csi", "mmwave"],
    "strategy": "confidence_weighted",   // or "kalman" | "early" | "late"
    "app": "mat"
  }'
```

Fusion improves tracking robustness:
- WiFi CSI: wider field of view, through-wall capability
- mmWave: higher range resolution, velocity ground truth

## 5 — Range-Doppler interpretation

The `/api/app/stream` payload for `app: "mmwave_rd"`:

```json
{
  "app": "mmwave_rd",
  "payload": {
    "range_bins":   256,
    "doppler_bins": 16,
    "range_m":      [0.1, 5.0],
    "velocity_mps": [-2.0, 2.0],
    "matrix":       "<base64 float32 256×16>"
  }
}
```

Render the range-Doppler heatmap in the Observatory UI:
- Select **mmWave** tab → **Range-Doppler** view.
- Bright vertical strip = stationary target (zero Doppler).
- Bright off-centre stripe = moving target (positive = approaching).

## 6 — Troubleshooting

| Symptom | Fix |
|---------|-----|
| No TLV frames on data port | Verify both ACM0 (control) and ACM1 (data) are open |
| `ARM_STATUS_INIT_FAILED` | Re-flash firmware, reset board |
| Point cloud empty | Distance outside configured range profile |
| High false-positive rate | Reduce `sensitivity` or apply spatial ROI mask |
