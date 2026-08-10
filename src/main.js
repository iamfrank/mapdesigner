import { fetchOSMData, updateOsmData } from "./utils/overpass.js";
import { LayerControlList } from "./components/layer-control-list.js";
import { OsmMap } from "./components/map-osm.js";
import { ArtworkMap } from "./components/map-artwork.js";
import { ArtworkDetailMap } from "./components/map-artwork-detail.js";
import { StatusNotify } from "./components/status-notify.js";
import { ExportPDF } from "./components/export-pdf.js";
import state from "./utils/state.js";

customElements.define("layer-control-list", LayerControlList);
customElements.define("map-artwork", ArtworkMap);
customElements.define("map-artwork-detail", ArtworkDetailMap);
customElements.define("map-osm", OsmMap);
customElements.define("status-notify", StatusNotify);
customElements.define("export-pdf", ExportPDF);

// TODO: Do we still need resize
/*
window.addEventListener("resize", () => {
  sizeOverviewCanvas();
});
 */

document.querySelectorAll('.toolbar-button').forEach((btn) => {
  btn.addEventListener('click', (ev) => {
    const el = document.getElementById(ev.target.getAttribute('aria-controls'))
    console.log(el)
    el.setAttribute('aria-expanded', true)
  })
})

window.addEventListener('load', () => {
  state.subscribe('center', async () => {
    await updateOsmData()
  })
})
