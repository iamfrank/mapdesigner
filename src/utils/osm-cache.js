/**
 * In-memory cache of fetched OSM ways, per layer.
 *
 * For each layer it remembers (a) the bboxes already fetched and (b) the ways
 * received, keyed by OSM id so overlapping fetches never duplicate geometry.
 * A layer needs no fetch when a single cached bbox fully contains the
 * requested one.
 *
 * Bboxes are [minLat, minLon, maxLat, maxLon].
 */

export const LAYER_IDS = ['highways', 'mainRoads', 'streets', 'paths', 'tracks', 'coastlines', 'water', 'parks', 'buildings', 'railways', 'places']

export function bboxContains(outer, inner) {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
}

export function createOsmCache() {
  /** layerId -> bboxes fetched */
  const coverage = new Map(LAYER_IDS.map((id) => [id, []]))
  /** layerId -> Map<wayKey, coords> */
  const ways = new Map(LAYER_IDS.map((id) => [id, new Map()]))

  return {
    /** Is `bbox` already fully covered for `layerId`? */
    has(layerId, bbox) {
      return coverage.get(layerId).some((b) => bboxContains(b, bbox))
    },

    /** Subset of `layerIds` not yet covered for `bbox`. */
    missing(layerIds, bbox) {
      return layerIds.filter((id) => !this.has(id, bbox))
    },

    /**
     * Record a completed fetch.
     * @param {string[]} layerIds  Layers that were requested (now covered for bbox)
     * @param {number[]} bbox
     * @param {Record<string, Map<string, [number,number][]>>} result  layerId -> wayKey -> coords
     * @returns {string[]} layers whose way set actually grew
     */
    add(layerIds, bbox, result) {
      const changed = []
      for (const id of layerIds) {
        const list = coverage.get(id)
        // Drop boxes the new one supersedes.
        coverage.set(id, [...list.filter((b) => !bboxContains(bbox, b)), bbox])
        const store = ways.get(id)
        const before = store.size
        for (const [key, coords] of result[id] ?? []) {
          if (!store.has(key)) store.set(key, coords)
        }
        if (store.size !== before) changed.push(id)
      }
      return changed
    },

    /** All cached ways of one layer, as a fresh array. */
    waysOf(layerId) {
      return [...ways.get(layerId).values()]
    },

    clear() {
      for (const id of LAYER_IDS) {
        coverage.set(id, [])
        ways.get(id).clear()
      }
    },
  }
}
