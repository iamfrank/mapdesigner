import { OVERPASS_URL } from './state.js'
import state from './state.js'

export async function updateOsmData() {
  try {
    const osmData = await fetchOSMData();
    if (osmData) {
      state.update({
        osmData,
        statusText: `Loaded: ${osmData.streets.length.toLocaleString()} streets, ` +
          `${osmData.water.length.toLocaleString()} water, ` +
          `${osmData.parks.length.toLocaleString()} parks, ` +
          `${osmData.buildings.length.toLocaleString()} buildings, ` +
          `${osmData.railways.length.toLocaleString()} railways, ` +
          `${osmData.coastlines.length.toLocaleString()} coastline ways`
      })
    }

  } catch (err) {
    state.set('statusText', `Error: ${err.message}`)
    console.error(err);
  }
}

/**
 * Fetch OSM ways (highways, coastlines, water, parks/green space, buildings,
 * railways) for the configured bounding box.
 * See
 * - https://wiki.openstreetmap.org/wiki/Map_features
 * - https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
 * @returns {Promise<{ streets: [number,number][][], coastlines: [number,number][][], water: [number,number][][], parks: [number,number][][], buildings: [number,number][][], railways: [number,number][][] }>}
 */
export async function fetchOSMData() {
  const bbox = state.get('bbox')
  console.log('fetching', state.get('bbox'))
  if (!bbox) {
    return
  }
  const query = `[out:json][timeout:120][bbox:${bbox.join(',')}];
(
  way["highway"];
  way["natural"="coastline"];
  way["natural"="water"];
  way["landuse"="reservoir"];
  way["leisure"="park"];
  way["landuse"="forest"];
  way["landuse"="grass"];
  way["landuse"="meadow"];
  way["natural"="wood"];
  way["building"];
  way["railway"];
);
out body;
>;
out skel qt;`;

  state.set('statusText', "Fetching OSM data ...")

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });

  if (!response.ok) {
    throw new Error(
      `Overpass request failed: ${response.status} ${response.statusText}`,
    );
  }

  state.set('statusText', 'Parsing OSM data…')
  const json = await response.json();
  return parseOSMData(json);
}

/**
 * Parse an Overpass JSON response into arrays of polylines, bucketed by
 * feature category.
 * @param {object} json
 * @returns {{ streets: [number,number][][], coastlines: [number,number][][], water: [number,number][][], parks: [number,number][][], buildings: [number,number][][], railways: [number,number][][] }}
 */
function parseOSMData(json) {
  // Build a map of nodeId → {lon, lat}
  const nodes = new Map();
  for (const el of json.elements) {
    if (el.type === "node") {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  const streets = [];
  const coastlines = [];
  const water = [];
  const parks = [];
  const buildings = [];
  const railways = [];

  for (const el of json.elements) {
    if (el.type !== "way") continue;

    // Resolve node IDs to coordinates, dropping any missing nodes
    const coords = el.nodes.map((id) => nodes.get(id)).filter(Boolean);

    if (coords.length < 2) continue;

    const tags = el.tags ?? {};

    if (tags.natural === "coastline") {
      coastlines.push(coords);
    } else if (
      tags.natural === "water" ||
      tags.landuse === "reservoir"
    ) {
      water.push(coords);
    } else if (
      tags.leisure === "park" ||
      tags.landuse === "forest" ||
      tags.landuse === "grass" ||
      tags.landuse === "meadow" ||
      tags.natural === "wood"
    ) {
      parks.push(coords);
    } else if (tags.building) {
      buildings.push(coords);
    } else if (tags.railway) {
      railways.push(coords);
    } else if (tags.highway) {
      streets.push(coords);
    }
  }

  console.info(
    `Parsed: ${streets.length} streets, ${water.length} water, ${parks.length} parks, ` +
    `${buildings.length} buildings, ${railways.length} railways, ${coastlines.length} coastline ways`,
  );
  return { streets, coastlines, water, parks, buildings, railways };
}
