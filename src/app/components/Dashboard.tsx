"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Clock,
  Database,
  MapPin,
  Plane,
  Tag,
} from "lucide-react";
import type { DroneFlightWithCoords } from "@/lib/sfpd-flights";
import MapWithTimeline from "./MapWithTimeline";

const iconSize = 14;
const iconClass = "shrink-0 text-[var(--muted)]";

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Normalize reason for grouping (tagging changed over time; merge similar labels). */
function normalizeReason(s: string): string {
  return (s || "").trim().toLowerCase();
}

/**
 * Map raw reason variants to canonical labels (PD-style consolidation).
 * Keys are normalized (lowercase); values are the display label we use.
 */
const REASON_CANONICAL: Record<string, string> = {
  // Person with weapon (gun/weapon variants)
  "person with gun": "Person with weapon",
  "person with a gun": "Person with weapon",
  "person with weapon": "Person with weapon",
  "person with a weapon": "Person with weapon",
  "person w/gun": "Person with weapon",
  "person w/gun-shots fired": "Person with weapon",
  "subject with gun": "Person with weapon",
  "brandishing gun": "Person with weapon",
  "gun brandishing": "Person with weapon",
  // Person with knife
  "person with knife": "Person with knife",
  "person with a knife": "Person with knife",
  "peson with a knife": "Person with knife",
  "person with a kinfe": "Person with knife",
  "person with kife": "Person with knife",
  "person with machete": "Person with knife",
  "person with sword": "Person with knife",
  "person with a axe": "Person with knife",
  "man with a knife": "Person with knife",
  // Search warrant
  "pursuant to a search warrant": "Search warrant",
  "search warrant": "Search warrant",
  "search warrant service": "Search warrant",
  // Stolen plate(s)
  "stolen plate": "Stolen plate(s)",
  "stolen plates": "Stolen plate(s)",
  "stolen license plate": "Stolen plate(s)",
  "stolen license plates": "Stolen plate(s)",
  // Domestic violence
  "domestic violence": "Domestic violence",
  "domestic violence call": "Domestic violence",
  "domestic battery": "Domestic violence",
  "domestic violence fight": "Domestic violence",
  // Suicidal / crisis
  "suicidal person": "Suicidal / crisis",
  "suicidal subject": "Suicidal / crisis",
  "suicidal person.": "Suicidal / crisis",
  "suicide attempt": "Suicidal / crisis",
  "suicide": "Suicidal / crisis",
  "suicidal": "Suicidal / crisis",
  // Wanted
  "wanted person": "Wanted person",
  "wanted subject": "Wanted person",
  "wanted vehicle": "Wanted vehicle",
  "wanted suspect": "Wanted person",
  // Hit and run
  "hit and run": "Hit and run",
  "hit and run vehicle": "Hit and run",
  "hit and run collision": "Hit and run",
  "h&r": "Hit and run",
  // Auto burglary (keep distinct from Burglary)
  "auto burglary": "Auto burglary",
  "auto burglary vehicle": "Auto burglary",
  // Fight
  "fight with weapons": "Fight",
  "fight with weapon": "Fight",
  "fights with weapon": "Fight",
  "physical fight": "Fight",
  "fight no weapons": "Fight",
  // Shooting / shots fired
  "shooting": "Shooting / shots fired",
  "shots fired": "Shooting / shots fired",
  "person shot": "Shooting / shots fired",
  "shooting investigation": "Shooting / shots fired",
  // Aggravated assault
  "aggravated assault": "Aggravated assault",
  "aggravated assault with knife": "Aggravated assault",
  "aggravated assault with vehicle": "Aggravated assault",
  // Search and rescue
  "search and rescue": "Search and rescue",
  "search & rescue": "Search and rescue",
  // Warrant
  "warrant arrest": "Warrant",
  "warrant service": "Warrant",
  "warrant": "Warrant",
  "arrest warrant": "Warrant",
  // Trespassing
  "trespasser": "Trespassing",
  "trespassing": "Trespassing",
  "person trespassing": "Trespassing",
  "tresspasser": "Trespassing",
  // Vandalism
  "vandalism": "Vandalism",
  "malicious mischief": "Vandalism",
  "graffiti": "Vandalism",
  // Missing person
  "missing person": "Missing person",
  "missing person at risk": "Missing person",
  "missing juvenile": "Missing person",
  "missing child": "Missing person",
  "missing children": "Missing person",
  "lost child": "Missing person",
  "missing infant at-risk": "Missing person",
  // Robbery variants (keep Robbery as-is; merge some)
  "robbery vehicle": "Robbery",
  "robbery with a gun": "Robbery",
  "robbery with gun": "Robbery",
  "attempted robbery": "Robbery",
  "armed robbery, 911 call": "Robbery",
  // Narcotics
  "narcotics sales": "Narcotics",
  "narcotics investigation": "Narcotics",
  "narcotics sale": "Narcotics",
  "narcotics operation": "Narcotics",
  "drug dealing": "Narcotics",
  "narcotics spotting operation": "Narcotics",
  // Suspicious
  "suspicious vehicle": "Suspicious vehicle",
  "suspicious person": "Suspicious person",
  "suspicious vehicles": "Suspicious vehicle",
  // Stolen vehicle (already merged by case; ensure one label)
  "stolen vehicle": "Stolen vehicle",
  // Burglary (non-auto)
  "burglary": "Burglary",
  // Reckless / stunt
  "stunt driving": "Stunt driving",
  "reckless driving": "Reckless driving",
  // Fire
  "fire": "Fire",
  "illegal fireworks": "Fireworks",
  "fireworks": "Fireworks",
};

export default function Dashboard({
  flights,
}: {
  flights: DroneFlightWithCoords[];
}) {
  const fullExtent = useMemo(() => {
    if (flights.length === 0) return { minTs: 0, maxTs: 0 };
    const times = flights.map((f) => new Date(f.date).getTime());
    return { minTs: Math.min(...times), maxTs: Math.max(...times) };
  }, [flights]);

  const [rangeStartTs, setRangeStartTs] = useState(0);
  const [rangeEndTs, setRangeEndTs] = useState(0);
  useEffect(() => {
    if (flights.length > 0 && fullExtent.maxTs > fullExtent.minTs) {
      setRangeStartTs(fullExtent.minTs);
      setRangeEndTs(fullExtent.maxTs);
    }
  }, [flights.length, fullExtent.minTs, fullExtent.maxTs]);

  const handleTimelineRangeChange = useCallback((startTs: number, endTs: number) => {
    setRangeStartTs(startTs);
    setRangeEndTs(endTs);
  }, []);

  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());
  const [showAllReasons, setShowAllReasons] = useState(false);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<Set<string>>(new Set());
  const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set());
  const [selectedDurations, setSelectedDurations] = useState<Set<string>>(new Set());

  const toggleReason = useCallback((r: string) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }, []);
  const toggleNeighborhood = useCallback((n: string) => {
    setSelectedNeighborhoods((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);
  const toggleDistrict = useCallback((d: string) => {
    setSelectedDistricts((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }, []);
  const toggleDuration = useCallback((d: string) => {
    setSelectedDurations((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }, []);

  const dateFilteredFlights = useMemo(() => {
    if (flights.length === 0 || rangeStartTs <= 0 || rangeEndTs <= 0) return flights;
    return flights.filter((f) => {
      const t = new Date(f.date).getTime();
      return t >= rangeStartTs && t <= rangeEndTs;
    });
  }, [flights, rangeStartTs, rangeEndTs]);

  /** Get canonical display label for a raw reason (for counting and filtering). */
  const getCanonicalReason = useCallback((raw: string): string => {
    const key = normalizeReason(raw);
    return REASON_CANONICAL[key] ?? (raw || "").trim();
  }, []);

  const allReasonsWithCount = useMemo(() => {
    const byCountKey: Record<
      string,
      { total: number; displayLabel: string }
    > = {};
    for (const f of dateFilteredFlights) {
      const raw = (f.reason_for_flight || "").trim();
      if (!raw) continue;
      const canonical = getCanonicalReason(raw);
      const countKey = normalizeReason(canonical);
      if (!byCountKey[countKey]) {
        byCountKey[countKey] = { total: 0, displayLabel: canonical };
      }
      byCountKey[countKey].total += 1;
      if (REASON_CANONICAL[normalizeReason(raw)]) {
        byCountKey[countKey].displayLabel = canonical;
      }
    }
    return Object.values(byCountKey)
      .map(({ displayLabel, total }) => [displayLabel, total] as [string, number])
      .sort((a, b) => b[1] - a[1]);
  }, [dateFilteredFlights, getCanonicalReason]);

  const MIN_REASON_COUNT = 20;
  const TOP_REASON_CAP = 20;
  const topReasonsWithCount = useMemo(() => {
    return allReasonsWithCount
      .filter(([, count]) => count >= MIN_REASON_COUNT)
      .slice(0, TOP_REASON_CAP);
  }, [allReasonsWithCount]);

  const reasonsToShow = showAllReasons ? allReasonsWithCount : topReasonsWithCount;
  const hasMoreReasons = allReasonsWithCount.length > topReasonsWithCount.length;

  const neighborhoodsWithCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of dateFilteredFlights) {
      const n = f.analysis_neighborhood ?? "Unknown";
      if (n) counts[n] = (counts[n] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [dateFilteredFlights]);

  const districtsWithCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of dateFilteredFlights) {
      const d = f.supervisor_district ?? "—";
      if (d) counts[d] = (counts[d] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [dateFilteredFlights]);

  const DURATION_BUCKETS = [
    { id: "short", label: "≤15 min", test: (m: number) => m <= 15 },
    { id: "medium", label: "15–60 min", test: (m: number) => m > 15 && m <= 60 },
    { id: "long", label: ">60 min", test: (m: number) => m > 60 },
  ] as const;

  const durationsWithCount = useMemo(() => {
    return DURATION_BUCKETS.map(({ id, label, test }) => {
      let count = 0;
      for (const f of dateFilteredFlights) {
        const m = Number(f.flight_duration_minutes) || 0;
        if (test(m)) count++;
      }
      return { id, label, count };
    }).filter((d) => d.count > 0);
  }, [dateFilteredFlights]);

  const filteredFlights = useMemo(() => {
    let out = dateFilteredFlights;
    if (selectedReasons.size > 0) {
      const selectedNormalized = new Set(
        [...selectedReasons].map(normalizeReason)
      );
      out = out.filter((f) =>
        selectedNormalized.has(
          normalizeReason(getCanonicalReason(f.reason_for_flight ?? ""))
        )
      );
    }
    if (selectedNeighborhoods.size > 0) {
      out = out.filter(
        (f) =>
          (f.analysis_neighborhood && selectedNeighborhoods.has(f.analysis_neighborhood)) ||
          (f.analysis_neighborhood === null && selectedNeighborhoods.has("Unknown"))
      );
    }
    if (selectedDistricts.size > 0) {
      out = out.filter(
        (f) => f.supervisor_district && selectedDistricts.has(f.supervisor_district)
      );
    }
    if (selectedDurations.size > 0) {
      out = out.filter((f) => {
        const m = Number(f.flight_duration_minutes) || 0;
        return DURATION_BUCKETS.some(
          (b) => selectedDurations.has(b.id) && b.test(m)
        );
      });
    }
    return out;
  }, [
    dateFilteredFlights,
    selectedReasons,
    selectedNeighborhoods,
    selectedDistricts,
    selectedDurations,
    getCanonicalReason,
  ]);

  const tileStats = useMemo(() => {
    const total = filteredFlights.length;
    let totalMinutes = 0;
    for (const f of filteredFlights) {
      totalMinutes += Number(f.flight_duration_minutes) || 0;
    }
    return { total, totalMinutes };
  }, [filteredFlights]);

  const dateRange = useMemo(() => {
    if (filteredFlights.length === 0) return null;
    const times = filteredFlights.map((f) => new Date(f.date).getTime());
    return {
      from: formatDateLabel(new Date(Math.min(...times)).toISOString()),
      to: formatDateLabel(new Date(Math.max(...times)).toISOString()),
    };
  }, [filteredFlights]);

  const dataSourceUrl =
    "https://data.sfgov.org/Public-Safety/San-Francisco-Police-Department-Drone-Flight-Logs/giw5-ttjs";

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden font-mono">
      <div className="flex flex-1 min-h-0 w-full relative">
        {/* Full-width map + timeline (behind the overlay panel); z-0 so Leaflet panes stay below the aside */}
        <main className="absolute inset-0 z-0 flex flex-col bg-[var(--background)] min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <MapWithTimeline
              timelineFlights={flights}
              mapFlights={filteredFlights}
              rangeStartTs={rangeStartTs}
              rangeEndTs={rangeEndTs}
              onRangeChange={handleTimelineRangeChange}
            />
          </div>
        </main>

        {/* Floating filter panel: card-style over the map */}
        <aside className="absolute left-4 top-4 z-10 w-[min(380px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-light)] dark:bg-[var(--card-dark)] overflow-hidden shadow-xl">
          <div className="shrink-0 p-4 border-b border-[var(--border)]">
            <h1 className="text-lg font-semibold text-[var(--foreground)] tracking-tight flex items-center gap-2">
              <Plane size={18} className={iconClass} aria-hidden />
              SFPD Drone Flights
            </h1>
            <a
              href={dataSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:underline mt-0.5 inline-block"
            >
              DataSF
            </a>
          </div>

        {/* Tiles + filters: scrollable */}
        <div className="flex-1 p-4 overflow-y-auto min-h-0">
          <h2 className="text-sm font-medium text-[var(--foreground)] mb-3 tracking-tight flex items-center gap-2">
            <BarChart3 size={iconSize} className={iconClass} aria-hidden />
            Summary
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] dark:bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                Total flights
              </p>
              <p className="text-2xl font-semibold text-[var(--foreground)] mt-0.5 tabular-nums">
                {tileStats.total.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)] p-3 text-white">
              <p className="text-[11px] uppercase tracking-wide text-white/80">
                Total flight time
              </p>
              <p className="text-2xl font-semibold mt-0.5 tabular-nums">
                {Math.round(tileStats.totalMinutes / 60)}h
              </p>
              <p className="text-xs text-white/70 tabular-nums">
                {tileStats.totalMinutes.toLocaleString()} min
              </p>
            </div>
            {dateRange && (
              <div className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--card-dark)] p-3 text-white">
                <p className="text-[11px] uppercase tracking-wide text-white/70">
                  Date range
                </p>
                <p className="text-sm mt-0.5 tabular-nums">
                  {dateRange.from} → {dateRange.to}
                </p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-2 flex items-center gap-1.5">
                <Tag size={iconSize} className={iconClass} aria-hidden />
                Top reasons
              </p>
              <div className="flex flex-wrap gap-1.5">
                {reasonsToShow.map(([r, count]) => {
                  const selected = selectedReasons.has(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleReason(r)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                        selected
                          ? "bg-[var(--accent)] text-white hover:opacity-90"
                          : "bg-[var(--background)] dark:bg-white/10 text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {r} · {count.toLocaleString()}
                    </button>
                  );
                })}
                {hasMoreReasons && !showAllReasons && (
                  <button
                    type="button"
                    onClick={() => setShowAllReasons(true)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-[var(--muted)] bg-[var(--background)] dark:bg-white/10 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                  >
                    More +
                  </button>
                )}
                {showAllReasons && (
                  <button
                    type="button"
                    onClick={() => setShowAllReasons(false)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-[var(--muted)] bg-[var(--background)] dark:bg-white/10 border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                  >
                    Less
                  </button>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-2 flex items-center gap-1.5">
                <MapPin size={iconSize} className={iconClass} aria-hidden />
                Top neighborhoods
              </p>
              <div className="flex flex-wrap gap-1.5">
                {neighborhoodsWithCount.map(([n, count]) => {
                  const selected = selectedNeighborhoods.has(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleNeighborhood(n)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                        selected
                          ? "bg-[var(--accent)] text-white hover:opacity-90"
                          : "bg-[var(--background)] dark:bg-white/10 text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {n} · {count.toLocaleString()}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-2 flex items-center gap-1.5">
                <Building2 size={iconSize} className={iconClass} aria-hidden />
                Supervisor district
              </p>
              <div className="flex flex-wrap gap-1.5">
                {districtsWithCount.map(([d, count]) => {
                  const selected = selectedDistricts.has(d);
                  const label = d === "—" ? "Unknown" : `District ${d}`;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDistrict(d)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                        selected
                          ? "bg-[var(--accent)] text-white hover:opacity-90"
                          : "bg-[var(--background)] dark:bg-white/10 text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {label} · {count.toLocaleString()}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-2 flex items-center gap-1.5">
                <Clock size={iconSize} className={iconClass} aria-hidden />
                Flight duration
              </p>
              <div className="flex flex-wrap gap-1.5">
                {durationsWithCount.map(({ id, label, count }) => {
                  const selected = selectedDurations.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleDuration(id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                        selected
                          ? "bg-[var(--accent)] text-white hover:opacity-90"
                          : "bg-[var(--background)] dark:bg-white/10 text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {label} · {count.toLocaleString()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </aside>
      </div>

      <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--card-light)] dark:bg-[var(--card-dark)] px-4 py-2 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
        <Database size={iconSize} className={iconClass} aria-hidden />
        <span>Data source:</span>
        <a
          href={dataSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          San Francisco Police Department — Drone Flight Logs (DataSF)
        </a>
      </footer>
    </div>
  );
}
