import { OVERPASS_URL } from './state.js'
import state from './state.js'
import { LAYER_IDS, createOsmCache } from './osm-cache.js'

/** Every fetched way, across all fetches. Lives for the page's lifetime. */
const cache = createOsmCache()

/**
 * `highway=*` values per road layer, so each kind of road can be styled on
 * its own. The `streets` layer is the catch-all for every other highway value
 * (residential, unclassified, service, living_street, ...).
 * See https://wiki.openstreetmap.org/wiki/Key:highway
 */
export const ROAD_CLASSES = {
  highways: ['motorway', 'motorway_link', 'trunk', 'trunk_link'],
  mainRoads: ['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'],
  paths: ['footway', 'path', 'cycleway', 'bridleway', 'steps', 'pedestrian', 'corridor'],
  tracks: ['track'],
}
const NON_STREET_VALUES = Object.values(ROAD_CLASSES).flat()
const valuesRe = (values) => `^(${values.join('|')})$`

/** `place=*` values that get a name label. */
export const PLACE_VALUES = ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood', 'hamlet', 'island', 'islet', 'locality']

/**
 * Overpass selectors per layer. Large areas (forests, lakes, ...) are often
 * mapped as multipolygon *relations* with the tag on the relation itself, so
 * area layers query relations as well as ways.
 */
const WAY_AND_RELATION = (filters) => filters.flatMap((f) => [`way${f};`, `relation${f};`])
const LAYER_QUERIES = {
  highways: () => [`way["highway"~"${valuesRe(ROAD_CLASSES.highways)}"];`],
  mainRoads: () => [`way["highway"~"${valuesRe(ROAD_CLASSES.mainRoads)}"];`],
  streets: () => [`way["highway"]["highway"!~"${valuesRe(NON_STREET_VALUES)}"];`],
  paths: () => [`way["highway"~"${valuesRe(ROAD_CLASSES.paths)}"];`],
  tracks: () => [`way["highway"~"${valuesRe(ROAD_CLASSES.tracks)}"];`],
  places: () => [`node["place"~"${valuesRe(PLACE_VALUES)}"]["name"];`],
  coastlines: () => WAY_AND_RELATION(['["natural"="coastline"]']),
  water: () => WAY_AND_RELATION(['["natural"="water"]', '["landuse"="reservoir"]']),
  parks: () => WAY_AND_RELATION([
    '["leisure"="park"]', '["landuse"="forest"]', '["landuse"="grass"]',
    '["landuse"="meadow"]', '["natural"="wood"]',
  ]),
  buildings: () => WAY_AND_RELATION(['["building"]']),
  railways: () => [`way["railway"];`],
}

/** Layer ids whose style is currently enabled in the style UI. */
export function enabledLayerIds() {
  return state.get('styles').filter((s) => s.visible && LAYER_IDS.includes(s.id)).map((s) => s.id)
}

/** Current merged data for every layer, reusing unchanged arrays from `prev`. */
function buildOsmData(prev, changed) {
  const data = {}
  for (const id of LAYER_IDS) {
    data[id] = prev?.[id] && !changed.includes(id) ? prev[id] : cache.waysOf(id)
  }
  return data
}

let fetching = false

/**
 * Fetch the enabled layers for the current bbox that aren't cached yet, merge
 * them into `state.osmData` (which triggers a canvas rerender).
 */
export async function updateOsmData() {
  if (fetching) return
  const bbox = state.get('bbox')
  if (!bbox) return

  const missing = cache.missing(enabledLayerIds(), bbox)
  if (missing.length === 0) {
    state.set('statusText', enabledLayerIds().length ? 'Enabled layers already loaded for this area.' : 'No layers enabled.')
    return
  }

  fetching = true
  try {
    const result = await fetchOSMData(bbox, missing)
    const changed = cache.add(missing, bbox, result)
    const prev = state.get('osmData')
    const osmData = buildOsmData(prev, changed)
    const summary = missing.map((id) => `${osmData[id].length.toLocaleString()} ${id}`).join(', ')
    // osmData is always a new object, so subscribers fire even when no layer grew.
    state.update({ osmData, statusText: `Loaded: ${summary}` })
  } catch (err) {
    state.set('statusText', `Error: ${err.message}`)
    console.error(err)
  } finally {
    fetching = false
  }
}

/**
 * Fetch OSM ways for the given layers within `bbox`.
 * See
 * - https://wiki.openstreetmap.org/wiki/Map_features
 * - https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
 * @param {[number,number,number,number]} bbox  [minLat, minLon, maxLat, maxLon]
 * @param {string[]} layerIds
 * @returns {Promise<Record<string, Map<string, any>>>} layerId -> key -> coords (or place label)
 */
export async function fetchOSMData(bbox, layerIds) {
  // ">>" recurses all the way down (relation → member ways → nodes).
  const query = `[out:json][timeout:120][bbox:${bbox.join(',')}];
(
${layerIds.flatMap((id) => LAYER_QUERIES[id]()).map((l) => '  ' + l).join('\n')}
);
out body;
>>;
out skel qt;`

  state.set('statusText', `Fetching OSM data (${layerIds.join(', ')}) ...`)

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  })

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`)
  }

  state.set('statusText', 'Parsing OSM data…')
  return parseOSMData(await response.json(), layerIds)
}

/**
 * Parse an Overpass JSON response into polylines bucketed by layer, keyed by
 * OSM id (`w<id>` for ways, `r<id>/w<id>` for relation members). The `places`
 * layer holds `{ coord, name, place, population }` label points keyed `n<id>`.
 * Only the requested layers are returned.
 * @param {object} json
 * @param {string[]} layerIds
 * @returns {Record<string, Map<string, any>>}
 */
export function parseOSMData(json, layerIds) {
  // nodeId → [lon, lat], wayId → node ids, so relation members resolve
  // regardless of element order.
  const nodes = new Map()
  const ways = new Map()
  for (const el of json.elements) {
    if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat])
    else if (el.type === 'way') ways.set(el.id, el.nodes)
  }

  const result = Object.fromEntries(layerIds.map((id) => [id, new Map()]))

  const MATCHERS = {
    coastlines: (t) => t.natural === 'coastline',
    water: (t) => t.natural === 'water' || t.landuse === 'reservoir',
    parks: (t) => t.leisure === 'park' || t.landuse === 'forest' || t.landuse === 'grass' ||
      t.landuse === 'meadow' || t.natural === 'wood',
    buildings: (t) => !!t.building,
    railways: (t) => !!t.railway,
    highways: (t) => ROAD_CLASSES.highways.includes(t.highway),
    mainRoads: (t) => ROAD_CLASSES.mainRoads.includes(t.highway),
    streets: (t) => !!t.highway && !NON_STREET_VALUES.includes(t.highway),
    paths: (t) => ROAD_CLASSES.paths.includes(t.highway),
    tracks: (t) => ROAD_CLASSES.tracks.includes(t.highway),
  }
  // First matching *requested* layer wins, in this priority order.
  const order = ['coastlines', 'water', 'parks', 'buildings', 'railways', 'highways', 'mainRoads', 'streets', 'paths', 'tracks']
    .filter((id) => layerIds.includes(id))
  const layerFor = (tags) => order.find((id) => MATCHERS[id](tags)) ?? null

  const resolveCoords = (nodeIds) => (nodeIds ?? []).map((id) => nodes.get(id)).filter(Boolean)

  for (const el of json.elements) {
    if (el.type === 'node') {
      const t = el.tags
      if (result.places && t?.name && PLACE_VALUES.includes(t.place)) {
        result.places.set(`n${el.id}`, {
          coord: [el.lon, el.lat],
          name: t.name,
          place: t.place,
          population: Number.parseInt(t.population, 10) || 0,
        })
      }
    } else if (el.type === 'way') {
      const layer = layerFor(el.tags ?? {})
      if (!layer) continue
      const coords = resolveCoords(el.nodes)
      if (coords.length >= 2) result[layer].set(`w${el.id}`, coords)
    } else if (el.type === 'relation') {
      // Render each "outer" member way as its own ring, using the relation's
      // tags (no hole-cutting for "inner" members).
      const layer = layerFor(el.tags ?? {})
      if (!layer) continue
      for (const member of el.members ?? []) {
        if (member.type !== 'way') continue
        if (member.role && member.role !== 'outer') continue
        const coords = resolveCoords(ways.get(member.ref))
        if (coords.length >= 2) result[layer].set(`r${el.id}/w${member.ref}`, coords)
      }
    }
  }

  return result
}
