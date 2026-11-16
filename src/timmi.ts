// Fetches swimming hall lane bookings from the public Timmi calendar (guest login)
// and writes them to dist/lanes.json. Never fails the build: on error, no file is
// written and generate.ts leaves the lanes page out.
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.TIMMI_BASE ?? "https://asp3.timmi.fi/WebTimmi/";
const LOGIN =
  "login.do?loginName=selaaja.uimahalli&password=password&roomId=1063346&adminAreaId=5275";
const WEEKS = 2;

// Timmi room-part id → key used by the page.
// all = whole big pool (blocks every lane), shallow/deep = teaching areas over lanes 1–2.
const PARTS: Record<number, string> = {
  1159903: "all",
  1159913: "L1",
  1159917: "L2",
  1159920: "L3",
  1159922: "L4",
  1159923: "L5",
  1159925: "L6",
  1160039: "shallow",
  1160040: "deep",
  1159894: "teach",
  1159893: "therapy",
};

// reservationType 2 = "blocked because an overlapping area is booked"; the page works that out itself.
const DERIVED_TYPE = 2;

export type LaneBooking = [date: string, startMin: number, endMin: number, key: string, type: number, name: string];

export interface LanesData {
  fetchedAt: string;
  bookings: LaneBooking[];
}

interface Episode {
  roomPartIdOnCalendar: number;
  startDateInMills: number;
  endDateInMills: number;
  reservationType: number;
  eventTextField: ({ name?: string } | string)[];
}

const helsinki = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toHelsinki(ms: number): { date: string; min: number } {
  const p = Object.fromEntries(helsinki.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

let cookie = "";

async function get(path: string, query: Record<string, string> = {}): Promise<string> {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(BASE + path + (qs ? (path.includes("?") ? "&" : "?") + qs : ""), {
    headers: { "User-Agent": "tunnit", ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status}`);
  const session = res.headers.getSetCookie().find((c) => c.startsWith("JSESSIONID="));
  if (session) cookie = session.split(";")[0];
  return res.text();
}

async function fetchLanes(): Promise<LanesData> {
  await get(LOGIN);
  if (!cookie) throw new Error("login did not return a session cookie");

  const ok = await get("calendarAjax.do", {
    actionCode: "updateCalendarData",
    structure: JSON.stringify({
      referenceDateMills: Date.now(),
      roomPartIds: Object.keys(PARTS).map(Number),
      daysSelected: [1, 1, 1, 1, 1, 1, 1],
      viewType: 0,
      viewStartTime: 4 * 3600 * 1000,
      viewEndTime: 20 * 3600 * 1000,
    }),
  });
  if (!ok.includes('"success":1')) throw new Error(`updateCalendarData: unexpected response ${ok.slice(0, 80)}`);

  const today = toHelsinki(Date.now()).date;
  const seen = new Set<string>();
  const bookings: LaneBooking[] = [];
  for (let week = 0; week < WEEKS; week++) {
    if (week > 0) await get("calendarAjax.do", { actionCode: "changeWeek", numberOfWeeks: "1" });
    const episodes: Episode[] = JSON.parse(await get("calendarAjax.do", { actionCode: "getEpisodes" }));
    for (const e of episodes) {
      const key = PARTS[e.roomPartIdOnCalendar];
      if (!key || e.reservationType === DERIVED_TYPE) continue;
      const id = `${e.roomPartIdOnCalendar}|${e.startDateInMills}|${e.endDateInMills}|${e.reservationType}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const start = toHelsinki(e.startDateInMills);
      if (start.date < today) continue;
      const end = toHelsinki(e.endDateInMills);
      const name = e.eventTextField
        .map((t) => (typeof t === "string" ? t : t.name ?? ""))
        .filter(Boolean)
        .join(" / ");
      bookings.push([start.date, start.min, end.date === start.date ? end.min : 24 * 60, key, e.reservationType, name]);
    }
  }
  bookings.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  return { fetchedAt: new Date().toISOString(), bookings };
}

async function main() {
  const distDir = resolve(__dirname, "../dist");
  const out = resolve(distDir, "lanes.json");
  mkdirSync(distDir, { recursive: true });
  console.log("Fetching swimming hall lane bookings from Timmi...");
  try {
    const data = await fetchLanes();
    writeFileSync(out, JSON.stringify(data));
    console.log(`Wrote dist/lanes.json with ${data.bookings.length} bookings`);
  } catch (err) {
    // Don't leave a stale file from an earlier local run behind.
    rmSync(out, { force: true });
    // fetch() reports network errors as "fetch failed" with the real reason in .cause.
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error("  FAIL: Timmi:", err instanceof Error ? err.message + cause : err);
  }
}

main();
