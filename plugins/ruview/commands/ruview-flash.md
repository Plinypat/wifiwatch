---
name: ruview-flash
skill: esp32-setup
description: >
  Build the RuView ESP32 firmware and flash it to a connected device.
  Handles IDF toolchain, esptool fallback, partition layout, and post-flash
  verification.
usage: /ruview-flash [--port <device>] [--target esp32|esp32s3|esp32c3]
examples:
  - /ruview-flash
  - /ruview-flash --port /dev/ttyUSB0
  - /ruview-flash --port COM4 --target esp32s3
---

Invoke the **esp32-setup** skill. Extract `--port` and `--target` from the
user's arguments if present and substitute them into the relevant commands.
If `--port` is omitted, run the port-detection step first.
