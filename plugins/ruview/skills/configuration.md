---
name: configuration
description: >
  Provision a flashed ESP32 node over serial NVS or the RuView HTTP API.
  Covers WiFi credentials, sink (server) IP and port, 802.11 channel and
  BSSID/MAC filter, mesh slot assignment, and optional TLS cert pinning.
trigger: /ruview-provision
---

# Device Provisioning

Provisioning writes key-value pairs into the ESP32's NVS partition.
Two methods are supported: **serial NVS tool** (offline) and
**HTTP provisioning API** (device must be on the local network first via AP mode).

## Method A — Serial NVS (recommended for first-time setup)

```bash
# Install the NVS tool once
pip install esptool nvs-partition-gen

python3 tools/provision.py \
  --port  /dev/ttyUSB0   \
  --ssid  "MyNetwork"    \
  --pass  "s3cr3t"       \
  --sink  192.168.1.100  \
  --port-ws 3000         \
  --channel 6            \
  --mac   AA:BB:CC:DD:EE:FF   # optional BSSID filter
```

`tools/provision.py` wraps `nvs_partition_gen` and flashes only the NVS partition,
preserving firmware.

## Method B — HTTP API (device in AP mode)

When not yet provisioned the ESP32 starts a soft-AP `RuView-XXXX`.

1. Connect your laptop to `RuView-XXXX` (password: `ruview123`).
2. POST credentials:

```bash
curl -X POST http://192.168.4.1/api/provision \
  -H "Content-Type: application/json" \
  -d '{
    "ssid":    "MyNetwork",
    "pass":    "s3cr3t",
    "sink_ip": "192.168.1.100",
    "sink_port": 3000,
    "channel": 6
  }'
```

3. The device reboots and joins `MyNetwork`.

## Mesh slot assignment

RuView supports up to 8 nodes in a multistatic mesh. Assign each node a unique
slot (0–7):

```bash
# Serial
python3 tools/provision.py --port /dev/ttyUSB0 --mesh-slot 1

# HTTP (device already on LAN)
curl -X POST http://<device-ip>/api/mesh \
  -d '{"slot": 1, "total": 4}'
```

Slot 0 is the designated sync master and emits the reference CSI frame.

## NVS key reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `wifi/ssid` | string | — | Station SSID |
| `wifi/pass` | string | — | Station password |
| `sink/ip` | string | — | Sensing server IP |
| `sink/port` | u16 | 3000 | Sensing server WS port |
| `rf/channel` | u8 | 6 | 802.11 channel (1–13) |
| `rf/mac` | string | — | BSSID filter (optional) |
| `mesh/slot` | u8 | 0 | Mesh slot index |
| `mesh/total` | u8 | 1 | Total nodes in mesh |
| `tls/cert` | blob | — | PEM cert for TLS pinning |

## Verify provisioning

```bash
idf.py -p /dev/ttyUSB0 monitor
# Expect:
# I (xxx) ruview: WiFi connected  ip=192.168.1.42
# I (xxx) ruview: WS connected    sink=192.168.1.100:3000
# I (xxx) ruview: CSI streaming   ch=6 slot=0/1
```
