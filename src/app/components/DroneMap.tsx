"use client";

import dynamic from "next/dynamic";
import type { DroneFlightWithCoords } from "@/lib/sfpd-flights";

const DroneMapClient = dynamic(
  () => import("./DroneMapClient"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[400px] w-full bg-[var(--background)] flex items-center justify-center text-[var(--muted)] text-sm font-mono">
        Loading…
      </div>
    ),
  }
);

export default function DroneMap({
  flights,
}: {
  flights: DroneFlightWithCoords[];
}) {
  return <DroneMapClient flights={flights} />;
}
