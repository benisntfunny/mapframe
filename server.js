require("dotenv").config();
const express = require('express');
const fetch = require('node-fetch');
const sharp = require('sharp');
const path = require('path');

const app = express();
const PORT = 3006;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Tile styles (@2x = 512×512px) ──

const TILE_STYLES = {
  // Light
  positron:          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  positron_nolabels: "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
  voyager:           "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  voyager_nolabels:  "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png",
  mt_basic:          "https://api.maptiler.com/maps/basic-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  // Artistic
  mt_aquarelle:      "https://api.maptiler.com/maps/aquarelle/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_toner:          "https://api.maptiler.com/maps/toner-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_toner_bg:       "https://api.maptiler.com/maps/toner-v2-background/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  // Rich/colorful
  mt_streets:        "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_outdoor:        "https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_topo:           "https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_winter:         "https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  mt_satellite:      "https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  // Dark
  dark:              "https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  dark_nolabels:     "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
  mt_dark:           "https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
  // Minimal/high-contrast
  esri_dark_gray:    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  mt_backdrop:       "https://api.maptiler.com/maps/backdrop/{z}/{x}/{y}@2x.png?key=${process.env.MAPTILER_KEY}",
};

const TILE_SIZE = 512;

// ── Tile math ──

function latLonToPixel(lat, lon, zoom, tileSize = TILE_SIZE) {
  const n = Math.pow(2, zoom);
  const x = (lon + 180) / 360 * n * tileSize;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
  return { x, y };
}

const TILE_SIZE_OVERRIDES = {
  esri_dark_gray: 256,
}
// Apply sharp contrast/linear boost after fetch for washed-out styles
const CONTRAST_BOOST = {
  esri_dark_gray: { linear: [1.8, -0.15] },
};

function getTileSize(style) {
  return TILE_SIZE_OVERRIDES[style] || TILE_SIZE;
}

function getTileUrl(style, z, x, y) {
  return TILE_STYLES[style].replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

// ── Geocode via Nominatim ──

async function geocode(query, countrycodes) {
  let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  if (countrycodes) url += `&countrycodes=${encodeURIComponent(countrycodes)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MapFrameApp/1.0 (ben@homesweetserver.com)' }
  });
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Location not found');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display_name: data[0].display_name };
}

// ── POST /api/osm ──

app.post('/api/osm', async (req, res) => {
  try {
    const { query, lat, lon, countrycodes } = req.body;
    let centerLat, centerLon, displayName;
    if (lat && lon) {
      centerLat = parseFloat(lat);
      centerLon = parseFloat(lon);
      displayName = `${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}`;
    } else if (query) {
      const geo = await geocode(query, countrycodes);
      centerLat = geo.lat;
      centerLon = geo.lon;
      displayName = geo.display_name;
    } else {
      return res.status(400).json({ error: 'Provide query or lat/lon' });
    }
    res.json({ center: { lat: centerLat, lon: centerLon }, displayName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/proxy-style ──

app.get('/api/proxy-style', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url param' });
    const allowed = ['basemaps.cartocdn.com'];
    const parsed = new URL(url);
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return res.status(403).json({ error: 'URL not allowed' });
    }
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MapFrameApp/1.0' }
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('proxy-style error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/render ──

app.post('/api/render', async (req, res) => {
  try {
    const { lat, lon, zoom, width, height, style } = req.body;

    if (lat == null || lon == null || zoom == null || width == null || height == null || !style) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    if (!TILE_STYLES[style]) {
      return res.status(400).json({ error: `Unknown style: ${style}` });
    }

    const z = Math.round(zoom);
    const w = Math.min(Math.max(Math.round(width), 100), 4000);
    const h = Math.min(Math.max(Math.round(height), 100), 4000);
    const n = Math.pow(2, z);
    const TS = getTileSize(style); // tile size in px (256 for ESRI, 512 for others)

    // Center pixel position in the global tile grid (using actual tile size)
    const center = latLonToPixel(lat, lon, z, TS);

    // Integer pixel bounds for the requested viewport
    const left = Math.round(center.x - w / 2);
    const top = Math.round(center.y - h / 2);

    // Which tiles cover this pixel range
    const tileMinX = Math.floor(left / TS);
    const tileMaxX = Math.floor((left + w - 1) / TS);
    const tileMinY = Math.floor(top / TS);
    const tileMaxY = Math.floor((top + h - 1) / TS);

    // Collect tile coordinates
    const tiles = [];
    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        const wrappedX = ((tx % n) + n) % n;
        const clampedY = Math.max(0, Math.min(n - 1, ty));
        tiles.push({ tx, ty, fetchX: wrappedX, fetchY: clampedY });
      }
    }

    if (tiles.length > 36) {
      return res.status(400).json({ error: `Too many tiles (${tiles.length}). Use a higher zoom or smaller dimensions.` });
    }

    // Fetch all tiles in parallel
    const tileResults = await Promise.all(tiles.map(async (tile) => {
      const url = getTileUrl(style, z, tile.fetchX, tile.fetchY);
      try {
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'MapFrameApp/1.0' },
          timeout: 10000
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.buffer();
        // Normalize tile + optional contrast boost
        let pipeline = sharp(raw).resize(TS, TS, { fit: 'fill' });
        if (CONTRAST_BOOST[style]) {
          const [a, b] = CONTRAST_BOOST[style].linear;
          pipeline = pipeline.linear(a, b);
        }
        const buffer = await pipeline.png().toBuffer();
        return {
          buffer,
          left: (tile.tx - tileMinX) * TS,
          top: (tile.ty - tileMinY) * TS
        };
      } catch (err) {
        console.error(`Tile z=${z} x=${tile.fetchX} y=${tile.fetchY} failed:`, err.message);
        const placeholder = await sharp({
          create: { width: TS, height: TS, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 255 } }
        }).png().toBuffer();
        return {
          buffer: placeholder,
          left: (tile.tx - tileMinX) * TS,
          top: (tile.ty - tileMinY) * TS
        };
      }
    }));

    // Stitch and crop
    const stitchW = (tileMaxX - tileMinX + 1) * TS;
    const stitchH = (tileMaxY - tileMinY + 1) * TS;
    const cropX = Math.max(0, left - tileMinX * TS);
    const cropY = Math.max(0, top - tileMinY * TS);
    // Clamp crop dimensions to stay within stitched canvas
    const cropW = Math.min(w, stitchW - cropX);
    const cropH = Math.min(h, stitchH - cropY);

    console.log(`Stitch ${stitchW}x${stitchH}, crop at (${cropX},${cropY}) ${cropW}x${cropH}`);
    // Debug: log actual sizes of each tile buffer
    for (const t of tileResults) {
      const meta = await sharp(t.buffer).metadata();
      console.log(`  tile left=${t.left} top=${t.top} actual=${meta.width}x${meta.height}`);
    }

    const baseCanvas = await sharp({
      create: { width: stitchW, height: stitchH, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 255 } }
    }).png().toBuffer();

    // sharp 0.34: cannot chain .composite().extract() — must be two separate calls
    const stitched = await sharp(baseCanvas)
      .composite(tileResults.map(t => ({ input: t.buffer, left: t.left, top: t.top })))
      .png()
      .toBuffer();

    let pipeline = sharp(stitched)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(w, h, { fit: 'fill' });

    // Optional post-processing
    const contrast    = parseFloat(req.body.contrast    || 1);
    const brightness  = parseFloat(req.body.brightness  || 1);
    const saturation  = parseFloat(req.body.saturation  || 1);
    const invert      = req.body.invert === true || req.body.invert === 'true';
    const grayscale   = req.body.grayscale === true || req.body.grayscale === 'true';

    // Pipeline: grayscale → normalize → [negate if invert] → contrast/brightness/blackpoint → saturation → [negate again if NOT invert to restore, or skip]
    // When invert=true: negate early so contrast boosts the right tones, no second negate needed
    // When invert=false: negate at end (or skip if not checked)
    if (grayscale)  pipeline = pipeline.grayscale();
    const normalize = req.body.normalize === true || req.body.normalize === 'true';
    if (normalize)  pipeline = pipeline.normalize();
    if (invert)     pipeline = pipeline.negate(); // negate before contrast when inverting
    const blackPoint = parseFloat(req.body.blackPoint || 0);
    if (contrast !== 1 || brightness !== 1 || blackPoint !== 0) {
      const a = contrast;
      const b = Math.round((brightness - 1) * 128) - blackPoint;
      pipeline = pipeline.linear(a, b);
    }
    if (saturation !== 1) pipeline = pipeline.modulate({ saturation });

    const result = await pipeline.png().toBuffer();
    res.set('Content-Type', 'image/png');
    res.send(result);
  } catch (err) {
    console.error('Render error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/post-process ──
// Accepts PNG, runs label removal via Studio, returns cleaned PNG
// Body: multipart form OR raw PNG with ?op=remove_labels
const { execFile } = require('child_process');
const os = require('os');
const fsp = require('fs').promises;

app.post('/api/post-process', async (req, res) => {
  try {
    const op = req.query.op || 'remove_labels';
    if (op !== 'remove_labels') return res.status(400).json({ error: 'Unknown op' });

    // Read raw PNG body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const inputBuf = Buffer.concat(chunks);
    if (!inputBuf.length) return res.status(400).json({ error: 'No image data' });

    // Write to temp file
    const tmpIn = `${os.tmpdir()}/mapframe-in-${Date.now()}.png`;
    const tmpOut = `${os.tmpdir()}/mapframe-out-${Date.now()}.png`;
    await fsp.writeFile(tmpIn, inputBuf);

    // SSH to studio and run pipeline
    await new Promise((resolve, reject) => {
      const ssh = execFile('ssh', [
        'ben@studio',
        `/opt/homebrew/opt/python@3.12/bin/python3.12 ~/bin/remove_labels.py - -`
      ], { maxBuffer: 50 * 1024 * 1024 });

      const chunks2 = [];
      ssh.stdout.on('data', d => chunks2.push(d));
      ssh.stderr.on('data', d => process.stderr.write('[studio] ' + d));
      ssh.stdin.write(inputBuf);
      ssh.stdin.end();

      ssh.on('close', code => {
        if (code !== 0) return reject(new Error(`Studio pipeline exited ${code}`));
        const outBuf = Buffer.concat(chunks2);
        fsp.writeFile(tmpOut, outBuf).then(() => resolve(outBuf));
      });
    }).then(outBuf => {
      res.set('Content-Type', 'image/png');
      res.send(outBuf);
    });

    await fsp.unlink(tmpIn).catch(() => {});
  } catch (err) {
    console.error('post-process error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`MapFrame running on http://localhost:${PORT}`));
