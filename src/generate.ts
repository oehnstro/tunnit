import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface LanesData {
  fetchedAt: string;
  bookings: [string, number, number, string, number, string][];
}

interface PlaceData {
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

const CATEGORY_ICONS: Record<string, string> = {
  swimming: "&#x1F3CA;",
  library: "&#x1F4DA;",
  shop: "&#x1F6D2;",
};

const DAY_ABBR: Record<string, string> = {
  maanantai: "ma",
  tiistai: "ti",
  keskiviikko: "ke",
  torstai: "to",
  perjantai: "pe",
  lauantai: "la",
  sunnuntai: "su",
};

function parseWeekdayText(text: string): { abbr: string; hours: string } {
  const colonIdx = text.indexOf(": ");
  if (colonIdx === -1) return { abbr: text, hours: "" };
  const fullDay = text.slice(0, colonIdx).toLowerCase();
  return {
    abbr: DAY_ABBR[fullDay] ?? fullDay,
    hours: text.slice(colonIdx + 2),
  };
}

function hasSpecialHoursToday(place: PlaceData): boolean {
  // Uses UTC date — could show the wrong day between midnight and ~03:00 Helsinki time.
  // Acceptable since the daily build also runs at 04:00 UTC (07:00 Helsinki).
  const today = new Date().toISOString().slice(0, 10);
  return place.specialDays.some((d) => d.date === today);
}

function renderPlace(place: PlaceData, index: number, lanesPage: boolean): string {
  const icon = CATEGORY_ICONS[place.category] ?? "";
  const specialToday = hasSpecialHoursToday(place);

  // Use current hours (which reflect holidays) when available, fall back to regular
  const displayText =
    place.currentWeekdayText.length > 0
      ? place.currentWeekdayText
      : place.weekdayText;
  const displayPeriods =
    place.currentPeriods.length > 0 ? place.currentPeriods : place.periods;

  const hoursRows = displayText
    .map((text, i) => {
      const { abbr, hours } = parseWeekdayText(text);
      return `<div class="day-row" data-day="${i}"><span class="day-label">${abbr}</span><span class="day-hours">${hours}</span></div>`;
    })
    .join("\n");

  const specialNotice = specialToday
    ? `<div class="special-notice">&#x26A0; Poikkeavat aukioloajat t&auml;n&auml;&auml;n</div>`
    : "";

  return `
    <div class="card" data-periods='${JSON.stringify(displayPeriods)}'>
      <div class="card-header">
        <span class="card-icon">${icon}</span>
        <h2>${place.name}</h2>
      </div>
      <div class="status" id="status-${index}">
        <span class="status-dot" id="dot-${index}"></span>
        <span class="status-label" id="label-${index}"></span>
        <span class="status-time" id="time-${index}"></span>
      </div>
      ${specialNotice}
      <div class="hours-grid">${hoursRows}</div>
      ${lanesPage && place.category === "swimming" ? `<a class="card-link" href="uimahalli.html">Radat &rarr;</a>` : ""}
    </div>`;
}

function pageShell(opts: {
  title: string;
  heading: string;
  subtitle: string;
  body: string;
  footer: string;
  scripts: string;
  bodyClass?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ""}>
  <header>
    <div class="header-inner">
      <h1>${opts.heading}</h1>
      <p class="subtitle">${opts.subtitle}</p>
    </div>
  </header>
  ${opts.body}
  <footer>
    <p>${opts.footer}</p>
  </footer>
  ${opts.scripts}
</body>
</html>`;
}

function generateHtml(places: PlaceData[], lanesPage: boolean): string {
  const fetchedAt = places[0]?.fetchedAt
    ? new Date(places[0].fetchedAt).toLocaleDateString("fi-FI", {
        dateStyle: "medium",
      })
    : "unknown";

  const cards = places.map((p, i) => renderPlace(p, i, lanesPage)).join("\n");

  return pageShell({
    title: "Tunnit &mdash; Kirkkonummi",
    heading: "Kirkkonummi",
    subtitle: "aukioloajat",
    body: `<main>
    ${cards}
  </main>`,
    footer: `P&auml;ivitetty ${fetchedAt} &middot; L&auml;hde: Google Maps`,
    scripts: `<script>
    (function() {
      var now = new Date();
      var day = now.getDay();
      var time = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
      // Highlight today's row (weekdayText index: 0=Mon, JS day: 0=Sun)
      var todayIndex = day === 0 ? 6 : day - 1;
      document.querySelectorAll('[data-day]').forEach(function(el) {
        if (parseInt(el.getAttribute('data-day')) === todayIndex) el.classList.add('today');
      });
      // Update open/closed status
      document.querySelectorAll('.card').forEach(function(card, i) {
        var periods = JSON.parse(card.getAttribute('data-periods') || '[]');
        var dot = document.getElementById('dot-' + i);
        var label = document.getElementById('label-' + i);
        var timeEl = document.getElementById('time-' + i);
        var open = false, closesAt = '';
        for (var j = 0; j < periods.length; j++) {
          var p = periods[j];
          if (p.open.day === day && time >= p.open.time && time < p.close.time) {
            open = true;
            closesAt = p.close.time.slice(0,2) + '.' + p.close.time.slice(2);
            break;
          }
        }
        dot.className = 'status-dot ' + (open ? 'open' : 'closed');
        label.textContent = open ? 'auki' : 'suljettu';
        timeEl.textContent = open ? 'sulkee ' + closesAt : '';
      });
    })();
  </script>`,
  });
}

const HOURS_DAYS = 14;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
const addDays = (date: string, n: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const helsinkiDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Helsinki" });

// Swimming hall opening hours per date, from the Google data. currentPeriods include
// holiday exceptions but only cover the week from when they were fetched; after that,
// fall back to regular periods. null = closed that day.
function poolHours(pool: PlaceData | undefined): Record<string, [number, number] | null> {
  const hours: Record<string, [number, number] | null> = {};
  if (!pool) return hours;
  const today = helsinkiDate(new Date());
  const currentFrom = helsinkiDate(new Date(pool.fetchedAt));
  const currentTo = addDays(currentFrom, 6);
  for (let i = 0; i < HOURS_DAYS; i++) {
    const date = addDays(today, i);
    const useCurrent = pool.currentPeriods.length > 0 && date >= currentFrom && date <= currentTo;
    const periods = useCurrent ? pool.currentPeriods : pool.periods;
    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const p = periods.find((x) => x.open.day === weekday);
    hours[date] = p ? [toMin(p.open.time), p.close.day === weekday ? toMin(p.close.time) : 24 * 60] : null;
  }
  return hours;
}

function generateLanesHtml(lanes: LanesData, pool: PlaceData | undefined): string {
  const updated = new Date(lanes.fetchedAt).toLocaleString("fi-FI", {
    timeZone: "Europe/Helsinki",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const data = JSON.stringify({ fetchedAt: lanes.fetchedAt, hours: poolHours(pool), bookings: lanes.bookings })
    .replace(/</g, "\\u003c");

  return pageShell({
    title: "Uimahallin radat &mdash; Kirkkonummi",
    heading: `<a href="index.html">Kirkkonummi</a>`,
    subtitle: "uimahallin radat",
    bodyClass: "lanes-page",
    body: `<main class="lanes">
    <div class="lanes-head">
      <h2>Vapaat radat</h2>
      <div class="lanes-days" id="lanes-days" role="group" aria-label="P&auml;iv&auml;"></div>
    </div>
    <div class="lanes-strip" id="lanes-strip"><noscript>Ratojen n&auml;ytt&auml;minen vaatii JavaScriptin.</noscript></div>
    <div class="lanes-detail" id="lanes-detail" aria-live="polite"></div>
    <div class="lanes-legend" id="lanes-legend"></div>
  </main>`,
    footer: `P&auml;ivitetty ${updated} &middot; L&auml;hde: Timmi-varauskalenteri`,
    scripts: `<script type="application/json" id="lanes-data">${data}</script>
  <script src="lanes.js"></script>`,
  });
}

function main() {
  const distDir = resolve(__dirname, "../dist");
  mkdirSync(distDir, { recursive: true });

  const data: PlaceData[] = JSON.parse(
    readFileSync(resolve(distDir, "data.json"), "utf-8")
  );

  const lanesPath = resolve(distDir, "lanes.json");
  const lanes: LanesData | null = existsSync(lanesPath)
    ? JSON.parse(readFileSync(lanesPath, "utf-8"))
    : null;

  const html = generateHtml(data, lanes !== null);
  writeFileSync(resolve(distDir, "index.html"), html);

  copyFileSync(
    resolve(__dirname, "../public/style.css"),
    resolve(distDir, "style.css")
  );

  if (lanes) {
    const pool = data.find((p) => p.category === "swimming");
    writeFileSync(resolve(distDir, "uimahalli.html"), generateLanesHtml(lanes, pool));
    copyFileSync(resolve(__dirname, "../public/lanes.js"), resolve(distDir, "lanes.js"));
  } else {
    rmSync(resolve(distDir, "uimahalli.html"), { force: true });
    rmSync(resolve(distDir, "lanes.js"), { force: true });
  }

  const cnamePath = resolve(__dirname, "../public/CNAME");
  if (existsSync(cnamePath)) {
    copyFileSync(cnamePath, resolve(distDir, "CNAME"));
  }

  console.log(
    `Generated dist/index.html with ${data.length} places` +
      (lanes ? ` and dist/uimahalli.html with ${lanes.bookings.length} lane bookings` : " (no lane data, lanes page skipped)")
  );
}

main();
