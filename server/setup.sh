#!/usr/bin/env bash
# RuView Sensing Server — Hetzner VPS setup script
# Run as root on a fresh Ubuntu 22.04 / Debian 12 VPS:
#   curl -fsSL https://raw.githubusercontent.com/Plinypat/wifiwatch/main/server/setup.sh | bash

set -euo pipefail

REPO="https://github.com/Plinypat/wifiwatch.git"
BRANCH="claude/optimistic-newton-h85kc"
APP_DIR="/opt/ruview"
SERVICE_USER="ruview"
PORT=3000

echo "==> Installing Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git ufw

echo "==> Creating service user"
id "$SERVICE_USER" &>/dev/null || useradd -r -m -s /bin/bash "$SERVICE_USER"

echo "==> Cloning / updating repo"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --rebase origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "==> Installing server dependencies"
cd "$APP_DIR/server"
sudo -u "$SERVICE_USER" npm install --omit=dev

echo "==> Configuring firewall"
ufw allow 22/tcp
ufw allow "$PORT/tcp"
ufw --force enable

echo "==> Writing systemd service"
cat > /etc/systemd/system/ruview.service <<EOF
[Unit]
Description=RuView Sensing Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5
Environment=PORT=$PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling and starting service"
systemctl daemon-reload
systemctl enable ruview
systemctl restart ruview
sleep 2
systemctl status ruview --no-pager

echo ""
echo "==> Done! Server running at:"
echo "    http://$(hostname -I | awk '{print $1}'):$PORT/health"
echo "    ws://$(hostname -I | awk '{print $1}'):$PORT/ws/sensing   ← paste this into the Observatory"
echo "    ws://$(hostname -I | awk '{print $1}'):$PORT/ws/esp32     ← point ESP32 nodes here"
