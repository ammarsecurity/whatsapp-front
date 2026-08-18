#!/usr/bin/env bash
# Ubuntu: Google Chrome + libraries required by Puppeteer / whatsapp-web.js
set -euo pipefail

echo "==> Installing Chrome runtime dependencies..."
apt-get update -qq
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  libxshmfence1 \
  xdg-utils \
  wget \
  gnupg

if ! command -v google-chrome >/dev/null 2>&1; then
  echo "==> Google Chrome not found — installing from Google repo..."
  install -m 0755 -d /etc/apt/keyrings
  wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -qq
  apt-get install -y google-chrome-stable
fi

CHROME="${CHROME_PATH:-/usr/bin/google-chrome}"
if [ ! -x "$CHROME" ] && [ -x /usr/bin/google-chrome-stable ]; then
  CHROME=/usr/bin/google-chrome-stable
fi

echo "==> Chrome binary: $CHROME"
"$CHROME" --version

echo "==> Headless smoke test..."
"$CHROME" \
  --headless=new \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --dump-dom about:blank >/dev/null

echo "==> OK — Chrome is ready for WhatsApp backend"

CHROME_HOME="${CHROME_HOME:-/var/lib/whatsapp-api/chrome-home}"
mkdir -p "$CHROME_HOME/.local/share/applications" "$CHROME_HOME/crash-dumps"
chmod -R 755 "$CHROME_HOME"
echo "==> CHROME_HOME ready at $CHROME_HOME"
