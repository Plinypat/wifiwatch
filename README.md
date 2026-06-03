# WiFi Watch — Sensing Observatory

Real-time WiFi sensing visualization built on Three.js.
Displays presence detection, vital signs, and human pose estimation from WiFi CSI data.

## Deployment (Vercel)

```bash
npx vercel --prod
```

Or connect this repo to Vercel via the dashboard — it deploys as a static site, no build step required.

## Local development

```bash
# Python
python -m http.server 3000

# Node
npx serve .
```

Open http://localhost:3000

## Connecting live data

In the Settings panel (gear icon), go to the **Data** tab:
- Set **Data Source** to **Live WebSocket**
- Enter your sensing server WebSocket URL: `ws://your-server:3000/ws/sensing`

## Adding your features

- `observatory/js/` — Three.js scene modules (vanilla JS, no build step)
- `observatory/css/wifi-watch-brand.css` — brand tokens and overrides
- `index.html` — HUD markup

## Licenses

This project is built on top of the RuView Observatory UI.
The original MIT license is preserved in `/licenses/RuView-MIT-LICENSE.txt`.
