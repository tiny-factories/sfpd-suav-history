import { getDroneFlights, hasCoords, isInSFCounty } from "@/lib/sfpd-flights";
import Dashboard from "./components/Dashboard";

export const revalidate = 3600;

export default async function Home() {
  const allFlights = await getDroneFlights();
  const flightsWithCoords = allFlights
    .filter(hasCoords)
    .filter(isInSFCounty);
  flightsWithCoords.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return <Dashboard flights={flightsWithCoords} />;
}
