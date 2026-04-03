require("dotenv").config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3007;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/config ──
// Expose MapTiler key to client without hardcoding in HTML
app.get('/api/config', (req, res) => {
  res.json({ maptilerKey: process.env.MAPTILER_KEY });
});

// ── Geocode via MapTiler ──

async function geocode(query, countrycodes) {
  const key = process.env.MAPTILER_KEY;
  let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=1`;
  if (countrycodes) url += `&country=${countrycodes}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data || !data.features || data.features.length === 0) throw new Error('Location not found');
  const f = data.features[0];
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, display_name: f.place_name || f.text || query };
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

// Prevent EPIPE crashes from killing the server
process.on('uncaughtException', err => {
  if (err.code === 'EPIPE') { console.error('[warn] EPIPE swallowed'); return; }
  console.error('Uncaught exception:', err);
});

app.listen(PORT, () => console.log(`MapFrame running on http://localhost:${PORT}`));
