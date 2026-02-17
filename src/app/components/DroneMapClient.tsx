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
import { BAY_AREA_BBOX, SF_COUNTY_BBOX } from "@/lib/sf-bounds";
import "leaflet/dist/leaflet.css";
import "@/app/components/map-minimal.css";

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

/** Fit SF bounds so SF appears in the right-hand center (left padding for overlay panel). */
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
    const leftPadding = w > 0 ? Math.floor(w / 2) : padding;
    map.fitBounds(bounds, {
      paddingTopLeft: [leftPadding, padding],
      paddingBottomRight: [padding, padding],
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

export default function DroneMapClient({
  flights,
  overlayContainerRef,
}: {
  flights: DroneFlightWithCoords[];
  overlayContainerRef?: React.RefObject<HTMLElement | null>;
}) {
  const center: [number, number] = [37.7749, -122.4194];

  const maxBounds = useMemo(
    () =>
      L.latLngBounds(
        [BAY_AREA_BBOX.south, BAY_AREA_BBOX.west],
        [BAY_AREA_BBOX.north, BAY_AREA_BBOX.east]
      ),
    []
  );

  const [sfBoundaryRing, setSfBoundaryRing] = useState<[number, number][] | null>(null);

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
      maxBounds={maxBounds}
      maxBoundsViscosity={1}
    >
      {sfBoundaryRing && <MapFadeMask boundaryRing={sfBoundaryRing} />}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
      />
      <FitBoundsToSF />
      {flights.map((flight, i) => (
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
      ))}
    </MapContainer>
  );
}
