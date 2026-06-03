# RuView ESP32 Firmware

## What you need
- ESP32 dev board (WROOM-32 or S3 recommended)
- USB cable (data, not charge-only)
- [ESP-IDF v5.1+](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/) installed

## First-time setup (do once)

```bash
# 1. Set up IDF environment (run from your ESP-IDF install folder)
. $IDF_PATH/export.sh          # Linux/Mac
# or on Windows: run ESP-IDF PowerShell shortcut

# 2. Clone this repo if not already
git clone https://github.com/Plinypat/wifiwatch.git
cd wifiwatch/firmware/esp32

# 3. Set build target
idf.py set-target esp32        # or esp32s3

# 4. Build
idf.py build
```

## Flash firmware

```bash
# Find your port first:
# Windows: Device Manager → Ports → "Silicon Labs CP210x" or "CH340"
# Linux:   ls /dev/ttyUSB*

idf.py -p COM4 flash           # Windows (replace COM4 with your port)
idf.py -p /dev/ttyUSB0 flash   # Linux
```

## Provision WiFi + server config

After flashing, write your WiFi credentials and server address:

```bash
pip install esptool             # once

python3 firmware/tools/provision.py \
    --port  COM4 \
    --ssid  "YourWiFiName" \
    --pass  "YourPassword" \
    --sink  87.99.158.55 \
    --slot  0              # 0 for first node, 1 for second, 2 for third
```

Run once per board, incrementing `--slot` (0, 1, 2) for each of your 3 nodes.

## Monitor

```bash
idf.py -p COM4 monitor
```

Expected boot output:
```
I (xxx) ruview: WiFi connected  ip=192.168.x.x
I (xxx) ruview: WS client started  target=ws://87.99.158.55:3000/ws/esp32  slot=0/3
I (xxx) ruview: CSI streaming   ch=6  slot=0/3
```

Once all 3 nodes are streaming, the Observatory at
https://project-nspij.vercel.app switches from DEMO to LIVE automatically.

## Mesh setup (3 nodes)

| Node | Slot | Role |
|------|------|------|
| Node A | 0 | Sync master — place near router |
| Node B | 1 | Slave — opposite corner |
| Node C | 2 | Slave — third corner |

```bash
# Provision each board with its slot number:
python3 firmware/tools/provision.py --port COM4 --slot 0 --total 3 ...
python3 firmware/tools/provision.py --port COM5 --slot 1 --total 3 ...
python3 firmware/tools/provision.py --port COM6 --slot 2 --total 3 ...
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed to connect to serial port` | Hold BOOT button while running flash |
| `No WiFi credentials in NVS` | Run provision.py |
| `WiFi connection failed` | Check SSID/password, ensure 2.4 GHz network |
| `WS not connected` | Check server is running: `curl http://87.99.158.55:3000/health` |
| Observatory stays on DEMO | Visit `https://87.99.158.55/health` first to accept cert |
