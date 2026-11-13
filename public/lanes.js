// Uimahallin radat: free-lane timeline for today and the next two days.
// Data comes from #lanes-data, written at build time by src/generate.ts.
(function () {
  "use strict";

  var DATA = JSON.parse(document.getElementById("lanes-data").textContent);
  var NAME = 5;
  // [date, startMin, endMin, key, type, name]; type 3 = maintenance closure
  var BOOKINGS = DATA.bookings.map(function (r) {
    return { d: r[0], s: r[1], e: r[2], k: r[3], t: r[4], n: r[NAME] };
  });
  var DAYS_SHOWN = 3;
  var PAST_MIN = 60;
  var SWIM_ENDS_BEFORE_CLOSE = 30;
  var FALLBACK_HOURS = [360, 1260];

  // Which booked areas take each row out of use.
  var AFFECTS = {
    L1: ["L1", "all", "shallow", "deep"],
    L2: ["L2", "all", "shallow", "deep"],
    L3: ["L3", "all"],
    L4: ["L4", "all"],
    L5: ["L5", "all"],
    L6: ["L6", "all"],
    teach: ["teach"],
    therapy: ["therapy"],
  };
  var AREA = { all: "Koko allas", shallow: "Matala pää", deep: "Syvä pää" };
  var ROWS = [
    ["L1", "Rata 1"], ["L2", "Rata 2"], ["L3", "Rata 3"], ["L4", "Rata 4"], ["L5", "Rata 5"], ["L6", "Rata 6"],
    ["teach", "Opetus"], ["therapy", "Terapia"],
  ];
  var WD = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  var WD_LONG = ["Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai"];

  var elDays = document.getElementById("lanes-days");
  var elStrip = document.getElementById("lanes-strip");
  var elDetail = document.getElementById("lanes-detail");
  var elLegend = document.getElementById("lanes-legend");

  var helsinki = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function helsinkiNow() {
    var p = {};
    helsinki.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { d: p.year + "-" + p.month + "-" + p.day, m: Number(p.hour) * 60 + Number(p.minute) };
  }

  function fmt(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function dateObj(d) { return new Date(d + "T12:00:00Z"); }
  function addDays(d, n) { var x = dateObj(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function dayLabel(d) { var x = dateObj(d); return WD[x.getUTCDay()] + " " + x.getUTCDate() + "." + (x.getUTCMonth() + 1) + "."; }
  // null = closed all day
  function hours(d) { return d in DATA.hours ? DATA.hours[d] : FALLBACK_HOURS; }
  function swimEnd(d) { return hours(d)[1] - SWIM_ENDS_BEFORE_CLOSE; }
  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function shortName(n) {
    return n.replace(/^(Kirkkonummen )?[Nn]uoriso- ja liikuntapalvelut\s*\/\s*/, "").replace(/^Opistot \d+,\s*/, "Opisto · ");
  }
  function bookingsFor(u, d) {
    return BOOKINGS.filter(function (b) { return b.d === d && AFFECTS[u].indexOf(b.k) !== -1; });
  }

  var lastDate = BOOKINGS.reduce(function (x, b) { return b.d > x ? b.d : x; }, "");
  var dates = [];
  var cur = null;
  var sel = null; // { id, u } of the tapped booking
  var AX0 = 360, AX1 = 1260;
  function pct(m) { return (Math.max(AX0, Math.min(AX1, m)) - AX0) / (AX1 - AX0) * 100; }

  // Today (unless swimming is already over) and the following days. Nothing from the past.
  function pickDates() {
    var n = helsinkiNow();
    dates = [];
    for (var d = n.d; d <= lastDate && dates.length < DAYS_SHOWN; d = addDays(d, 1)) {
      var h = hours(d);
      if (d === n.d && h && n.m >= swimEnd(d)) continue;
      dates.push(d);
    }
    if (dates.indexOf(cur) === -1) { cur = dates[0] || null; sel = null; }
  }

  function renderDays() {
    var today = helsinkiNow().d;
    elDays.innerHTML = dates.map(function (d) {
      var x = dateObj(d);
      var lbl = d === today ? "Tänään" : d === addDays(today, 1) ? "Huomenna" : WD_LONG[x.getUTCDay()];
      return '<button class="lanes-day" type="button" data-d="' + d + '" aria-pressed="' + (d === cur) + '">' +
        lbl + "<small>" + x.getUTCDate() + "." + (x.getUTCMonth() + 1) + ".</small></button>";
    }).join("");
  }

  function render() {
    if (!cur) {
      elStrip.innerHTML = '<p class="lanes-empty">Varaustietoja ei ole saatavilla.</p>';
      elDetail.innerHTML = elLegend.innerHTML = "";
      return;
    }
    var d = cur, n = helsinkiNow(), isToday = d === n.d, h = hours(d);
    if (!h) {
      elStrip.innerHTML = '<p class="lanes-empty">Uimahalli on suljettu ' + dayLabel(d) + "</p>";
      elDetail.innerHTML = elLegend.innerHTML = "";
      return;
    }
    var open = h[0], close = h[1], end = swimEnd(d);
    AX0 = isToday ? Math.max(open, Math.floor((n.m - PAST_MIN) / 15) * 15) : open;
    AX1 = close;
    var from = Math.max(open, AX0);
    var shut = '<div class="lanes-shut" style="left:0;width:' + pct(from) + '%"></div>' +
      '<div class="lanes-shut" style="left:' + pct(end) + '%;right:0"></div>';
    var showNow = isToday && n.m >= AX0 && n.m <= AX1;
    var nowLine = showNow ? '<div class="lanes-now" style="left:' + pct(n.m) + '%"></div>' : "";

    // Always present so the lanes don't shift when switching days.
    var nowRow = '<div class="lanes-row"><div></div><div class="lanes-nowrow">' +
      (showNow ? '<span class="lanes-now-tag" style="left:' + pct(n.m) + '%">Nyt</span>' : "") + "</div></div>";

    var maint = false;
    var rows = ROWS.map(function (r) {
      var u = r[0], label = r[1];
      var bars = bookingsFor(u, d).filter(function (b) { return b.e > from && b.s < end; }).map(function (b) {
        if (b.t === 3) maint = true;
        var l = pct(Math.max(b.s, from)), w = pct(Math.min(b.e, end)) - l;
        var id = BOOKINGS.indexOf(b);
        var area = u.charAt(0) === "L" && AREA[b.k] ? AREA[b.k] + ": " : "";
        var cls = "lanes-bk" + (b.t === 3 ? " maint" : "") + (sel && sel.id === id && sel.u === u ? " sel" : "");
        return '<button type="button" class="' + cls + '" data-id="' + id + '" data-u="' + u + '" style="left:' + l + "%;width:" + w +
          '%" aria-label="' + label + " " + fmt(b.s) + "–" + fmt(b.e) + ", " + esc(area + b.n) + '">' + esc(shortName(b.n)) + "</button>";
      }).join("");
      return '<div class="lanes-row"><div class="lanes-lbl">' + label + '</div><div class="lanes-track">' + shut + bars + nowLine + "</div></div>";
    }).join("");

    var ticks = [];
    for (var hr = Math.ceil(AX0 / 60); hr <= Math.floor(AX1 / 60); hr++) {
      ticks.push('<span class="' + (hr % 2 ? "odd" : "") + '" style="left:' + pct(hr * 60) + '%">' + hr + "</span>");
    }
    elStrip.innerHTML = nowRow + rows + '<div class="lanes-row"><div></div><div class="lanes-axis">' + ticks.join("") + "</div></div>";

    elLegend.innerHTML =
      '<span><i class="free"></i>Vapaa</span><span><i class="booked"></i>Varattu</span>' +
      (maint ? '<span><i class="maint"></i>Huoltotauko</span>' : "") +
      '<span><i class="shut"></i>Ei uintia</span>';

    var b = sel && BOOKINGS[sel.id];
    if (b && b.d === d) {
      var rowLabel = ROWS.filter(function (r) { return r[0] === sel.u; })[0][1];
      elDetail.innerHTML = "<b>" + rowLabel + '</b><span class="muted">' + fmt(b.s) + "–" + fmt(b.e) + "</span> · " + esc(b.n) +
        (AREA[b.k] ? ' <span class="muted">(' + AREA[b.k] + ")</span>" : "");
    } else {
      elDetail.innerHTML = '<span class="muted">Napauta varausta nähdäksesi, kuka radalla on.</span>';
    }
  }

  elDays.addEventListener("click", function (e) {
    var btn = e.target.closest(".lanes-day");
    if (!btn) return;
    cur = btn.getAttribute("data-d");
    sel = null;
    renderDays();
    render();
  });
  elStrip.addEventListener("click", function (e) {
    var btn = e.target.closest(".lanes-bk");
    var id = btn ? Number(btn.getAttribute("data-id")) : -1;
    var u = btn ? btn.getAttribute("data-u") : null;
    sel = btn && !(sel && sel.id === id && sel.u === u) ? { id: id, u: u } : null;
    render();
  });

  function tick() { pickDates(); renderDays(); render(); }
  tick();
  setInterval(tick, 60 * 1000);
})();
