import { updateOsmData } from "./utils/overpass.js";
import { computeBBoxFromCenter } from "./utils/paper.js";
import { LayerControlList } from "./components/layer-control-list.js";
import { OsmMap } from "./components/map-osm.js";
import { ArtworkMap } from "./components/map-artwork.js";
import { ArtworkDetailMap } from "./components/map-artwork-detail.js";
import { StatusNotify } from "./components/status-notify.js";
import { ExportPDF } from "./components/export-pdf.js";
import { LocationPicker } from "./components/location-picker.js";
import { DistanceControl } from "./components/distance-control.js";
import { PaperSizeControl } from "./components/paper-size-control.js";
import { PosterTextControl } from "./components/poster-text-control.js";
import state, { getPrintPx } from "./utils/state.js";

customElements.define("layer-control-list", LayerControlList);
customElements.define("map-artwork", ArtworkMap);
customElements.define("map-artwork-detail", ArtworkDetailMap);
customElements.define("map-osm", OsmMap);
customElements.define("status-notify", StatusNotify);
customElements.define("export-pdf", ExportPDF);
customElements.define("location-picker", LocationPicker);
customElements.define("distance-control", DistanceControl);
customElements.define("paper-size-control", PaperSizeControl);
customElements.define("poster-text-control", PosterTextControl);

/**
 * The bbox used for OSM fetching/rendering is always derived from the
 * current centre point, radius ("distance"), and target paper aspect ratio
 * — never from the nav map's own pan/zoom extent — so the exported poster
 * always matches exactly what will be fetched and rendered.
 */
function recomputeBBox() {
  const [lon, lat] = state.get("center");
  const distanceM = state.get("distanceM");
  const { w, h } = getPrintPx();
  const aspect = w / h;
  const bbox = computeBBoxFromCenter(lon, lat, distanceM, aspect);

  const prev = state.get("bbox");
  const unchanged = prev && prev.length === bbox.length && prev.every((v, i) => v === bbox[i]);
  if (!unchanged) state.set("bbox", bbox);
}

recomputeBBox();

state.subscribe("center", recomputeBBox);
state.subscribe("distanceM", recomputeBBox);
state.subscribe("paperSizeId", recomputeBBox);
state.subscribe("customWidthMM", recomputeBBox);
state.subscribe("customHeightMM", recomputeBBox);

state.subscribe("bbox", async () => {
  await updateOsmData();
});

// Fetch once for the default centre/extent so the app shows a populated
// poster immediately, without requiring a first interaction.
await updateOsmData();
