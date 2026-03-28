const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3006;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Geocode a city name to lat/lon using Nominatim
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MapFrameApp/1.0 (ben@homesweetserver.com)' }
  });
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Location not found');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display_name: data[0].display_name };
}

// Fetch OSM data via Overpass
async function fetchOSMData(lat, lon, radiusKm) {
  const r = radiusKm * 1000; // meters
  const query = `
[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|footway|path|cycleway|pedestrian|living_street|unclassified)$"](around:${r},${lat},${lon});
  way["waterway"~"^(river|stream|canal|drain|brook)$"](around:${r},${lat},${lon});
  way["natural"~"^(water|coastline|wood|forest|grass|scrub|heath|beach)$"](around:${r},${lat},${lon});
  relation["natural"~"^(water)$"](around:${r},${lat},${lon});
  way["leisure"~"^(park|garden|playground|pitch|golf_course|nature_reserve)$"](around:${r},${lat},${lon});
  way["landuse"~"^(park|forest|grass|meadow|cemetery|recreation_ground|village_green)$"](around:${r},${lat},${lon});
  way["building"](around:${r},${lat},${lon});
);
out geom;
`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  return res.json();
}

// Project lat/lon to SVG coordinates
function project(lat, lon, centerLat, centerLon, scale, svgSize) {
  const latRad = lat * Math.PI / 180;
  const centerLatRad = centerLat * Math.PI / 180;
  const x = (lon - centerLon) * Math.cos(centerLatRad) * scale + svgSize / 2;
  const y = -(lat - centerLat) * scale + svgSize / 2;
  return { x, y };
}

function getStyleConfig(style) {
  const styles = {
    minimal: {
      bg: '#f8f5f0',
      water: { fill: '#c9dde8', stroke: '#a0c4d8', strokeWidth: 0.5 },
      park: { fill: '#d4e8c9', stroke: 'none' },
      building: { fill: '#e8e0d8', stroke: '#ccc8c0', strokeWidth: 0.3 },
      highway: {
        motorway: { stroke: '#888', strokeWidth: 2.5 },
        trunk: { stroke: '#999', strokeWidth: 2.2 },
        primary: { stroke: '#aaa', strokeWidth: 1.8 },
        secondary: { stroke: '#bbb', strokeWidth: 1.4 },
        tertiary: { stroke: '#ccc', strokeWidth: 1.0 },
        residential: { stroke: '#ddd', strokeWidth: 0.6 },
        service: { stroke: '#e0e0e0', strokeWidth: 0.4 },
        footway: { stroke: '#ddd', strokeWidth: 0.3, dasharray: '2,2' },
        path: { stroke: '#ddd', strokeWidth: 0.3, dasharray: '2,2' },
        cycleway: { stroke: '#ccc', strokeWidth: 0.3 },
        pedestrian: { stroke: '#ddd', strokeWidth: 0.5 },
        living_street: { stroke: '#ddd', strokeWidth: 0.5 },
        unclassified: { stroke: '#ddd', strokeWidth: 0.5 }
      },
      textColor: '#333',
      frameColor: '#2c2c2c',
      frameBg: '#f0ebe3'
    },
    dark: {
      bg: '#0d0d0d',
      water: { fill: '#0d2233', stroke: '#1a3a50', strokeWidth: 0.5 },
      park: { fill: '#0d1f0d', stroke: 'none' },
      building: { fill: '#1a1a1a', stroke: '#2a2a2a', strokeWidth: 0.3 },
      highway: {
        motorway: { stroke: '#eee', strokeWidth: 2.5 },
        trunk: { stroke: '#ddd', strokeWidth: 2.2 },
        primary: { stroke: '#ccc', strokeWidth: 1.8 },
        secondary: { stroke: '#aaa', strokeWidth: 1.4 },
        tertiary: { stroke: '#888', strokeWidth: 1.0 },
        residential: { stroke: '#555', strokeWidth: 0.6 },
        service: { stroke: '#333', strokeWidth: 0.4 },
        footway: { stroke: '#444', strokeWidth: 0.3, dasharray: '2,2' },
        path: { stroke: '#444', strokeWidth: 0.3, dasharray: '2,2' },
        cycleway: { stroke: '#444', strokeWidth: 0.3 },
        pedestrian: { stroke: '#555', strokeWidth: 0.5 },
        living_street: { stroke: '#555', strokeWidth: 0.5 },
        unclassified: { stroke: '#555', strokeWidth: 0.5 }
      },
      textColor: '#ddd',
      frameColor: '#111',
      frameBg: '#0a0a0a'
    },
    sepia: {
      bg: '#f4ead8',
      water: { fill: '#b8ccd4', stroke: '#9ab0bc', strokeWidth: 0.5 },
      park: { fill: '#c8d8a8', stroke: 'none' },
      building: { fill: '#e4d4b8', stroke: '#c8b89a', strokeWidth: 0.3 },
      highway: {
        motorway: { stroke: '#7a5c3a', strokeWidth: 2.5 },
        trunk: { stroke: '#8a6c4a', strokeWidth: 2.2 },
        primary: { stroke: '#9a7c5a', strokeWidth: 1.8 },
        secondary: { stroke: '#aa8c6a', strokeWidth: 1.4 },
        tertiary: { stroke: '#ba9c7a', strokeWidth: 1.0 },
        residential: { stroke: '#c8aa88', strokeWidth: 0.6 },
        service: { stroke: '#d0b898', strokeWidth: 0.4 },
        footway: { stroke: '#c0a880', strokeWidth: 0.3, dasharray: '2,2' },
        path: { stroke: '#c0a880', strokeWidth: 0.3, dasharray: '2,2' },
        cycleway: { stroke: '#b8a078', strokeWidth: 0.3 },
        pedestrian: { stroke: '#c0a880', strokeWidth: 0.5 },
        living_street: { stroke: '#c0a880', strokeWidth: 0.5 },
        unclassified: { stroke: '#c0a880', strokeWidth: 0.5 }
      },
      textColor: '#4a3520',
      frameColor: '#5a3e28',
      frameBg: '#ede0c8'
    }
  };
  return styles[style] || styles.minimal;
}

function renderSVG(osmData, centerLat, centerLon, radiusKm, style, label) {
  const svgSize = 1200;
  const padding = 80;
  const mapSize = svgSize - padding * 2;

  // Degrees per km at this latitude
  const latPerKm = 1 / 110.574;
  const lonPerKm = 1 / (111.320 * Math.cos(centerLat * Math.PI / 180));
  const latSpan = radiusKm * latPerKm * 2;
  const lonSpan = radiusKm * lonPerKm * 2;
  const scaleY = mapSize / latSpan;
  const scaleX = mapSize / lonSpan;
  const scale = Math.min(scaleX, scaleY);

  const cfg = getStyleConfig(style);

  const waysByType = {
    water: [],
    park: [],
    building: [],
    highway: {}
  };

  for (const el of osmData.elements) {
    if (el.type !== 'way' || !el.geometry) continue;
    const tags = el.tags || {};

    if (tags.natural === 'water' || tags.waterway || tags.natural === 'coastline') {
      waysByType.water.push(el);
    } else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve' ||
               tags.landuse === 'park' || tags.landuse === 'forest' || tags.landuse === 'grass' ||
               tags.landuse === 'meadow' || tags.landuse === 'cemetery' || tags.landuse === 'recreation_ground' ||
               tags.landuse === 'village_green' || tags.natural === 'wood' || tags.natural === 'forest' ||
               tags.natural === 'grass' || tags.natural === 'scrub') {
      waysByType.park.push(el);
    } else if (tags.building) {
      waysByType.building.push(el);
    } else if (tags.highway) {
      const ht = tags.highway;
      if (!waysByType.highway[ht]) waysByType.highway[ht] = [];
      waysByType.highway[ht].push(el);
    }
  }

  function wayToPath(way) {
    if (!way.geometry || way.geometry.length < 2) return '';
    let d = '';
    for (let i = 0; i < way.geometry.length; i++) {
      const pt = way.geometry[i];
      // bounds check
      if (Math.abs(pt.lat - centerLat) > radiusKm * latPerKm * 1.1) continue;
      if (Math.abs(pt.lon - centerLon) > radiusKm * lonPerKm * 1.1) continue;
      const p = project(pt.lat, pt.lon, centerLat, centerLon, scale, mapSize);
      d += (i === 0 ? 'M' : 'L') + `${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    }
    return d;
  }

  function waysToSVGAreas(ways, fillStyle) {
    return ways.map(w => {
      const d = wayToPath(w);
      if (!d) return '';
      const fill = fillStyle.fill || 'none';
      const stroke = fillStyle.stroke || 'none';
      const sw = fillStyle.strokeWidth || 0.5;
      return `<path d="${d}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    }).join('\n');
  }

  function waysToSVGLines(ways, lineStyle) {
    return ways.map(w => {
      const d = wayToPath(w);
      if (!d) return '';
      const stroke = lineStyle.stroke || '#999';
      const sw = lineStyle.strokeWidth || 1;
      const da = lineStyle.dasharray ? `stroke-dasharray="${lineStyle.dasharray}"` : '';
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${da}/>`;
    }).join('\n');
  }

  const highwayOrder = ['residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'footway', 'path', 'cycleway', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];

  let svgParts = [];
  svgParts.push(waysToSVGAreas(waysByType.park, cfg.park));
  svgParts.push(waysToSVGAreas(waysByType.water, cfg.water));
  svgParts.push(waysToSVGAreas(waysByType.building, cfg.building));

  for (const ht of highwayOrder) {
    if (waysByType.highway[ht] && cfg.highway[ht]) {
      svgParts.push(waysToSVGLines(waysByType.highway[ht], cfg.highway[ht]));
    }
  }

  const clipId = 'mapclip';
  const frameSize = svgSize;
  const frameOuter = 24;
  const frameInner = 8;

  // Frame mat area
  const matX = frameOuter;
  const matY = frameOuter;
  const matW = frameSize - frameOuter * 2;
  const matH = frameSize - frameOuter * 2;
  const mapX = matX + frameInner + padding - frameOuter;
  const mapY = matY + frameInner + padding - frameOuter;

  // Label
  const labelY = frameSize - frameOuter - frameInner - 10;
  const labelParts = label ? label.split('\n') : [];

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${padding}" y="${padding}" width="${mapSize}" height="${mapSize}"/>
    </clipPath>
  </defs>

  <!-- Frame background -->
  <rect width="${svgSize}" height="${svgSize}" fill="${cfg.frameColor}"/>
  <!-- Mat -->
  <rect x="${frameOuter}" y="${frameOuter}" width="${matW}" height="${matH}" fill="${cfg.frameBg}"/>
  <!-- Inner frame line -->
  <rect x="${frameOuter + frameInner}" y="${frameOuter + frameInner}" width="${matW - frameInner*2}" height="${matH - frameInner*2}" fill="none" stroke="${cfg.frameColor}" stroke-width="1.5"/>

  <!-- Map area -->
  <g transform="translate(${padding},${padding})">
    <!-- Background -->
    <rect width="${mapSize}" height="${mapSize}" fill="${cfg.bg}"/>
    <!-- Map content clipped -->
    <g clip-path="url(#${clipId})" transform="translate(-${padding},-${padding})">
      <g transform="translate(${padding},${padding})">
        ${svgParts.join('\n        ')}
      </g>
    </g>
  </g>

  <!-- Label area -->
  <text x="${svgSize/2}" y="${labelY - (labelParts.length > 1 ? 14 : 0)}" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="${cfg.textColor}" letter-spacing="4" opacity="0.7">${labelParts[0] || ''}</text>
  ${labelParts[1] ? `<text x="${svgSize/2}" y="${labelY + 6}" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${cfg.textColor}" letter-spacing="2" opacity="0.5">${labelParts[1]}</text>` : ''}
</svg>`;

  return svg;
}

// API: render map
app.post('/api/render', async (req, res) => {
  try {
    const { query, lat, lon, radius = 1.5, style = 'minimal', label } = req.body;

    let centerLat, centerLon, displayName;

    if (lat && lon) {
      centerLat = parseFloat(lat);
      centerLon = parseFloat(lon);
      displayName = `${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}`;
    } else if (query) {
      const geo = await geocode(query);
      centerLat = geo.lat;
      centerLon = geo.lon;
      displayName = geo.display_name;
    } else {
      return res.status(400).json({ error: 'Provide query or lat/lon' });
    }

    const osmData = await fetchOSMData(centerLat, centerLon, parseFloat(radius));
    const mapLabel = label || displayName.split(',').slice(0, 2).join(',').trim();
    const svg = renderSVG(osmData, centerLat, centerLon, parseFloat(radius), style, mapLabel);

    res.json({
      svg,
      center: { lat: centerLat, lon: centerLon },
      displayName
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MapFrame running on port ${PORT}`);
});
