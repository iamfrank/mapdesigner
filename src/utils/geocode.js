/**
 * Nominatim (OpenStreetMap) geocoding — forward search only.
 * https://nominatim.org/release-docs/latest/api/Search/
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * @param {string} query  Free-text place / address query
 * @returns {Promise<Array<{ label: string, lat: number, lon: number }>>}
 */
export async function geocodeSearch(query) {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return json.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
}
