"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { DroneFlightWithCoords } from "@/lib/sfpd-flights";
import { SF_COUNTY_BBOX } from "@/lib/sf-bounds";
import "leaflet/dist/leaflet.css";
import "@/app/components/map-minimal.css";

// Load heat plugin (expects L on window)
if (typeof window !== "undefined") {
  (window as unknown as { L: typeof L }).L = L;
  require("leaflet.heat");
}

const SF_BOUNDARY_API =
  "https://data.sfgov.org/resource/wamw-vt4s.json?county=San%20Francisco&$limit=1&$select=the_geom";

/** Simplify ring by taking every Nth point. Returns [lat, lng][] for Leaflet. */
function simplifyRing(
  coords: [number, number][],
  step: number
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length; i += step) {
    const [lng, lat] = coords[i];
    out.push([lat, lng]);
  }
  if (out.length > 0 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push([out[0][0], out[0][1]]);
  }
  return out;
}

// Minimal dot marker
const dotIcon = L.divIcon({
  className: "minimal-dot-marker",
  html: "<span></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Fit SF bounds with even padding so the map is centered on SF; extra bottom padding so the bottom-left filter panel doesn’t cover the city. */
function FitBoundsToSF({ padding = 56 }: { padding?: number }) {
  const map = useMap();
  const bounds = useMemo(
    () =>
      L.latLngBounds(
        [SF_COUNTY_BBOX.south, SF_COUNTY_BBOX.west],
        [SF_COUNTY_BBOX.north, SF_COUNTY_BBOX.east]
      ),
    []
  );
  const applyFit = useCallback(() => {
    const container = map.getContainer();
    const w = container?.offsetWidth ?? 0;
    const h = container?.offsetHeight ?? 0;
    const leftPadding =
      16 + Math.min(380, Math.max(0, w - 32));
    const bottomPadding = h > 0 ? Math.min(420, Math.floor(h * 0.5)) : 360;
    map.fitBounds(bounds, {
      paddingTopLeft: [leftPadding, padding],
      paddingBottomRight: [padding, bottomPadding],
      maxZoom: 13,
    });
  }, [map, bounds, padding]);
  useEffect(() => {
    applyFit();
    const container = map.getContainer();
    if (!container) return;
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(container);
    return () => ro.disconnect();
  }, [applyFit, map]);
  return null;
}

const FEATHER_BLUR_PX = 18;

function encodeSvgDataUrl(svg: string): string {
  return (
    "url(\"data:image/svg+xml," +
    encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22") +
    "\")"
  );
}

/** Mask: white inside boundary (feathered), black outside. Map container uses this so map fades out. */
function buildMapFadeMaskSvg(
  w: number,
  h: number,
  d: string,
  blurPx: number
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><filter id="feather" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur in="SourceGraphic" stdDeviation="${blurPx}"/></filter></defs><mask id="m"><rect width="100%" height="100%" fill="black"/><path fill="white" fill-rule="evenodd" d="${d}" filter="url(%23feather)"/></mask><rect width="100%" height="100%" fill="white" mask="url(%23m)"/></svg>`;
  return encodeSvgDataUrl(svg);
}

/** Applies feathered mask to map container so the map fades out at the SF boundary (no hard edge). */
function MapFadeMask({ boundaryRing }: { boundaryRing: [number, number][] | null }) {
  const map = useMap();

  const update = useCallback(() => {
    if (!boundaryRing || boundaryRing.length < 3) return;
    const container = map.getContainer();
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const points = boundaryRing.map(([lat, lng]) =>
      map.latLngToContainerPoint(L.latLng(lat, lng))
    );
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ") + " Z";
    const blurPx = Math.max(FEATHER_BLUR_PX, Math.min(50, (w + h) / 60));
    const maskUrl = buildMapFadeMaskSvg(w, h, d, blurPx);
    container.style.maskImage = maskUrl;
    container.style.webkitMaskImage = maskUrl;
    container.style.maskSize = "100% 100%";
    container.style.webkitMaskSize = "100% 100%";
  }, [map, boundaryRing]);

  useEffect(() => {
    if (!boundaryRing) return;
    update();
    map.on("moveend zoomend", update);
    return () => {
      map.off("moveend zoomend", update);
      const c = map.getContainer();
      c.style.maskImage = "";
      c.style.webkitMaskImage = "";
    };
  }, [map, boundaryRing, update]);

  return null;
}

/** Heat map layer: [lat, lng, intensity]. Intensity can be duration (minutes) for weighted heat. */
function MapHeatLayer({
  flights,
  radius = 28,
  blur = 20,
}: {
  flights: DroneFlightWithCoords[];
  radius?: number;
  blur?: number;
}) {
  const map = useMap();
  const heatRef = useRef<ReturnType<typeof L.heatLayer> | null>(null);

  const heatData = useMemo(() => {
    return flights.map((f) => {
      const lat = f.point.coordinates[1];
      const lng = f.point.coordinates[0];
      const minutes = Number(f.flight_duration_minutes) || 0;
      const intensity = minutes > 0 ? Math.min(1, 0.2 + minutes / 60) : 0.5;
      return [lat, lng, intensity] as [number, number, number];
    });
  }, [flights]);

  useEffect(() => {
    if (!("heatLayer" in L)) return;
    const heat = (L as unknown as { heatLayer: (latlngs: [number, number, number][], o?: object) => { addTo: (m: L.Map) => void; remove: () => void } }).heatLayer(
      heatData,
      {
        radius,
        blur,
        max: 1,
        minOpacity: 0.35,
        gradient: {
          0.25: "rgba(59, 130, 246, 0.5)",
          0.5: "rgba(34, 197, 94, 0.6)",
          0.75: "rgba(234, 179, 8, 0.7)",
          1: "rgba(239, 68, 68, 0.9)",
        },
      }
    );
    heat.addTo(map);
    heatRef.current = heat as unknown as ReturnType<typeof L.heatLayer>;
    return () => {
      heatRef.current?.remove();
      heatRef.current = null;
    };
  }, [map, radius, blur, heatData]);

  return null;
}

export type MapViewMode = "dots" | "heatmap";

const TILE_URL_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const TILE_URL_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

export default function DroneMapClient({
  flights,
  overlayContainerRef,
  mapViewMode = "dots",
}: {
  flights: DroneFlightWithCoords[];
  overlayContainerRef?: React.RefObject<HTMLElement | null>;
  mapViewMode?: MapViewMode;
}) {
  const center: [number, number] = [37.7749, -122.4194];

  const [sfBoundaryRing, setSfBoundaryRing] = useState<[number, number][] | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    setDarkMode(m.matches);
    const listener = () => setDarkMode(m.matches);
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(SF_BOUNDARY_API)
      .then((r) => r.json())
      .then((data: { the_geom?: { coordinates: [number, number][][][] } }[]) => {
        if (cancelled || !data[0]?.the_geom?.coordinates) return;
        const firstPoly = data[0].the_geom.coordinates[0][0] as [number, number][];
        setSfBoundaryRing(simplifyRing(firstPoly, 12));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="minimal-map h-full w-full min-h-[400px] relative z-[1]"
      scrollWheelZoom
    >
      {sfBoundaryRing && <MapFadeMask boundaryRing={sfBoundaryRing} />}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url={darkMode ? TILE_URL_DARK : TILE_URL_LIGHT}
      />
      <FitBoundsToSF />
      {mapViewMode === "heatmap" ? (
        <MapHeatLayer flights={flights} />
      ) : (
        flights.map((flight, i) => (
          <Marker
            key={`${flight.date}-${flight.case_cad_event_number}-${i}`}
            position={[
              flight.point.coordinates[1],
              flight.point.coordinates[0],
            ]}
            icon={dotIcon}
          >
            <Popup className="minimal-popup">
              <div className="popup-inner">
                <p className="popup-location">
                  {flight.location || "Unknown location"}
                </p>
                <p className="popup-meta">
                  {formatDate(flight.date)} · {flight.flight_duration_minutes} min
                </p>
                <p className="popup-reason">{flight.reason_for_flight}</p>
                {flight.analysis_neighborhood && (
                  <p className="popup-neighborhood">
                    {flight.analysis_neighborhood}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))
      )}
    </MapContainer>
  );
}
