---
name: ruview-start
skill: onboarding
description: >
  Onboarding wizard. Detects whether the user wants a Docker demo, a local
  repo build, or a live ESP32 session, checks prerequisites, and gets them
  to a running Observatory UI.
usage: /ruview-start [docker|build|esp32]
examples:
  - /ruview-start
  - /ruview-start docker
  - /ruview-start esp32
---

Invoke the **onboarding** skill. If the user passed an argument (`docker`,
`build`, or `esp32`) skip the detection step and jump directly to that path.
Otherwise ask which path they need before proceeding.
