---
name: esp32-setup
description: >
  Build the RuView ESP32 firmware from source and flash it to a connected
  device via esptool or the IDF toolchain. Handles partition layout,
  NVS defaults, OTA partition, and post-flash verification.
trigger: /ruview-flash
---

# ESP32 Firmware Build & Flash

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| ESP-IDF | 5.1 | `./install.sh esp32` via the IDF repo |
| esptool.py | 4.6 | `pip install esptool` |
| cmake | 3.24 | system package manager |

## 1 — Identify the target port

```bash
# Linux / macOS
ls /dev/tty{USB,ACM}* 2>/dev/null || ls /dev/cu.usbserial* 2>/dev/null

# Windows (PowerShell)
Get-WMIObject Win32_PnPEntity | Where Caption -match "COM\d" | Select Caption
```

Prompt the user for `PORT` if it cannot be inferred (e.g. `/dev/ttyUSB0`).

## 2 — Configure the build

```bash
cd firmware/esp32
idf.py set-target esp32          # or esp32s3, esp32c3
idf.py menuconfig                # optional: verify partitions & log level
```

Key `menuconfig` paths to verify:
- `Component config → RuView → CSI channel` (default `6`)
- `Component config → RuView → Sink IP` (set to host IP)
- `Serial flasher config → Flash size` (match your module — typically 4 MB)

## 3 — Build

```bash
idf.py build
# Artefacts: build/ruview.bin, build/partition-table.bin, build/bootloader/bootloader.bin
```

Check for errors. Common fix: `idf.py fullclean && idf.py build`

## 4 — Flash

```bash
idf.py -p $PORT flash
# or with explicit baud rate:
idf.py -p $PORT -b 921600 flash
```

If `idf.py` is unavailable fall back to esptool:

```bash
esptool.py --chip esp32 --port $PORT --baud 921600 \
  write_flash \
  0x1000  build/bootloader/bootloader.bin \
  0x8000  build/partition-table.bin \
  0x10000 build/ruview.bin
```

## 5 — Monitor & verify

```bash
idf.py -p $PORT monitor
```

Expected boot log lines (first 10 s):
```
I (xxx) ruview: NVS loaded
I (xxx) ruview: WiFi STA started
I (xxx) ruview: CSI callback registered  ch=6
```

If the device hangs at `WiFi STA started` the credentials are not yet
provisioned — proceed to `/ruview-provision`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed to connect` | Hold BOOT button while running flash command |
| `MD5 mismatch` | Re-run `idf.py fullclean && idf.py build` |
| Bootloop | Check flash size in menuconfig matches module |
| `NVS: namespace not found` | First boot is normal; proceed to provision |
