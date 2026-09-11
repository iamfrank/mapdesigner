import { OVERPASS_URL } from './state.js'
import state from './state.js'

export async function updateOsmData() {
  try {
    const osmData = await fetchOSMData();
    if (osmData) {
      state.update({
        osmData,
        statusText: `Loaded: ${osmData.streets.length.toLocaleString()} streets, ` +
          `${osmData.paths.length.toLocaleString()} paths, ` +
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
 * @returns {Promise<{ streets: [number,number][][], paths: [number,number][][], coastlines: [number,number][][], water: [number,number][][], parks: [number,number][][], buildings: [number,number][][], railways: [number,number][][] }>}
 */
export async function fetchOSMData() {
  const bbox = state.get('bbox')
  console.log('fetching', state.get('bbox'))
  if (!bbox) {
    return
  }
  // Large areas (forests, lakes, ...) are frequently mapped as multipolygon
  // *relations* with the tag on the relation itself rather than on its
  // member ways, so those need to be queried explicitly too. ">>" recurses
  // all the way down (relation → member ways → nodes), not just one level.
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
  relation["natural"="coastline"];
  relation["natural"="water"];
  relation["landuse"="reservoir"];
  relation["leisure"="park"];
  relation["landuse"="forest"];
  relation["landuse"="grass"];
  relation["landuse"="meadow"];
  relation["natural"="wood"];
  relation["building"];
);
out body;
>>;
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
 * @returns {{ streets: [number,number][][], paths: [number,number][][], coastlines: [number,number][][], water: [number,number][][], parks: [number,number][][], buildings: [number,number][][], railways: [number,number][][] }}
 */
function parseOSMData(json) {
  // Build a map of nodeId → {lon, lat}, and a map of wayId → node ids, so
  // relation members can be resolved regardless of the order elements come
  // back in.
  const nodes = new Map();
  const ways = new Map();
  for (const el of json.elements) {
    if (el.type === "node") {
      nodes.set(el.id, [el.lon, el.lat]);
    } else if (el.type === "way") {
      ways.set(el.id, el.nodes);
    }
  }

  const streets = [];
  const paths = [];
  const coastlines = [];
  const water = [];
  const parks = [];
  const buildings = [];
  const railways = [];

  // highway values that are foot/cycle/bridle paths rather than roads for
  // motor vehicles, so they can be styled distinctly from roadways.
  const PATH_HIGHWAY_VALUES = new Set([
    "footway", "path", "cycleway", "bridleway", "steps", "pedestrian", "track",
  ]);

  const bucketFor = (tags) => {
    if (tags.natural === "coastline") return coastlines;
    if (tags.natural === "water" || tags.landuse === "reservoir") return water;
    if (
      tags.leisure === "park" ||
      tags.landuse === "forest" ||
      tags.landuse === "grass" ||
      tags.landuse === "meadow" ||
      tags.natural === "wood"
    ) return parks;
    if (tags.building) return buildings;
    if (tags.railway) return railways;
    if (tags.highway) return PATH_HIGHWAY_VALUES.has(tags.highway) ? paths : streets;
    return null;
  };

  const resolveCoords = (nodeIds) =>
    (nodeIds ?? []).map((id) => nodes.get(id)).filter(Boolean);

  for (const el of json.elements) {
    if (el.type === "way") {
      const tags = el.tags ?? {};
      const bucket = bucketFor(tags);
      if (!bucket) continue;

      const coords = resolveCoords(el.nodes);
      if (coords.length < 2) continue;
      bucket.push(coords);
    } else if (el.type === "relation") {
      // Large areas (forests, lakes, parks, ...) are often mapped as
      // multipolygon relations, with the tag on the relation rather than on
      // its member ways. Render each "outer" member way as its own ring,
      // using the relation's tags (no hole-cutting for "inner" members, same
      // simplification as plain area ways).
      const tags = el.tags ?? {};
      const bucket = bucketFor(tags);
      if (!bucket) continue;

      for (const member of el.members ?? []) {
        if (member.type !== "way") continue;
        if (member.role && member.role !== "outer") continue;

        const coords = resolveCoords(ways.get(member.ref));
        if (coords.length < 2) continue;
        bucket.push(coords);
      }
    }
  }

  console.info(
    `Parsed: ${streets.length} streets, ${paths.length} paths, ${water.length} water, ${parks.length} parks, ` +
    `${buildings.length} buildings, ${railways.length} railways, ${coastlines.length} coastline ways`,
  );
  return { streets, paths, coastlines, water, parks, buildings, railways };
}
