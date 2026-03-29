# MapFrame

Map art generator — create Mapiful-style prints with real tile maps.

## Features
- 13 tile styles (CartoDB Positron/Voyager/Dark, MapTiler Streets/Outdoor/Topo/Winter/Satellite/Backdrop/Aquarelle/Toner, ESRI Gray Dark)
- No-label variants for clean maps
- Custom text with 24 Google Fonts, per-element positioning
- Multi-marker system with Font Awesome icon picker
- Gradient overlay (edge/vignette with curve control)
- Uneven mat controls (top/right/bottom/left)
- Image processing: normalize, contrast, brightness, black point, saturation, grayscale, invert
- AI label removal via EasyOCR + LaMa inpainting (runs on Studio)
- PNG export at full resolution
- URL-based state sharing (Copy Link)
- LocalStorage persistence

## Setup

```bash
npm install
cp .env.example .env
# Add your MAPTILER_KEY to .env
node server.js
```

## Environment
- `MAPTILER_KEY` — MapTiler Cloud API key
- `PORT` — defaults to 3006

## Architecture
- Server: Express + node-fetch + sharp (tile stitching + post-processing)
- Client: Pure HTML/CSS/JS (no build step)
- Tile sources: CartoDB, MapTiler, ESRI ArcGIS
- AI pipeline: SSH to studio, runs Python/EasyOCR/LaMa
