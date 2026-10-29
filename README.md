# mapdesigner

Web application to style and print custom art maps using OpenStreetMap data.

## Developing
```
npm run dev
```

## Building for production
```
npm run build
```

## Elevation contours (preview only)

The large map view loads public [Mapzen Terrarium terrain tiles](https://registry.opendata.aws/terrain-tiles/)
without an API key. Use **Contour lines** to toggle the overlay and choose an
interval (Auto, 10, 20, 50, or 100 metres). Every fifth contour is emphasized.
The location map and PNG/PDF exports are unchanged; contours are not exported.

Tiles are decoded, mosaicked with a pixel buffer, and converted into stitched
isolines using marching squares in a Web Worker. Requests are debounced and
cancelled when the area changes, with at most 16 tiles per area, four concurrent
downloads, and a 64-tile decoded cache. Auto selects an interval from the elevation
range; very large ranges also impose a minimum interval to cap processing work.
The actual interval is shown in the overlay. Excessively complex contours show a
recoverable error rather than allocating unbounded geometry.

Requires a browser with module workers, OffscreenCanvas, createImageBitmap, and
AbortSignal.any/timeout. Failed requests can be retried from the overlay.
Elevation resolution and accuracy vary by region; these contours are not survey
measurements. Attribution and underlying dataset licenses are linked in the view:
[Mapzen terrain sources](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

## Tests

```
npm test
npx vite build
```

## Print services

* https://www.myposter.de
* https://www.whitewall.com/eu
