---
name: ruview-provision
skill: configuration
description: >
  Provision a flashed ESP32 node: WiFi credentials, sink IP/port,
  RF channel and BSSID filter, mesh slot assignment, and optional TLS
  cert pinning.
usage: /ruview-provision [--method serial|http] [--slot <n>]
examples:
  - /ruview-provision
  - /ruview-provision --method http
  - /ruview-provision --method serial --slot 2
---

Invoke the **configuration** skill. If `--method` is provided skip the method
selection step. If `--slot` is provided pre-fill the mesh slot assignment step.
Prompt for any missing required values (SSID, password, sink IP) before
issuing commands.
