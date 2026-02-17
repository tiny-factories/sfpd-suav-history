#!/usr/bin/env node
/**
 * Fetches all SFPD drone flight records from DataSF and saves to src/data/sfpd-flights.json.
 * Run periodically to keep a local copy (e.g. retention is ~2 years).
 * Usage: node scripts/update-flights.mjs  OR  npm run update-data
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://data.sfgov.org/resource/giw5-ttjs.json";
const LIMIT = 1000;
const OUT_PATH = path.join(__dirname, "..", "src", "data", "sfpd-flights.json");

async function fetchAll() {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${API_BASE}?$limit=${LIMIT}&$offset=${offset}&$order=date ASC`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
    const chunk = await res.json();
    if (!chunk.length) break;
    all.push(...chunk);
    if (chunk.length < LIMIT) break;
    offset += LIMIT;
    process.stdout.write(`\rFetched ${all.length} records…`);
  }
  return all;
}

async function main() {
  console.log("Fetching SFPD drone flight logs from DataSF…");
  const data = await fetchAll();
  console.log(`\nTotal: ${data.length} records`);
  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), "utf8");
  console.log(`Written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
