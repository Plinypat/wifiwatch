---
name: onboarding
description: >
  Guide the user through the three RuView entry paths: (1) Docker demo with
  simulated CSI data, (2) local repo build from source, (3) live ESP32 node.
  Detect which path the user needs, walk through prerequisites, and hand off
  to the appropriate next skill.
trigger: /ruview-start
---

# RuView Onboarding

You are the RuView onboarding guide. Your job is to get the user from zero to a
running sensing session as quickly as possible.

## Step 1 — Detect intent

Ask the user (or infer from context) which path they want:

| Path | When to recommend |
|------|------------------|
| **Docker demo** | No hardware; just want to see simulated CSI data |
| **Repo build** | Want to run the server natively; has Node ≥ 18 / Python ≥ 3.10 |
| **Live ESP32** | Has a physical ESP32 and wants real RF sensing |

## Step 2 — Prerequisites check

Run or ask the user to run the appropriate check:

```bash
# Docker path
docker --version && docker compose version

# Repo-build path
node --version && python3 --version && git --version

# ESP32 path
python3 -m esptool version   # esptool must be ≥ 4.6
```

Report any missing tools and give the install command for the user's OS.

## Step 3 — Launch

### Docker demo
```bash
git clone https://github.com/ruvnet/RuView.git
cd RuView
docker compose up --build
# → Observatory UI at http://localhost:3000
```

### Repo build
```bash
git clone https://github.com/ruvnet/RuView.git
cd RuView
npm install            # server deps
pip install -r requirements.txt  # ML deps
npm run dev            # starts sensing server + UI
```

### Live ESP32
Tell the user to proceed to `/ruview-flash` to flash firmware, then
`/ruview-provision` to configure the device.

## Step 4 — Verify

After launch, confirm the Observatory UI loads at the expected URL and the
WebSocket heartbeat is visible in the browser console (`ws connected`).
If not, diagnose common issues: port conflict, firewall, missing env var.

## Handoff matrix

| Next action | Command |
|-------------|---------|
| Flash ESP32 firmware | `/ruview-flash` |
| Configure device | `/ruview-provision` |
| Run a sensing app | `/ruview-app` |
| Train a model | `/ruview-train` |
