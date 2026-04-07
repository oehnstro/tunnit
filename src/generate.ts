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
    .map((text, i) => `<tr data-day="${i}"><td>${text}</td></tr>`)
    .join("\n");

  const specialNotice = specialToday
    ? `<p class="special-notice">Poikkeavat aukioloajat t&auml;n&auml;&auml;n</p>`
    : "";

  return `
    <div class="card" data-periods='${JSON.stringify(displayPeriods)}'>
      <h2>${icon} ${place.name}</h2>
      <span class="badge" id="badge-${index}"></span>
      ${specialNotice}
      <table>${hoursRows}</table>
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
  <title>Aukioloajat - Kirkkonummi</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Kirkkonummi</h1>
    <p class="subtitle">Aukioloajat</p>
  </header>
  <main>
    ${cards}
  </main>
  <footer>
    <p>P&auml;ivitetty ${fetchedAt} &middot; Lähde: Google Maps</p>
  </footer>
  <script>
    (function() {
      var now = new Date();
      var day = now.getDay();
      var time = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
      // Highlight today's row (weekdayText index: 0=Mon, JS day: 0=Sun)
      var todayIndex = day === 0 ? 6 : day - 1;
      document.querySelectorAll('tr[data-day]').forEach(function(tr) {
        if (parseInt(tr.getAttribute('data-day')) === todayIndex) tr.classList.add('today');
      });
      // Update open/closed badges
      document.querySelectorAll('.card').forEach(function(card, i) {
        var periods = JSON.parse(card.getAttribute('data-periods') || '[]');
        var badge = document.getElementById('badge-' + i);
        var open = false, closesAt = '';
        for (var j = 0; j < periods.length; j++) {
          var p = periods[j];
          if (p.open.day === day && time >= p.open.time && time < p.close.time) {
            open = true;
            closesAt = p.close.time.slice(0,2) + ':' + p.close.time.slice(2);
            break;
          }
        }
        badge.className = 'badge ' + (open ? 'open' : 'closed');
        badge.textContent = open ? 'Auki nyt \\u00b7 sulkee ' + closesAt : 'Suljettu';
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
