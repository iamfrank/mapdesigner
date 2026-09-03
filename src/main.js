import { LayerControlList } from "./components/layer-control-list.js";
import { OsmMap } from "./components/map-osm.js";
import { ArtworkMap } from "./components/map-artwork.js";
import { ArtworkDetailMap } from "./components/map-artwork-detail.js";
import { StatusNotify } from "./components/status-notify.js";
import { ExportPDF } from "./components/export-pdf.js";
import { LocationSearch } from "./components/location-search.js";
import { FetchDataControl } from "./components/fetch-data-control.js";
import { PaperSizeControl } from "./components/paper-size-control.js";
import { PosterTextControl } from "./components/poster-text-control.js";

customElements.define("layer-control-list", LayerControlList);
customElements.define("map-artwork", ArtworkMap);
customElements.define("map-artwork-detail", ArtworkDetailMap);
customElements.define("map-osm", OsmMap);
customElements.define("status-notify", StatusNotify);
customElements.define("export-pdf", ExportPDF);
customElements.define("location-search", LocationSearch);
customElements.define("fetch-data-control", FetchDataControl);
customElements.define("paper-size-control", PaperSizeControl);
customElements.define("poster-text-control", PosterTextControl);

// Note: nothing here fetches automatically. Panning/clicking the nav map or
// using <location-search> only updates `center`/`bbox`; loading OSM data
// from Overpass only ever happens when the user explicitly clicks "Fetch map
// data" (<fetch-data-control>), to stay well clear of Overpass's rate limits.
