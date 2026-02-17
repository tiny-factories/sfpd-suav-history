import type { LatLng } from "leaflet";

declare module "leaflet" {
  interface HeatMapOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer {
    addTo(map: Map): this;
    remove(): this;
    setLatLngs(latlngs: [number, number, number][]): this;
    setOptions(options: HeatMapOptions): this;
    redraw(): this;
  }

  function heatLayer(
    latlngs: [number, number, number?][],
    options?: HeatMapOptions
  ): HeatLayer;
}
