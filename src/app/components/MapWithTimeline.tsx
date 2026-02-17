"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DroneFlightWithCoords } from "@/lib/sfpd-flights";

const DroneMapClient = dynamic(() => import("./DroneMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 min-h-[400px] w-full bg-[var(--background)] flex items-center justify-center text-[var(--muted)] text-sm font-mono">
      Loading…
    </div>
  ),
});

function formatLabel(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

/** Start of day (midnight) for a timestamp, for same-day comparison */
function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function MapWithTimeline({
  timelineFlights,
  mapFlights,
  rangeStartTs,
  rangeEndTs,
  onRangeChange,
}: {
  timelineFlights: DroneFlightWithCoords[];
  mapFlights: DroneFlightWithCoords[];
  rangeStartTs: number;
  rangeEndTs: number;
  onRangeChange: (startTs: number, endTs: number) => void;
}) {
  const { minTs, maxTs } = useMemo(() => {
    if (timelineFlights.length === 0) return { minTs: 0, maxTs: 0 };
    const times = timelineFlights.map((f) => new Date(f.date).getTime());
    return { minTs: Math.min(...times), maxTs: Math.max(...times) };
  }, [timelineFlights]);

  const [playbackTs, setPlaybackTs] = useState(maxTs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(0.5);
  const playSpeedRef = useRef(playSpeed);
  playSpeedRef.current = playSpeed;
  const PLAY_SPEEDS = [0.25, 0.5, 0.75, 1] as const;
  const rangeRef = useRef({ rangeStartTs, rangeEndTs });
  rangeRef.current = { rangeStartTs, rangeEndTs };

  // Clamp playback position when controlled range changes
  useEffect(() => {
    if (maxTs <= minTs) return;
    setPlaybackTs((prev) => Math.max(rangeStartTs, Math.min(rangeEndTs, prev)));
  }, [rangeStartTs, rangeEndTs, minTs, maxTs]);

  const [showAllPoints, setShowAllPoints] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<"dots" | "heatmap">("dots");

  // When showAllPoints: show every mapFlight. Otherwise: only flights on the current playback date.
  const visibleFlights = useMemo(() => {
    if (showAllPoints) return mapFlights;
    const playbackDay = dayStart(playbackTs);
    return mapFlights.filter((f) => dayStart(new Date(f.date).getTime()) === playbackDay);
  }, [mapFlights, playbackTs, showAllPoints]);

  const playbackDate = useMemo(() => new Date(playbackTs), [playbackTs]);

  const playStart = rangeStartTs;
  const playEnd = rangeEndTs;

  // Advance timeline when playing. Use refs so we always see latest range/speed.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const { rangeStartTs: rs, rangeEndTs: re } = rangeRef.current;
      if (re <= rs) return;
      const speed = playSpeedRef.current;
      const step = Math.max(1, ((re - rs) / 500) * speed);
      setPlaybackTs((t) => {
        const { rangeStartTs: rs2, rangeEndTs: re2 } = rangeRef.current;
        if (re2 <= rs2) return t;
        const next = t + step;
        if (next >= re2) {
          setIsPlaying(false);
          return re2;
        }
        return next;
      });
    }, 40);
    return () => clearInterval(id);
  }, [isPlaying]);

  const trackRef = useRef<HTMLDivElement>(null);

  const pctToTs = useCallback(
    (pct: number) => {
      return minTs + (maxTs - minTs) * (pct / 100);
    },
    [minTs, maxTs]
  );
  const tsToPct = useCallback(
    (ts: number) => {
      if (maxTs <= minTs) return 0;
      return ((ts - minTs) / (maxTs - minTs)) * 100;
    },
    [minTs, maxTs]
  );

  const playheadPct = tsToPct(playbackTs);
  const rangeStartPct = tsToPct(playStart);
  const rangeEndPct = tsToPct(playEnd);

  // Waveform: activity per time bucket (drone flights per segment, like audio waveform)
  const WAVEFORM_BUCKETS = 80;
  const waveformHeights = useMemo(() => {
    if (timelineFlights.length === 0 || maxTs <= minTs) return new Array(WAVEFORM_BUCKETS).fill(0);
    const step = (maxTs - minTs) / WAVEFORM_BUCKETS;
    const counts = new Array(WAVEFORM_BUCKETS).fill(0);
    for (const f of timelineFlights) {
      const t = new Date(f.date).getTime();
      const i = Math.min(WAVEFORM_BUCKETS - 1, Math.floor((t - minTs) / step));
      if (i >= 0) counts[i]++;
    }
    const maxCount = Math.max(1, ...counts);
    return counts.map((c) => c / maxCount);
  }, [timelineFlights, minTs, maxTs]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      setPlaybackTs(pctToTs(pct));
    },
    [pctToTs]
  );

  const [dragPlayhead, setDragPlayhead] = useState(false);
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragPlayhead(true);
  }, []);
  useEffect(() => {
    if (!dragPlayhead) return;
    const onMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      setPlaybackTs(pctToTs(pct));
    };
    const onUp = () => setDragPlayhead(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragPlayhead, pctToTs]);

  const setInPoint = useCallback(() => onRangeChange(playbackTs, rangeEndTs), [playbackTs, rangeEndTs, onRangeChange]);
  const setOutPoint = useCallback(() => onRangeChange(rangeStartTs, playbackTs), [rangeStartTs, playbackTs, onRangeChange]);

  const [dragHandle, setDragHandle] = useState<"in" | "out" | null>(null);
  useEffect(() => {
    if (!dragHandle) return;
    const onMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const ts = pctToTs(pct);
      const { rangeStartTs: rs, rangeEndTs: re } = rangeRef.current;
      if (dragHandle === "in") {
        onRangeChange(Math.min(ts, re - 1), re);
      } else {
        onRangeChange(rs, Math.max(ts, rs + 1));
      }
    };
    const onUp = () => setDragHandle(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragHandle, pctToTs, onRangeChange]);

  if (timelineFlights.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm font-mono">
        No flight data. Run{" "}
        <code className="mx-1 rounded bg-[var(--background)] dark:bg-white/10 border border-[var(--border)] px-1.5 py-0.5">
          npm run update-data
        </code>{" "}
        to fetch.
      </div>
    );
  }

  const mapWrapRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      <div
        ref={mapWrapRef}
        className="flex-1 min-h-0 relative bg-[var(--background)]"
      >
        {/* Dark underlay so feathered map mask reveals this outside SF (no hard boundary) */}
        <div className="absolute inset-0 z-0 bg-[var(--card-dark)]" aria-hidden role="presentation" />
        <DroneMapClient
          flights={visibleFlights}
          overlayContainerRef={mapWrapRef}
          mapViewMode={mapViewMode}
        />
      </div>
      {/* Timeline bar: single row, labels above Map / Scope / Speed */}
      <div className="timeline-bar absolute bottom-4 left-[calc(1rem+min(380px,100vw-2rem)+0.5rem)] right-4 z-10 rounded-2xl border border-[var(--border)] bg-[var(--card-light)] dark:bg-[var(--card-dark)] shadow-xl px-4 py-3 flex items-end gap-3 font-mono">
        {/* Map — same style as Scope: label above, text-only toggles */}
        <div className="shrink-0 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Map</span>
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] dark:bg-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setMapViewMode("dots")}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                mapViewMode === "dots" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Show flights as dots"
            >
              Dots
            </button>
            <button
              type="button"
              onClick={() => setMapViewMode("heatmap")}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                mapViewMode === "heatmap" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              title="Show heatmap"
            >
              Heat
            </button>
          </div>
        </div>

        {/* Scope — label above, Timeline/All data inline */}
        <div className="shrink-0 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Scope</span>
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] dark:bg-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setShowAllPoints(false)}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                !showAllPoints ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setShowAllPoints(true)}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                showAllPoints ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              All data
            </button>
          </div>
        </div>

        {/* Play button */}
        <button
          type="button"
          onClick={() => {
            if (!isPlaying && (playbackTs < playStart || playbackTs > playEnd)) {
              setPlaybackTs(playStart);
            }
            setIsPlaying((p) => !p);
          }}
          className="timeline-play-btn shrink-0 w-9 h-9 rounded-full bg-[var(--accent)] text-white hover:opacity-90 flex items-center justify-center transition-transform active:scale-95 shadow-md"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Speed — label above, dropdown inline */}
        <div className="shrink-0 flex flex-col gap-1">
          <label htmlFor="timeline-speed" className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Speed
          </label>
          <select
            id="timeline-speed"
            value={playSpeed}
            onChange={(e) => setPlaySpeed(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] dark:bg-white/10 text-[var(--foreground)] text-[11px] font-medium py-1.5 pl-2 pr-6 tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            title="Playback speed"
          >
            {PLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>

        {/* Waveform timeline with draggable in/out handles */}
        <div className="flex-1 min-w-0 flex flex-col justify-end">
          <div
            ref={trackRef}
            role="slider"
            aria-valuenow={playbackTs}
            aria-valuemin={minTs}
            aria-valuemax={maxTs}
            aria-label="Timeline position"
            tabIndex={0}
            onClick={handleTrackClick}
            className="timeline-track timeline-waveform flex-1 min-w-0 h-10 flex items-center relative rounded-lg overflow-hidden cursor-pointer select-none bg-[var(--background)] dark:bg-white/10"
          >
            {/* Waveform bars — height = activity at that time */}
            <div className="absolute inset-0 flex items-end justify-between gap-px px-0.5 pb-0.5 pointer-events-none">
              {waveformHeights.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[2px] rounded-sm bg-[var(--muted)]/50"
                  style={{ height: `${Math.max(4, h * 100)}%` }}
                />
              ))}
            </div>
            {/* Selected range highlight (between in/out handles) */}
            <div
              className="absolute inset-y-0 bg-[var(--accent)]/25 pointer-events-none"
              style={{
                left: `${rangeStartPct}%`,
                width: `${rangeEndPct - rangeStartPct}%`,
              }}
            />
            {/* In point handle — drag to set loop start */}
            <div
              className="timeline-range-handle absolute top-0 bottom-0 w-2 -ml-1 z-10 cursor-ew-resize flex items-center justify-center"
              style={{ left: `${rangeStartPct}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragHandle("in");
              }}
              title="Drag to set loop start (Set In)"
            >
              <div className="w-1.5 h-full min-h-[20px] rounded-full bg-[var(--accent)] shadow" />
            </div>
            {/* Out point handle — drag to set loop end */}
            <div
              className="timeline-range-handle absolute top-0 bottom-0 w-2 -ml-1 z-10 cursor-ew-resize flex items-center justify-center"
              style={{ left: `${rangeEndPct}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragHandle("out");
              }}
              title="Drag to set loop end (Set Out)"
            >
              <div className="w-1.5 h-full min-h-[20px] rounded-full bg-[var(--accent)] shadow" />
            </div>
            {/* Playhead */}
            <div
              className="timeline-handle absolute top-0 bottom-0 w-0.5 -ml-px z-20 pointer-events-auto cursor-ew-resize bg-[var(--accent)] shadow-lg"
              style={{ left: `${playheadPct}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handlePlayheadMouseDown(e);
              }}
            />
          </div>
        </div>

        {/* Timestamp and context on the right */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className="text-sm font-medium text-[var(--foreground)] tabular-nums">
            {showAllPoints ? "All data" : formatLabel(playbackDate)}
          </span>
          <span className="text-[11px] text-[var(--muted)] tabular-nums">
            {visibleFlights.length} flights
          </span>
        </div>
      </div>
    </div>
  );
}
