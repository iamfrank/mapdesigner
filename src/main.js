import { LayerControlList } from "./components/layer-control-list.js";
import { OsmMap } from "./components/map-osm.js";
import { ArtworkMap } from "./components/map-artwork.js";
import { StatusNotify } from "./components/status-notify.js";
import { ExportPDF } from "./components/export-pdf.js";
import { LocationSearch } from "./components/location-search.js";
import { FetchDataControl } from "./components/fetch-data-control.js";
import { PaperSizeControl } from "./components/paper-size-control.js";
import { PosterTextControl } from "./components/poster-text-control.js";

customElements.define("layer-control-list", LayerControlList);
customElements.define("map-artwork", ArtworkMap);
customElements.define("map-osm", OsmMap);
customElements.define("status-notify", StatusNotify);
customElements.define("export-pdf", ExportPDF);
customElements.define("location-search", LocationSearch);
customElements.define("fetch-data-control", FetchDataControl);
customElements.define("paper-size-control", PaperSizeControl);
customElements.define("poster-text-control", PosterTextControl);

// OSM data is never fetched automatically. Panning/clicking the nav map or
// using <location-search> updates `center`/`bbox`; Overpass is only called
// when the user clicks "Fetch map data", to respect its rate limits.
// The preview-only terrain overlay independently loads public Mapzen tiles.
