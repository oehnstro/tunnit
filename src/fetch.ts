import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Place {
  name: string;
  placeId: string;
  category: string;
}

export interface PlaceData {
  name: string;
  category: string;
  weekdayText: string[];
  periods: {
    open: { day: number; time: string };
    close: { day: number; time: string };
  }[];
  currentWeekdayText: string[];
  currentPeriods: {
    open: { day: number; time: string };
    close: { day: number; time: string };
  }[];
  specialDays: { date: string; isExceptional: boolean }[];
  fetchedAt: string;
}

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY environment variable is required");
  process.exit(1);
}

const places: Place[] = JSON.parse(
  readFileSync(resolve(__dirname, "places.json"), "utf-8")
);

interface ApiPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

function formatPeriods(periods: ApiPeriod[] | undefined) {
  return (
    periods?.map((p) => ({
      open: {
        day: p.open.day,
        time:
          String(p.open.hour).padStart(2, "0") +
          String(p.open.minute).padStart(2, "0"),
      },
      close: p.close
        ? {
            day: p.close.day,
            time:
              String(p.close.hour).padStart(2, "0") +
              String(p.close.minute).padStart(2, "0"),
          }
        : { day: p.open.day, time: "2359" },
    })) ?? []
  );
}

async function fetchPlaceHours(place: Place): Promise<PlaceData> {
  const fields = [
    "regularOpeningHours",
    "currentOpeningHours",
    "displayName",
  ].join(",");

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${place.placeId}?fields=${fields}&languageCode=fi`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey!,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const regular = data.regularOpeningHours;
  const current = data.currentOpeningHours;

  return {
    name: place.name,
    category: place.category,
    weekdayText: regular?.weekdayDescriptions ?? [],
    periods: formatPeriods(regular?.periods),
    currentWeekdayText: current?.weekdayDescriptions ?? [],
    currentPeriods: formatPeriods(current?.periods),
    specialDays:
      current?.specialDays?.map((d: { date: { year: number; month: number; day: number }; exceptional: boolean }) => ({
        date: `${d.date.year}-${String(d.date.month).padStart(2, "0")}-${String(d.date.day).padStart(2, "0")}`,
        isExceptional: d.exceptional,
      })) ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  console.log(`Fetching hours for ${places.length} places...`);

  const results: PlaceData[] = [];
  for (const place of places) {
    try {
      const data = await fetchPlaceHours(place);
      results.push(data);
      console.log(`  OK: ${place.name}`);
    } catch (err) {
      console.error(`  FAIL: ${place.name}:`, err);
    }
  }

  const distDir = resolve(__dirname, "../dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, "data.json"), JSON.stringify(results, null, 2));
  console.log(`Wrote dist/data.json with ${results.length} places`);
}

main();
