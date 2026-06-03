---
name: ruview-app
skill: sensing-apps
description: >
  Launch and operate a RuView sensing application: presence, vitals, pose,
  sleep, MAT (Multi-Antenna Tracking), or pointcloud. Shows live output and
  guides parameter tuning.
usage: /ruview-app [<app-id>] [--params <json>]
examples:
  - /ruview-app
  - /ruview-app presence
  - /ruview-app vitals --params '{"window_s": 60}'
  - /ruview-app pose --params '{"model": "full"}'
---

Invoke the **sensing-apps** skill. If an `<app-id>` argument is present skip
the app-selection step and launch that app directly. Apply any `--params` JSON
to the app's configuration before starting. If no argument is given, present
the app catalogue and ask which to launch.
