import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function renderPlace(place: PlaceData, index: number): string {
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
    </div>`;
}

function generateHtml(places: PlaceData[]): string {
  const fetchedAt = places[0]?.fetchedAt
    ? new Date(places[0].fetchedAt).toLocaleDateString("fi-FI", {
        dateStyle: "medium",
      })
    : "unknown";

  const cards = places.map((p, i) => renderPlace(p, i)).join("\n");

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tunnit &mdash; Kirkkonummi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <div class="header-inner">
      <h1>Kirkkonummi</h1>
      <p class="subtitle">aukioloajat</p>
    </div>
  </header>
  <main>
    ${cards}
  </main>
  <footer>
    <p>P&auml;ivitetty ${fetchedAt} &middot; L&auml;hde: Google Maps</p>
  </footer>
  <script>
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
  </script>
</body>
</html>`;
}

function main() {
  const distDir = resolve(__dirname, "../dist");
  mkdirSync(distDir, { recursive: true });

  const data: PlaceData[] = JSON.parse(
    readFileSync(resolve(distDir, "data.json"), "utf-8")
  );

  const html = generateHtml(data);
  writeFileSync(resolve(distDir, "index.html"), html);

  copyFileSync(
    resolve(__dirname, "../public/style.css"),
    resolve(distDir, "style.css")
  );

  const cnamePath = resolve(__dirname, "../public/CNAME");
  if (existsSync(cnamePath)) {
    copyFileSync(cnamePath, resolve(distDir, "CNAME"));
  }

  console.log(`Generated dist/index.html with ${data.length} places`);
}

main();
