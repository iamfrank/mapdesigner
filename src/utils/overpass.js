import { OVERPASS_URL } from './state.js'
import state from './state.js'

/**
 * Fetch OSM ways (highways + coastlines) for the configured bounding box.
 * See
 * - https://wiki.openstreetmap.org/wiki/Map_features
 * - https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
 * @param {(msg: string) => void} onStatus  – called with progress messages
 * @returns {Promise<{ streets: [number,number][][], coastlines: [number,number][][] }>}
 */
export async function fetchOSMData() {
  const bbox = state.get('bbox')
  console.log('fetching', state.get('bbox'))
  if (!bbox) {
    return
  }
  const query = `[out:json][timeout:90][bbox:${bbox.join(',')}];
(
  way["highway"];
  way["natural"="coastline"];
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

  onStatus("Parsing OSM data…");
  const json = await response.json();
  return parseOSMData(json);
}

/**
 * Parse an Overpass JSON response into arrays of polylines.
 * @param {object} json
 * @returns {{ streets: [number,number][][], coastlines: [number,number][][] }}
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

  for (const el of json.elements) {
    if (el.type !== "way") continue;

    // Resolve node IDs to coordinates, dropping any missing nodes
    const coords = el.nodes.map((id) => nodes.get(id)).filter(Boolean);

    if (coords.length < 2) continue;

    if (el.tags?.natural === "coastline") {
      coastlines.push(coords);
    } else if (el.tags?.highway) {
      streets.push(coords);
    }
  }

  console.info(
    `Parsed: ${streets.length} street ways, ${coastlines.length} coastline ways`,
  );
  return { streets, coastlines };
}
