/**
 * Types and fetch for SFPD Drone Flight Logs (DataSF)
 * https://data.sfgov.org/Public-Safety/San-Francisco-Police-Department-Drone-Flight-Logs/giw5-ttjs
 * Data is stored locally (see scripts/update-flights.mjs) for retention; API used as fallback.
 */

import fs from "fs";
import path from "path";

const API_BASE = "https://data.sfgov.org/resource/giw5-ttjs.json";
const DEFAULT_LIMIT = 5000;
const STORED_PATH = path.join(process.cwd(), "src/data/sfpd-flights.json");

export interface DroneFlightPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

export interface DroneFlight {
  date: string;
  case_cad_event_number: string;
  flight_duration_minutes: string;
  reason_for_flight: string;
  location: string;
  geocoded_location: string | null;
  point: DroneFlightPoint | null;
  analysis_neighborhood: string | null;
  supervisor_district: string | null;
  data_as_of: string;
  data_loaded_at: string;
}

export interface DroneFlightWithCoords extends DroneFlight {
  point: DroneFlightPoint;
}

import { SF_COUNTY_BBOX } from "./sf-bounds";

export { SF_COUNTY_BBOX };

export function hasCoords(flight: DroneFlight): flight is DroneFlightWithCoords {
  return (
    flight.point != null &&
    Array.isArray(flight.point.coordinates) &&
    flight.point.coordinates.length >= 2
  );
}

/** True if flight has coordinates inside SF county bbox. */
export function isInSFCounty(flight: DroneFlightWithCoords): boolean {
  const [lng, lat] = flight.point.coordinates;
  return (
    lat >= SF_COUNTY_BBOX.south &&
    lat <= SF_COUNTY_BBOX.north &&
    lng >= SF_COUNTY_BBOX.west &&
    lng <= SF_COUNTY_BBOX.east
  );
}

/** Reads stored flights from src/data/sfpd-flights.json (created by npm run update-data). */
function getStoredFlights(): DroneFlight[] | null {
  try {
    if (!fs.existsSync(STORED_PATH)) return null;
    const raw = fs.readFileSync(STORED_PATH, "utf-8");
    const data = JSON.parse(raw) as DroneFlight[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function fetchDroneFlights(
  limit: number = DEFAULT_LIMIT
): Promise<DroneFlight[]> {
  const url = `${API_BASE}?$limit=${limit}&$order=date DESC`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`SFPD API error: ${res.status}`);
  const data = (await res.json()) as DroneFlight[];
  return data;
}

/** Prefer stored data (2-year retention); fallback to API. Use in server components. */
export async function getDroneFlights(): Promise<DroneFlight[]> {
  const stored = getStoredFlights();
  if (stored != null && stored.length > 0) return stored;
  return fetchDroneFlights(DEFAULT_LIMIT);
}
