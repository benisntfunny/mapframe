# MapFrame Vector Edition — Migration Task

## Goal
Rewrite MapFrame's map rendering from server-side raster tile stitching (sharp/PNG) to **client-side vector tile rendering** using MapLibre GL JS. Keep all existing UI/features intact.

## Why
- Current: fetches raster PNG tiles → stitches with sharp → returns PNG to client
- Target: render vector tiles client-side → export canvas → download PNG
- Benefits: sharper at all zoom levels, SVG export possible, no server tile-fetching bottleneck

## Project location
`/home/ben/clawd/comms/2026-03-30-mapframe-vector/`
The server runs on port **3007** (not 3006).

## Key constraints
- MapLibre GL JS requires WebGL. The existing app was built on a non-WebGL machine, but the **production server** (mapframe.apps.homesweetserver.com) runs in a normal browser — WebGL is available there.
- Keep ALL existing UI controls: mat, border, text, markers, gradient, process sliders, download sizes, URL params, localStorage — everything stays.
- The server still needs to run for: geocoding (`/api/osm`) and the MapTiler API key proxy (so the key isn't exposed client-side). Remove `/api/render` and `/api/post-process`.

## Architecture after migration

### Client
1. Load MapLibre GL JS from CDN
2. Initialize `maplibregl.Map` in a hidden `<div id="maplibre-container">` 
3. On "Generate": geocode → fly map to location → after map idle, capture to canvas
4. Capture: use `map.getCanvas()` to get the WebGL canvas, draw it to an offscreen canvas, then composite mat/text/markers/gradient on top (same as current `updatePreview()` flow)
5. Preview: show the composited result in `#map-layer` img (or use the canvas directly)
6. Download: same `compositeToCanvas()` function, but source image from MapLibre canvas

### Server simplification
Keep `/api/osm` (geocoding). Remove `/api/render` tile-stitching endpoint entirely.

## MapTiler styles to wire up
MapLibre uses style JSON URLs. MapTiler provides these:

```javascript
const MAPTILER_STYLES = {
  positron:     `https://api.maptiler.com/maps/positron/style.json?key=${KEY}`,
  voyager:      `https://api.maptiler.com/maps/voyager/style.json?key=${KEY}`,
  mt_basic:     `https://api.maptiler.com/maps/basic-v2/style.json?key=${KEY}`,
  mt_aquarelle: `https://api.maptiler.com/maps/aquarelle/style.json?key=${KEY}`,
  mt_toner:     `https://api.maptiler.com/maps/toner-v2/style.json?key=${KEY}`,
  mt_streets:   `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`,
  mt_outdoor:   `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${KEY}`,
  mt_topo:      `https://api.maptiler.com/maps/topo-v2/style.json?key=${KEY}`,
  mt_winter:    `https://api.maptiler.com/maps/winter-v2/style.json?key=${KEY}`,
  mt_satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${KEY}`,
  dark:         `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${KEY}`,
  mt_dark:      `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${KEY}`,
  mt_backdrop:  `https://api.maptiler.com/maps/backdrop/style.json?key=${KEY}`,
  esri_dark_gray: `https://api.maptiler.com/maps/basic-v2-dark/style.json?key=${KEY}`,
  // No-label variants (MapLibre can hide labels via layer filtering)
  positron_nolabels: `https://api.maptiler.com/maps/positron-nolabels/style.json?key=${KEY}`,
  voyager_nolabels:  `https://api.maptiler.com/maps/voyager-nolabels/style.json?key=${KEY}`,
  dark_nolabels:     `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${KEY}`, // filter labels
};
```

Note: The MapTiler API key is `hCyLl9rO9H0k3vMra7tF` — it's already in `.env`. Expose it to the client via a `/api/config` endpoint that returns `{ maptilerKey: process.env.MAPTILER_KEY }` so the key isn't hardcoded in the HTML.

## No-labels implementation
For styles without a native nolabels variant, hide label layers in MapLibre:
```javascript
function hideLabels(map) {
  map.getStyle().layers.forEach(layer => {
    if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none');
  });
}
```

## Process filters (contrast/brightness/saturation/grayscale/invert)
These currently run server-side via sharp. In vector mode, apply them client-side using **CSS filters** on the MapLibre canvas or canvas `filter` property before compositing:
```javascript
// Apply to offscreen canvas context
ctx.filter = buildCssFilter(contrast, brightness, saturation, grayscale, invert);
ctx.drawImage(maplibreaCanvas, 0, 0);
ctx.filter = 'none';
```

## Capture flow
```javascript
async function captureMap(width, height) {
  // Resize MapLibre container to target dimensions
  mapContainer.style.width = width + 'px';
  mapContainer.style.height = height + 'px';
  map.resize();
  
  // Wait for map to be fully rendered
  await new Promise(resolve => {
    map.once('idle', resolve);
    map.triggerRepaint();
  });
  
  // Get WebGL canvas
  return map.getCanvas();
}
```

## Download sizes
The Download buttons (Print/High/Medium/Low) currently re-fetch tiles at higher zoom. In vector mode:
- Temporarily resize the MapLibre container to the target dimensions (e.g. 6000×6000 for Print)
- Wait for idle
- Capture and composite
- Restore original size

## Files to change
- `public/index.html` — main UI + JS (big changes)
- `server.js` — remove `/api/render`, add `/api/config`, keep `/api/osm`
- `requirements.txt` / `package.json` — sharp dependency can be removed

## Files to keep unchanged
- `start.sh`
- `.env`
- `static/`
- `templates/` (not used by main app, just dashboard references)

## Testing
After implementation, start the server:
```bash
cd /home/ben/clawd/comms/2026-03-30-mapframe-vector
node server.js
```
It should run on port 3007. Test by loading `http://localhost:3007` in a browser.

## Done signal
When complete:
```bash
openclaw system event --text "Done: MapFrame vector edition ready on port 3007 at /home/ben/clawd/comms/2026-03-30-mapframe-vector — uses MapLibre GL JS, all UI features preserved" --mode now
```
