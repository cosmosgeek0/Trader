/* Quant shell — clock, collapsible sidebar, tooltips, router, theme,
   settings, search, news, and network. */
"use strict";

(function () {
  /* ---- settings: one object, validated on load, saved on every change ---- */
  var SET_KEY = "quant.settings";
  var SWITCH = [["off", "Off"], ["on", "On"]];
  var OPTIONS = {
    theme: [["system", "System"], ["light", "Light"], ["dark", "Dark"]],
    accent: [["red", "Red"], ["orange", "Orange"], ["yellow", "Yellow"], ["green", "Green"],
      ["blue", "Blue"], ["indigo", "Indigo"], ["violet", "Violet"], ["gray", "Gray"]],
    motion: [["system", "System"], ["full", "Full"], ["reduced", "Reduced"]],
    density: [["comfortable", "Comfortable"], ["compact", "Compact"]],
    font: [["inter", "Inter"], ["system", "System"]],
    lang: [["auto", "Auto detect"], ["en", "English"], ["hi", "हिन्दी"], ["zh", "中文"],
      ["es", "Español"], ["fr", "Français"]],
    tz: [["Asia/Kolkata", "IST"], ["UTC", "UTC"], ["Europe/London", "London"],
      ["America/New_York", "New York"], ["Asia/Tokyo", "Tokyo"]],
    hours: [["24", "24-hour"], ["12", "12-hour"]],
    sidebar: [["collapsed", "Collapsed"], ["expanded", "Expanded"]],
    unit: [["pct", "%"], ["bps", "bps"]],
    currency: [["USD", "USD"], ["EUR", "EUR"], ["GBP", "GBP"], ["INR", "INR"], ["JPY", "JPY"]],
    notifyWhen: [["always", "Always"], ["background", "Background only"]],
    awake: SWITCH, notifyDevices: SWITCH, notifyLogouts: SWITCH, notifySound: SWITCH,
    smoothing: SWITCH, seconds: SWITCH, confirmLogout: SWITCH,
    date: SWITCH, tips: SWITCH, zebra: SWITCH,
    tab: [["General", "General"], ["Notifications", "Notifications"], ["Devices", "Devices"]]
  };
  var LOCALE = { en: "en-CA", hi: "hi-IN", zh: "zh-CN", es: "es-ES", fr: "fr-FR" };
  var DEFAULTS = { theme: "system", accent: "blue", scale: 100, motion: "system",
    density: "comfortable", lang: "auto", tz: "Asia/Kolkata", hours: "24", sidebar: "expanded",
    landing: "overview", unit: "pct", currency: "USD", font: "inter", awake: "off",
    notifyDevices: "off", notifySound: "off", notifyWhen: "always", notifyLogouts: "off",
    smoothing: "off", seconds: "off", confirmLogout: "off", date: "off", tips: "on",
    zebra: "off", tab: "General" };
  var settings = {};

  function loadSettings() {
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(SET_KEY) || "{}"); } catch (e) { /* private mode */ }
    for (var k in DEFAULTS) {
      var v = raw[k];
      if (k === "scale") { settings[k] = v >= 80 && v <= 150 ? v : DEFAULTS[k]; }
      else if (k === "landing") { settings[k] = typeof v === "string" ? v : DEFAULTS[k]; }
      else { settings[k] = OPTIONS[k].some(function (o) { return o[0] === v; }) ? v : DEFAULTS[k]; }
    }
  }
  if (window.innerWidth <= 700) { DEFAULTS.sidebar = "collapsed"; }
  loadSettings();

  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ok */ }
  }

  function choose(key, value) {
    settings[key] = value;
    saveSettings();
    applyLook();
    applyClock();
  }

  function locale() {
    if (settings.lang !== "auto") { return LOCALE[settings.lang]; }
    var tag = navigator.language || "en";
    return LOCALE[tag.slice(0, 2)] ? tag : LOCALE.en;
  }

  var clockEl = document.getElementById("clock");
  var zoneEl = document.querySelector(".clock-command-zone");
  var clockFmt = null;
  var timeFmt = null;
  var hoverTimeFmt = null;
  var dateFmt = null;
  var dayFmt = null;

  function tickClock() {
    var now = new Date();
    clockEl.textContent = (settings.date === "on" ? dayFmt.format(now) + " · " : "") + clockFmt.format(now);
  }

  function applyClock() {
    clockFmt = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit", minute: "2-digit", second: settings.seconds === "on" ? "2-digit" : undefined,
      hourCycle: settings.hours === "12" ? "h12" : "h23", timeZone: settings.tz
    });
    timeFmt = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit", minute: "2-digit", hourCycle: settings.hours === "12" ? "h12" : "h23", timeZone: settings.tz
    });
    hoverTimeFmt = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: settings.hours === "12" ? "h12" : "h23", timeZone: settings.tz
    });
    dateFmt = new Intl.DateTimeFormat(locale(), {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: settings.tz
    });
    dayFmt = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", timeZone: settings.tz });
    zoneEl.textContent = label(OPTIONS.tz, settings.tz);
    tickClock();
  }
  applyClock();
  setInterval(tickClock, 250);

  /* ---- elements ---- */
  var side = document.getElementById("side");
  var brandBtn = document.getElementById("brand-btn");
  var collapseBtn = document.getElementById("side-collapse");
  var tip = document.getElementById("tip");
  var pop = document.getElementById("pop");
  var profile = document.getElementById("profile");
  var tipTimer = null;
  var KBD = "⌘";

  /* ---- look: theme, accent, motion, density, language on <html>; scale as zoom on <body> ---- */
  var darkMql = window.matchMedia("(prefers-color-scheme: dark)");
  var motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ACCENTS = { red: "#d94141", orange: "#e0812b", yellow: "#d9a52b", green: "#2e9e5b",
    blue: "#2557d6", indigo: "#5b5bd6", violet: "#7c3aed", gray: "#5d5d5d" };

  function applyLook() {
    var root = document.documentElement;
    root.setAttribute("data-theme", settings.theme === "system"
      ? (darkMql.matches ? "dark" : "light") : settings.theme);
    root.setAttribute("data-motion", settings.motion === "system"
      ? (motionMql.matches ? "reduced" : "full") : settings.motion);
    root.setAttribute("data-density", settings.density);
    root.setAttribute("data-font", settings.font);
    root.setAttribute("data-smoothing", settings.smoothing);
    root.setAttribute("data-zebra", settings.zebra);
    root.style.setProperty("--focus", ACCENTS[settings.accent]);
    document.body.style.zoom = settings.scale === 100 ? "" : String(settings.scale / 100);
    root.style.setProperty("--zoom", String(settings.scale / 100));
    var btns = pop.querySelectorAll(".tbtn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-theme-set") === settings.theme;
      btns[i].classList.toggle("on", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    syncSegs();
    applyAwake();
  }

  function zoomFactor() { return settings.scale / 100; }

  var wakeLock = null;

  function applyAwake() {
    if (!navigator.wakeLock) { return; }
    if (settings.awake === "on" && document.visibilityState === "visible") {
      if (!wakeLock) {
        navigator.wakeLock.request("screen").then(function (lock) {
          wakeLock = lock;
          lock.addEventListener("release", function () { wakeLock = null; });
        }, function () { /* refused by the browser */ });
      }
    } else if (wakeLock) {
      wakeLock.release();
    }
  }
  document.addEventListener("visibilitychange", applyAwake);

  darkMql.addEventListener("change", applyLook);
  motionMql.addEventListener("change", applyLook);
  applyLook();

  pop.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest
      ? ev.target.closest("[data-theme-set]") : null;
    if (btn) { choose("theme", btn.getAttribute("data-theme-set")); }
  });

  /* ---- sidebar state ---- */
  function state() { return side.getAttribute("data-state"); }

  function apply(next) {
    side.setAttribute("data-state", next);
    var expanded = next === "expanded";
    brandBtn.setAttribute("aria-label", expanded ? "Quant" : "Expand sidebar");
    if (expanded) { brandBtn.removeAttribute("data-tip"); }
    else { brandBtn.setAttribute("data-tip", "Expand"); }
    hideTip();
    closePop();
  }

  function toggle() {
    settings.sidebar = state() === "expanded" ? "collapsed" : "expanded";
    saveSettings();
    apply(settings.sidebar);
    syncSegs();
  }

  apply(settings.sidebar);
  side.offsetWidth;
  side.setAttribute("data-ready", "");

  brandBtn.addEventListener("click", function () {
    if (state() === "collapsed") { toggle(); }
  });
  collapseBtn.addEventListener("click", toggle);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "\\" && ev.metaKey) {
      ev.preventDefault();
      toggle();
    }
    if (ev.key === "Escape") { closePop(); }
  });

  /* ---- router: pages honest about their state ---- */
  var pageEl = document.getElementById("page");
  var rows = document.querySelectorAll(".nav-row[data-page]");
  var PAGES = {
    overview: "", account: "", markets: "", basis: "", volume: "",
    machine: "", logs: "", news: "", network: "", settings: ""
  };

  function route() {
    var h = (location.hash || "#" + settings.landing).slice(1);
    if (!Object.prototype.hasOwnProperty.call(PAGES, h)) { h = "overview"; }
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-page") === h;
      rows[i].classList.toggle("active", on);
      if (on) { rows[i].setAttribute("aria-current", "page"); }
      else { rows[i].removeAttribute("aria-current"); }
    }
    if (netRequest) {
      clearTimeout(netRequest.timeout);
      netRequest.controller.abort();
    }
    netRequest = null;
    netPlace = null;
    netHoverAt = null;
    if (logsRequest) {
      clearTimeout(logsRequest.timeout);
      logsRequest.controller.abort();
    }
    logsRequest = null;
    pageEl.textContent = "";
    devices.clear();
    newsEl = null;
    newsBar = null;
    clearInterval(newsTimer);
    netEl = null;
    netSync = null;
    logsSync = null;
    netPlot = null;
    netMap = null;
    clearInterval(netTimer);
    closeLogPop();
    logsEl = null;
    logsBar = null;
    clearInterval(logsTimer);
    if (acctRequest) {
      clearTimeout(acctRequest.timeout);
      acctRequest.controller.abort();
    }
    acctRequest = null;
    acctEl = null;
    acctBar = null;
    acctPaint = null;
    acctSide = null;
    acctSection = null;
    lawSection = null;
    lawModeSeg = null;
    lawSliding = false;
    lawRepaintPending = false;
    lawPaintKey = "";
    closeLawPop();
    closeReceipt();
    clearInterval(acctTimer);
    if (marketsRequest) {
      clearTimeout(marketsRequest.timeout);
      marketsRequest.controller.abort();
    }
    marketsRequest = null;
    marketsEl = null;
    marketsBar = null;
    marketsPaint = null;
    marketsRows = {};
    marketsSide = null;
    clearInterval(marketsTimer);
    if (basisRequest) {
      clearTimeout(basisRequest.timeout);
      basisRequest.controller.abort();
    }
    basisRequest = null;
    basisEl = null;
    basisPaint = null;
    basisDot = null;
    basisAge = null;
    clearInterval(basisTimer);
    var page = document.createElement("div");
    page.className = "page-shell";
    var head = document.createElement("div");
    head.className = "set-head";
    var ttl = document.createElement("b");
    ttl.textContent = h.charAt(0).toUpperCase() + h.slice(1);
    head.appendChild(ttl);
    page.appendChild(head);
    pageEl.appendChild(page);
    if (h === "overview") {
      buildStub(page, "overview", [["all", "All"]], ["#", "Section", "Detail", "Value"]);
    } else if (h === "machine") {
      buildStub(page, "machine", [["all", "All"], ["bnorm", "Basis"], ["brev", "Reverse"], ["spread", "Volume"]],
        ["#", "Strategy", "State", "Detail", "Value"]);
    } else if (h === "basis") { buildBasis(page, head); } else if (h === "volume") {
      buildStub(page, "volume", [["all", "All"], ["spot", "Spot only"], ["fut", "Futures only"]],
        ["#", "Token", "Price", "Volume 24h", "Vol 1h"]);
    } else if (h === "settings") { buildSettings(page, head); }
    else if (h === "news") { buildNews(page, head); }
    else if (h === "network") { buildNetwork(page, head); }
    else if (h === "logs") { buildLogs(page, head); }
    else if (h === "account") { buildAccount(page, head); }
    else if (h === "markets") { buildMarkets(page, head); }
    closePop();
  }

  function buildStub(page, name, pillDefs, cols) {
    page.classList.add(name);
    var bar = page.appendChild(el("div", "news-pills"));
    pillDefs.forEach(function (p, i) {
      var b = el("button", "news-pill" + (i ? "" : " on"));
      b.appendChild(icon(p[0]));
      b.appendChild(document.createTextNode(p[1]));
      bar.appendChild(b);
    });
    var list = page.appendChild(el("div", "news-list"));
    var head = el("div", "news-head-row");
    cols.forEach(function (c) { head.appendChild(el("span", "", c)); });
    list.appendChild(head);
  }

  function selectOne(btn) {
    var sibs = btn.parentElement.children;
    for (var i = 0; i < sibs.length; i++) {
      sibs[i].classList.toggle("on", sibs[i] === btn);
    }
  }

  document.addEventListener("mousedown", function (ev) {
    var open = document.querySelectorAll(".set-menu-panel:not([hidden])");
    for (var i = 0; i < open.length; i++) {
      if (!open[i].parentElement.contains(ev.target)) { open[i].hidden = true; }
    }
  });

  function menuControl(key, options) {
    options = options || OPTIONS[key];
    var value = settings[key];
    var wrap = document.createElement("div");
    wrap.className = "set-menu";
    var btn = document.createElement("button");
    btn.className = "set-menu-btn";
    var panel = document.createElement("div");
    panel.className = "set-menu-panel";
    panel.hidden = true;
    btn.textContent = label(options, value);
    options.forEach(function (o) {
      var it = document.createElement("button");
      it.className = "set-menu-row" + (o[0] === value ? " on" : "");
      it.textContent = o[1];
      it.addEventListener("click", function () {
        btn.textContent = o[1];
        selectOne(it);
        panel.hidden = true;
        choose(key, o[0]);
      });
      panel.appendChild(it);
    });
    btn.addEventListener("click", function () { panel.hidden = !panel.hidden; });
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
  }

  /* ---- settings page: General, Notifications, Devices ---- */
  function label(options, value) {
    var pair = options.filter(function (o) { return o[0] === value; })[0];
    return pair ? pair[1] : value;
  }

  function syncSegs() {
    var segs = document.querySelectorAll(".set-seg[data-key]");
    for (var i = 0; i < segs.length; i++) {
      var key = segs[i].getAttribute("data-key");
      for (var j = 0; j < segs[i].children.length; j++) {
        segs[i].children[j].classList.toggle("on",
          segs[i].children[j].getAttribute("data-value") === String(settings[key]));
      }
    }
  }

  function segControl(key, onPick) {
    var seg = document.createElement("div");
    seg.className = "set-seg";
    seg.setAttribute("data-key", key);
    OPTIONS[key].forEach(function (o) {
      var b = document.createElement("button");
      b.className = "set-seg-btn" + (settings[key] === o[0] ? " on" : "");
      b.setAttribute("data-value", o[0]);
      b.textContent = o[1];
      b.addEventListener("click", function () {
        choose(key, o[0]);
        if (onPick) { onPick(o[0]); }
      });
      seg.appendChild(b);
    });
    return seg;
  }

  function swatchControl() {
    var wrap = document.createElement("div");
    wrap.className = "set-swatches";
    OPTIONS.accent.forEach(function (pair) {
      var name = pair[0];
      var b = document.createElement("button");
      b.className = "set-swatch" + (settings.accent === name ? " on" : "");
      b.style.setProperty("--c", ACCENTS[name]);
      b.title = pair[1];
      b.addEventListener("click", function () {
        selectOne(b);
        choose("accent", name);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function switchControl(key, onPick) {
    var b = document.createElement("button");
    b.className = "set-switch" + (settings[key] === "on" ? " on" : "");
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", settings[key] === "on" ? "true" : "false");
    b.addEventListener("click", function () {
      choose(key, settings[key] === "on" ? "off" : "on");
      b.classList.toggle("on", settings[key] === "on");
      b.setAttribute("aria-checked", settings[key] === "on" ? "true" : "false");
      if (onPick) { onPick(settings[key]); }
    });
    return b;
  }

  function scaleControl() {
    var wrap = document.createElement("div");
    wrap.className = "set-group";
    var value = document.createElement("span");
    value.className = "set-value";
    value.textContent = settings.scale + "%";
    function go(next) {
      choose("scale", Math.min(150, Math.max(80, next)));
      value.textContent = settings.scale + "%";
    }
    wrap.appendChild(button("−", "set-action set-step", function () { go(settings.scale - 10); }));
    wrap.appendChild(value);
    wrap.appendChild(button("+", "set-action set-step", function () { go(settings.scale + 10); }));
    return wrap;
  }

  function buildSettings(page, head) {
    var acts = document.createElement("div");
    acts.className = "set-actions";
    acts.appendChild(button("Restore defaults", "set-action", function () {
      for (var k in DEFAULTS) { settings[k] = DEFAULTS[k]; }
      saveSettings();
      applyLook();
      applyClock();
      apply(settings.sidebar);
      if (location.hash) { route(); } else { location.hash = "settings"; }
    }));
    page.classList.add("settings");
    var tabs = document.createElement("div");
    tabs.className = "set-tabs";
    var body = document.createElement("div");
    OPTIONS.tab.forEach(function (pair) {
      var n = pair[0];
      var tb = document.createElement("button");
      tb.className = "set-tab" + (n === settings.tab ? " on" : "");
      var mark = n === "Devices"
        ? document.querySelector('#sess-icons svg[data-d="monitor"]').cloneNode(true)
        : n === "Notifications" ? icon("bell")
          : document.querySelector('.nav-row[data-page="settings"] svg').cloneNode(true);
      mark.setAttribute("class", "");
      tb.appendChild(mark);
      tb.appendChild(document.createTextNode(n));
      tb.addEventListener("click", function () {
        settings.tab = n;
        saveSettings();
        selectOne(tb);
        drawTab();
      });
      tabs.appendChild(tb);
    });
    tabs.appendChild(acts);
    page.appendChild(tabs);
    page.appendChild(body);

    function row(rows, title, subText, control) {
      var r = document.createElement("div");
      r.className = "set-row";
      var rank = document.createElement("span");
      rank.className = "set-rank";
      rank.textContent = String(rows.childElementCount);
      r.appendChild(rank);
      var t = document.createElement("div");
      t.className = "set-title";
      t.textContent = title;
      r.appendChild(t);
      var su = document.createElement("div");
      su.className = "set-sub";
      su.textContent = subText;
      r.appendChild(su);
      if (control.getAttribute("role") === "switch") { control.setAttribute("aria-label", title); }
      r.appendChild(control);
      rows.appendChild(r);
    }

    function drawGeneral(rows) {
      row(rows, "Theme", "Follow the system, or fix light or dark", segControl("theme"));
      row(rows, "Accent", "Colour used for focus, selection and switches", swatchControl());
      row(rows, "Interface scale", "Size of everything on the site, 80% to 150%", scaleControl());
      row(rows, "Motion", "Play animations, stop them, or follow the system", segControl("motion"));
      row(rows, "Density", "Space between rows in tables and lists", segControl("density"));
      row(rows, "Font", "Inter, or the system font of this device", segControl("font"));
      row(rows, "Language", "Date formats; auto follows the browser",
        menuControl("lang"));
      row(rows, "Clock", "Time zone for the top clock and every time shown",
        menuControl("tz"));
      row(rows, "Time format", "24-hour or 12-hour clock", segControl("hours"));
      row(rows, "Sidebar", "How the sidebar opens on each visit",
        segControl("sidebar", apply));
      var pages = [];
      for (var pk in PAGES) {
        pages.push([pk, pk.charAt(0).toUpperCase() + pk.slice(1)]);
      }
      row(rows, "Default landing page", "The page the site opens on",
        menuControl("landing", pages));
      row(rows, "Basis unit", "Percent or basis points, once gaps are shown", segControl("unit"));
      row(rows, "Currency", "Currency for money values, once they are shown",
        menuControl("currency"));
      row(rows, "Show seconds", "Show seconds on the top clock", switchControl("seconds"));
      row(rows, "Clock date", "Day and month beside the top clock", switchControl("date"));
      row(rows, "Striped tables", "Shade alternate rows in tables", switchControl("zebra"));
      row(rows, "Tooltips", "Hover hints on the sidebar", switchControl("tips"));
      row(rows, "Font smoothing", "Thinner grayscale text on macOS", switchControl("smoothing"));
      row(rows, "Keep screen awake", "Stop the screen sleeping while Quant is open", switchControl("awake"));
      row(rows, "Confirm device logout", "Ask before a Log out button acts", switchControl("confirmLogout"));
    }

    function drawNotifications(rows) {
      var group = document.createElement("div");
      group.className = "set-group";
      var status = document.createElement("span");
      status.className = "set-status";
      var enable = button("Enable", "set-action", function () {
        Notification.requestPermission().then(refresh);
      });
      var test = button("Send test", "set-action", function () {
        notify("Quant", "Notifications are working.");
      });
      function refresh() {
        var perm = "Notification" in window ? Notification.permission : "unsupported";
        status.textContent = { unsupported: "Not supported in this browser", denied: "Blocked in the browser",
          granted: "Enabled", default: "Not enabled" }[perm];
        enable.hidden = perm !== "default";
        test.hidden = perm !== "granted";
      }
      refresh();
      group.appendChild(status);
      group.appendChild(enable);
      group.appendChild(test);
      row(rows, "Browser notifications", "Let this browser show notifications from Quant", group);
      row(rows, "When", "Alert always, or only while Quant is in the background", segControl("notifyWhen"));
      row(rows, "Device sign-ins", "Alert when a new device signs in", switchControl("notifyDevices"));
      row(rows, "Device logouts", "Alert when a device is logged out", switchControl("notifyLogouts"));
      row(rows, "Sound", "Play a short tone with each alert",
        switchControl("notifySound", function (v) { if (v === "on") { beep(); } }));
    }

    function drawTab() {
      body.textContent = "";
      devices.clear();
      var rows = document.createElement("div");
      rows.className = "set-section";
      body.appendChild(rows);
      if (settings.tab !== "Devices") {
        var hr = document.createElement("div");
        hr.className = "set-head-row";
        ["#", "Setting", "Detail", "Value"].forEach(function (text) {
          var c = document.createElement("span");
          c.textContent = text;
          hr.appendChild(c);
        });
        rows.appendChild(hr);
      }
      if (settings.tab === "General") { drawGeneral(rows); }
      else if (settings.tab === "Notifications") { drawNotifications(rows); }
      else {
        devices.show(rows);
      }
    }
    drawTab();
  }

  /* ---- account popup: hover or click opens it ---- */
  var popTimer = null;

  function placePop() {
    var z = zoomFactor();
    var r = profile.getBoundingClientRect();
    var left = Math.min(Math.max(8, r.left), window.innerWidth - pop.offsetWidth * z - 8);
    pop.style.left = Math.round(left / z) + "px";
    pop.style.top = Math.round(Math.max(8, r.top - pop.offsetHeight * z - 8) / z) + "px";
  }

  function openPop() {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    if (!pop.hidden) { return; }
    pop.hidden = false;
    placePop();
    profile.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () { pop.classList.add("on"); });
  }

  function closePop() {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    if (pop.hidden) { return; }
    pop.classList.remove("on");
    profile.setAttribute("aria-expanded", "false");
    pop.hidden = true;
  }

  function scheduleClose() {
    if (popTimer) { clearTimeout(popTimer); }
    popTimer = setTimeout(closePop, 250);
  }

  profile.addEventListener("mouseenter", openPop);
  profile.addEventListener("mouseleave", scheduleClose);
  pop.addEventListener("mouseenter", function () {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  });
  pop.addEventListener("mouseleave", scheduleClose);
  profile.addEventListener("click", openPop);
  document.addEventListener("mousedown", function (ev) {
    if (!pop.hidden && !pop.contains(ev.target) &&
        !profile.contains(ev.target)) { closePop(); }
  });

  function button(label, cls, fn) {
    var out = el("button", cls, label);
    out.addEventListener("click", fn);
    return out;
  }

  var audio = null;

  function beep() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== "running") { audio.resume(); }
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.15);
  }

  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") { return; }
    new Notification(title, { body: body, icon: "brand-mark.png" });
    if (settings.notifySound === "on") { beep(); }
  }

  function alertUser(title, body) {
    if (settings.notifyWhen === "background" && document.visibilityState === "visible") { return; }
    notify(title, body);
  }

  var devices = window.createDevices({
    settings: settings,
    timezone: function () { return label(OPTIONS.tz, settings.tz); },
    formatTime: function (t) {
      var d = new Date(t * 1000);
      return dateFmt.format(d) + " " + timeFmt.format(d);
    },
    button: button,
    alertUser: alertUser,
    placePop: placePop
  });

  /* ---- news: the fetcher's one file, filtered and counted in the browser ---- */
  var newsData = null;
  var newsOk = true;
  var newsEl = null;
  var newsBar = null;
  var newsDot = null;
  var newsAge = null;
  var newsSwitch = null;
  var newsOn = true;
  var newsTimer = null;
  var newsFresh = {};
  var newsCat = "all";
  var newsQuery = "";
  var newsSourceQuery = "";
  var newsPage = 1;
  var NEWS_PAGE_SIZE = 20;
  var newsOff = {};
  try { newsOff = JSON.parse(localStorage.getItem("quant.news.off") || "{}"); } catch (e) { /* private mode */ }
  var CATEGORY_COLOR = { Crypto: "#3b82f6", Macro: "#8b5cf6", Markets: "#10b981", Regulation: "#f59e0b",
    Exchange: "#06b6d4", "On-Chain": "#ec4899", Security: "#ef4444" };
  var NEWS_CATS = Object.keys(CATEGORY_COLOR);
  var NEWS_CAT_ICON = { all: "all", Crypto: "spot", Macro: "globe", Markets: "bnorm",
    Regulation: "scales", Exchange: "spread", "On-Chain": "chain", Security: "shield" };

  function el(tag, cls, text) {
    var out = document.createElement(tag);
    if (cls) { out.className = cls; }
    if (text !== undefined) { out.textContent = text; }
    return out;
  }

  function svg(tag, attrs) {
    var out = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) { out.setAttribute(k, attrs[k]); }
    return out;
  }

  function icon(name) {
    return document.querySelector('#news-icons svg[data-i="' + name + '"]').cloneNode(true);
  }

  function refreshButton(fn) {
    var out = el("button", "set-action refresh");
    out.setAttribute("aria-label", "Refresh");
    out.setAttribute("data-tip", "Refresh");
    out.appendChild(icon("refresh"));
    out.addEventListener("click", fn);
    return out;
  }

  function badge(name, domain) {
    var m = String(name).match(/[A-Za-z0-9]/);
    var letter = el("span", "news-badge", m ? m[0].toUpperCase() : "?");
    if (!domain) { return letter; }
    var img = el("img", "news-badge");
    img.alt = "";
    img.src = "/favicons/" + domain + ".png";
    img.addEventListener("error", function () { img.replaceWith(letter); });
    return img;
  }

  function link(it, text) {
    var out = el(it.url ? "a" : "span", "", text);
    if (it.url) { out.href = it.url; out.target = "_blank"; out.rel = "noopener noreferrer"; }
    out.title = it.title;
    return out;
  }

  function itemKey(it) { return it.url || it.source + it.title; }

  function fetchNews() {
    fetch("/news.json", { headers: { "X-Requested-With": "XMLHttpRequest" } }).then(function (r) {
      if (r.status === 401) { location.reload(); }
      if (!r.ok) { throw new Error(r.status); }
      return r.json();
    }).then(function (d) {
      newsOk = true;
      if (newsData && newsData.at === d.at) { drawAge(); return; }
      var old = {};
      if (newsData) { newsData.items.forEach(function (it) { old[itemKey(it)] = true; }); }
      newsFresh = {};
      if (newsData) { d.items.forEach(function (it) { if (!old[itemKey(it)]) { newsFresh[itemKey(it)] = true; } }); }
      newsData = d;
      drawNews();
    }).catch(function () {
      newsOk = false;
      if (newsData) { drawAge(); } else { drawNews(); }
    });
  }

  function drawAge() {
    if (!newsEl) { return; }
    var age = newsData ? (Date.now() - newsData.at) / 1000 : Infinity;
    var state = !newsOn ? "off" : !newsOk ? "dead" : !newsData ? "" : age < 300 ? "live" : "stale";
    var words = { off: "Off", dead: "Offline", live: "Live", "": "On" };
    newsDot.className = "status-dot " + state;
    newsAge.textContent = state in words ? words[state] : "On · " + Math.round(age / 60) + "m";
  }

  function drawSwitch() {
    if (!newsEl) { return; }
    newsSwitch.classList.toggle("on", newsOn);
    newsSwitch.setAttribute("aria-checked", newsOn ? "true" : "false");
    newsEl.classList.toggle("off", !newsOn);
    drawAge();
  }

  function feedState(api, on, apply) {
    fetch(api, on === undefined ? { headers: { "X-Requested-With": "XMLHttpRequest" } }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: on }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { apply(d.on); })
      .catch(function () { /* state unknown, stays as shown */ });
  }

  function newsState(on) {
    feedState("/api/news", on, function (v) {
      newsOn = v;
      drawSwitch();
      if (v || !newsData) { fetchNews(); }
    });
  }

  function searchBox(name, placeholder, value, change) {
    var box = el("span", "news-search");
    box.setAttribute("data-box", name);
    box.appendChild(icon("search"));
    var input = el("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value;
    var clear = el("button", "news-clear");
    clear.setAttribute("aria-label", "Clear");
    clear.appendChild(icon("x"));
    clear.hidden = !value;
    function set(v) {
      input.value = v;
      clear.hidden = !v;
      change(v);
    }
    input.addEventListener("input", function () { set(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && input.value) { ev.stopPropagation(); set(""); }
    });
    clear.addEventListener("click", function () { input.focus(); set(""); });
    box.appendChild(input);
    box.appendChild(clear);
    return box;
  }

  function box(title, sub) {
    var out = el("div", "news-box");
    var head = el("div", "news-box-head");
    head.appendChild(el("b", "", title));
    if (sub) { head.appendChild(el("span", "", sub)); }
    out.appendChild(head);
    return out;
  }

  function pager(total, page, go, size) {
    var per = size || NEWS_PAGE_SIZE;
    var pages = Math.max(1, Math.ceil(total / per));
    var out = el("div", "dev-pages");
    function pageButton(label, to, on) {
      var b = el("button", "dev-page" + (on ? " on" : ""), label);
      if (to < 1 || to > pages) { b.disabled = true; }
      else { b.addEventListener("click", function () { go(to); }); }
      out.appendChild(b);
    }
    pageButton("‹", page - 1);
    var from = Math.max(1, Math.min(page - 2, pages - 4));
    var to = Math.min(pages, from + 4);
    if (from > 1) { pageButton("1", 1); }
    if (from > 2) { out.appendChild(el("span", "news-page-gap", "…")); }
    for (var p = from; p <= to; p++) { pageButton(String(p), p, p === page); }
    if (to < pages - 1) { out.appendChild(el("span", "news-page-gap", "…")); }
    if (to < pages) { pageButton(String(pages), pages); }
    pageButton("›", page + 1);
    var start = (page - 1) * per;
    out.appendChild(el("span", "news-page-info",
      (start + 1) + "–" + Math.min(start + per, total) + " of " + total));
    return out;
  }

  function tally(pool, field) {
    var n = {};
    pool.forEach(function (it) { n[it[field]] = (n[it[field]] || 0) + 1; });
    return Object.keys(n).map(function (k) { return [k, n[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  function barsBox(title, pairs, colors) {
    var out = box(title);
    var max = pairs.length ? pairs[0][1] : 1;
    pairs.forEach(function (p) {
      var row = el("div", "news-hbar");
      row.appendChild(el("span", "news-hbar-label", p[0]));
      var fill = row.appendChild(el("span", "news-hbar-track")).appendChild(el("span", "news-hbar-fill"));
      fill.style.width = Math.max(2, Math.round(p[1] / max * 100)) + "%";
      if (colors) { fill.style.background = colors[p[0]]; }
      row.appendChild(el("span", "news-hbar-value", String(p[1])));
      out.appendChild(row);
    });
    return out;
  }

  function topOfHour() {
    var now = new Date();
    var clock = new Intl.DateTimeFormat("en-US", { timeZone: settings.tz, minute: "numeric", second: "numeric" })
      .format(now).split(":").map(Number);
    return Math.floor(now.getTime() / 1000) - clock[0] * 60 - clock[1];
  }

  function activityBox(pool, top) {
    var out = box("Activity · 24h", "by category");
    var buckets = [];
    for (var i = 0; i < 24; i++) { buckets.push({}); }
    pool.forEach(function (it) {
      var back = Math.max(0, Math.ceil((top - it.ts) / 3600));
      if (back < 24) { buckets[23 - back][it.category] = (buckets[23 - back][it.category] || 0) + 1; }
    });
    function total(b) { return NEWS_CATS.reduce(function (n, c) { return n + (b[c] || 0); }, 0); }
    var max = Math.max.apply(null, buckets.map(total)) || 1;
    var chart = svg("svg", { viewBox: "0 0 356 118", "class": "news-chart" });
    var slot = 356 / 24;
    chart.appendChild(svg("text", { x: 0, y: 9 })).textContent = String(max);
    buckets.forEach(function (b, x) {
      var y = 98;
      NEWS_CATS.forEach(function (c) {
        if (!b[c]) { return; }
        var h = Math.max(2, b[c] / max * 84);
        y -= h;
        chart.appendChild(svg("rect", { x: x * slot + 1.5, y: y, width: slot - 3, height: Math.max(1, h - 1),
          rx: 1.5, fill: CATEGORY_COLOR[c] }));
      });
      var label = timeFmt.format(new Date((top - (23 - x) * 3600) * 1000));
      if ((23 - x) % 6 === 0) {
        var text = svg("text", { x: Math.min(x * slot + slot / 2, 334), y: 116, "text-anchor": "middle" });
        text.textContent = label;
        chart.appendChild(text);
      }
      var hit = svg("rect", { x: x * slot, y: 0, width: slot, height: 118, fill: "transparent" });
      hit.setAttribute("data-tip", label + " · " + total(b) + (total(b) ? ": " + NEWS_CATS.filter(function (c) {
        return b[c];
      }).map(function (c) { return c + " " + b[c]; }).join(", ") : ""));
      chart.appendChild(hit);
    });
    chart.appendChild(svg("line", { x1: 0, y1: 98.5, x2: 356, y2: 98.5, "class": "news-chart-base" }));
    out.appendChild(chart);
    return out;
  }

  function sourcesBox() {
    var rows = newsData.sources;
    var live = rows.filter(function (s) { return s.status === "live"; }).length;
    var out = box("Sources", rows.length + " · " + live + " live");
    out.appendChild(searchBox("sources", "Search sources", newsSourceQuery, function (v) { newsSourceQuery = v; drawNews(); }));
    var list = el("div", "news-source-list");
    var q = newsSourceQuery.trim().toLowerCase();
    var rank = { live: 2, delayed: 1, error: 0 };
    rows.slice().sort(function (a, b) {
      return b.count - a.count || rank[b.status] - rank[a.status] || a.label.localeCompare(b.label);
    }).forEach(function (s) {
      if (q && s.label.toLowerCase().indexOf(q) === -1) { return; }
      var row = el("div", "news-source-row" + (newsOff[s.label] ? " off" : ""));
      row.appendChild(badge(s.label, s.domain));
      var name = el("span", "news-source-name", s.label);
      name.title = s.label + (s.domain ? " · " + s.domain : "") + " · " + s.status;
      row.appendChild(name);
      row.appendChild(el("i", "news-status " + s.status));
      row.appendChild(el("span", "news-count", String(s.count)));
      var sw = el("button", "set-switch news-switch" + (newsOff[s.label] ? "" : " on"));
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-checked", newsOff[s.label] ? "false" : "true");
      sw.setAttribute("aria-label", s.label);
      sw.addEventListener("click", function () {
        if (newsOff[s.label]) { delete newsOff[s.label]; } else { newsOff[s.label] = true; }
        try { localStorage.setItem("quant.news.off", JSON.stringify(newsOff)); } catch (e) { /* private mode */ }
        drawNews();
      });
      row.appendChild(sw);
      list.appendChild(row);
    });
    if (!list.childNodes.length) { list.appendChild(el("div", "news-empty", "No source matches.")); }
    out.appendChild(list);
    return out;
  }

  function drawNews() {
    if (!newsEl) { return; }
    drawAge();
    var focused = document.activeElement && document.activeElement.closest(".news-search");
    var focusedBox = focused ? focused.getAttribute("data-box") : null;
    var caret = focused ? document.activeElement.selectionStart : 0;
    var sourceList = newsEl.querySelector(".news-source-list");
    var scrolled = sourceList ? sourceList.scrollTop : 0;
    newsEl.textContent = "";
    if (!newsData) {
      newsEl.appendChild(el("div", "news-empty", "No news yet."));
      return;
    }
    var hourStart = topOfHour();
    var q = newsQuery.trim().toLowerCase();
    var perCat = {};
    var items = newsData.items.filter(function (it) {
      if (newsOff[it.feed || it.source]
          || (q && it.title.toLowerCase().indexOf(q) === -1 && it.source.toLowerCase().indexOf(q) === -1)) {
        return false;
      }
      perCat[it.category] = (perCat[it.category] || 0) + 1;
      return true;
    });
    var shown = items.filter(function (it) { return newsCat === "all" || it.category === newsCat; });

    var bar = newsBar;
    bar.textContent = "";
    [["all", "All News"]].concat(NEWS_CATS.map(function (c) { return [c, c]; }))
      .forEach(function (def) {
        var b = el("button", "news-pill" + (newsCat === def[0] ? " on" : ""));
        b.appendChild(icon(NEWS_CAT_ICON[def[0]] || "all"));
        b.appendChild(document.createTextNode(def[1]));
        b.addEventListener("click", function () { newsCat = def[0]; newsPage = 1; drawNews(); });
        bar.appendChild(b);
      });

    var cols = el("div", "news-cols");
    var main = el("div", "news-main");
    var list = el("div", "news-list");
    var headRow = el("div", "news-row news-head-row");
    ["Time", "Source", "Headline", "Category", ""].forEach(function (t) { headRow.appendChild(el("span", "", t)); });
    list.appendChild(headRow);
    var pages = Math.max(1, Math.ceil(shown.length / NEWS_PAGE_SIZE));
    newsPage = Math.min(newsPage, pages);
    var start = (newsPage - 1) * NEWS_PAGE_SIZE;
    shown.slice(start, start + NEWS_PAGE_SIZE).forEach(function (it) {
      var row = el("div", "news-row" + (newsFresh[itemKey(it)] ? " fresh" : ""));
      row.appendChild(el("span", "news-time", timeFmt.format(new Date(it.ts * 1000))));
      var source = el("span", "news-source");
      source.appendChild(badge(it.source, it.domain));
      var col = source.appendChild(el("span", "news-source-col"));
      col.appendChild(el("span", "news-source-name", it.source));
      if (it.domain && it.domain !== it.source) { col.appendChild(el("span", "news-domain", it.domain)); }
      row.appendChild(source);
      row.appendChild(el("span", "news-headline")).appendChild(link(it, it.title));
      row.appendChild(el("span", "news-cat", it.category));
      var open = row.appendChild(el("span", "news-open"));
      if (it.url) { open.appendChild(link(it)).appendChild(icon("link")); }
      list.appendChild(row);
    });
    main.appendChild(list);
    if (!shown.length) {
      main.appendChild(el("div", "news-empty", "Nothing matches these filters."));
    } else {
      main.appendChild(pager(shown.length, newsPage, function (p) { newsPage = p; drawNews(); }));
    }
    cols.appendChild(main);

    var side = el("div", "news-side");
    function chip(name, boxEl) {
      var b = boxEl.querySelector(".news-box-head b");
      b.insertBefore(icon(name), b.firstChild);
      return boxEl;
    }
    side.appendChild(chip("both", sourcesBox()));
    side.appendChild(chip("change", activityBox(shown, hourStart)));
    var top = tally(shown, "source").slice(0, 8);
    var shades = {};
    top.forEach(function (p, i) { shades[p[0]] = "rgba(100, 116, 139, " + (1 - i * 0.09).toFixed(2) + ")"; });
    side.appendChild(chip("bnorm", barsBox("Top sources", top, shades)));
    side.appendChild(chip("breadth", barsBox("Categories", tally(shown, "category"), CATEGORY_COLOR)));
    cols.appendChild(side);
    newsEl.appendChild(cols);
    newsEl.querySelector(".news-source-list").scrollTop = scrolled;
    newsFresh = {};
    var input = focusedBox && newsEl.querySelector('.news-search[data-box="' + focusedBox + '"] input');
    if (input) {
      input.focus();
      input.setSelectionRange(caret, caret);
    }
  }

  function buildNews(page, head) {
    var acts = el("div", "set-actions news-acts");
    acts.appendChild(searchBox("news", "Search news…", newsQuery, function (v) {
      newsQuery = v;
      newsPage = 1;
      drawNews();
    }));
    acts.appendChild(refreshButton(fetchNews));
    newsSwitch = el("button", "set-switch");
    newsSwitch.setAttribute("role", "switch");
    newsSwitch.setAttribute("aria-label", "News on or off");
    newsSwitch.addEventListener("click", function () { newsState(!newsOn); });
    acts.appendChild(newsSwitch);
    var live = acts.appendChild(el("span", "status"));
    newsDot = live.appendChild(el("i", "status-dot"));
    newsAge = live.appendChild(el("span"));
    page.classList.add("news");
    head.appendChild(acts);
    newsBar = page.appendChild(el("div", "news-pills"));
    newsEl = page.appendChild(el("div", "news"));
    drawSwitch();
    drawNews();
    newsState();
    newsTimer = setInterval(newsState, 60000);
  }

  /* ---- account: the feed's one file, three wallets in one table ---- */
  var acctData = null;
  var acctOk = true;
  var acctEl = null;
  var acctBar = null;
  var acctDot = null;
  var acctAge = null;
  var acctTimer = null;
  var acctRequest = null;
  var acctWallet = "all";
  var acctPaint = null;
  var acctSide = null;
  var acctSort = { key: "value", dir: -1 };
  var ACCT_WALLETS = [["spot", "Spot"], ["margin", "Margin"], ["fut", "Futures"],
    ["earn", "Earn"], ["funding", "Funding"], ["loan", "Loans"]];
  var ACCT_ICON = { all: "all", spot: "spot", margin: "scales", fut: "fut",
    earn: "funding", funding: "spread", loan: "chain", convert: "spread" };
  var ORD_TABS = [["all", "Overview"], ["spot", "Spot"], ["fut", "Futures"],
    ["margin", "Margin"], ["convert", "Convert"]];
  var acctOrdTab = "all";
  var acctOrdPage = 1;
  var acctOrdSeen = null;
  var ACCT_LABEL = {};
  ACCT_WALLETS.forEach(function (w) { ACCT_LABEL[w[0]] = w[1]; });
  var ACCT_COLOR = { "Spot": "#3b82f6", "Margin": "#8b5cf6", "Futures": "#d9a52b",
    "Earn": "#2ebd85", "Funding": "#ec4899", "Loans": "#22b8cf" };
  var ACCT_COLS = [["asset", "Asset"], ["wallet", "Category"], ["amount", "Amount"],
    ["value", "Value"], ["pnl", "PnL"]];
  var ORD_STATUS = { FILLED: "Filled", PARTIALLY_FILLED: "Partial", CANCELED: "Canceled",
    EXPIRED: "Expired", NEW: "Open", Completed: "Done", Success: "Done", Confirmed: "Done" };

  function ordStatus(s) { return ORD_STATUS[s] || s; }

  function fmtMoney(v) {
    var sign = v < 0 ? "-" : "";
    var s = Math.abs(v).toFixed(2);
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + "$" + parts.join(".");
  }

  function fmtQty(v) {
    if (v === 0) { return "0"; }
    var s = Math.abs(v) >= 1 ? v.toFixed(4) : v.toFixed(8);
    return s.replace(/0+$/, "").replace(/\.$/, "");
  }

  function acctRows() {
    var rows = acctData.rows.map(function (r) { return r; });
    acctData.positions.forEach(function (p) {
      rows.push({ wallet: "fut", asset: p.symbol, position: true, leverage: p.leverage,
        amount: p.amount, entry: p.entry, pnl: p.pnl, value: null });
    });
    return rows.filter(function (r) { return acctWallet === "all" || r.wallet === acctWallet; });
  }

  function acctValue(r, key) {
    if (key === "asset") { return r.asset; }
    var v = r[key];
    return v === undefined || v === null ? null : v;
  }

  var acctOn = true;

  function fetchAcct(force) {
    if (!acctEl || acctRequest || !acctOn) { return; }
    if (force !== true && document.hidden) { return; }
    var controller = new AbortController();
    var request = { controller: controller, timeout: setTimeout(function () { controller.abort(); }, 12000) };
    acctRequest = request;
    fetch("/account.json", { signal: controller.signal, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) {
        if (r.status === 401) { location.reload(); }
        if (!r.ok) { throw new Error(r.status); }
        return r.json();
      }).then(function (d) {
        if (acctRequest !== request) { return; }
        clearTimeout(request.timeout);
        acctRequest = null;
        if (!acctEl) { return; }
        acctOk = true;
        if (acctData && acctData.at === d.at) { drawAcctStatus(); return; }
        acctData = d;
        paintAcct();
      }).catch(function () {
        if (acctRequest !== request) { return; }
        clearTimeout(request.timeout);
        acctRequest = null;
        if (!acctEl) { return; }
        acctOk = false;
        if (acctData) { drawAcctStatus(); } else { drawAcct(); }
      });
  }

  function drawAcctStatus() {
    acctRedrawFlush();
    if (!acctEl) { return; }
    if (!acctOn) {
      acctDot.className = "status-dot";
      acctAge.textContent = "Off";
      return;
    }
    var stale = !acctData || Date.now() - acctData.at > acctData.every * 3000;
    acctDot.className = "status-dot " + (!acctOk ? "dead" : !acctData ? "" : stale ? "stale" : "live");
    acctAge.textContent = !acctOk ? "Offline" : !acctData ? "" : stale ? "Stale" : "Live";
  }

  function acctDonut(pairs, colors, label) {
    var share = el("div", "logs-share");
    var donut = svg("svg", { viewBox: "0 0 120 120", "class": "logs-donut", role: "img", "aria-label": label });
    donut.appendChild(svg("circle", { cx: 60, cy: 60, r: 44, fill: "none",
      stroke: "var(--hover)", "stroke-width": 16 }));
    var total = 0;
    pairs.forEach(function (p) { total += Math.max(p[1], 0); });
    var C = 2 * Math.PI * 44;
    var run = 0;
    pairs.forEach(function (p) {
      var slice = Math.max(p[1], 0);
      if (!slice || !total) { return; }
      var arc = svg("circle", { cx: 60, cy: 60, r: 44, fill: "none", stroke: colors[p[0]] || "var(--faint)",
        "stroke-width": 16, "stroke-dasharray": (slice / total * C).toFixed(2) + " " + C.toFixed(2),
        "stroke-dashoffset": (-run / total * C).toFixed(2), transform: "rotate(-90 60 60)" });
      arc.setAttribute("data-tip", p[0] + " · " + fmtMoney(p[1])
        + " (" + Math.round(slice / total * 100) + "%)");
      donut.appendChild(arc);
      run += slice;
    });
    share.appendChild(donut);
    var legend = el("div", "logs-share-rows");
    pairs.forEach(function (p) {
      var row = el("div", "news-hbar");
      var dot = el("span", "net-chip-dot");
      dot.style.background = colors[p[0]] || "var(--faint)";
      row.appendChild(dot);
      row.appendChild(el("span", "news-hbar-label", p[0]));
      row.appendChild(el("span", "news-hbar-value", fmtMoney(p[1])));
      legend.appendChild(row);
    });
    share.appendChild(legend);
    return share;
  }

  function acctMeter(frac, tone) {
    var meter = el("span", "acct-meter");
    var fill = meter.appendChild(el("i", "acct-meter-fill"));
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%";
    fill.style.background = tone;
    return meter;
  }

  function acctStat(box, label, text) {
    var row = el("div", "news-source-row");
    row.appendChild(el("span", "news-source-name", label));
    row.appendChild(el("span", "news-count", text));
    box.appendChild(row);
    return row;
  }

  function acctKey(r) {
    return (r.position ? "p|" : r.wallet + "|") + r.asset + "|"
      + (r.collateral ? "c" : r.ltv !== undefined ? "l" : r.earn ? "e" + r.earn
        : r.borrowed ? "b" : r.locked ? "k" : "-");
  }

  function acctSub(r) {
    if (r.position) {
      return (r.amount > 0 ? "long" : "short") + " · " + r.leverage + "× · entry " + r.entry;
    }
    if (r.borrowed) { return "borrowed " + fmtQty(r.borrowed) + " · interest " + fmtQty(r.interest); }
    if (r.ltv !== undefined) { return "flexible loan · LTV " + r.ltv.toFixed(2); }
    if (r.collateral) { return "loan collateral"; }
    if (r.locked) { return "locked " + fmtQty(r.locked); }
    return null;
  }

  function acctSorted() {
    var rows = acctRows();
    rows.sort(function (a, b) {
      var va = acctValue(a, acctSort.key);
      var vb = acctValue(b, acctSort.key);
      if (va === null && vb === null) { return a.asset < b.asset ? -1 : 1; }
      if (va === null) { return 1; }
      if (vb === null) { return -1; }
      if (va < vb) { return -acctSort.dir; }
      if (va > vb) { return acctSort.dir; }
      return a.asset < b.asset ? -1 : 1;
    });
    return rows;
  }

  function acctChip(name, boxEl) {
    var b = boxEl.querySelector(".news-box-head b");
    b.insertBefore(icon(name), b.firstChild);
    return boxEl;
  }

  function acctRail() {
    var side = el("div", "news-side");
    var series = acctData.series || [];
    if (series.length > 1) {
      var hist = acctChip("change", box("Balance · 24h", fmtMoney(acctData.total)));
      var chart = svg("svg", { viewBox: "0 0 356 108", "class": "news-chart",
        role: "img", "aria-label": "Total value over 24 hours" });
      var lo = Infinity;
      var hi = -Infinity;
      series.forEach(function (s) {
        if (s[1] < lo) { lo = s[1]; }
        if (s[1] > hi) { hi = s[1]; }
      });
      var pad = Math.max((hi - lo) * 0.1, 0.5);
      lo -= pad;
      hi += pad;
      var t0 = series[0][0];
      var span = Math.max(series[series.length - 1][0] - t0, 1);
      var pts = series.map(function (s) {
        return ((s[0] - t0) / span * 356).toFixed(1) + ","
          + (88 - (s[1] - lo) / (hi - lo) * 74).toFixed(1);
      });
      chart.appendChild(svg("text", { x: 0, y: 8 })).textContent = fmtMoney(hi - pad);
      chart.appendChild(svg("polyline", { points: pts.join(" "), fill: "none",
        stroke: "var(--focus)", "stroke-width": 2, "stroke-linejoin": "round",
        "stroke-linecap": "round" }));
      chart.appendChild(svg("polygon", { points: "0,88 " + pts.join(" ") + " 356,88",
        fill: "var(--focus)", "fill-opacity": 0.08, stroke: "none" }));
      chart.appendChild(svg("line", { x1: 0, y1: 88.5, x2: 356, y2: 88.5, "class": "news-chart-base" }));
      var hit = svg("rect", { x: 0, y: 0, width: 356, height: 108, fill: "transparent" });
      hit.setAttribute("data-tip", "Low " + fmtMoney(lo + pad) + " · high " + fmtMoney(hi - pad)
        + " · " + series.length + " samples");
      chart.appendChild(hit);
      hist.appendChild(chart);
      side.appendChild(hist);
    }
    var balance = acctChip("breadth", box("Balance · by wallet", fmtMoney(acctData.total) + " total"));
    balance.appendChild(acctDonut(ACCT_WALLETS.map(function (w) {
      return [w[1], acctData.wallets[w[0]] || 0];
    }), ACCT_COLOR, "Balance by wallet"));
    var today = el("div", "news-hbar");
    today.appendChild(el("span", "news-hbar-label", "Today"));
    if (acctData.day.seeded) {
      today.appendChild(el("span", "news-hbar-value", "—"));
      today.setAttribute("data-tip", "First full day starts at 00:00 UTC");
    } else {
      var dayDiff = acctData.total - acctData.day.total;
      var dayCell = el("span", "news-hbar-value", (dayDiff >= 0 ? "+" : "") + fmtMoney(dayDiff));
      dayCell.className += dayDiff > 0 ? " up" : dayDiff < 0 ? " down" : "";
      today.appendChild(dayCell);
      today.setAttribute("data-tip", "Since 00:00 UTC · anchor " + fmtMoney(acctData.day.total));
    }
    balance.appendChild(today);
    if (lawRules()) {
      var m = lawRules().machine;
      var seesRow = el("div", "news-hbar");
      seesRow.appendChild(el("span", "news-hbar-label", "Machine sees"));
      seesRow.appendChild(el("span", "news-hbar-value",
        fmtMoney(Math.max(0, m.lifetime_usdt - m.used_usdt))));
      seesRow.setAttribute("data-tip", "Lifetime allowance " + fmtMoneyExact(m.lifetime_usdt)
        + " minus used " + fmtMoneyExact(m.used_usdt));
      balance.appendChild(seesRow);
    }
    side.appendChild(balance);

    var byAsset = {};
    acctData.rows.forEach(function (r) {
      if (r.value > 0) { byAsset[r.asset] = (byAsset[r.asset] || 0) + r.value; }
    });
    var assetPairs = Object.keys(byAsset).map(function (k) { return [k, byAsset[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var top = assetPairs.slice(0, 4);
    var rest = assetPairs.slice(4).reduce(function (n, p) { return n + p[1]; }, 0);
    if (rest > 0) { top.push(["Other", rest]); }
    var assetColors = {};
    var palette = ["#3b82f6", "#2ebd85", "#8b5cf6", "#d9a52b", "#22b8cf"];
    top.forEach(function (p, i) { assetColors[p[0]] = palette[i % palette.length]; });
    var alloc = acctChip("spot", box("Allocation · by asset", assetPairs.length + " assets"));
    alloc.appendChild(acctDonut(top, assetColors, "Allocation by asset"));
    side.appendChild(alloc);

    var expo = acctChip("fut", box("Exposure"));
    var used = acctData.futures.margin_balance > 0
      ? acctData.futures.maintenance / acctData.futures.margin_balance : 0;
    var em = el("div", "news-hbar");
    em.appendChild(el("span", "news-hbar-label", "Futures margin"));
    em.appendChild(acctMeter(used, "var(--focus)"));
    em.setAttribute("data-tip", "Maintenance " + fmtMoney(acctData.futures.maintenance)
      + " of " + fmtMoney(acctData.futures.margin_balance) + " margin balance");
    expo.appendChild(em);
    acctStat(expo, "Open positions", String(acctData.positions.length));
    acctStat(expo, "Borrowed", fmtMoney(acctData.margin.borrowed));
    if (acctData.margin.borrowed > 0) {
      acctStat(expo, "Margin level", acctData.margin.level >= 999 ? "∞"
        : acctData.margin.level.toFixed(2));
    }
    var upnl = acctData.futures.pnl;
    var upnlRow = acctStat(expo, "Unrealized PnL", (upnl >= 0 ? "+" : "") + fmtMoney(upnl));
    upnlRow.lastChild.className += upnl > 0 ? " up" : upnl < 0 ? " down" : "";
    side.appendChild(expo);
    return side;
  }

  function acctOrders() {

    var orders = acctData ? acctData.orders || [] : [];
    var past = acctData ? acctData.history || [] : [];
    var section = el("div", "acct-section");
    var obar = section.appendChild(el("div", "news-pills"));
    var mixed = [];
    orders.forEach(function (o) {
      mixed.push({ ts: o.ts, venue: o.venue, kind: "order",
        type: (ACCT_LABEL[o.venue] || o.venue) + " " + o.side,
        symbol: o.symbol, otype: o.type.toLowerCase(), price: o.price,
        qty: o.qty, filled: o.filled,
        detail: o.symbol + " " + o.type.toLowerCase()
          + (parseFloat(o.price) > 0 ? " @ " + o.price : "")
          + (parseFloat(o.filled) > 0 ? " · filled " + o.filled : ""),
        amount: parseFloat(o.filled) > 0 ? o.filled : o.qty, status: o.status });
    });
    past.forEach(function (r) {
      if (r.kind === "order") {
        mixed.push({ ts: r.ts, venue: r.venue, kind: "order",
          type: (ACCT_LABEL[r.venue] || r.venue) + " " + r.side,
          symbol: r.symbol, otype: r.otype.toLowerCase(),
          price: parseFloat(r.price) > 0 ? parseFloat(r.price).toPrecision(6) : "",
          qty: r.qty, filled: r.filled,
          detail: r.symbol + " " + r.otype.toLowerCase()
            + (parseFloat(r.price) > 0 ? " @ " + parseFloat(r.price).toPrecision(6) : "")
            + (parseFloat(r.filled) > 0 ? " · filled " + r.filled : ""),
          amount: parseFloat(r.filled) > 0 ? r.filled : r.qty, status: r.status });
        return;
      }
      mixed.push({ ts: r.ts, venue: null, kind: r.kind,
        type: r.kind.charAt(0).toUpperCase() + r.kind.slice(1),
        detail: r.detail || "—",
        amount: fmtQty(r.amount) + " " + r.asset, status: r.status });
    });
    mixed.sort(function (a, b) { return b.ts - a.ts; });
    var shownOrd = mixed.filter(function (m) {
      if (acctOrdTab === "all") { return true; }
      if (acctOrdTab === "convert") { return m.kind === "convert"; }
      return m.kind === "order" && m.venue === acctOrdTab;
    });
    ORD_TABS.forEach(function (tab) {
      var n = tab[0] === "all" ? mixed.length
        : tab[0] === "convert" ? mixed.filter(function (m) { return m.kind === "convert"; }).length
          : mixed.filter(function (m) { return m.kind === "order" && m.venue === tab[0]; }).length;
      var b = el("button", "news-pill" + (acctOrdTab === tab[0] ? " on" : ""));
      b.appendChild(icon(ACCT_ICON[tab[0]] || "all"));
      b.appendChild(document.createTextNode(tab[1]));
      b.addEventListener("click", function () {
        acctOrdTab = tab[0];
        acctOrdPage = 1;
        acctOrdSeen = null;
        drawTrans();
      });
      obar.appendChild(b);
    });
    var olist = el("div", "news-list");
    var ohead = el("div", "ord-row news-head-row");
    ["Time", "Detail", "Amount", "Status", "Receipt"].forEach(function (c) {
      ohead.appendChild(el("span", "", c));
    });
    olist.appendChild(ohead);
    var known = acctOrdSeen !== null;
    if (!known) { acctOrdSeen = {}; }
    var freshKeys = {};
    shownOrd.forEach(function (m) {
      var key = m.ts + "|" + m.detail + "|" + m.amount;
      if (known && !acctOrdSeen[key]) { freshKeys[key] = true; }
      acctOrdSeen[key] = true;
    });
    var fresh = Object.keys(freshKeys).length > 0;
    if (fresh) { acctOrdPage = 1; }
    var opages = Math.max(1, Math.ceil(shownOrd.length / 20));
    acctOrdPage = Math.min(acctOrdPage, opages);
    var ostart = (acctOrdPage - 1) * 20;
    shownOrd.slice(ostart, ostart + 20).forEach(function (m) {
      var row = el("div", "ord-row"
        + (freshKeys[m.ts + "|" + m.detail + "|" + m.amount] ? " ord-new" : ""));
      var when = new Date(m.ts * 1000);
      row.appendChild(el("span", "news-time", dateFmt.format(when) + " " + timeFmt.format(when)));
      var detail = el("span", "logs-msg", m.detail);
      detail.title = m.detail;
      row.appendChild(detail);
      row.appendChild(el("span", "mkt-num", m.amount));
      var ok = m.status === "FILLED" || m.status === "Completed" || m.status === "Success";
      var bad = m.status === "CANCELED" || m.status === "EXPIRED";
      row.appendChild(el("span", "mkt-num" + (ok ? " up" : bad ? " down" : ""), ordStatus(m.status)));
      var open = row.appendChild(el("span", "news-open"));
      var slip = svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" });
      slip.appendChild(svg("path", {
        d: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" }));
      slip.appendChild(svg("path", { d: "M14 8H8" }));
      slip.appendChild(svg("path", { d: "M16 12H8" }));
      slip.appendChild(svg("path", { d: "M13 16H8" }));
      open.appendChild(slip);
      row.addEventListener("click", function () { openReceipt(m); });
      olist.appendChild(row);
    });
    section.appendChild(olist);
    if (!shownOrd.length) {
      section.appendChild(el("div", "news-empty", "Nothing here yet."));
    } else {
      section.appendChild(pager(shownOrd.length, acctOrdPage, function (pg) {
        acctOrdPage = pg;
        drawTrans();
      }, 20));
    }
    return section;
  }

  function drawTrans() {
    if (!acctEl || !acctSection) { return; }
    var next = acctOrders();
    acctSection.replaceWith(next);
    acctSection = next;
  }

  var transPop = null;

  function closeReceipt() {
    if (!transPop) { return; }
    document.removeEventListener("keydown", transPop.onKey);
    transPop.dim.remove();
    transPop.card.remove();
    transPop = null;
  }

  function openReceipt(m) {
    closeReceipt();
    var dim = el("div", "qsearch-dim");
    var card = el("div", "logs-pop");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Transaction receipt");
    var head = el("div", "logs-pop-head");
    var col = head.appendChild(el("span", "news-source-col"));
    col.appendChild(el("span", "news-source-name", m.type));
    if (m.symbol) { col.appendChild(el("span", "news-domain", m.symbol)); }
    var ok = m.status === "FILLED" || m.status === "Completed" || m.status === "Success"
      || m.status === "Confirmed";
    var bad = m.status === "CANCELED" || m.status === "EXPIRED";
    head.appendChild(el("span", "logs-pop-time"))
      .appendChild(el("span", "mkt-num" + (ok ? " up" : bad ? " down" : ""), ordStatus(m.status)));
    card.appendChild(head);
    var when = new Date(m.ts * 1000);
    [["Time", dateFmt.format(when) + " " + hoverTimeFmt.format(when)],
     ["Order", m.otype], ["Price", m.price], ["Quantity", m.qty], ["Filled", m.filled],
     ["Detail", m.detail]].forEach(function (p) {
      if (p[1]) { acctStat(card, p[0], String(p[1])); }
    });
    dim.addEventListener("mousedown", closeReceipt);
    var onKey = function (ev) { if (ev.key === "Escape") { closeReceipt(); } };
    document.addEventListener("keydown", onKey);
    transPop = { dim: dim, card: card, onKey: onKey };
    document.body.appendChild(dim);
    document.body.appendChild(card);
  }

  /* ---- controls: the money law — one file on the server, edited here,
     every row badged with the layer that really enforces it ---- */
  var rulesData = null;
  var rulesOk = true;
  var rulesBusy = false;
  var rulesError = "";
  var lawSection = null;
  var lawPopEl = null;
  var acctSection = null;
  function lawClone(value) { return JSON.parse(JSON.stringify(value)); }

  function lawRules() { return rulesData && rulesData.rules; }

  var rulesFetching = false;
  var rulesStale = false;
  var rulesGen = 0;

  function fetchRules() {
    rulesFetching = true;
    var gen = ++rulesGen;
    fetch("/api/rules", { headers: { "X-Requested-With": "XMLHttpRequest" } }).then(function (r) {
      if (r.status === 401) { location.reload(); }
      if (!r.ok) { throw new Error(r.status); }
      return r.json();
    }).then(function (d) {
      if (gen !== rulesGen) { return; }
      rulesFetching = false;
      var oldVersion = lawRules() ? lawRules().version : null;
      rulesOk = true;
      rulesData = d;
      if (rulesStale) {
        rulesError = "The law changed elsewhere — your last change was not saved.";
      }
      var conflictFresh = rulesStale && d.rules.version !== oldVersion;
      if (!lawQueue.length && !rulesBusy) { drawLaw(conflictFresh); }
      lawQueueFlush();
    }).catch(function () {
      if (gen !== rulesGen) { return; }
      rulesFetching = false;
      rulesOk = false;
      if (!rulesBusy) {
        var dropped = lawQueue;
        lawQueue = [];
        dropped.forEach(function (q) {
          delete lawPending[q[0].join(".")];
          if (q[2]) { q[2]("The law could not be loaded — not saved."); }
        });
      }
      if (!rulesBusy && !lawQueue.length) { drawLaw(true); }
    });
  }

  function postRules(doc, done, pop, wrote, fromQueue) {
    if (rulesBusy) { if (done) { done("Still writing — try again."); } return; }
    if (pop && pop.version !== null) { doc.version = pop.version; }
    rulesBusy = true;
    fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc) })
      .then(function (r) {
        if (r.status === 401) { location.reload(); }
        return r.json().then(function (body) { return { status: r.status, body: body }; });
      })
      .then(function (got) {
        rulesBusy = false;
        if (got.status === 200) {
          lawPendRelease(wrote);
          rulesGen++;
          rulesFetching = false;
          rulesOk = true;
          rulesData = got.body;
          if (!fromQueue) {
            rulesError = "";
            rulesStale = false;
          }
          lawQueue.forEach(function (q) {
            if (q[3] === doc.version) { q[3] = got.body.rules.version; }
          });
          if (lawShownVersion === doc.version) {
            lawShownVersion = got.body.rules.version;
          }
          if (done) { done(null); }
          if (!lawQueue.length) { drawLaw(true); }
          lawQueueFlush();
        } else if (got.status === 409) {
          if (pop === lawPopEl) { closeLawPop(); }
          rulesStale = true;
          var kept = [];
          lawQueue.forEach(function (q) {
            if (q[3] === doc.version) {
              delete lawPending[q[0].join(".")];
              if (q[2]) { q[2]("The law changed elsewhere — nothing saved."); }
            } else { kept.push(q); }
          });
          lawQueue = kept;
          lawPendRelease(wrote);
          fetchRules();
          if (done) { done("The law changed elsewhere — nothing saved."); }
          drawLaw(true);
        } else {
          lawPendRelease(wrote);
          if (done) { done(got.body && got.body.error ? got.body.error : "Rejected."); }
          drawLaw(true);
          lawQueueFlush();
        }
      })
      .catch(function () {
        rulesBusy = false;
        lawPendRelease(wrote);
        if (done) { done("Could not reach the law file."); }
        drawLaw(true);
        lawQueueFlush();
      });
  }

  var lawQueue = [];

  function lawWrite(path, value, done, pop, fromQueue, pinV) {
    if (!pop && !fromQueue && (rulesBusy || rulesFetching || !rulesData)) {
      lawQueue = lawQueue.filter(function (q) { return q[0].join(".") !== path.join("."); });
      lawQueue.push([path, value, done, lawShownVersion]);
      return;
    }
    if (!rulesData) { if (done) { done("The law is not loaded."); } return; }
    var doc = lawClone(rulesData.rules);
    var d = doc;
    for (var i = 0; i < path.length - 1; i++) { d = d[path[i]]; }
    d[path[path.length - 1]] = value;
    var pin = fromQueue ? pinV : lawShownVersion;
    if (!pop && pin !== null && pin !== undefined) { doc.version = pin; }
    postRules(doc, done, pop, path.join("."), fromQueue);
  }

  function lawPendRelease(wrote) {
    if (!wrote) { return; }
    var newer = lawQueue.some(function (q) { return q[0].join(".") === wrote; });
    if (!newer) { delete lawPending[wrote]; }
  }

  function lawQueueFlush() {
    if (!lawQueue.length || rulesBusy || rulesFetching || !rulesData) {
      if (!lawQueue.length) { acctRedrawFlush(); }
      return;
    }
    var next = lawQueue.shift();
    lawWrite(next[0], next[1], next[2], null, true, next[3]);
  }


  function lawBadge(layer) { return el("span", "law-badge " + layer, layer.toUpperCase()); }

  var lawRowN = 0;

  function lawRow(list, title, ic, cls) {
    var r = el("div", "set-row law-grid" + (cls ? " " + cls : ""));
    lawRowN += 1;
    r.appendChild(el("span", "mkt-rank", String(lawRowN)));
    var col = el("div", "set-col law-name");
    if (ic) { col.appendChild(icon(ic)); }
    col.appendChild(el("div", "set-title law-title", title));
    r.appendChild(col);
    var right = el("div", "law-cell");
    r.appendChild(right);
    var act = el("div", "law-act");
    r.appendChild(act);
    list.appendChild(r);
    return { row: r, right: right, act: act };
  }

  function lawGet(path) {
    var d = lawRules();
    for (var i = 0; d && i < path.length; i++) { d = d[path[i]]; }
    return d;
  }

  function lawShow(v, opts) {
    if (v === null || v === undefined) { return "none"; }
    var out = opts && opts.money ? fmtMoneyExact(v) : String(v);
    if (opts && opts.after) { out += " " + opts.after; }
    return out;
  }

  function closeLawPop() {
    if (!lawPopEl) { return; }
    document.removeEventListener("keydown", lawPopEl.onKey);
    lawPopEl.dim.remove();
    lawPopEl.card.remove();
    lawPopEl = null;
    acctRedrawFlush();
  }

  function openLawPop(title, layers, subText, body, onSave) {
    closeLawPop();
    var dim = el("div", "qsearch-dim");
    var card = el("div", "law-pop");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    var t = el("div", "law-pop-title", title);
    layers.forEach(function (layer) { t.appendChild(lawBadge(layer)); });
    card.appendChild(t);
    card.appendChild(el("div", "law-pop-sub", subText));
    card.appendChild(body);
    var err = el("div", "law-error");
    err.style.marginTop = "10px";
    card.appendChild(err);
    var foot = el("div", "law-pop-foot");
    foot.appendChild(button("Cancel", "set-action", closeLawPop));
    var save = button("Save", "set-action law-apply-go", function () {
      save.textContent = "Writing…";
      onSave(function (fail) {
        if (fail) {
          if (lawPopEl === mine) { save.textContent = "Save"; err.textContent = fail; }
          else { rulesError = fail; drawLaw(true); }
        } else if (lawPopEl === mine) { closeLawPop(); }
      }, mine);
    });
    foot.appendChild(save);
    card.appendChild(foot);
    dim.addEventListener("mousedown", closeLawPop);
    var onKey = function (ev) { if (ev.key === "Escape") { closeLawPop(); } };
    document.addEventListener("keydown", onKey);
    var mine = { dim: dim, card: card, onKey: onKey, err: err,
      version: lawRules() ? lawRules().version : null };
    lawPopEl = mine;
    document.body.appendChild(dim);
    document.body.appendChild(card);
    var first = card.querySelector("input, button:enabled");
    if (first) { first.focus(); }
    return mine;
  }

  function lawNumberInput(value, opts) {
    var line = el("div", "law-pop-input");
    if (opts.money) { line.appendChild(el("span", "law-unit", "$")); }
    var input = el("input", "law-field");
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = opts.nullable ? "none" : "0";
    input.value = value === null || value === undefined ? "" : String(value);
    line.appendChild(input);
    if (opts.after) { line.appendChild(el("span", "law-unit", opts.after)); }
    return { line: line, input: input };
  }

  function lawParse(input, opts) {
    var raw = input.value.trim();
    if (raw === "" || raw === "none") {
      return opts.nullable ? { value: null } : { fail: "Enter a number." };
    }
    if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
      return { fail: opts.int ? "A whole number." : "A number, up to 3 decimals." };
    }
    var n = Number(raw);
    if (opts.int && !Number.isInteger(n)) { return { fail: "A whole number." }; }
    return { value: n };
  }

  function lawNumberPop(title, layers, subText, path, opts) {
    var cur = lawGet(path);
    var body = el("div");
    var now = el("div", "law-pop-now");
    now.appendChild(el("span", "", "Current"));
    now.appendChild(el("b", "", lawShow(cur, opts)));
    body.appendChild(now);
    var made = lawNumberInput(cur, opts);
    body.appendChild(made.line);
    openLawPop(title, layers, subText, body, function (done, pop) {
      var parsed = lawParse(made.input, opts);
      if (parsed.fail) { done(parsed.fail); return; }
      if (parsed.value === cur) { done(); return; }
      lawWrite(path, parsed.value, done, pop);
    });
    made.input.focus();
    made.input.select();
  }

  function lawEditButton(open) {
    var edit = el("button", "set-action law-edit");
    edit.setAttribute("aria-label", "Edit");
    edit.setAttribute("data-tip", "Edit");
    var pen = svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" });
    pen.appendChild(svg("path", {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }));
    pen.appendChild(svg("path", { d: "m15 5 4 4" }));
    edit.appendChild(pen);
    edit.addEventListener("click", open);
    return edit;
  }

  function lawEditRow(list, title, layers, subText, path, opts, ic, cls) {
    var r = lawRow(list, title, ic, cls);
    r.right.appendChild(el("span", "law-value", lawShow(lawGet(path), opts)));
    r.act.appendChild(lawEditButton(function () {
      lawNumberPop(title, layers, subText, path, opts);
    }));
    return r;
  }

  function fmtMoneyExact(v) {
    return v === null || v === undefined ? "none"
      : "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
  }

  function lawLifePop() {
    var m = lawRules().machine;
    var pendLife = lawPending["machine.lifetime_usdt"];
    var lifeVal = pendLife !== undefined ? pendLife : m.lifetime_usdt;
    var body = el("div");
    var now = el("div", "law-pop-now");
    now.appendChild(el("span", "", "Used so far"));
    now.appendChild(el("b", "", fmtMoneyExact(m.used_usdt)));
    body.appendChild(now);
    var made = lawNumberInput(lifeVal, { money: true });
    body.appendChild(made.line);
    var mine = openLawPop("Lifetime allowance", ["engine"],
      "Everything the bot may use in its whole life. Only your reset starts it fresh.",
      body, function (done, pop) {
        var p = lawParse(made.input, { money: true });
        if (p.fail) { done(p.fail); return; }
        lawWrite(["machine", "lifetime_usdt"], p.value, done, pop);
      });
    var reset = button("Reset used to $0", "set-action", function () {
      lawWrite(["machine", "used_usdt"], 0, function (fail) {
        if (fail) {
          if (lawPopEl === mine) { mine.err.textContent = fail; }
          else { rulesError = fail; drawLaw(true); }
        } else if (lawPopEl === mine) { closeLawPop(); }
      }, mine);
    });
    reset.style.margin = "10px 0 2px";
    body.appendChild(reset);
    made.input.focus();
    made.input.select();
  }

  function lawWalletPop(name) {
    var body = el("div");
    var head1 = el("div", "law-pop-now");
    head1.appendChild(el("span", "", "Use — the most the bot may put to work from here"));
    body.appendChild(head1);
    var u = lawNumberInput(lawGet(["wallets", name, "use_usdt"]), { money: true });
    body.appendChild(u.line);
    var head2 = el("div", "law-pop-now");
    head2.appendChild(el("span", "", "Move — the most it may transfer out of here"));
    body.appendChild(head2);
    var m = lawNumberInput(lawGet(["wallets", name, "move_usdt"]), { money: true });
    body.appendChild(m.line);
    openLawPop(name[0].toUpperCase() + name.slice(1) + " transfers", ["engine"],
      "The switch on the row shuts this section off completely.",
      body, function (done, pop) {
        var pu = lawParse(u.input, { money: true });
        if (pu.fail) { done("Use: " + pu.fail); return; }
        var pm = lawParse(m.input, { money: true });
        if (pm.fail) { done("Move: " + pm.fail); return; }
        var doc = lawClone(rulesData.rules);
        doc.wallets[name].use_usdt = pu.value;
        doc.wallets[name].move_usdt = pm.value;
        postRules(doc, done, pop, "wallets." + name);
      });
    u.input.focus();
    u.input.select();
  }

  var lawBoardCache = null;

  function lawAssetsPop() {
    var picked = (lawGet(["excluded_assets"]) || []).slice();
    var body = el("div");
    var find = el("input", "law-field law-asset-find");
    find.type = "text";
    find.placeholder = "find a token";
    body.appendChild(find);
    var countLine = el("div", "law-pop-now");
    var countText = countLine.appendChild(el("span", "", ""));
    body.appendChild(countLine);
    var box = el("div", "law-asset-list");
    body.appendChild(box);
    function paint() {
      countText.textContent = picked.length + " excluded";
      var want = find.value.trim().toUpperCase();
      box.textContent = "";
      if (!lawBoardCache) {
        box.appendChild(el("div", "news-empty", "Loading the token universe…"));
        return;
      }
      var rows = lawBoardCache.filter(function (r) {
        return !want || r.sym.indexOf(want) !== -1;
      });
      rows.forEach(function (r) {
        var on = picked.indexOf(r.sym) !== -1;
        var item = el("button", "law-asset" + (on ? " on" : ""));
        item.appendChild(tokenBadge(r.sym));
        item.appendChild(el("span", "law-asset-sym", r.sym));
        item.appendChild(el("span", "law-asset-mark", on ? "excluded" : ""));
        item.addEventListener("click", function () {
          var at = picked.indexOf(r.sym);
          if (at === -1) { picked.push(r.sym); } else { picked.splice(at, 1); }
          item.classList.toggle("on", at === -1);
          item.lastChild.textContent = at === -1 ? "excluded" : "";
          countText.textContent = picked.length + " excluded";
        });
        box.appendChild(item);
      });
      if (!rows.length) { box.appendChild(el("div", "news-empty", "No token matches.")); }
    }
    find.addEventListener("input", paint);
    paint();
    if (!lawBoardCache) {
      fetch("/board.json", { headers: { "X-Requested-With": "XMLHttpRequest" } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          lawBoardCache = d.rows.map(function (r) {
            return { sym: r.sym.replace(/USDT$/, ""), vol: (r.svol || 0) + (r.fvol || 0) };
          }).filter(function (r) { return r.sym; })
            .sort(function (a, b) { return b.vol - a.vol; });
          paint();
        })
        .catch(function () { lawBoardCache = null; });
    }
    openLawPop("EXCLUDED ASSETS", ["engine"],
      "Scam tokens the bot must never see or touch, anywhere. Click a token to exclude it; "
      + "click again to allow it.",
      body, function (done, pop) {
        lawWrite(["excluded_assets"], picked.slice().sort(), done, pop);
      });
    find.focus();
  }

  function lawControls(list) {
    var m = lawRules().machine;

    var pendLife = lawPending["machine.lifetime_usdt"];
    var lifeNow = pendLife !== undefined ? pendLife : m.lifetime_usdt;
    var lt = lawRow(list, "LIFETIME ALLOWANCE", "all");
    var ltVal = lt.right.appendChild(el("span", "law-value",
      fmtMoneyExact(m.used_usdt) + " used of " + fmtMoneyExact(lifeNow)));
    var slide = el("input", "law-slider");
    slide.type = "range";
    slide.min = String(lifeNow % 25);
    slide.max = String(Math.max(1000, Math.ceil(lifeNow * 2 / 25) * 25));
    slide.step = "25";
    slide.value = String(lifeNow);
    slide.setAttribute("aria-label", "Lifetime allowance");
    var slideMoved = false;
    slide.addEventListener("pointerdown", function () { lawSliding = true; });
    var slideEnd = function (canceled) {
      lawSliding = false;
      setTimeout(function () {
        if (lawSliding) { return; }
        if (canceled && slideMoved) {
          slideMoved = false;
          lawRepaintPending = false;
          drawLaw(true);
          return;
        }
        if (lawRepaintPending) { lawRepaintPending = false; drawLaw(true); }
      }, 0);
    };
    slide.addEventListener("pointerup", function () { slideEnd(false); });
    slide.addEventListener("pointercancel", function () { slideEnd(true); });
    slide.addEventListener("lostpointercapture", function () { slideEnd(true); });
    slide.addEventListener("input", function () {
      slideMoved = true;
      ltVal.textContent = fmtMoneyExact(m.used_usdt) + " used of " + fmtMoneyExact(+slide.value);
    });
    slide.addEventListener("change", function () {
      lawSliding = false;
      slideMoved = false;
      lawPending["machine.lifetime_usdt"] = +slide.value;
      lawWrite(["machine", "lifetime_usdt"], +slide.value, function (fail) {
        if (fail) { rulesError = fail; }
      });
      setTimeout(function () {
        if (lawRepaintPending && !lawSliding) { lawRepaintPending = false; drawLaw(true); }
      }, 0);
    });
    lt.right.appendChild(slide);
    lt.act.appendChild(lawEditButton(lawLifePop));

    var ex = lawRow(list, "EXCLUDED ASSETS", "x");
    ex.right.appendChild(el("span", "law-value", lawRules().excluded_assets.length + " assets"));
    ex.act.appendChild(lawEditButton(lawAssetsPop));

    lawEditRow(list, "Futures max", ["engine"],
      "The most the bot may ever hold in futures — the riskiest wallet.",
      ["futures", "max_usdt"], { money: true }, "fut");

    lawEditRow(list, "Futures max loss", ["engine"],
      "Futures loss reaches this → funds access trips off.",
      ["futures", "max_loss_usdt"], { money: true }, "fut");

    lawEditRow(list, "Max leverage", ["engine"],
      "Leverage above this anywhere → funds access trips off.",
      ["futures", "max_leverage"], { int: true, after: "x" }, "fut");

    lawEditRow(list, "Max fees", ["engine"],
      "Fees burned reach this → the bot stops.",
      ["machine", "max_fees_usdt"], { money: true }, "scales");

    ["spot", "margin", "futures", "funding"].forEach(function (name) {
      var w = lawRules().wallets[name];
      var pend = lawPending["wallets." + name + ".on"];
      var now = pend !== undefined ? pend : w.on;
      var r = lawRow(list, name[0].toUpperCase() + name.slice(1) + " transfers",
        { spot: "spot", margin: "scales", futures: "fut", funding: "spread" }[name]);
      if (!now) { r.row.className += " law-off"; }
      var wVal = r.right.appendChild(el("span", "law-value", now
        ? "use " + fmtMoneyExact(w.use_usdt) + " · move " + fmtMoneyExact(w.move_usdt)
        : "OFF"));
      var sw = el("button", "set-switch" + (now ? " on" : ""));
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-checked", now ? "true" : "false");
      sw.setAttribute("aria-label", name + " transfers");
      sw.addEventListener("click", function () {
        now = !now;
        lawPending["wallets." + name + ".on"] = now;
        sw.classList.toggle("on", now);
        sw.setAttribute("aria-checked", now ? "true" : "false");
        wVal.textContent = now
          ? "use " + fmtMoneyExact(w.use_usdt) + " · move " + fmtMoneyExact(w.move_usdt)
          : "OFF";
        r.row.classList.toggle("law-off", !now);
        lawWrite(["wallets", name, "on"], now, function (fail) {
          if (fail) { rulesError = fail; }
        });
      });
      r.act.appendChild(sw);
      r.act.appendChild(lawEditButton(function () { lawWalletPop(name); }));
    });

    var loan = lawRules().wallets.loan;
    var lpend = lawPending["wallets.loan.on"];
    var lnow = lpend !== undefined ? lpend : loan.on;
    var lr = lawRow(list, "Loan transfers", "chain");
    if (!lnow) { lr.row.className += " law-off"; }
    var lVal = lr.right.appendChild(el("span", "law-value",
      lnow ? "borrow " + fmtMoneyExact(loan.borrow_usdt) : "OFF"));
    var lsw = el("button", "set-switch" + (lnow ? " on" : ""));
    lsw.setAttribute("role", "switch");
    lsw.setAttribute("aria-checked", lnow ? "true" : "false");
    lsw.setAttribute("aria-label", "Loan transfers");
    lsw.addEventListener("click", function () {
      lnow = !lnow;
      lawPending["wallets.loan.on"] = lnow;
      lsw.classList.toggle("on", lnow);
      lsw.setAttribute("aria-checked", lnow ? "true" : "false");
      lVal.textContent = lnow ? "borrow " + fmtMoneyExact(loan.borrow_usdt) : "OFF";
      lr.row.classList.toggle("law-off", !lnow);
      lawWrite(["wallets", "loan", "on"], lnow, function (fail) {
        if (fail) { rulesError = fail; }
      });
    });
    lr.act.appendChild(lsw);
    lr.act.appendChild(lawEditButton(function () {
      lawNumberPop("Loan transfers", ["engine"],
        "How much loan the bot may take against collateral, in total.",
        ["wallets", "loan", "borrow_usdt"], { money: true });
    }));
  }

  function acctControls() {
    var section = el("div", "acct-section law-box");
    if (!lawRules()) {
      section.appendChild(el("div", "news-empty",
        rulesOk ? "Loading the law…" : "The law file is unreachable."));
      return section;
    }
    lawShownVersion = lawRules().version;
    var pendMode = lawPending["machine.mode"];
    var mode = pendMode !== undefined ? pendMode : lawGet(["machine", "mode"]);
    section.className += " law-mode-" + mode;
    var lhead = el("div", "set-row law-grid news-head-row law-head");
    lhead.appendChild(el("span", "mkt-rank", "#"));
    lhead.appendChild(el("span", "", "Control"));
    lhead.appendChild(el("span", "", "Value"));
    lhead.appendChild(el("span", "", "Edit"));
    section.appendChild(lhead);
    if (rulesError) {
      section.appendChild(el("div", "law-error", rulesError));
    }
    if (!rulesOk) {
      section.appendChild(el("div", "law-error",
        "The law file is unreachable — showing the last loaded law."));
    }
    var rows = el("div", "law-rows");
    lawRowN = 0;
    lawControls(rows);
    section.appendChild(rows);
    return section;
  }

  var LAW_MODES = [["blocked", "Blocked"], ["limited", "Limited"], ["full", "Full"]];
  var lawModeSeg = null;

  function lawModeSet(mode) {
    var pendM = lawPending["machine.mode"];
    var showing = pendM !== undefined ? pendM : (lawRules() && lawGet(["machine", "mode"]));
    if (mode === showing) { return; }
    lawPending["machine.mode"] = mode;
    if (lawSection) {
      lawSection.className = lawSection.className
        .replace(/ law-mode-\w+/g, "") + " law-mode-" + mode;
    }
    if (lawModeSeg) {
      lawModeSeg.forEach(function (m) { m[1].classList.toggle("on", m[0] === mode); });
    }
    lawWrite(["machine", "mode"], mode, function (fail) {
      if (fail) { rulesError = fail; }
    });
  }

  var lawPaintKey = "";
  var lawShownVersion = null;
  var lawPending = {};
  var lawSliding = false;
  var lawRepaintPending = false;

  function drawLaw(force) {
    if (!acctEl || !lawSection) { return; }
    if (lawSliding) {
      if (force) { lawRepaintPending = true; }
      return;
    }
    var key = (lawRules() ? lawRules().version : "-") + "|" + rulesError + "|"
      + JSON.stringify(lawPending) + "|" + rulesOk;
    var busy = !force && !!(lawPopEl || lawSection.contains(document.activeElement)
      || lawQueue.length || rulesBusy);
    if (!busy && (force || key !== lawPaintKey)) {
      lawPaintKey = key;
      var next = acctControls();
      lawSection.replaceWith(next);
      lawSection = next;
      if (acctSide && acctData) {
        var side = acctRail();
        acctSide.replaceWith(side);
        acctSide = side;
      }
    }
    if (lawModeSeg) {
      var pm = lawPending["machine.mode"];
      var now = pm !== undefined ? pm : lawGet(["machine", "mode"]);
      lawModeSeg.forEach(function (m) { m[1].classList.toggle("on", m[0] === now); });
    }
  }

  var acctRedrawPending = false;

  function lawEngaged() {
    return !!(lawPopEl || lawQueue.length || rulesBusy
      || (lawSection && document.activeElement
        && lawSection.contains(document.activeElement)));
  }

  function acctRedrawFlush() {
    if (acctRedrawPending && acctEl && acctData && !lawEngaged()) {
      acctRedrawPending = false;
      drawAcct();
    }
  }

  function paintAcct() {
    if (!acctEl) { return; }
    var busyInLaw = lawEngaged();
    if (!acctPaint) {
      if (busyInLaw) { acctRedrawPending = true; } else { drawAcct(); }
      return;
    }
    var rows = acctSorted();
    if (rows.map(acctKey).join(",") !== acctPaint.key) {
      if (busyInLaw) { acctRedrawPending = true; } else { drawAcct(); }
      return;
    }
    rows.forEach(function (r) {
      var c = acctPaint.map[acctKey(r)];
      var amount = fmtQty(r.amount);
      if (c.amount.textContent !== amount) { c.amount.textContent = amount; }
      var val = r.value === null ? "—" : fmtMoney(r.value);
      if (c.value.textContent !== val) { c.value.textContent = val; }
      var pnl = r.pnl === undefined || r.pnl === null ? null : r.pnl;
      var ptxt = pnl === null ? "—" : fmtMoney(pnl);
      if (c.pnl.textContent !== ptxt) { c.pnl.textContent = ptxt; }
      var pcls = "mkt-num" + (pnl > 0 ? " up" : pnl < 0 ? " down" : "");
      if (c.pnl.className !== pcls) { c.pnl.className = pcls; }
      var sub = acctSub(r) || "";
      if (c.sub.textContent !== sub) {
        c.sub.textContent = sub;
        c.sub.style.display = sub ? "" : "none";
      }
      var cat = ACCT_LABEL[r.wallet] || r.wallet;
      if (c.cat.textContent !== cat) { c.cat.textContent = cat; }
    });
    var side = acctRail();
    acctSide.replaceWith(side);
    acctSide = side;
    if (!busyInLaw) { drawLaw(); }
    drawTrans();
    drawAcctStatus();
  }

  function drawAcct() {
    if (!acctEl) { return; }
    acctRedrawPending = false;
    drawAcctStatus();
    acctEl.textContent = "";
    if (!acctData) {
      acctEl.appendChild(el("div", "news-empty", acctOk
        ? "No account snapshot yet — start the feed: python3 trader.py account" : "Feed unreachable."));
        lawSection = acctEl.appendChild(acctControls());
      return;
    }
    var cols = el("div", "news-cols");
    var main = el("div", "news-main");
    var halves = el("div", "acct-halves");
    var left = el("div", "acct-half");
    acctBar = left.appendChild(el("div", "news-pills"));
    [["all", "Overview"]].concat(ACCT_WALLETS).forEach(function (w) {
      var b = el("button", "news-pill" + (acctWallet === w[0] ? " on" : ""));
      b.appendChild(icon(ACCT_ICON[w[0]] || "all"));
      b.appendChild(document.createTextNode(w[1]));
      b.addEventListener("click", function () { acctWallet = w[0]; drawAcct(); });
      acctBar.appendChild(b);
    });

    var rows = acctSorted();

    var list = el("div", "news-list");
    var headRow = el("div", "acct-row news-head-row");
    headRow.appendChild(el("span", "mkt-rank", "#"));
    ACCT_COLS.forEach(function (c) {
      var cell = el("button", "mkt-head" + (acctSort.key === c[0]
        ? (acctSort.dir === 1 ? " on asc" : " on") : ""), c[1]);
      cell.addEventListener("click", function () {
        if (acctSort.key === c[0]) { acctSort.dir = -acctSort.dir; }
        else { acctSort = { key: c[0], dir: c[0] === "asset" ? 1 : -1 }; }
        drawAcct();
      });
      headRow.appendChild(cell);
    });
    list.appendChild(headRow);
    acctPaint = { key: rows.map(acctKey).join(","), map: {} };
    rows.forEach(function (r, i) {
      var row = el("div", "acct-row");
      row.appendChild(el("span", "mkt-rank", String(i + 1)));
      var tok = el("span", "news-source");
      tok.appendChild(tokenBadge(r.position ? r.asset.replace(/USDT$/, "") : r.asset));
      var col = tok.appendChild(el("span", "news-source-col"));
      col.appendChild(el("span", "news-source-name", r.asset));
      var subEl = col.appendChild(el("span", "news-domain", acctSub(r) || ""));
      if (!acctSub(r)) { subEl.style.display = "none"; }
      row.appendChild(tok);
      var catEl = row.appendChild(el("span", "acct-cat", ACCT_LABEL[r.wallet] || r.wallet));
      var amountEl = row.appendChild(el("span", "mkt-num", fmtQty(r.amount)));
      var valueEl = row.appendChild(el("span", "mkt-num", r.value === null ? "—" : fmtMoney(r.value)));
      var pnl = r.pnl === undefined || r.pnl === null ? null : r.pnl;
      var pnlEl = row.appendChild(el("span", "mkt-num" + (pnl > 0 ? " up" : pnl < 0 ? " down" : ""),
        pnl === null ? "—" : fmtMoney(pnl)));
      acctPaint.map[acctKey(r)] = { sub: subEl, cat: catEl, amount: amountEl,
        value: valueEl, pnl: pnlEl };
      list.appendChild(row);
    });
    left.appendChild(list);
    if (!rows.length) { left.appendChild(el("div", "news-empty", "Nothing in this wallet.")); }
    var side = acctRail();
    acctSide = side;

    halves.appendChild(left);
    main.appendChild(halves);
    cols.appendChild(main);
    cols.appendChild(side);
    acctEl.appendChild(cols);

    lawSection = left.appendChild(acctControls());
    acctSection = halves.appendChild(acctOrders());
  }

  function buildAccount(page, head) {
    var acts = el("div", "set-actions");
    var seg = el("div", "set-seg law-danger");
    lawModeSeg = LAW_MODES.map(function (o) {
      var b = el("button", "set-seg-btn", o[1]);
      b.addEventListener("click", function () { lawModeSet(o[0]); });
      seg.appendChild(b);
      return [o[0], b];
    });
    acts.appendChild(seg);
    acts.appendChild(refreshButton(function () { fetchAcct(true); fetchRules(); }));
    var sw = el("button", "set-switch" + (acctOn ? " on" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", acctOn ? "true" : "false");
    sw.setAttribute("aria-label", "Account display");
    sw.addEventListener("click", function () {
      acctOn = !acctOn;
      sw.classList.toggle("on", acctOn);
      sw.setAttribute("aria-checked", acctOn ? "true" : "false");
      drawAcctStatus();
      if (acctOn) { fetchAcct(true); }
    });
    acts.appendChild(sw);
    var live = acts.appendChild(el("span", "status"));
    acctDot = live.appendChild(el("i", "status-dot"));
    acctAge = live.appendChild(el("span"));
    head.appendChild(acts);
    acctEl = page.appendChild(el("div", "account"));
    drawAcct();
    fetchAcct(true);
    fetchRules();
    acctTimer = setInterval(function () {
      fetchAcct();
      if (!rulesFetching && !rulesBusy) { fetchRules(); }
    }, 5000);
  }

  /* ---- logs: the journal worker's one file, filtered in the browser ---- */
  var logsData = null;
  var logsOk = true;
  var logsEl = null;
  var logsBar = null;
  var logsDot = null;
  var logsAge = null;
  var logsTimer = null;
  var logsRequest = null;
  var logsFlash = 0;
  var logsQuery = "";
  var logsPage = 1;
  var logsPop = null;
  var LOGS_UNITS = [["ui", "Website", "ui.service"], ["news", "News runner", "news.service"],
    ["net", "Network checker", "net.service"], ["tunnel", "Tunnel", "cloudflared.service"]];
  var LOGS_LABEL = {};
  var LOGS_FILE = {};
  LOGS_UNITS.forEach(function (u) { LOGS_LABEL[u[0]] = u[1]; LOGS_FILE[u[0]] = u[2]; });
  var LOGS_COLOR = { "Website": "#3b82f6", "News runner": "#2ebd85", "Network checker": "#8b5cf6", "Tunnel": "#d9a52b" };
  var logsView = { unit: "all", on: true };
  try { logsView = JSON.parse(localStorage.getItem("quant.logs")) || logsView; } catch (e) { /* private mode */ }
  logsView.on = logsView.on !== false;
  if (!LOGS_LABEL[logsView.unit]) { logsView.unit = "all"; }

  function saveLogs() {
    try { localStorage.setItem("quant.logs", JSON.stringify(logsView)); } catch (e) { /* private mode */ }
  }

  function logCategory(msg) {
    if (/(Started|Stopping|Stopped|Deactivated|Consumed|Reloading|Reloaded) /.test(msg)) { return "Lifecycle"; }
    if (/fail|\bdown\b|error|\bERR\b|timeout|traceback|denied|refused|unable/i.test(msg)) { return "Failure"; }
    if (/\bWRN\b|warn/i.test(msg)) { return "Warning"; }
    return "Routine";
  }

  function logsBadge(unit) {
    if (unit === "tunnel") {
      var cloud = svg("svg", { viewBox: "0 0 28 28", "class": "logs-mark" });
      var g = cloud.appendChild(svg("g", { transform: "translate(-31 3.8) scale(.55)" }));
      g.appendChild(svg("path", { fill: "#f48120", d: "M88.1 24c.3-1 .2-2-.3-2.6-.5-.6-1.2-1-2.1-1.1l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.5-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3-1.1-5.1-5.7-8.9-11.1-8.9-5 0-9.3 3.2-10.8 7.7-1-.7-2.2-1.1-3.6-1-2.4.2-4.3 2.2-4.6 4.6-.1.6 0 1.2.1 1.8-3.9.1-7.1 3.3-7.1 7.3 0 .4 0 .7.1 1.1 0 .2.2.3.3.3h32.1c.2 0 .4-.1.4-.3l.3-1.1z" }));
      g.appendChild(svg("path", { fill: "#faad3f", d: "M93.6 12.8h-.5c-.1 0-.2.1-.3.2l-.7 2.4c-.3 1-.2 2 .3 2.6.5.6 1.2 1 2.1 1.1l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.2.9c-.1.1 0 .3.2.3h13.2c.2 0 .3-.1.3-.3.2-.8.4-1.7.4-2.6 0-5.2-4.3-9.5-9.5-9.5" }));
      return cloud;
    }
    var icon = document.querySelector(unit === "ui" ? '#sess-icons svg[data-d="monitor"]'
      : '.nav-row[data-page="' + (unit === "news" ? "news" : "network") + '"] svg').cloneNode(true);
    icon.setAttribute("class", "logs-mark");
    return icon;
  }

  function closeLogPop() {
    if (!logsPop) { return; }
    document.removeEventListener("keydown", logsPop.onKey);
    logsPop.dim.remove();
    logsPop.card.remove();
    logsPop = null;
  }

  function openLogPop(entry) {
    closeLogPop();
    var when = new Date(entry.ts * 1000);
    var dim = el("div", "qsearch-dim");
    var card = el("div", "logs-pop");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Log line detail");
    var head = el("div", "logs-pop-head");
    head.appendChild(logsBadge(entry.unit));
    var col = head.appendChild(el("span", "news-source-col"));
    col.appendChild(el("span", "news-source-name", LOGS_LABEL[entry.unit] || entry.unit));
    col.appendChild(el("span", "news-domain",
      (LOGS_FILE[entry.unit] || "") + (entry.pid ? " · PID " + entry.pid : "")));
    head.appendChild(el("span", "logs-pop-time",
      dateFmt.format(when) + " · " + hoverTimeFmt.format(when)));
    card.appendChild(head);
    card.appendChild(el("div", "logs-pop-msg", entry.msg));
    var mates = logsData ? logsData.entries.filter(function (e) { return e.unit === entry.unit; }) : [];
    var at = mates.indexOf(entry);
    for (var i = 0; at === -1 && i < mates.length; i++) {
      if (mates[i].ts === entry.ts && mates[i].msg === entry.msg) { at = i; }
    }
    if (at !== -1 && mates.length > 1) {
      var ctx = el("div", "logs-pop-ctx");
      ctx.appendChild(el("div", "logs-pop-ctx-title",
        "Around this line · " + (LOGS_LABEL[entry.unit] || entry.unit)));
      mates.slice(Math.max(0, at - 4), at + 5).forEach(function (m) {
        var line = el("div", "logs-ctx-row" + (m === mates[at] ? " on" : ""));
        line.appendChild(el("span", "logs-ctx-time", hoverTimeFmt.format(new Date(m.ts * 1000))));
        line.appendChild(el("span", "logs-ctx-msg", m.msg));
        if (m !== mates[at]) { line.addEventListener("click", function () { openLogPop(m); }); }
        ctx.appendChild(line);
      });
      card.appendChild(ctx);
    }
    dim.addEventListener("mousedown", closeLogPop);
    var onKey = function (ev) { if (ev.key === "Escape") { closeLogPop(); } };
    document.addEventListener("keydown", onKey);
    logsPop = { dim: dim, card: card, onKey: onKey };
    document.body.appendChild(dim);
    document.body.appendChild(card);
  }

  function fetchLogs(force) {
    if (!logsEl || logsRequest) { return; }
    if (force !== true && (!logsView.on || document.hidden)) { return; }
    var controller = new AbortController();
    var request = { controller: controller, timeout: setTimeout(function () { controller.abort(); }, 12000) };
    logsRequest = request;
    fetch("/logs.json", { signal: controller.signal, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) {
        if (r.status === 401) { location.reload(); }
        if (!r.ok) { throw new Error(r.status); }
        return r.json();
      }).then(function (d) {
        if (logsRequest !== request) { return; }
        clearTimeout(request.timeout);
        logsRequest = null;
        if (!logsEl) { return; }
        logsOk = true;
        if (logsData && logsData.at === d.at) { drawLogsStatus(); return; }
        logsFlash = logsData && logsData.entries.length ? logsData.entries[logsData.entries.length - 1].ts : 0;
        logsData = d;
        drawLogs();
      }).catch(function () {
        if (logsRequest !== request) { return; }
        clearTimeout(request.timeout);
        logsRequest = null;
        if (!logsEl) { return; }
        logsOk = false;
        if (logsData) { drawLogsStatus(); } else { drawLogs(); }
      });
  }

  function drawLogsStatus() {
    if (!logsEl) { return; }
    logsEl.classList.toggle("off", !logsView.on);
    if (!logsView.on) {
      logsDot.className = "status-dot";
      logsAge.textContent = "Off";
      return;
    }
    var stale = !logsData || Date.now() - logsData.at > logsData.every * 3000;
    logsDot.className = "status-dot " + (!logsOk ? "dead" : !logsData ? "" : stale ? "stale" : "live");
    logsAge.textContent = !logsOk ? "Offline" : !logsData ? "" : stale ? "Stale" : "Live";
  }

  function drawLogs() {
    if (!logsEl) { return; }
    drawLogsStatus();
    logsEl.textContent = "";
    if (!logsData) {
      logsEl.appendChild(el("div", "news-empty", "No logs yet."));
      return;
    }
    var q = logsQuery.trim().toLowerCase();
    var perUnit = {};
    var pool = logsData.entries.filter(function (e) {
      if (q && e.msg.toLowerCase().indexOf(q) === -1
          && (LOGS_LABEL[e.unit] || e.unit).toLowerCase().indexOf(q) === -1) { return false; }
      perUnit[e.unit] = (perUnit[e.unit] || 0) + 1;
      return true;
    });
    var shown = logsView.unit === "all" ? pool
      : pool.filter(function (e) { return e.unit === logsView.unit; });

    logsBar.textContent = "";
    [["all", "All Logs"]].concat(LOGS_UNITS.map(function (u) { return [u[0], u[1]]; }))
      .forEach(function (def) {
        var b = el("button", "news-pill" + (logsView.unit === def[0] ? " on" : ""));
        b.appendChild(def[0] === "all" ? icon("all") : logsBadge(def[0]));
        b.appendChild(document.createTextNode(def[1]));
        b.addEventListener("click", function () { logsView.unit = def[0]; logsPage = 1; saveLogs(); drawLogs(); });
        logsBar.appendChild(b);
      });

    var top = topOfHour();
    var perHour = {};
    LOGS_UNITS.forEach(function (u) {
      perHour[u[0]] = [];
      for (var i = 0; i < 24; i++) { perHour[u[0]].push(0); }
    });
    var totals = [];
    var failTotals = [];
    for (var i = 0; i < 24; i++) { totals.push(0); failTotals.push(0); }
    var failCount = 0;
    var dupes = {};
    shown.forEach(function (e) {
      var back = Math.max(0, Math.ceil((top - e.ts) / 3600));
      if (back < 24 && perHour[e.unit]) {
        perHour[e.unit][23 - back] += 1;
        totals[23 - back] += 1;
      }
      if (logCategory(e.msg) === "Failure") {
        failCount += 1;
        if (back < 24) { failTotals[23 - back] += 1; }
        var seen = dupes[e.msg] || (dupes[e.msg] = { count: 0, sample: e });
        seen.count += 1;
      }
    });
    var max = Math.max.apply(null, totals) || 1;

    var cols = el("div", "news-cols");
    var main = el("div", "news-main");
    var list = el("div", "news-list");
    var headRow = el("div", "logs-row news-head-row");
    ["Time", "Service", "Message", "Category"].forEach(function (t) { headRow.appendChild(el("span", "", t)); });
    list.appendChild(headRow);
    var pages = Math.max(1, Math.ceil(shown.length / NEWS_PAGE_SIZE));
    logsPage = Math.min(logsPage, pages);
    var start = (logsPage - 1) * NEWS_PAGE_SIZE;
    shown.slice().reverse().slice(start, start + NEWS_PAGE_SIZE).forEach(function (e) {
      var row = el("div", "logs-row" + (logsFlash && e.ts > logsFlash ? " fresh" : ""));
      var when = new Date(e.ts * 1000);
      var time = el("span", "news-time", hoverTimeFmt.format(when));
      time.title = dateFmt.format(when) + " " + hoverTimeFmt.format(when);
      row.appendChild(time);
      var service = el("span", "news-source");
      service.appendChild(logsBadge(e.unit));
      service.appendChild(el("span", "news-source-name", LOGS_LABEL[e.unit] || e.unit));
      row.appendChild(service);
      var msg = el("span", "logs-msg", e.msg);
      msg.title = e.msg;
      row.appendChild(msg);
      row.appendChild(el("span", "news-cat", logCategory(e.msg)));
      row.addEventListener("click", function () { openLogPop(e); });
      list.appendChild(row);
    });
    main.appendChild(list);
    if (!shown.length) {
      main.appendChild(el("div", "news-empty", "Nothing matches these filters."));
    } else {
      main.appendChild(pager(shown.length, logsPage, function (p) { logsPage = p; drawLogs(); }));
    }
    cols.appendChild(main);

    var side = el("div", "news-side");
    function chip(name, boxEl) {
      var b = boxEl.querySelector(".news-box-head b");
      b.insertBefore(icon(name), b.firstChild);
      return boxEl;
    }
    var activity = chip("change", box("Activity · 24h"));
    var chart = svg("svg", { viewBox: "0 0 356 108", "class": "news-chart",
      role: "img", "aria-label": "Log lines per hour" });
    chart.appendChild(svg("text", { x: 0, y: 8 })).textContent = String(max);
    var slot = 356 / 24;
    for (var h = 0; h < 24; h++) {
      var count = totals[h];
      if (count) {
        var barH = Math.max(2, count / max * 74);
        chart.appendChild(svg("rect", { x: h * slot + 1.5, y: 88 - barH, width: slot - 3,
          height: barH, rx: 1.5, fill: "var(--focus)" }));
      }
      var when = timeFmt.format(new Date((top - (23 - h) * 3600) * 1000));
      if ((23 - h) % 6 === 0) {
        chart.appendChild(svg("text", { x: Math.min(h * slot + slot / 2, 334), y: 104,
          "text-anchor": "middle" })).textContent = when;
      }
      var hit = svg("rect", { x: h * slot, y: 0, width: slot, height: 108, fill: "transparent" });
      hit.setAttribute("data-tip", when + " · " + count + (count ? ": " + LOGS_UNITS.filter(function (u) {
        return perHour[u[0]][h];
      }).map(function (u) { return u[1] + " " + perHour[u[0]][h]; }).join(", ") : ""));
      chart.appendChild(hit);
    }
    chart.appendChild(svg("line", { x1: 0, y1: 88.5, x2: 356, y2: 88.5, "class": "news-chart-base" }));
    activity.appendChild(chart);
    side.appendChild(activity);

    var services = chip("both", box("Services", "by hour"));
    LOGS_UNITS.forEach(function (u) {
      var lane = el("div", "logs-lane");
      lane.appendChild(logsBadge(u[0]));
      lane.appendChild(el("span", "logs-lane-name", u[1]));
      var strip = el("span", "logs-lane-strip");
      var laneMax = Math.max.apply(null, perHour[u[0]]) || 1;
      for (var c = 0; c < 24; c++) {
        var cell = el("i", "logs-lane-cell");
        var n = perHour[u[0]][c];
        if (n) {
          cell.style.background = LOGS_COLOR[u[1]];
          cell.style.opacity = Math.max(0.18, n / laneMax).toFixed(2);
        }
        cell.setAttribute("data-tip", u[1] + " · " + timeFmt.format(new Date((top - (23 - c) * 3600) * 1000))
          + " · " + n + (n === 1 ? " line" : " lines"));
        strip.appendChild(cell);
      }
      lane.appendChild(strip);
      services.appendChild(lane);
    });
    side.appendChild(services);

    var sharesBox = chip("breadth", box("Lines by service"));
    var share = el("div", "logs-share");
    var donut = svg("svg", { viewBox: "0 0 120 120", "class": "logs-donut",
      role: "img", "aria-label": "Share of lines by service" });
    donut.appendChild(svg("circle", { cx: 60, cy: 60, r: 44, fill: "none",
      stroke: "var(--hover)", "stroke-width": 16 }));
    var pairs = LOGS_UNITS.map(function (u) { return [u[1], perUnit[u[0]] || 0]; })
      .filter(function (p) { return p[1]; }).sort(function (a, b) { return b[1] - a[1]; });
    var total = 0;
    pairs.forEach(function (p) { total += p[1]; });
    var C = 2 * Math.PI * 44;
    var run = 0;
    pairs.forEach(function (p) {
      var arc = svg("circle", { cx: 60, cy: 60, r: 44, fill: "none", stroke: LOGS_COLOR[p[0]],
        "stroke-width": 16, "stroke-dasharray": (p[1] / total * C).toFixed(2) + " " + C.toFixed(2),
        "stroke-dashoffset": (-run / total * C).toFixed(2), transform: "rotate(-90 60 60)" });
      arc.setAttribute("data-tip", p[0] + " · " + p[1] + " of " + total
        + " lines (" + Math.round(p[1] / total * 100) + "%)");
      donut.appendChild(arc);
      run += p[1];
    });
    share.appendChild(donut);
    var legend = el("div", "logs-share-rows");
    pairs.forEach(function (p) {
      var row = el("div", "news-hbar");
      var dot = el("span", "net-chip-dot");
      dot.style.background = LOGS_COLOR[p[0]];
      row.appendChild(dot);
      row.appendChild(el("span", "news-hbar-label", p[0]));
      row.appendChild(el("span", "news-hbar-value", String(p[1])));
      legend.appendChild(row);
    });
    share.appendChild(legend);
    sharesBox.appendChild(share);
    side.appendChild(sharesBox);

    if (failCount) {
      var failBox = chip("alert", box("Failures · 24h", String(failCount)));
      var fmax = Math.max.apply(null, failTotals) || 1;
      var fchart = svg("svg", { viewBox: "0 0 356 108", "class": "news-chart",
        role: "img", "aria-label": "Failed lines per hour" });
      fchart.appendChild(svg("text", { x: 0, y: 8 })).textContent = String(fmax);
      for (var f = 0; f < 24; f++) {
        var fails = failTotals[f];
        if (fails) {
          var fh = Math.max(2, fails / fmax * 74);
          fchart.appendChild(svg("rect", { x: f * slot + 1.5, y: 88 - fh, width: slot - 3,
            height: fh, rx: 1.5, fill: "#cc2f3c" }));
        }
        var fwhen = timeFmt.format(new Date((top - (23 - f) * 3600) * 1000));
        if ((23 - f) % 6 === 0) {
          fchart.appendChild(svg("text", { x: Math.min(f * slot + slot / 2, 334), y: 104,
            "text-anchor": "middle" })).textContent = fwhen;
        }
        var fhit = svg("rect", { x: f * slot, y: 0, width: slot, height: 108, fill: "transparent" });
        fhit.setAttribute("data-tip", fwhen + " · " + fails + (fails === 1 ? " failure" : " failures"));
        fchart.appendChild(fhit);
      }
      fchart.appendChild(svg("line", { x1: 0, y1: 88.5, x2: 356, y2: 88.5, "class": "news-chart-base" }));
      failBox.appendChild(fchart);
      side.appendChild(failBox);
    }

    var repeated = Object.keys(dupes).map(function (k) { return dupes[k]; })
      .filter(function (d) { return d.count > 1; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    if (repeated.length) {
      var rep = chip("x", box("Repeated failures"));
      repeated.forEach(function (d) {
        var row = el("div", "logs-ctx-row");
        var dot = el("span", "net-chip-dot");
        dot.style.background = LOGS_COLOR[LOGS_LABEL[d.sample.unit]] || "var(--faint)";
        row.appendChild(dot);
        var msg = el("span", "logs-ctx-msg", d.sample.msg);
        msg.title = d.sample.msg;
        row.appendChild(msg);
        row.appendChild(el("span", "logs-ctx-time", String(d.count)));
        row.addEventListener("click", function () { openLogPop(d.sample); });
        rep.appendChild(row);
      });
      side.appendChild(rep);
    }
    cols.appendChild(side);
    logsEl.appendChild(cols);
        logsFlash = 0;
  }

  function buildLogs(page, head) {
    var acts = el("div", "set-actions news-acts");
    acts.appendChild(searchBox("logs", "Search logs…", logsQuery, function (v) {
      logsQuery = v;
      logsPage = 1;
      drawLogs();
    }));
    acts.appendChild(refreshButton(function () { fetchLogs(true); }));
    var sw = el("button", "set-switch" + (logsView.on ? " on" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", logsView.on ? "true" : "false");
    sw.setAttribute("aria-label", "Logs display");
    logsSync = function (v) {
      logsView.on = v;
      saveLogs();
      sw.classList.toggle("on", v);
      sw.setAttribute("aria-checked", v ? "true" : "false");
      drawLogsStatus();
      if (v) { fetchLogs(); }
    };
    sw.addEventListener("click", function () { feedState("/api/logs", !logsView.on, logsSync); });
    feedState("/api/logs", undefined, logsSync);
    acts.appendChild(sw);
    var live = acts.appendChild(el("span", "status"));
    logsDot = live.appendChild(el("i", "status-dot"));
    logsAge = live.appendChild(el("span"));
    page.classList.add("logs");
    head.appendChild(acts);
    logsBar = page.appendChild(el("div", "news-pills"));
    logsEl = page.appendChild(el("div", "logs"));
    drawLogs();
    fetchLogs(true);
    logsTimer = setInterval(fetchLogs, 5000);
  }

  /* ---- markets: every Binance USDT token, one closed set ---- */
  var marketsData = null;
  var marketsOk = true;
  var marketsEl = null;
  var marketsBar = null;
  var marketsDot = null;
  var marketsAge = null;
  var marketsTimer = null;
  var marketsRequest = null;
  var marketsQuery = "";
  var marketsPage = 1;
  var marketsPaint = null;
  var marketsRows = {};
  var marketsSide = null;
  var MKT_CATS = [["all", "All"], ["both", "Both"], ["spot", "Spot only"], ["fut", "Futures only"]];
  var MKT_COLS = [["tok", "Token"], ["price", "Price"], ["chg", "24h %"], ["vol", "Volume 24h"],
    ["v1x", "Vol 1h"], ["ratio", "F/S"], ["fund", "Funding"], ["bas", "Basis"],
    ["spr", "Spread"], ["bh", "Basis /1h"]];
  var marketsView = { cat: "all", sort: "vol", dir: -1, on: true };
  try { marketsView = JSON.parse(localStorage.getItem("quant.markets")) || marketsView; } catch (e) { /* private mode */ }
  marketsView.on = marketsView.on !== false;

  function saveMarkets() {
    try { localStorage.setItem("quant.markets", JSON.stringify(marketsView)); } catch (e) { /* private mode */ }
  }

  function tokenName(r) { return r.sym.slice(-4) === "USDT" ? r.sym.slice(0, -4) : r.sym; }

  function tokenBadge(name) {
    var key = name.replace(/^(1000000|1000|1M)(?=.)/, "");
    var tries = ["/tokens/" + key + ".svg", "/tokens/" + key + ".png"];
    if (key.length > 4 && key.slice(0, 2) === "LD") {
      tries.push("/tokens/" + key.slice(2) + ".svg", "/tokens/" + key.slice(2) + ".png");
    }
    var img = el("img", "mkt-badge");
    img.alt = "";
    img.loading = "lazy";
    var at = 0;
    img.src = tries[0];
    img.addEventListener("error", function () {
      at += 1;
      if (at < tries.length) { img.src = tries[at]; }
      else { img.replaceWith(el("span", "mkt-badge", name.charAt(0))); }
    });
    return img;
  }

  function marketsValue(r, key) {
    if (key === "tok") { return tokenName(r); }
    if (key === "price") {
      var p = r.sbid !== undefined ? r.sbid : r.fbid;
      return p === undefined ? null : parseFloat(p);
    }
    if (key === "chg") { return r.schg !== undefined ? r.schg : r.fchg !== undefined ? r.fchg : null; }
    if (key === "vol") {
      if (r.svol === undefined && r.fvol === undefined) { return null; }
      return (r.svol || 0) + (r.fvol || 0);
    }
    if (key === "bas") { return rowBasis(r); }
    if (key === "spr") { return rowSpread(r); }
    return r[key] !== undefined ? r[key] : null;
  }

  function rowBasis(r) {
    return r.bas !== undefined ? r.bas : null;
  }

  function rowSpread(r) {
    if (r.sbid === undefined || r.fbid === undefined) { return null; }
    var sb = parseFloat(r.sbid);
    var sa = parseFloat(r.sask);
    var fb = parseFloat(r.fbid);
    var fa = parseFloat(r.fask);
    if (sb <= 0 || fb <= 0) { return null; }
    return (sa - sb) / ((sa + sb) / 2) * 100 + (fa - fb) / ((fa + fb) / 2) * 100;
  }

  function fmtPrice(r) {
    var p = r.sbid !== undefined ? r.sbid : r.fbid;
    if (p === undefined) { return "—"; }
    if (p.indexOf(".") !== -1) { p = p.replace(/0+$/, "").replace(/\.$/, ""); }
    var parts = p.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return "$" + parts.join(".");
  }

  function fmtVol(v) {
    if (v === null) { return "—"; }
    if (v >= 1e9) { return (v / 1e9).toFixed(1) + "B"; }
    if (v >= 1e6) { return (v / 1e6).toFixed(1) + "M"; }
    if (v >= 1e3) { return (v / 1e3).toFixed(0) + "K"; }
    return String(Math.round(v));
  }

  function fmtSigned(v, digits) {
    return v === null || v === undefined ? "—" : (v > 0 ? "+" : "") + v.toFixed(digits) + "%";
  }

  function marketsShown() {
    var q = marketsQuery.trim().toUpperCase();
    return marketsData.rows.filter(function (r) {
      if (marketsView.cat !== "all" && r.cat !== marketsView.cat) { return false; }
      return !q || r.sym.indexOf(q) !== -1 || (r.fsym && r.fsym.indexOf(q) !== -1)
        || (r.name && r.name.toUpperCase().indexOf(q) !== -1);
    });
  }

  function marketsSort(rows) {
    var key = marketsView.sort;
    var dir = marketsView.dir;
    rows.sort(function (a, b) {
      var va = marketsValue(a, key);
      var vb = marketsValue(b, key);
      if (va === null && vb === null) { return a.sym < b.sym ? -1 : 1; }
      if (va === null) { return 1; }
      if (vb === null) { return -1; }
      if (va < vb) { return -dir; }
      if (va > vb) { return dir; }
      return a.sym < b.sym ? -1 : 1;
    });
    return rows;
  }

  function fetchMarkets(force) {
    if (!marketsEl || marketsRequest) { return; }
    if (force !== true && (!marketsView.on || document.hidden)) { return; }
    var controller = new AbortController();
    var request = { controller: controller, timeout: setTimeout(function () { controller.abort(); }, 12000) };
    marketsRequest = request;
    fetch("/board.json", { signal: controller.signal, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) {
        if (r.status === 401) { location.reload(); }
        if (!r.ok) { throw new Error(r.status); }
        return r.json();
      }).then(function (d) {
        if (marketsRequest !== request) { return; }
        clearTimeout(request.timeout);
        marketsRequest = null;
        if (!marketsEl) { return; }
        marketsOk = true;
        if (marketsData && marketsData.at === d.at) { drawMarketsStatus(); return; }
        marketsData = d;
        paintMarkets();
      }).catch(function () {
        if (marketsRequest !== request) { return; }
        clearTimeout(request.timeout);
        marketsRequest = null;
        if (!marketsEl) { return; }
        marketsOk = false;
        if (marketsData) { drawMarketsStatus(); } else { drawMarkets(); }
      });
  }

  function drawMarketsStatus() {
    if (!marketsEl) { return; }
    marketsEl.classList.toggle("off", !marketsView.on);
    if (!marketsView.on) {
      marketsDot.className = "status-dot";
      marketsAge.textContent = "Off";
      return;
    }
    var stale = !marketsData || Date.now() - marketsData.at > 10000;
    marketsDot.className = "status-dot " + (!marketsOk ? "dead" : !marketsData ? "" : stale ? "stale" : "live");
    marketsAge.textContent = !marketsOk ? "Offline" : !marketsData ? "" : stale ? "Stale" : "Live";
  }

  function steps(from, to, step) {
    var out = [];
    for (var v = from; v <= to + 1e-9; v += step) { out.push(Math.round(v * 1000) / 1000); }
    return out;
  }

  function spreadBox(title, values, edges, tone, tickEvery, unit) {
    unit = unit || "%";
    var counts = [];
    for (var i = 0; i <= edges.length; i++) { counts.push(0); }
    var known = 0;
    values.forEach(function (v) {
      if (v === null || v === undefined) { return; }
      known += 1;
      var slotIndex = edges.length;
      for (var j = 0; j < edges.length; j++) {
        if (v < edges[j]) { slotIndex = j; break; }
      }
      counts[slotIndex] += 1;
    });
    var out = box(title, known + " tokens");
    var max = Math.max.apply(null, counts) || 1;
    var chart = svg("svg", { viewBox: "0 0 356 108", "class": "news-chart", role: "img", "aria-label": title });
    chart.appendChild(svg("text", { x: 0, y: 8 })).textContent = String(max);
    var slot = 356 / counts.length;
    counts.forEach(function (n, i) {
      var lo = i === 0 ? null : edges[i - 1];
      var hi = i === edges.length ? null : edges[i];
      if (n) {
        var barH = Math.max(2, n / max * 74);
        chart.appendChild(svg("rect", { x: i * slot + 1.5, y: 88 - barH, width: Math.max(slot - 3, 2),
          height: barH, rx: 1.5, fill: tone }));
      }
      var hit = svg("rect", { x: i * slot, y: 0, width: slot, height: 108, fill: "transparent" });
      hit.setAttribute("data-tip", (lo === null ? "under " + edges[0] + unit
        : hi === null ? "over " + edges[edges.length - 1] + unit
          : lo + unit + " to " + hi + unit) + " · " + n + (n === 1 ? " token" : " tokens"));
      chart.appendChild(hit);
    });
    for (var e = 0; e < edges.length; e += tickEvery) {
      chart.appendChild(svg("text", { x: Math.min(Math.max((e + 1) * slot, 10), 340), y: 104,
        "text-anchor": "middle" })).textContent = String(edges[e]);
    }
    chart.appendChild(svg("line", { x1: 0, y1: 88.5, x2: 356, y2: 88.5, "class": "news-chart-base" }));
    out.appendChild(chart);
    return out;
  }

  function marketsRail(rows) {
    var side = el("div", "news-side");
    function railBox(name, boxEl) {
      var b = boxEl.querySelector(".news-box-head b");
      b.insertBefore(icon(name), b.firstChild);
      side.appendChild(boxEl);
    }
    railBox("bnorm", spreadBox("Basis", rows.map(function (r) { return rowBasis(r); }),
      steps(-1, 1, 0.1), "#3b82f6", 5));

    var up = 0;
    var downCount = 0;
    var flat = 0;
    rows.forEach(function (r) {
      var c = marketsValue(r, "chg");
      if (c === null || c === 0) { flat += 1; }
      else if (c > 0) { up += 1; }
      else { downCount += 1; }
    });
    var breadth = box("24h breadth", rows.length + " tokens");
    var share = el("div", "logs-share");
    var donut = svg("svg", { viewBox: "0 0 120 120", "class": "logs-donut",
      role: "img", "aria-label": "Tokens up, down and flat over 24 hours" });
    donut.appendChild(svg("circle", { cx: 60, cy: 60, r: 44, fill: "none",
      stroke: "var(--hover)", "stroke-width": 16 }));
    var parts = [["Risers", up, "#2ebd85"], ["Fallers", downCount, "#cc2f3c"], ["Flat", flat, "var(--faint)"]]
      .filter(function (p) { return p[1]; });
    var total = 0;
    parts.forEach(function (p) { total += p[1]; });
    var C = 2 * Math.PI * 44;
    var run = 0;
    parts.forEach(function (p) {
      var arc = svg("circle", { cx: 60, cy: 60, r: 44, fill: "none", stroke: p[2],
        "stroke-width": 16, "stroke-dasharray": (p[1] / total * C).toFixed(2) + " " + C.toFixed(2),
        "stroke-dashoffset": (-run / total * C).toFixed(2), transform: "rotate(-90 60 60)" });
      arc.setAttribute("data-tip", p[0] + " · " + p[1] + " of " + total
        + " tokens (" + Math.round(p[1] / total * 100) + "%)");
      donut.appendChild(arc);
      run += p[1];
    });
    share.appendChild(donut);
    var legend = el("div", "logs-share-rows");
    parts.forEach(function (p) {
      var row = el("div", "news-hbar");
      var dot = el("span", "net-chip-dot");
      dot.style.background = p[2];
      row.appendChild(dot);
      row.appendChild(el("span", "news-hbar-label", p[0]));
      row.appendChild(el("span", "news-hbar-value", String(p[1])));
      legend.appendChild(row);
    });
    share.appendChild(legend);
    breadth.appendChild(share);
    railBox("breadth", breadth);

    railBox("funding", spreadBox("Funding", rows.map(function (r) { return r.fund; }),
      steps(-0.1, 0.1, 0.01), "#d9a52b", 5));
    railBox("change", spreadBox("24h change", rows.map(function (r) { return marketsValue(r, "chg"); }),
      steps(-10, 10, 1), "#10b981", 5));
    railBox("spread", spreadBox("Spread", rows.map(function (r) { return rowSpread(r); }),
      steps(0, 1, 0.05), "#ec4899", 4));
    return side;
  }

  function marketsRowTexts(r, chg) {
    var spr = rowSpread(r);
    return [fmtPrice(r), chg === null || chg === undefined ? "—" : Math.abs(chg).toFixed(2) + "%",
      fmtVol(marketsValue(r, "vol")),
      r.v1x === undefined ? "—" : r.v1x.toFixed(1) + "×",
      r.ratio === undefined ? "—" : r.ratio.toFixed(2),
      r.fund === undefined ? "—" : fmtSigned(r.fund, 4),
      fmtSigned(rowBasis(r), 3), spr === null ? "\u2014" : spr.toFixed(3) + "%", fmtSigned(r.bh, 3)];
  }

  function marketsRowEl(r) {
    var row = el("div", "mkt-row");
    row.dataset.sym = r.sym;
    row.appendChild(el("span", "mkt-rank", ""));
    var tok = el("span", "news-source");
    tok.appendChild(tokenBadge(tokenName(r)));
    var col = tok.appendChild(el("span", "news-source-col"));
    col.appendChild(el("span", "news-source-name", tokenName(r)));
    var sub = [r.name, r.mult && "×" + r.mult + " futures"].filter(Boolean).join(" · ");
    if (sub) { col.appendChild(el("span", "news-domain", sub)); }
    row.appendChild(tok);
    row.texts = [];
    for (var ci = 0; ci < 9; ci += 1) {
      var cell = el("span", "mkt-num");
      if (ci === 1) { row.arr = cell.appendChild(el("span", "mkt-arr", "")); }
      var tn = document.createTextNode("");
      cell.appendChild(tn);
      if (ci === 5) { row.fundHours = cell.appendChild(el("span", "mkt-int", "")); }
      row.appendChild(cell);
      row.texts.push(tn);
    }
    return row;
  }

  function marketsRowUpdate(r, rank) {
    var row = marketsRows[r.sym] || (marketsRows[r.sym] = marketsRowEl(r));
    row.firstChild.textContent = String(rank);
    var chg = marketsValue(r, "chg");
    marketsRowTexts(r, chg).forEach(function (txt, i) {
      if (row.texts[i].nodeValue !== txt) { row.texts[i].nodeValue = txt; }
    });
    var hrs = r.hours === undefined ? "" : "/" + r.hours + "h";
    if (row.fundHours.textContent !== hrs) { row.fundHours.textContent = hrs; }
    var cls = "mkt-arr" + (chg > 0 ? " up" : chg < 0 ? " down" : "");
    if (row.arr.className !== cls) {
      row.arr.className = cls;
      row.arr.textContent = chg > 0 ? "▲" : chg < 0 ? "▼" : "";
    }
    return row;
  }

  function paintMarkets() {
    if (!marketsEl) { return; }
    if (!marketsPaint) { drawMarkets(); return; }
    var rows = marketsSort(marketsShown());
    if (rows.length !== marketsPaint.total) { drawMarkets(); return; }
    var pages = Math.max(1, Math.ceil(rows.length / NEWS_PAGE_SIZE));
    marketsPage = Math.min(marketsPage, pages);
    var start = (marketsPage - 1) * NEWS_PAGE_SIZE;
    var slice = rows.slice(start, start + NEWS_PAGE_SIZE);
    var key = rows.length + ":" + slice.map(function (r) { return r.sym; }).join(",");
    var body = marketsPaint.body;
    if (key !== marketsPaint.key) {
      var first = {};
      Array.prototype.forEach.call(body.children, function (n) {
        first[n.dataset.sym] = n.getBoundingClientRect().top;
      });
      slice.forEach(function (r, i) {
        var row = marketsRowUpdate(r, start + i + 1);
        if (body.children[i] !== row) { body.insertBefore(row, body.children[i] || null); }
      });
      while (body.children.length > slice.length) { body.lastChild.remove(); }
      Array.prototype.forEach.call(body.children, function (n) {
        var was = first[n.dataset.sym];
        if (was === undefined) {
          n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });
          return;
        }
        var d = was - n.getBoundingClientRect().top;
        if (d) { n.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 260, easing: "ease" }); }
      });
      marketsPaint.key = key;
    } else {
      slice.forEach(function (r, i) { marketsRowUpdate(r, start + i + 1); });
    }
    var fresh = marketsRail(rows);
    marketsSide.replaceWith(fresh);
    marketsSide = fresh;
    drawMarketsStatus();
  }

  function drawMarkets() {
    if (!marketsEl) { return; }
    drawMarketsStatus();
    marketsEl.textContent = "";
    marketsBar.textContent = "";
    if (!marketsData) {
      marketsEl.appendChild(el("div", "news-empty", marketsView.on
        ? "No market data yet." : "Markets is off — press refresh for one snapshot, or switch it on."));
      return;
    }
    MKT_CATS.forEach(function (c) {
      var b = el("button", "news-pill" + (marketsView.cat === c[0] ? " on" : ""));
      b.appendChild(icon(c[0]));
      b.appendChild(document.createTextNode(c[1]));
      b.addEventListener("click", function () {
        marketsView.cat = c[0];
        marketsPage = 1;
        drawMarkets();
      });
      marketsBar.appendChild(b);
    });
    var rows = marketsSort(marketsShown());

    var cols = el("div", "news-cols");
    var main = el("div", "news-main");
    var list = el("div", "news-list");
    var headRow = el("div", "mkt-row news-head-row");
    headRow.appendChild(el("span", "mkt-rank", "#"));
    MKT_COLS.forEach(function (c) {
      var cell = el("button", "mkt-head" + (marketsView.sort === c[0]
        ? (marketsView.dir === 1 ? " on asc" : " on") : ""), c[1]);
      cell.addEventListener("click", function () {
        if (marketsView.sort === c[0]) { marketsView.dir = -marketsView.dir; }
        else { marketsView.sort = c[0]; marketsView.dir = c[0] === "tok" ? 1 : -1; }
        marketsPage = 1;
        drawMarkets();
      });
      headRow.appendChild(cell);
    });
    list.appendChild(headRow);
    var pages = Math.max(1, Math.ceil(rows.length / NEWS_PAGE_SIZE));
    marketsPage = Math.min(marketsPage, pages);
    var start = (marketsPage - 1) * NEWS_PAGE_SIZE;
    var slice = rows.slice(start, start + NEWS_PAGE_SIZE);
    var body = el("div");
    slice.forEach(function (r, i) { body.appendChild(marketsRowUpdate(r, start + i + 1)); });
    list.appendChild(body);
    marketsPaint = { key: rows.length + ":" + slice.map(function (r) { return r.sym; }).join(","),
      body: body, total: rows.length };
    main.appendChild(list);
    if (!rows.length) {
      main.appendChild(el("div", "news-empty", "Nothing matches these filters."));
    } else {
      main.appendChild(pager(rows.length, marketsPage, function (p) { marketsPage = p; drawMarkets(); }));
    }
    cols.appendChild(main);

    var side = marketsRail(rows);
    marketsSide = side;
    cols.appendChild(side);
    marketsEl.appendChild(cols);
  }

  function buildMarkets(page, head) {
    var acts = el("div", "set-actions news-acts");
    acts.appendChild(searchBox("markets", "Search tokens…", marketsQuery, function (v) {
      marketsQuery = v;
      marketsPage = 1;
      drawMarkets();
    }));
    acts.appendChild(refreshButton(function () { fetchMarkets(true); }));
    var sw = el("button", "set-switch" + (marketsView.on ? " on" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", marketsView.on ? "true" : "false");
    sw.setAttribute("aria-label", "Live market data");
    sw.addEventListener("click", function () {
      marketsView.on = !marketsView.on;
      saveMarkets();
      sw.classList.toggle("on", marketsView.on);
      sw.setAttribute("aria-checked", marketsView.on ? "true" : "false");
      drawMarketsStatus();
      if (marketsView.on) { fetchMarkets(); }
    });
    acts.appendChild(sw);
    var live = acts.appendChild(el("span", "status"));
    marketsDot = live.appendChild(el("i", "status-dot"));
    marketsAge = live.appendChild(el("span"));
    page.classList.add("markets");
    head.appendChild(acts);
    marketsBar = page.appendChild(el("div", "news-pills"));
    marketsEl = page.appendChild(el("div", "markets"));
    drawMarkets();
    fetchMarkets(true);
    marketsTimer = setInterval(fetchMarkets, 1000);
  }

  /* ---- basis: the crossing log ---- */
  var basisEl = null;
  var basisTimer = null;
  var basisRequest = null;
  var basisData = null;
  var basisOk = true;
  var basisDot = null;
  var basisAge = null;
  var basisPaint = null;

  function eventKey(e) { return e.sym + ":" + e.open; }

  function eventClock(ms) {
    return hoverTimeFmt.format(new Date(ms)) + "." + Math.floor(ms % 1000 / 100);
  }

  function eventTexts(e) {
    var dur = e.live ? (Date.now() - e.open) / 1000 : e.dur;
    return [eventClock(e.open),
      "+" + e.net.toFixed(3) + "%",
      "+" + e.peak.toFixed(3) + "%",
      (e.pbas > 0 ? "+" : "") + e.pbas.toFixed(3) + "%",
      e.upk === undefined ? "—" : "$" + (e.upk >= 1000 ? (e.upk / 1000).toFixed(1) + "K" : String(e.upk)),
      (dur >= 60 ? Math.floor(dur / 60) + "m " + Math.round(dur % 60) + "s"
        : dur >= 1 ? dur.toFixed(1) + "s" : Math.round(dur * 1000) + "ms"),
      e.live ? "live" : (e.why || "ended") + " " + eventClock(e.close)];
  }

  function eventRow(e) {
    var row = el("div", "mkt-row");
    row.dataset.key = eventKey(e);
    row.appendChild(el("span", "mkt-rank", ""));
    var tok = el("span", "news-source");
    tok.appendChild(tokenBadge(tokenName(e)));
    var col = tok.appendChild(el("span", "news-source-col"));
    col.appendChild(el("span", "news-source-name", tokenName(e)));
    col.appendChild(el("span", "news-domain", e.dir === "+" ? "futures above spot" : "spot above futures · pool open"));
    row.appendChild(tok);
    row.texts = [];
    for (var ci = 0; ci < 7; ci += 1) {
      var cell = el("span", "mkt-num" + (ci === 2 || ci === 4 ? " up" : ""));
      var tn = document.createTextNode("");
      cell.appendChild(tn);
      row.appendChild(cell);
      row.texts.push(tn);
    }
    row.statusCell = row.children[row.children.length - 1];
    return row;
  }

  function drawBasisStatus() {
    if (!basisDot) { return; }
    var stale = !basisData || Date.now() - basisData.at > 10000;
    var blind = basisData && basisData.ready === false;
    basisDot.className = "status-dot " + (!basisOk ? "dead" : !basisData ? "" : stale || blind ? "stale" : "live");
    basisAge.textContent = !basisOk ? "Offline" : !basisData ? "" : stale ? "Stale" : blind ? "Feed down" : "Live";
  }

  function drawBasis() {
    if (!basisEl) { return; }
    basisEl.textContent = "";
    basisEl.appendChild(el("div", "basis-cap",
      "Crossings · net = basis − spread − taker fees ("
      + (basisData && basisData.fees ? basisData.fees.toFixed(2) : "0.30")
      + "%, ETH-reference), before funding and borrow carry · negative side only when pool > 0 · the log stays"));
    var list = el("div", "news-list");
    var headRow = el("div", "mkt-row news-head-row");
    headRow.appendChild(el("span", "mkt-rank", "#"));
    ["Token", "When", "Cross net", "Net peak", "Basis @ pk", "Size @ pk $", "Lived", "State"].forEach(function (c) {
      headRow.appendChild(el("span", "mkt-head", c));
    });
    list.appendChild(headRow);
    var body = list.appendChild(el("div"));
    var note = list.appendChild(el("div", "news-empty",
      "No crossing recorded yet."));
    note.hidden = false;
    basisPaint = { body: body, note: note, rows: {} };
    basisEl.appendChild(list);
    if (basisData) { paintBasis(); }
    drawBasisStatus();
  }

  function paintBasis() {
    if (!basisEl || !basisData) { return; }
    if (!basisPaint) { drawBasis(); return; }
    var events = (basisData.events || []).slice(0, 300);
    var body = basisPaint.body;
    var first = {};
    Array.prototype.forEach.call(body.children, function (n) {
      first[n.dataset.key] = n.getBoundingClientRect().top;
    });
    var keep = {};
    events.forEach(function (e, i) {
      var key = eventKey(e);
      keep[key] = true;
      var row = basisPaint.rows[key];
      if (!row) {
        row = eventRow(e);
        basisPaint.rows[key] = row;
      }
      row.firstChild.textContent = String(i + 1);
      eventTexts(e).forEach(function (t, ci) {
        if (row.texts[ci].nodeValue !== t) { row.texts[ci].nodeValue = t; }
      });
      var cls = "mkt-num" + (e.live ? " up" : "");
      if (row.statusCell.className !== cls) { row.statusCell.className = cls; }
      if (body.children[i] !== row) { body.insertBefore(row, body.children[i] || null); }
    });
    Object.keys(basisPaint.rows).forEach(function (key) {
      if (!keep[key]) {
        basisPaint.rows[key].remove();
        delete basisPaint.rows[key];
      }
    });
    Array.prototype.forEach.call(body.children, function (n) {
      var was = first[n.dataset.key];
      if (was === undefined) {
        n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });
        return;
      }
      var d = was - n.getBoundingClientRect().top;
      if (d) { n.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 260, easing: "ease" }); }
    });
    basisPaint.note.hidden = events.length > 0;
    basisPaint.note.textContent = basisData.ready === false
      ? "No crossing recorded — feed connecting."
      : "No crossing recorded yet.";
    drawBasisStatus();
  }

  function fetchBasis(force) {
    if (!basisEl || basisRequest) { return; }
    if (force !== true && document.hidden) { return; }
    var controller = new AbortController();
    var request = { controller: controller, timeout: setTimeout(function () { controller.abort(); }, 12000) };
    basisRequest = request;
    fetch("/events.json", { signal: controller.signal, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) {
        if (r.status === 401) { location.reload(); }
        if (!r.ok) { throw new Error(r.status); }
        return r.json();
      }).then(function (d) {
        if (basisRequest !== request) { return; }
        clearTimeout(request.timeout);
        basisRequest = null;
        if (!basisEl) { return; }
        basisOk = true;
        basisData = d;
        paintBasis();
      }).catch(function () {
        if (basisRequest !== request) { return; }
        clearTimeout(request.timeout);
        basisRequest = null;
        if (!basisEl) { return; }
        basisOk = false;
        drawBasisStatus();
      });
  }

  function buildBasis(page, head) {
    page.classList.add("basis");
    var acts = el("div", "set-actions news-acts");
    acts.appendChild(refreshButton(function () { fetchBasis(true); }));
    var live = acts.appendChild(el("span", "status"));
    basisDot = live.appendChild(el("i", "status-dot"));
    basisAge = live.appendChild(el("span"));
    head.appendChild(acts);
    basisEl = page.appendChild(el("div", "basis-lists"));
    drawBasis();
    fetchBasis(true);
    basisTimer = setInterval(fetchBasis, 1000);
  }

  /* ---- network: the probe's one file, one graph at a time ---- */
  var netData = null;
  var netOk = true;
  var netEl = null;
  var netDot = null;
  var netSync = null;
  var logsSync = null;
  var netAge = null;
  var netTimer = null;
  var netResize = null;
  var netPlot = null;
  var netMap = null;
  var netMapScroll = 0;
  var netHoverAt = null;
  var netPlace = null;
  var browserAt = 0;
  var netRequest = null;
  var NET_VIEWS = [
    { key: "trade", label: "Trade RTT", series: ["spot", "futures", "clock"] },
    { key: "trade_path", label: "Trade stages", series: ["trade_dns", "trade_tcp", "trade_tls", "trade_server"] },
    { key: "site", label: "Website", series: ["browser", "cf_rtt", "origin"] },
    { key: "tunnel", label: "Tunnel health", series: ["cf_connections", "cf_lost", "cf_errors"] },
    { key: "news_loop", label: "News runner", series: ["news_interval", "news_duration", "news_p95"] },
    { key: "news_sources", label: "News sources", series: ["news_live", "news_delayed", "news_failed"] },
    { key: "traffic", label: "Traffic", series: ["host_received", "host_sent", "cf_received", "cf_sent"] }
  ];
  var netView = { tab: "trade", range: 1, on: true };
  var browserNet = {};
  try { netView = JSON.parse(localStorage.getItem("quant.net")) || netView; } catch (e) { /* private mode */ }
  if ([1, 6, 24].indexOf(netView.range) === -1) { netView.range = 1; }
  netView.on = netView.on !== false;

  function saveNet() {
    try { localStorage.setItem("quant.net", JSON.stringify(netView)); } catch (e) { /* private mode */ }
  }

  function browserSeries(data, value, down) {
    if (!data || !data.t.length) { return; }
    browserAt = Date.now();
    var stamp = Math.floor(browserAt / 1000);
    var sample = browserNet[stamp] || { value: null, event: 0 };
    sample.value = down ? null : value;
    if (down) { sample.event = 1; }
    browserNet[stamp] = sample;
    Object.keys(browserNet).forEach(function (key) {
      if (+key < data.t[0]) { delete browserNet[key]; }
    });
    var before = data.t.slice();
    if (!data.series.browser) { data.probeAt = before[before.length - 1]; }
    var times = before.concat(Object.keys(browserNet).map(Number)).sort(function (a, b) { return a - b; })
      .filter(function (time, index, all) { return !index || time !== all[index - 1]; });
    Object.keys(data.series).forEach(function (key) {
      if (key === "browser") { return; }
      var series = data.series[key];
      var values = {};
      var events = {};
      before.forEach(function (time, index) {
        if (series.values[index] !== undefined) { values[time] = series.values[index]; }
        if (series.events && series.events[index]) { events[time] = series.events[index]; }
      });
      series.values = times.map(function (time) {
        return Object.prototype.hasOwnProperty.call(values, time) ? values[time] : false;
      });
      if (series.events) {
        series.events = times.map(function (time) { return events[time] || 0; });
      }
    });
    data.t = times;
    data.series.browser = {
      label: "net.json fetch", unit: "ms", note: "download + JSON parse in this browser",
      since: +Object.keys(browserNet)[0],
      values: times.map(function (time) { return browserNet[time] ? browserNet[time].value : false; }),
      events: times.map(function (time) { return browserNet[time] ? browserNet[time].event : 0; }),
      details: Object.keys(browserNet).reduce(function (all, time) {
        if (browserNet[time].event) { all[time] = "request failed"; }
        return all;
      }, {})
    };
  }

  function fetchNet(force) {
    if (!netEl || netRequest) { return; }
    if (force !== true && (!netView.on || document.hidden)) { return; }
    var controller = new AbortController();
    var request = { controller: controller, timeout: null };
    request.timeout = setTimeout(function () { controller.abort(); }, 12000);
    netRequest = request;
    var started = performance.now();
    fetch("/net.json", { cache: "no-store", signal: controller.signal,
      headers: { "X-Requested-With": "XMLHttpRequest" } }).then(function (r) {
      if (r.status === 401) { location.reload(); }
      if (!r.ok) { throw new Error(r.status); }
      return r.json();
    }).then(function (d) {
      if (netRequest !== request || !netEl) { return; }
      clearTimeout(request.timeout);
      netRequest = null;
      browserSeries(d, Math.round((performance.now() - started) * 10) / 10, false);
      var same = netOk && netData && netData.at === d.at;
      netOk = true;
      netData = d;
      if (same && netPlot) { drawStatus(); graph(netSeries()); drawConnectionMap(); } else { drawNet(); }
    }).catch(function () {
      if (netRequest !== request || !netEl) { return; }
      clearTimeout(request.timeout);
      netRequest = null;
      netOk = false;
      browserSeries(netData, null, true);
      if (netData && netPlot) { drawStatus(); graph(netSeries()); drawConnectionMap(); } else { drawNet(); }
    });
  }

  function reading(v, unit) {
    if (v === false || v === undefined) { return "no sample"; }
    if (v === null) { return "down"; }
    if (!unit) { return String(v); }
    if (unit === "s") { return v < 300 ? v + " s" : v < 7200 ? (v / 60).toFixed(1) + " m" : (v / 3600).toFixed(1) + " h"; }
    if (unit === "ms") { return v < 1000 ? v + " ms" : (v / 1000).toFixed(1) + " s"; }
    return v + " " + unit;
  }

  function clock(t) {
    var d = new Date(t * 1000);
    return (netView.range === 24 ? dayFmt.format(d) + " " : "") + hoverTimeFmt.format(d);
  }

  function drawStatus() {
    if (!netEl) { return false; }
    netEl.classList.toggle("net-off", !netView.on);
    if (!netView.on) {
      netDot.className = "status-dot";
      netAge.textContent = "Off";
      return true;
    }
    var age = netData ? Math.round((Date.now() - netData.at) / 1000) : 0;
    var stale = !netOk || !netData || age > netData.every * 3;
    netDot.className = "status-dot " + (!netOk ? "dead" : !netData ? "" : stale ? "stale" : "live");
    netAge.textContent = !netOk ? "Offline" : !netData ? "" : stale ? "Stale" : "Live";
    return stale;
  }

  function drawNet() {
    if (!netEl) { return; }
    drawStatus();
    var oldStage = netMap && netMap.querySelector(".net-map-stage");
    if (oldStage) { netMapScroll = oldStage.scrollLeft; }
    netPlace = null;
    netHoverAt = null;
    netEl.textContent = "";
    netPlot = null;
    netMap = null;
    if (!netData) {
      netEl.appendChild(el("div", "page-sub", "No samples yet."));
      netMap = netEl.appendChild(el("section", "net-map"));
      drawConnectionMap();
      return;
    }
    var views = NET_VIEWS.filter(function (view) {
      var keys = view.series || [view.key];
      return keys.every(function (key) { return netData.series[key]; });
    });
    if (!views.length) {
      netEl.appendChild(el("div", "page-sub", "No complete metric groups yet."));
      netMap = netEl.appendChild(el("section", "net-map"));
      drawConnectionMap();
      return;
    }
    if (!views.some(function (view) { return view.key === netView.tab; })) { netView.tab = views[0].key; }
    var pills = netEl.appendChild(el("div", "news-pills"));
    pills.setAttribute("role", "group");
    pills.setAttribute("aria-label", "Network metric");
    views.forEach(function (view) {
      var pill = el("button", "news-pill" + (view.key === netView.tab ? " on" : ""));
      pill.appendChild(view.key === "site" ? logsBadge("ui")
        : view.key === "tunnel" ? logsBadge("tunnel")
          : view.key === "news_loop" ? logsBadge("news")
            : icon({ trade: "change", trade_path: "both", news_sources: "breadth", traffic: "spread" }[view.key] || "change"));
      pill.appendChild(document.createTextNode(view.label));
      pill.setAttribute("aria-pressed", view.key === netView.tab ? "true" : "false");
      pill.addEventListener("click", function () { netView.tab = view.key; netView.pick = null; saveNet(); drawNet(); });
      pills.appendChild(pill);
    });
    var seg = el("div", "net-range");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Network history range");
    [[1, "1H"], [6, "6H"], [24, "24H"]].forEach(function (o) {
      var b = el("button", "net-range-btn" + (netView.range === o[0] ? " on" : ""), o[1]);
      b.setAttribute("aria-pressed", netView.range === o[0] ? "true" : "false");
      b.addEventListener("click", function () { netView.range = o[0]; saveNet(); drawNet(); });
      seg.appendChild(b);
    });
    pills.appendChild(seg);
    netPlot = netEl.appendChild(el("div", "net-plot-stage"));
    netPlot.addEventListener("mousemove", function (ev) {
      netHoverAt = { x: ev.clientX, y: ev.clientY };
      if (netPlace) { netPlace(); }
    });
    netPlot.addEventListener("mouseleave", function () {
      netHoverAt = null;
      if (netPlace) { netPlace(); }
    });
    graph(netSeries());
    netMap = netEl.appendChild(el("section", "net-map"));
    drawConnectionMap();
  }

  function netSeries() {
    if (!netData) { return []; }
    var view = NET_VIEWS.filter(function (item) { return item.key === netView.tab; })[0];
    var keys = view && view.series ? view.series : [netView.tab];
    if (netView.pick && keys.indexOf(netView.pick) !== -1) { keys = [netView.pick]; }
    return keys.map(function (key) { return netData.series[key]; }).filter(Boolean);
  }

  function niceCeil(v) {
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 5, 10].filter(function (u) { return u * pow >= v - 1e-9; })[0] * pow;
  }

  function flow(run) {
    if (run.length < 3) {
      return run.map(function (q, i) { return (i ? "L" : "M") + q.x.toFixed(1) + "," + q.y.toFixed(1); }).join("");
    }
    var m = [];
    var i;
    for (i = 0; i < run.length - 1; i++) {
      m.push((run[i + 1].y - run[i].y) / Math.max(run[i + 1].x - run[i].x, 1e-6));
    }
    var k = [m[0]];
    for (i = 1; i < run.length - 1; i++) {
      k.push(m[i - 1] * m[i] <= 0 ? 0 : 2 * m[i - 1] * m[i] / (m[i - 1] + m[i]));
    }
    k.push(m[m.length - 1]);
    var d = "M" + run[0].x.toFixed(1) + "," + run[0].y.toFixed(1);
    for (i = 0; i < run.length - 1; i++) {
      var dx = (run[i + 1].x - run[i].x) / 3;
      d += "C" + (run[i].x + dx).toFixed(1) + "," + (run[i].y + k[i] * dx).toFixed(1)
        + " " + (run[i + 1].x - dx).toFixed(1) + "," + (run[i + 1].y - k[i + 1] * dx).toFixed(1)
        + " " + run[i + 1].x.toFixed(1) + "," + run[i + 1].y.toFixed(1);
    }
    return d;
  }

  function graph(series) {
    if (!netEl || !netPlot) { return; }
    netPlot.textContent = "";
    if (!series.length) { return; }
    var view = NET_VIEWS.filter(function (item) { return item.key === netView.tab; })[0];
    var keys = view && view.series ? view.series : [netView.tab];
    var tabShift = Math.max(NET_VIEWS.indexOf(view), 0);
    var palette = ["#3b82f6", "#2ebd85", "#8b5cf6", "#d9a52b", "#22b8cf", "#ec4899"];
    var tabSeries = keys.map(function (key) { return netData.series[key]; });
    var chips = netPlot.appendChild(el("div", "net-legend" + (netView.pick ? " picked" : "")));
    tabSeries.forEach(function (s, index) {
      var chip = el("button", "net-chip" + (netView.pick === keys[index] ? " on" : ""));
      var dot = el("span", "net-chip-dot");
      dot.style.background = palette[(index + tabShift) % palette.length];
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(s.label));
      chip.addEventListener("click", function () {
        netView.pick = netView.pick === keys[index] ? null : keys[index];
        saveNet();
        graph(netSeries());
      });
      chips.appendChild(chip);
    });
    var hours = netView.range;
    var now = Date.now() / 1000;
    var W = Math.max(netPlot.clientWidth, 860);
    var H = 380;
    var gutter = 44, right = 0;
    var plotW = Math.max(W - gutter - right, 1);
    var top = 38, axisH = 24;
    var plotH = H - top - axisH;
    var base = top + plotH;
    var major = hours === 1 ? 300 : hours === 6 ? 1800 : 7200;
    while (hours * 3600 / major > plotW / 62) { major *= 2; }
    var from = now - hours * 3600;
    var t = netData.t;
    var first = t.length;
    for (var i = 0; i < t.length; i++) { if (t[i] >= from) { first = i; break; } }
    var sampled = false;
    var failed = false;
    var hiPos = 0;
    var loPos = Infinity;
    series.forEach(function (s) {
      for (var vi = first; vi < t.length; vi++) {
        if (!s.since || t[vi] >= s.since) {
          var sv = s.values[vi];
          if (typeof sv === "number") {
            sampled = true;
            if (sv > hiPos) { hiPos = sv; }
            if (sv > 0 && sv < loPos) { loPos = sv; }
          } else if (sv === null) { failed = true; }
        }
      }
    });
    if (!sampled && !failed) {
      netPlot.appendChild(el("div", "page-sub", "No samples in this range."));
      netPlace = null;
      return;
    }
    var high = niceCeil(hiPos > 0 ? hiPos : 1);
    var low = Math.pow(10, Math.floor(Math.log10(hiPos > 0 ? loPos : high)));
    while (high / low < 100) { low = low / 10; }
    var marks = [];
    for (var dec = low; dec <= high * 1.0001; dec *= 10) { marks.push(dec); }
    function x(ts) { return gutter + (ts - from) / (hours * 3600) * plotW; }
    var logLow = Math.log10(low);
    var spread = Math.log10(high) - logLow;
    var band = plotH / (spread + 1);
    function y(v) {
      if (v <= 0) { return base; }
      return base - band - (Math.log10(v) - logLow) / spread * (plotH - band);
    }
    var chart = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H,
      "class": "net-graph", role: "img", "aria-label": "Network history graph" });
    chart.appendChild(svg("title", {})).textContent = "Network history · " + hours + " hour" + (hours === 1 ? "" : "s");
    chart.appendChild(svg("desc", {})).textContent = "Time series for "
      + series.map(function (item) { return item.label; }).join(", ") + ". Failures are marked on the time axis.";
    var defs = chart.appendChild(svg("defs", {}));
    var colors = series.map(function (s) {
      return palette[(Math.max(tabSeries.indexOf(s), 0) + tabShift) % palette.length];
    });
    var gradients = series.map(function (_, index) {
      var id = "netfade-" + Date.now() + "-" + index;
      var grad = defs.appendChild(svg("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }));
      grad.appendChild(svg("stop", { offset: 0, "stop-color": colors[index],
        "stop-opacity": series.length === 1 ? 0.38 : 0.12 }));
      grad.appendChild(svg("stop", { offset: 1, "stop-color": colors[index], "stop-opacity": 0 }));
      return id;
    });
    chart.appendChild(svg("text", { x: 0, y: base + 4 })).textContent = "0";
    marks.forEach(function (gv) {
      if (y(gv) > top + 6) {
        chart.appendChild(svg("line", { x1: gutter, y1: y(gv), x2: W, y2: y(gv), "class": "grid" }));
      }
      var power = Math.round(Math.log10(gv));
      chart.appendChild(svg("text", { x: 0, y: y(gv) + 4 })).textContent
        = power >= 0 ? String(Math.pow(10, power)) : Math.pow(10, power).toFixed(-power);
    });
    for (var k = hours * 3600; k >= 0; k -= major) {
      var tx = gutter + (1 - k / (hours * 3600)) * plotW;
      if (tx >= gutter + 10 && tx <= W - 10) {
        chart.appendChild(svg("line", { x1: tx, y1: top, x2: tx, y2: base, "class": "grid" }));
      }
      if (k === 0) {
        chart.appendChild(svg("text", { x: W - 2, y: H - 6, "text-anchor": "end" })).textContent = "now";
      } else if (tx >= gutter + 30 && tx <= W - 44) {
        chart.appendChild(svg("text", { x: tx, y: H - 6, "text-anchor": "middle" })).textContent
          = k < 5400 ? "-" + Math.round(k / 60) + "m"
            : "-" + String(Math.round(k / 1800) / 2).replace(/\.0$/, "") + "h";
      }
    }
    var span = Math.max(netData.every, Math.ceil(hours * 3600 * 2 / plotW / netData.every) * netData.every);
    var drawn = [];
    var alerts = {};
    series.forEach(function (s, seriesIndex) {
      var pts = [];
      for (var pi = first; pi < t.length; pi++) {
        if (s.since && t[pi] < s.since) { continue; }
        var raw = s.values[pi];
        if (raw === undefined || raw === false) { continue; }
        var slotIndex = Math.floor((t[pi] - from) / span);
        var point = pts[slotIndex] || (pts[slotIndex] = { t: t[pi], v: null });
        if (raw !== null && (point.v === null || raw > point.v)) { point.v = raw; point.t = t[pi]; }
        if (raw === null || s.events && s.events[pi]) {
          alerts[slotIndex] = Math.min(alerts[slotIndex] || t[pi], t[pi]);
        }
      }
      var runs = [], segPts = [];
      for (var slot = 0; slot < pts.length; slot++) {
        var p2 = pts[slot];
        if (!p2) {
          if (segPts.length) { runs.push(segPts); segPts = []; }
          continue;
        }
        if (p2.v === null) {
          if (segPts.length) { runs.push(segPts); segPts = []; }
          continue;
        }
        segPts.push({ x: x(p2.t), y: y(p2.v) });
      }
      if (segPts.length) { runs.push(segPts); }
      runs.forEach(function (run) {
        if (run.length === 1) {
          chart.appendChild(svg("circle", { cx: run[0].x, cy: run[0].y, r: 2, "class": "dot",
            style: "--net-line:" + colors[seriesIndex] }));
          return;
        }
        var d = flow(run);
        chart.appendChild(svg("path", { fill: "url(#" + gradients[seriesIndex] + ")",
          d: d + "L" + run[run.length - 1].x.toFixed(1) + "," + base + "L" + run[0].x.toFixed(1) + "," + base + "Z" }));
        chart.appendChild(svg("path", { d: d, "class": "line", style: "--net-line:" + colors[seriesIndex] }));
      });
      drawn.push({ series: s, color: colors[seriesIndex] });
    });
    Object.keys(alerts).forEach(function (slot) {
      var alert = alerts[slot];
      chart.appendChild(svg("line", { x1: x(alert), y1: base - 12, x2: x(alert), y2: base, "class": "down" }));
    });
    var mark = chart.appendChild(svg("line", { y1: top, y2: base, "class": "hover", visibility: "hidden" }));
    var snaps = drawn.map(function (item) {
      return chart.appendChild(svg("circle", { r: 4, "class": "dot ring", visibility: "hidden",
        style: "--net-line:" + item.color }));
    });
    var chip = chart.appendChild(svg("g", { "class": "tag", visibility: "hidden" }));
    netPlace = function () {
      var box = netHoverAt && first < t.length ? chart.getBoundingClientRect() : null;
      var inside = box && netHoverAt.x >= box.left + gutter / W * box.width
        && netHoverAt.x <= box.left + (W - right) / W * box.width
        && netHoverAt.y >= box.top && netHoverAt.y <= box.top + base / H * box.height;
      if (!inside) {
        mark.setAttribute("visibility", "hidden");
        snaps.forEach(function (snap) { snap.setAttribute("visibility", "hidden"); });
        chip.setAttribute("visibility", "hidden");
        return;
      }
      var ts = from + ((netHoverAt.x - box.left) / box.width * W - gutter) / plotW * hours * 3600;
      var chosen = first;
      for (var j = first + 1; j < t.length; j++) {
        if (Math.abs(t[j] - ts) < Math.abs(t[chosen] - ts)) { chosen = j; }
      }
      var px = x(t[chosen]);
      mark.setAttribute("x1", px);
      mark.setAttribute("x2", px);
      mark.setAttribute("visibility", "visible");
      chip.textContent = "";
      var back = chip.appendChild(svg("rect", { y: top + 6, rx: 6 }));
      var rows = [{ dot: null, label: clock(t[chosen]), value: "" }];
      drawn.forEach(function (item, index) {
        var raw = item.series.values[chosen];
        var off = item.series.since && t[chosen] < item.series.since || raw === undefined || raw === false;
        snaps[index].setAttribute("visibility", off || raw === null ? "hidden" : "visible");
        if (!off && raw !== null) {
          snaps[index].setAttribute("cx", px);
          snaps[index].setAttribute("cy", Math.max(y(raw), top + 2));
        }
        rows.push({ dot: item.color, label: item.series.label, value: reading(raw, item.series.unit) });
        var event = item.series.events && item.series.events[chosen] || 0;
        var detail = item.series.details && item.series.details[t[chosen]];
        if (event) {
          rows.push({ dot: null, label: (event === 1 ? "1 issue" : event + " issues")
            + (detail ? " · " + detail.slice(0, 60) : ""), value: "" });
        }
      });
      var rowH = 18, padX = 10, padY = 9;
      var made = rows.map(function (row, index) {
        var ty = top + 15 + padY + rowH * index;
        var square = row.dot ? chip.appendChild(svg("rect", { y: ty - 8, width: 8, height: 8, rx: 2,
          style: "fill:" + row.dot })) : null;
        var name = chip.appendChild(svg("text", { y: ty }));
        name.textContent = row.label;
        var value = null;
        if (row.value) {
          value = chip.appendChild(svg("text", { y: ty, "text-anchor": "end" }));
          value.textContent = row.value;
        }
        return { square: square, name: name, value: value };
      });
      var nameW = 0, valueW = 0;
      made.forEach(function (m, index) {
        nameW = Math.max(nameW, (rows[index].dot ? 14 : 0) + m.name.getBBox().width);
        if (m.value) { valueW = Math.max(valueW, m.value.getBBox().width); }
      });
      var boxW = padX * 2 + nameW + (valueW ? 24 + valueW : 0);
      var boxX = px + 14;
      if (boxX + boxW > W - right) { boxX = px - 14 - boxW; }
      if (boxX < gutter) { boxX = gutter; }
      back.setAttribute("x", boxX);
      back.setAttribute("width", boxW);
      back.setAttribute("height", padY * 2 + rowH * rows.length - 4);
      made.forEach(function (m, index) {
        if (m.square) { m.square.setAttribute("x", boxX + padX); }
        m.name.setAttribute("x", boxX + padX + (rows[index].dot ? 14 : 0));
        if (m.value) { m.value.setAttribute("x", boxX + boxW - padX); }
      });
      chip.setAttribute("visibility", "visible");
    };
    netPlot.appendChild(chart);
    netPlace();
  }

  function drawConnectionMap() {
    if (!netMap) { return; }
    var hasSnapshot = netData && netData.t && netData.t.length;
    var snapshot = hasSnapshot ? netData : { at: 0, every: false, probeAt: false, series: {}, t: [] };
    var stage = netMap.querySelector(".net-map-stage");
    if (stage) { netMapScroll = stage.scrollLeft; }
    Array.prototype.slice.call(netMap.children).forEach(function (child) {
      if (child !== stage) { netMap.removeChild(child); }
    });
    var stale = !netOk || !hasSnapshot || Date.now() - snapshot.at > snapshot.every * 3000;

    function metric(key) {
      var series = snapshot.series[key];
      var value = false;
      var sampleIndex = -1;
      if (series) {
        if (key === "browser") {
          for (var index = series.values.length - 1; index >= 0; index--) {
            if (series.values[index] !== false && series.values[index] !== undefined) {
              value = series.values[index];
              sampleIndex = index;
              break;
            }
          }
        } else {
          var probeIndex = snapshot.t.indexOf(snapshot.probeAt);
          if (probeIndex >= 0) {
            value = series.values[probeIndex];
            sampleIndex = probeIndex;
          }
        }
      }
      if (key === "browser") {
        if (!netOk) { value = null; }
        else if (!browserAt || Date.now() - browserAt > 15000) { value = false; }
      } else if (stale) {
        value = false;
      }
      return {
        value: value,
        unit: series ? series.unit : "",
        label: series ? series.label : key,
        note: series ? series.note || "" : "",
        event: series && series.events && sampleIndex >= 0 ? series.events[sampleIndex] || 0 : 0
      };
    }

    function health(metrics, warning) {
      if (metrics.some(function (item) { return item.value === null; })) { return "down"; }
      if (metrics.some(function (item) { return item.value === false || item.value === undefined; })) {
        return "unmeasured";
      }
      return warning || metrics.some(function (item) { return item.event; }) ? "warn" : "live";
    }

    function worst() {
      var rank = { live: 0, idle: 1, unmeasured: 1, warn: 2, down: 3 };
      var answer = "live";
      for (var i = 0; i < arguments.length; i++) {
        if (rank[arguments[i]] > rank[answer]) { answer = arguments[i]; }
      }
      return answer;
    }

    function mapReading(value, unit) {
      var text = reading(value, unit);
      if (text === "no sample") { return "No Sample"; }
      if (text === "down") { return "Down"; }
      return text;
    }

    function shown(item, unit) {
      return mapReading(item.value, unit === undefined ? item.unit : unit);
    }

    function stageSource(item) {
      if (item.note === "spot") { return "Spot"; }
      if (item.note === "futures") { return "Futures"; }
      return item.event ? "One Host Failed" : "Spot / Futures";
    }

    function stageValue(item) {
      var source = stageSource(item);
      return shown(item, "ms") + (typeof item.value === "number" &&
        (source === "Spot" || source === "Futures") ? " · " + source : "");
    }

    function amount(item, singular, plural) {
      return typeof item.value === "number"
        ? item.value + " " + (item.value === 1 ? singular : plural)
        : mapReading(item.value);
    }

    var browser = metric("browser");
    var tunnelRtt = metric("cf_rtt");
    var connections = metric("cf_connections");
    var lost = metric("cf_lost");
    var errors = metric("cf_errors");
    var origin = metric("origin");
    var hostSent = metric("host_sent");
    var hostReceived = metric("host_received");
    var spot = metric("spot");
    var futures = metric("futures");
    var clockOffset = metric("clock");
    var dns = metric("trade_dns");
    var tcp = metric("trade_tcp");
    var tls = metric("trade_tls");
    var server = metric("trade_server");
    var newsLive = metric("news_live");
    var newsDelayed = metric("news_delayed");
    var newsFailed = metric("news_failed");
    var newsDuration = metric("news_duration");
    var newsInterval = metric("news_interval");
    var newsP95 = metric("news_p95");

    var browserState = health([browser]);
    var tunnelState = health([tunnelRtt, connections, lost, errors], lost.value > 0 || errors.value > 0);
    if (typeof connections.value === "number" && connections.value <= 0) { tunnelState = "down"; }
    var originState = health([origin]);
    var spotState = health([spot]);
    var futuresState = health([futures]);
    var dnsState = health([dns]);
    var tcpState = health([tcp]);
    var tlsState = health([tls]);
    var serverState = health([server]);
    var stageState = worst(dnsState, tcpState, tlsState, serverState);
    var spotPathState = spotState;
    var tradeState = worst(spotState, futuresState, stageState);
    if (typeof connections.value === "number" && connections.value > 0 && connections.value < 4) {
      tunnelState = "warn";
    }
    var newsRunnerState = health([newsInterval, newsDuration, newsP95]);
    var newsSourceState = health([newsLive, newsDelayed, newsFailed],
      newsDelayed.value > 0 || newsFailed.value > 0);
    if (typeof newsLive.value === "number" && newsLive.value <= 0) { newsSourceState = "down"; }
    if (!newsOn || newsLive.note === "off") {
      newsRunnerState = "idle";
      newsSourceState = "idle";
    }
    var newsState = worst(newsRunnerState, newsSourceState);
    var coreState = worst(originState, tradeState, newsState);

    var clientWidth = Math.max(netMap.clientWidth, 320);
    var W = Math.max(2200, Math.min(clientWidth, 2860));
    var H = 693;
    if (!stage) {
      stage = netMap.appendChild(el("div", "net-map-stage"));
      stage.addEventListener("scroll", function () { netMapScroll = stage.scrollLeft; });
    }
    var chart = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H,
      "class": "net-map-chart", role: "img", "aria-label": "Network paths" });
    chart.appendChild(svg("title", {})).textContent = "Network Paths";
    chart.appendChild(svg("desc", {})).textContent =
      "Website delivery is " + stateLabel(worst(browserState, tunnelState, originState))
      + ". Spot is " + stateLabel(spotPathState) + " at " + shown(spot, "ms")
      + ". Futures is " + stateLabel(futuresState) + " at " + shown(futures, "ms")
      + ". News collection is " + stateLabel(newsState) + ". Owner control paths are on demand.";

    var defs = chart.appendChild(svg("defs", {}));
    var arrow = defs.appendChild(svg("marker", { id: "netMapArrow", viewBox: "0 0 8 8",
      refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }));
    arrow.appendChild(svg("path", { d: "M0 0L8 4L0 8Z", "class": "net-map-route-arrow" }));

    function stateLabel(value) {
      if (value === "live") { return "Live"; }
      if (value === "warn") { return "Warning"; }
      if (value === "down") { return "Down"; }
      if (value === "unmeasured") { return "No Measurement"; }
      return "On Demand";
    }

    function attachTip(target, data) {
      if (!data) { return target; }
      target.setAttribute("data-tip", data.title || "Connection Detail");
      target.setAttribute("data-tip-title", data.title || "Connection Detail");
      target.setAttribute("data-tip-tone", data.state || "idle");
      target.setAttribute("data-tip-status", data.status || stateLabel(data.state));
      if (data.subtitle) { target.setAttribute("data-tip-subtitle", data.subtitle); }
      if (data.stats) { target.setAttribute("data-tip-stats", JSON.stringify(data.stats)); }
      if (data.detail) { target.setAttribute("data-tip-detail", data.detail); }
      return target;
    }

    function pathFrom(points) {
      return points.map(function (point, index) {
        return (index ? "L" : "M") + point[0] + " " + point[1];
      }).join("");
    }

    function route(def) {
      var group = chart.appendChild(svg("g", {
        "class": "net-map-route " + def.state,
        style: "--route-color:" + def.color
      }));
      attachTip(group, def.info);
      var paths = def.paths || [{ d: def.d, state: def.state }];
      paths.forEach(function (item) {
        var attributes = { d: item.d, "class": "net-map-route-line " + (item.state || def.state) };
        if (def.arrows === "both") { attributes["marker-start"] = "url(#netMapArrow)"; }
        if (def.arrows !== "none") { attributes["marker-end"] = "url(#netMapArrow)"; }
        group.appendChild(svg("path", attributes));
      });
      var motionPaths = def.motionPaths || [{ d: def.d, state: def.state }];
      motionPaths.forEach(function (motion, motionIndex) {
        var motionState = motion.state || def.state;
        if (motionState === "down" || motionState === "idle" || motionState === "unmeasured") {
          return;
        }
        var duration = def.duration || 12;
        var phase = (Date.now() / 1000 + (def.offset || 0)
          + motionIndex * duration / motionPaths.length) % duration;
        var pulse = group.appendChild(svg("g", {
          "class": "net-map-pulse " + motionState
        }));
        pulse.appendChild(svg("circle", {
          r: 5.2, "class": "net-map-pulse-core"
        }));
        pulse.appendChild(svg("animateMotion", {
          path: motion.d,
          dur: duration + "s",
          begin: "-" + phase.toFixed(3) + "s",
          repeatCount: "indefinite",
          calcMode: "linear"
        }));
      });
      group.appendChild(svg("path", { d: def.d, "class": "net-map-route-hit" }));
      if (def.label) {
        var label = group.appendChild(svg("text", {
          x: def.labelX, y: def.labelY, "class": "net-map-route-label",
          "text-anchor": def.anchor || "middle"
        }));
        label.textContent = def.label;
      }
      return group;
    }

    function addLogo(parent, kind, x, y) {
      var logo = parent.appendChild(svg("g", {
        "class": "net-map-logo " + kind, transform: "translate(" + x + " " + y + ")"
      }));
      function serviceIcon(id, stopA, stopB, glyph) {
        var grad = logo.appendChild(svg("linearGradient", { id: id, x1: "0%", y1: "100%", x2: "100%", y2: "0%" }));
        grad.appendChild(svg("stop", { "stop-color": stopA, offset: "0" }));
        grad.appendChild(svg("stop", { "stop-color": stopB, offset: "1" }));
        logo.appendChild(svg("rect", { width: 28, height: 28, rx: 6, fill: "url(#" + id + ")" }));
        logo.appendChild(svg("g", { transform: "scale(0.109375)" }))
          .appendChild(svg("path", { d: glyph, fill: "#fff" }));
      }
      if (kind === "browser") {
        var chrome = logo.appendChild(svg("g", { transform: "translate(1 1) scale(1.08)" }));
        chrome.appendChild(svg("path", { fill: "#ea4335",
          d: "M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0z" }));
        chrome.appendChild(svg("path", { fill: "#34a853",
          d: "M1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29z" }));
        chrome.appendChild(svg("path", { fill: "#fbbc05",
          d: "M15.273 7.636a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364z" }));
        chrome.appendChild(svg("circle", { cx: 12, cy: 12, r: 5.45, fill: "#fff" }));
        chrome.appendChild(svg("circle", { cx: 12, cy: 12, r: 4.36, fill: "#4285f4" }));
      } else if (kind === "cloudflare") {
        var cloudflare = logo.appendChild(svg("g", { transform: "translate(-31 3.8) scale(.55)" }));
        cloudflare.appendChild(svg("path", {
          d: "M88.1 24c.3-1 .2-2-.3-2.6-.5-.6-1.2-1-2.1-1.1l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.5-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3-1.1-5.1-5.7-8.9-11.1-8.9-5 0-9.3 3.2-10.8 7.7-1-.7-2.2-1.1-3.6-1-2.4.2-4.3 2.2-4.6 4.6-.1.6 0 1.2.1 1.8-3.9.1-7.1 3.3-7.1 7.3 0 .4 0 .7.1 1.1 0 .2.2.3.3.3h32.1c.2 0 .4-.1.4-.3l.3-1.1z",
          fill: "#f48120"
        }));
        cloudflare.appendChild(svg("path", {
          d: "M93.6 12.8h-.5c-.1 0-.2.1-.3.2l-.7 2.4c-.3 1-.2 2 .3 2.6.5.6 1.2 1 2.1 1.1l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.2.9c-.1.1 0 .3.2.3h13.2c.2 0 .3-.1.3-.3.2-.8.4-1.7.4-2.6 0-5.2-4.3-9.5-9.5-9.5",
          fill: "#faad3f"
        }));
      } else if (kind === "ec2") {
        var cube = logo.appendChild(svg("g", { transform: "translate(2.4 0.5) scale(.0873)" }));
        [["M42.754,244.495 L12.836,251.321 L12.836,57.565 L42.754,64.404 L42.754,244.495", "#F68536"],
          ["M80.082,255.931 L42.754,266.539 L42.754,42.612 L80.082,53.207 L80.082,255.931", "#F68536"],
          ["M127.966,267.681 L80.082,285.205 L80.082,23.946 L127.966,41.462 L127.966,267.681", "#F68536"],
          ["M256,245.079 L127.966,309.096 L127.966,0 L256,64.017 L256,245.079", "#F68536"],
          ["M102.444,12.763 L127.966,0 L127.966,309.096 L102.444,296.337 L102.444,12.763", "#9D5025"],
          ["M60.325,33.82 L80.082,23.942 L80.082,285.154 L60.325,275.276 L60.325,33.82", "#9D5025"],
          ["M27.016,50.477 L42.754,42.608 L42.754,266.488 L27.016,258.614 L27.016,50.477", "#9D5025"],
          ["M12.836,57.565 L0,63.983 L0,245.117 L12.836,251.531 L12.836,57.565", "#9D5025"]
        ].forEach(function (piece) { cube.appendChild(svg("path", { d: piece[0], fill: piece[1] })); });
      } else if (kind === "ssm") {
        serviceIcon("awsssmg", "#B0084D", "#FF4F8B", "M150.4,175.993789 L192,175.993789 L192,182.394744 L150.4,182.394744 L150.4,188.7957 L144,188.7957 L144,182.394744 L131.2,182.394744 L131.2,175.993789 L144,175.993789 L144,172.793311 L150.4,172.793311 L150.4,175.993789 Z M163.2,156.790922 L192,156.790922 L192,163.191878 L163.2,163.191878 L163.2,169.592833 L156.8,169.592833 L156.8,163.191878 L131.2,163.191878 L131.2,156.790922 L156.8,156.790922 L156.8,153.590444 L163.2,153.590444 L163.2,156.790922 Z M179.2,137.588056 L192,137.588056 L192,143.989011 L179.2,143.989011 L179.2,150.389967 L172.8,150.389967 L172.8,143.989011 L131.2,143.989011 L131.2,137.588056 L172.8,137.588056 L172.8,134.387578 L179.2,134.387578 L179.2,137.588056 Z M67.2,150.389967 L96,150.389967 L96,156.790922 L67.2,156.790922 C63.184,156.790922 58.8928,155.584342 55.7216,153.564841 C49.2576,149.471429 38.4,139.889199 38.4,121.732889 C38.4,99.7136016 53.328,91.6323952 62.016,88.7999722 L61.8432,85.8683347 C61.8368,67.7312272 73.8368,49.1332509 89.7472,42.421849 C108.3808,34.5006662 128.1152,38.4244522 142.544,52.919416 C147.0208,57.4032854 150.7072,62.8729018 153.5296,69.2194493 C159.1968,64.4987446 166.912,62.8825034 174.08,65.2348544 C183.1904,68.2241008 188.8608,76.6445578 189.5264,87.9806499 C198.608,90.1537744 217.6,97.6268899 217.6,122.020932 C217.6,122.933068 217.5648,123.813199 217.5296,124.654925 L211.1328,124.4853 C211.1648,123.630772 211.2,122.843454 211.2,122.020932 C211.2,100.472115 193.4176,95.0601069 185.7728,93.7351091 C184.9088,93.5846867 184.1472,93.0918131 183.6608,92.3653046 C183.1776,91.6451971 183.008,90.7618653 183.1872,89.9137386 C183.0944,80.3731142 179.0592,73.6041037 172.0832,71.3157622 C165.8336,69.257855 158.9664,71.5269936 154.9888,76.9422022 C154.2848,77.892744 153.1296,78.3888182 151.9424,78.2095914 C150.7712,78.0399661 149.792,77.2334458 149.3952,76.1164787 C146.7296,68.6177594 142.8992,62.3352214 138.0128,57.4416909 C125.4912,44.8606128 108.3744,41.4553046 92.2432,48.317129 C78.7776,53.9947763 68.2368,70.4068266 68.2368,85.6795066 L68.5536,90.9730966 C68.6432,92.5029251 67.6352,93.8823309 66.1472,94.2599875 C58.176,96.2890902 44.8,102.555626 44.8,121.732889 C44.8,136.067828 52.6016,144.014615 59.152,148.159234 C61.312,149.53864 64.3936,150.389967 67.2,150.389967 L67.2,150.389967 Z M211.2,167.416508 L205.5552,167.09326 C204.0416,167.013248 202.5984,168.056604 202.2528,169.586432 C201.1712,174.380748 199.2896,178.925427 196.6592,183.092449 C195.824,184.417446 196.0672,186.148905 197.2384,187.19226 L201.4528,190.949621 L190.9536,201.45359 L187.2064,197.251362 C186.1632,196.076787 184.4256,195.839952 183.1104,196.675276 C178.944,199.306069 174.3968,201.19115 169.5904,202.276112 C168.0672,202.621764 167.0112,204.020373 167.104,205.582206 L167.424,211.199044 L152.576,211.199044 L152.896,205.575805 C152.9888,204.013972 151.9328,202.615363 150.4096,202.269711 C145.616,201.18795 141.0688,199.299668 136.896,196.665675 C135.5744,195.82715 133.84,196.067186 132.8,197.241761 L129.0432,201.450389 L118.5472,190.949621 L122.7552,187.198661 C123.9232,186.155306 124.1664,184.423847 123.3312,183.10205 C120.704,178.935028 118.8224,174.390349 117.7408,169.586432 C117.3984,168.056604 115.8688,167.013248 114.4384,167.09326 L108.8,167.416508 L108.8,152.566292 L114.4576,152.88954 C115.9456,152.972752 117.4112,151.926196 117.76,150.399568 C118.8448,145.614854 120.7296,141.076576 123.36,136.912755 C124.1952,135.587757 123.9488,133.853098 122.784,132.812943 L118.5472,129.033179 L129.0464,118.532411 L132.8256,122.766643 C133.8688,123.931617 135.6032,124.171653 136.9184,123.339529 C141.0784,120.718337 145.616,118.839657 150.4096,117.757895 C151.9328,117.412244 152.9888,116.013635 152.896,114.451802 L152.576,108.783756 L167.424,108.783756 L167.104,114.458203 C167.0112,116.020036 168.0672,117.415444 169.5904,117.761096 C174.3744,118.846058 178.9088,120.724738 183.0752,123.34913 C184.3904,124.184455 186.128,123.941218 187.168,122.776244 L190.9536,118.532411 L201.4528,129.033179 L197.2256,132.803341 C196.0608,133.846697 195.8144,135.578156 196.6496,136.903153 C199.28,141.066975 201.1648,145.608453 202.2464,150.399568 C202.592,151.922996 204.0416,152.972752 205.5488,152.88954 L211.2,152.566292 L211.2,167.416508 Z M214.2176,145.982909 L207.8144,146.347763 C206.7744,142.683216 205.312,139.15949 203.4528,135.824592 L208.2432,131.551955 C208.8992,130.966267 209.2864,130.137343 209.312,129.254012 C209.3376,128.377081 208.9984,127.522553 208.3744,126.90166 L193.0848,111.609777 C192.464,110.985684 191.5776,110.627231 190.7328,110.675238 C189.8496,110.700842 189.0208,111.084899 188.4352,111.740997 L184.1472,116.548115 C180.816,114.691837 177.2992,113.23562 173.6416,112.192264 L174.0064,105.765705 C174.0576,104.885574 173.744,104.024645 173.136,103.384549 C172.5344,102.744454 171.6928,102.3828 170.8128,102.3828 L149.1872,102.3828 C148.3072,102.3828 147.4656,102.744454 146.864,103.384549 C146.256,104.024645 145.9424,104.885574 145.9936,105.765705 L146.3584,112.185863 C142.6944,113.226019 139.1744,114.685436 135.8464,116.538513 L131.5648,111.740997 C130.9792,111.084899 130.1504,110.700842 129.2672,110.675238 C128.3616,110.633632 127.536,110.985684 126.9152,111.609777 L111.6256,126.90166 C111.0016,127.522553 110.6624,128.377081 110.688,129.254012 C110.7136,130.134143 111.1008,130.966267 111.7568,131.551955 L116.5568,135.834194 C114.6976,139.169092 113.2352,142.686417 112.192,146.347763 L105.7824,145.9253 C104.9248,145.9253 104.0416,146.248548 103.4016,146.850238 C102.7616,147.455129 102.4,148.296854 102.4,149.176986 L102.4,170.805814 C102.4,171.685946 102.7616,172.527671 103.4016,173.132562 C104.0416,173.734252 104.928,174.047898 105.7824,173.999891 L112.1696,173.635037 C113.2096,177.309185 114.6688,180.836112 116.528,184.17421 L111.7568,188.427645 C111.1008,189.013332 110.7136,189.845457 110.688,190.725588 C110.6624,191.605719 111.0016,192.460247 111.6256,193.08114 L126.9152,208.373023 C127.536,208.997116 128.4416,209.339567 129.2672,209.310763 C130.1504,209.285159 130.9824,208.897901 131.5648,208.241803 L135.8208,203.46669 C139.1584,205.332569 142.688,206.798388 146.3552,207.841743 L145.9936,214.217095 C145.9424,215.094026 146.256,215.954955 146.864,216.598251 C147.4656,217.238346 148.3072,217.6 149.1872,217.6 L170.8128,217.6 C171.6928,217.6 172.5344,217.238346 173.1392,216.598251 C173.744,215.954955 174.0576,215.094026 174.0064,214.217095 L173.6448,207.848144 C177.3184,206.801588 180.848,205.33897 184.1856,203.476292 L188.4352,208.241803 C189.0176,208.897901 189.8496,209.285159 190.7328,209.310763 C191.5872,209.349168 192.464,208.997116 193.0848,208.373023 L208.3744,193.08114 C208.9984,192.460247 209.3376,191.605719 209.312,190.725588 C209.2864,189.845457 208.8992,189.013332 208.24,188.427645 L203.4624,184.167809 C205.3216,180.829711 206.7808,177.302784 207.824,173.635037 L214.2176,173.999891 C215.0816,174.047898 215.9584,173.734252 216.5984,173.132562 C217.2384,172.527671 217.6,171.685946 217.6,170.805814 L217.6,149.176986 C217.6,148.296854 217.2384,147.455129 216.5984,146.850238 C215.9584,146.248548 215.0848,145.9285 214.2176,145.982909 L214.2176,145.982909 Z");
      } else if (kind === "binance") {
        logo.appendChild(svg("g", { transform: "translate(1 1) scale(1.08)" }))
          .appendChild(svg("path", { fill: "#f0b90b",
            d: "M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z" }));
      } else if (kind === "news") {
        logo.appendChild(svg("circle", { cx: 14, cy: 14, r: 14, fill: "#16181d" }));
        logo.appendChild(svg("g", { transform: "translate(5.2 5.2) scale(.0344)" }))
          .appendChild(svg("path", { fill: "#fff",
            d: "M168 80c-13.3 0-24 10.7-24 24l0 304c0 8.4-1.4 16.5-4.1 24L440 432c13.3 0 24-10.7 24-24l0-304c0-13.3-10.7-24-24-24L168 80zM72 480c-39.8 0-72-32.2-72-72L0 112C0 98.7 10.7 88 24 88s24 10.7 24 24l0 296c0 13.3 10.7 24 24 24s24-10.7 24-24l0-304c0-39.8 32.2-72 72-72l272 0c39.8 0 72 32.2 72 72l0 304c0 39.8-32.2 72-72 72L72 480zM176 136c0-13.3 10.7-24 24-24l96 0c13.3 0 24 10.7 24 24l0 80c0 13.3-10.7 24-24 24l-96 0c-13.3 0-24-10.7-24-24l0-80zm200-24l32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 80l32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zM200 272l208 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-208 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 80l208 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-208 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z" }));
      } else if (kind === "terminal") {
        logo.appendChild(svg("g", { transform: "translate(1 1) scale(1.08)" }))
          .appendChild(svg("path", { fill: "#1d1d1f",
            d: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" }));
      } else if (kind === "secrets") {
        serviceIcon("awssecg", "#BD0816", "#FF5252", "M124.032,138.752 C124.032,140.9408 125.8144,142.72 128,142.72 C130.1888,142.72 131.968,140.9408 131.968,138.752 C131.968,136.5632 130.1888,134.784 128,134.784 C125.8144,134.784 124.032,136.5632 124.032,138.752 L124.032,138.752 Z M117.632,138.752 C117.632,133.0336 122.2816,128.384 128,128.384 C133.7184,128.384 138.368,133.0336 138.368,138.752 C138.368,143.3472 135.3472,147.2064 131.2,148.5632 L131.2,156.8 L124.8,156.8 L124.8,148.5632 C120.6528,147.2064 117.632,143.3472 117.632,138.752 L117.632,138.752 Z M156.8,121.6 L99.2,121.6 L99.2,163.2 L156.8,163.2 L156.8,153.6 L147.2,153.6 L147.2,147.2 L156.8,147.2 L156.8,137.6 L147.2,137.6 L147.2,131.2 L156.8,131.2 L156.8,121.6 Z M108.8,115.2 L147.1968,115.2 L147.200001,99.2 C147.2032,90.8288 138.0576,83.2064 128.0128,83.2 L128.0032,83.2 C123.1104,83.2 118.1696,85.0368 114.4416,88.24 C110.8576,91.3184 108.8,95.3152 108.8,99.2032 L108.8,115.2 Z M153.6,99.2032 L153.5968,115.2 L160,115.2 C161.7696,115.2 163.2,116.6336 163.2,118.4 L163.2,166.4 C163.2,168.1664 161.7696,169.6 160,169.6 L96,169.6 C94.2304,169.6 92.8,168.1664 92.8,166.4 L92.8,118.4 C92.8,116.6336 94.2304,115.2 96,115.2 L102.4,115.2 L102.4,99.2 C102.4032,93.4464 105.2704,87.6832 110.2688,83.3856 C115.1424,79.2 121.6032,76.8 128.0032,76.8 L128.0128,76.8 C141.648,76.8064 153.6032,87.2736 153.6,99.2032 L153.6,99.2032 Z M61.4624,176.1568 L66.6496,172.4064 C57.8976,160.3104 53.0592,146.1184 52.4672,131.2 L60.8,131.2 L60.8,124.8 L52.4768,124.8 C53.1136,109.9712 57.9456,95.8624 66.6496,83.8336 L61.4624,80.08 C51.9648,93.2096 46.7168,108.6144 46.0768,124.8 L38.4,124.8 L38.4,131.2 L46.0672,131.2 C46.6624,147.4752 51.9168,162.9632 61.4624,176.1568 L61.4624,176.1568 Z M172.2816,189.4656 C160.2208,198.1952 146.0736,203.0272 131.2,203.6448 L131.2,195.2 L124.8,195.2 L124.8,203.6448 C109.9264,203.0304 95.776,198.1984 83.7088,189.4656 L79.9616,194.6496 C93.12,204.176 108.5696,209.424 124.8,210.0448 L124.8,217.6 L131.2,217.6 L131.2,210.0448 C147.4304,209.424 162.8736,204.176 176.032,194.6496 L172.2816,189.4656 Z M83.7088,66.7712 C95.776,58.0416 109.9264,53.2096 124.8,52.5952 L124.8,60.8 L131.2,60.8 L131.2,52.5952 C146.0736,53.2096 160.2208,58.0416 172.2816,66.7712 L176.032,61.5872 C162.8736,52.064 147.4304,46.816 131.2,46.1952 L131.2,38.4 L124.8,38.4 L124.8,46.1952 C108.5696,46.8128 93.12,52.0608 79.9616,61.5872 L83.7088,66.7712 Z M209.9168,124.8 C209.2768,108.6144 204.0288,93.2096 194.528,80.08 L189.3408,83.8336 C198.048,95.8624 202.88,109.9712 203.5168,124.8 L195.2,124.8 L195.2,131.2 L203.5264,131.2 C202.9312,146.1184 198.096,160.3104 189.3408,172.4064 L194.528,176.1568 C204.0768,162.9632 209.328,147.4752 209.9264,131.2 L217.6,131.2 L217.6,124.8 L209.9168,124.8 Z M180.4352,80.2048 L205.5232,55.1168 L200.9984,50.592 L175.9104,75.68 L180.4352,80.2048 Z M75.5584,176.032 L50.4704,201.12 L54.9952,205.6448 L80.0832,180.5568 L75.5584,176.032 Z M91.7312,87.2096 L44.24,39.7216 L39.7152,44.2464 L87.2064,91.7344 L91.7312,87.2096 Z M173.4176,168.896 L216.2752,211.7536 L211.7504,216.2784 L168.8928,173.4208 L173.4176,168.896 Z");
      }
      return logo;
    }


    function drawSymbol(parent, kind) {
      var glyph = parent.appendChild(svg("g", { "class": "net-map-glyph" }));
      if (kind === "origin") {
        [5, 12, 19].forEach(function (y) {
          glyph.appendChild(svg("rect", { x: 4, y: y, width: 20, height: 5, rx: 1.5,
            "class": "net-map-glyph-soft" }));
          glyph.appendChild(svg("circle", { cx: 20.5, cy: y + 2.5, r: 1.2,
            "class": "net-map-glyph-fill" }));
        });
      } else if (kind === "probe") {
        glyph.appendChild(svg("circle", { cx: 14, cy: 14, r: 9, "class": "net-map-glyph-line" }));
        glyph.appendChild(svg("circle", { cx: 14, cy: 14, r: 2.2, "class": "net-map-glyph-fill" }));
        glyph.appendChild(svg("path", { d: "M14 14L22 9M7 20A10 10 0 0 0 23 18",
          "class": "net-map-glyph-line" }));
      } else if (kind === "runner") {
        glyph.appendChild(svg("circle", { cx: 14, cy: 15, r: 9, "class": "net-map-glyph-line" }));
        glyph.appendChild(svg("path", { d: "M10 3H18M14 3V6M14 15L19 11",
          "class": "net-map-glyph-line" }));
        glyph.appendChild(svg("circle", { cx: 14, cy: 15, r: 1.8, "class": "net-map-glyph-fill" }));
      } else if (kind === "trader") {
        glyph.appendChild(svg("rect", { x: 3.5, y: 5, width: 21, height: 18, rx: 3,
          "class": "net-map-glyph-soft" }));
        glyph.appendChild(svg("path", { d: "M8 11L12 14L8 17M15 18H20",
          "class": "net-map-glyph-line" }));
      } else if (kind === "dns") {
        glyph.appendChild(svg("path", { d: "M6 15A8 8 0 0 1 19 8L22 8M22 8L19 5M22 13A8 8 0 0 1 9 20L6 20M6 20L9 23",
          "class": "net-map-glyph-line" }));
        glyph.appendChild(svg("circle", { cx: 14, cy: 14, r: 2.2, "class": "net-map-glyph-fill" }));
      } else if (kind === "tcp") {
        glyph.appendChild(svg("path", { d: "M5 8H20M17 5L20 8L17 11M23 14H8M11 11L8 14L11 17M5 21H20M17 18L20 21L17 24",
          "class": "net-map-glyph-line" }));
      } else if (kind === "tls") {
        glyph.appendChild(svg("rect", { x: 6, y: 12, width: 16, height: 12, rx: 2.5,
          "class": "net-map-glyph-soft" }));
        glyph.appendChild(svg("path", { d: "M9 12V9A5 5 0 0 1 19 9V12M14 16V20",
          "class": "net-map-glyph-line" }));
      } else if (kind === "server") {
        glyph.appendChild(svg("path", { d: "M3 16H7L10 9L14 21L18 12L21 16H25",
          "class": "net-map-glyph-line" }));
      }
      return glyph;
    }

    function component(data) {
      var width = data.width || 220;
      var height = data.height || 96;
      var top = -height / 2;
      var headerHeight = 46;
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + data.x + " " + data.y + ")",
        "class": "net-map-component " + (data.logo || data.kind || "service")
          + (data.external ? " external" : "") + " net-map-status " + data.state
      }));
      attachTip(group, data.info);
      group.appendChild(svg("rect", { x: 0, y: top, width: width, height: height,
        rx: 11, "class": "net-map-card-bg" }));
      group.appendChild(svg("rect", { x: width - 5, y: top + 12, width: 3, height: 22,
        rx: 1.5, "class": "net-map-card-accent" }));
      group.appendChild(svg("rect", { x: 1, y: top + 1, width: width - 2, height: headerHeight,
        rx: 10, "class": "net-map-card-header" }));
      group.appendChild(svg("rect", { x: 1, y: top + headerHeight - 10, width: width - 2,
        height: 11, "class": "net-map-card-header" }));
      group.appendChild(svg("line", { x1: 1, y1: top + headerHeight, x2: width - 1,
        y2: top + headerHeight, "class": "net-map-card-divider" }));
      if (data.logo) {
        addLogo(group, data.logo, 16, top + 9);
      } else {
        var symbol = group.appendChild(svg("g", { transform: "translate(16 " + (top + 9) + ")" }));
        drawSymbol(symbol, data.kind);
      }
      group.appendChild(svg("text", { x: width / 2 + 8, y: top + 19,
        "text-anchor": "middle", "class": "net-map-card-title" }))
        .textContent = data.title;
      group.appendChild(svg("text", { x: width / 2 + 8, y: top + 36,
        "text-anchor": "middle", "class": "net-map-card-subtitle" }))
        .textContent = data.subtitle || stateLabel(data.state);
      group.appendChild(svg("text", { x: width / 2, y: top + 72,
        "text-anchor": "middle", "class": "net-map-card-value" }))
        .textContent = data.value;
      if (data.detail) {
        group.appendChild(svg("text", { x: width / 2, y: top + 89,
          "text-anchor": "middle", "class": "net-map-card-detail" }))
          .textContent = data.detail;
      }
      return group;
    }

    function endpoint(data) {
      data.external = true;
      if (!data.height) { data.height = 104; }
      return component(data);
    }

    function service(data) {
      return component(data);
    }

    function instrumentStage(data) {
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + data.x + " " + data.y + ")",
        "class": "net-map-station " + data.kind + " net-map-status " + data.state
      }));
      attachTip(group, data.info);
      group.appendChild(svg("rect", { x: -56, y: -106, width: 112, height: 88,
        rx: 8, "class": "net-map-node-hit" }));
      var symbol = group.appendChild(svg("g", { transform: "translate(-14 -102)" }));
      drawSymbol(symbol, data.kind);
      group.appendChild(svg("path", { d: "M0 -18V0", "class": "net-map-stage-lead" }));
      group.appendChild(svg("rect", { x: -4, y: -3, width: 8, height: 6, rx: 1.5,
        "class": "net-map-stage-tap" }));
      if (data.caption) {
        group.appendChild(svg("text", { x: 0, y: -61, "class": "net-map-stage-caption",
          "text-anchor": "middle" })).textContent = data.caption;
      }
      group.appendChild(svg("text", { x: 0, y: -43, "class": "net-map-station-title",
        "text-anchor": "middle" })).textContent = data.title;
      group.appendChild(svg("text", { x: 0, y: -27, "class": "net-map-station-value",
        "text-anchor": "middle" })).textContent = data.value;
      return group;
    }

    function apiEgress(data) {
      var busTop = typeof data.top === "number" ? data.top - data.y : -68;
      var busBottom = typeof data.bottom === "number" ? data.bottom - data.y : 68;
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + data.x + " " + data.y + ")",
        "class": "net-map-egress net-map-status " + data.state
      }));
      attachTip(group, data.info);
      group.appendChild(svg("rect", { x: -38, y: busTop - 14, width: 76,
        height: busBottom - busTop + 28,
        rx: 9, "class": "net-map-node-hit" }));
      group.appendChild(svg("path", { d: "M0 " + busTop + "V" + busBottom,
        "class": "net-map-egress-bus" }));
      group.appendChild(svg("rect", { x: -4, y: busTop - 4, width: 8, height: 8, rx: 2,
        "class": "net-map-egress-port" }));
      group.appendChild(svg("rect", { x: -4, y: busBottom - 4, width: 8, height: 8, rx: 2,
        "class": "net-map-egress-port" }));
      group.appendChild(svg("rect", { x: -24, y: -24, width: 48, height: 48, rx: 8,
        "class": "net-map-egress-core" }));
      [-12, 0, 12].forEach(function (offset) {
        group.appendChild(svg("line", { x1: -17, y1: offset, x2: 17, y2: offset,
          "class": "net-map-egress-grid" }));
        group.appendChild(svg("line", { x1: offset, y1: -17, x2: offset, y2: 17,
          "class": "net-map-egress-grid" }));
      });
      group.appendChild(svg("text", { x: 0, y: -34, "text-anchor": "middle",
        "class": "net-map-egress-title" })).textContent = "API Egress";
      return group;
    }

    function openSwitch(data) {
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + data.x + " " + data.y + ")",
        "class": "net-map-switch net-map-status idle"
      }));
      attachTip(group, data.info);
      group.appendChild(svg("rect", { x: -32, y: -28, width: 64, height: 48,
        "class": "net-map-node-hit" }));
      group.appendChild(svg("circle", { cx: -12, cy: 0, r: 3.5, "class": "net-map-switch-contact" }));
      group.appendChild(svg("circle", { cx: 12, cy: 0, r: 3.5, "class": "net-map-switch-contact" }));
      group.appendChild(svg("path", { d: "M-8 0L8 -10", "class": "net-map-switch-arm" }));
      group.appendChild(svg("text", { x: 0, y: -18, "text-anchor": "middle",
        "class": "net-map-switch-label" })).textContent = data.label;
      return group;
    }

    var ec2Width = 1160;
    var xEc2 = Math.max(650, Math.round((W - ec2Width) / 2));
    var ec2Right = xEc2 + ec2Width;
    var ec2Top = 10;
    var ec2Bottom = 658;
    var browserWidth = 230;
    var edgeWidth = 270;
    var xLeft = 40;
    var leftGap = Math.max(50, Math.min(150,
      (xEc2 - xLeft - browserWidth - edgeWidth) / 2));
    var xEdge = xLeft + browserWidth + leftGap;
    var originWidth = 214;
    var probeWidth = 230;
    var runnerWidth = 210;
    var endpointWidth = 240;
    var macWidth = 230;
    var ssmWidth = 250;
    var traderWidth = 224;
    var processCenter = xEc2 + 320;
    var xOrigin = processCenter - originWidth / 2;
    var xProbe = processCenter - probeWidth / 2;
    var xRunner = processCenter - runnerWidth / 2;
    var xTrader = processCenter - traderWidth / 2;
    var xRight = W - endpointWidth - 36;
    var yWebsite = 138;
    var ySpot = 258;
    var yFutures = 288;
    var yNews = 438;
    var yControl = 588;
    var yProbe = yFutures;
    var probeOut = xProbe + probeWidth;
    var splitX = probeOut + 36;
    var panelX = probeOut + 70;
    var xEgress = ec2Right - 70;
    var panelWidth = xEgress - panelX - 54;
    var dnsX = Math.round(panelX + panelWidth * 0.12);
    var tcpX = Math.round(panelX + panelWidth * 0.38);
    var tlsX = Math.round(panelX + panelWidth * 0.64);
    var serverX = Math.round(panelX + panelWidth * 0.88);
    var secretsX = xRight;
    var xSsm = xEdge + 40;
    var originBottom = yWebsite + 48;
    var originRight = xOrigin + originWidth;
    var probeRight = xProbe + probeWidth;
    var originProbeBusX = Math.max(originRight, probeRight) + 28;

    var ec2 = chart.appendChild(svg("g", {
      "class": "net-map-ec2 net-map-status " + coreState
    }));
    attachTip(ec2, {
      title: "AWS EC2 Host", state: coreState, subtitle: "ap-south-1 · Standing Processes",
      stats: [["Origin", shown(origin, "ms")], ["Host Receive", shown(hostReceived)],
        ["Host Transmit", shown(hostSent)], ["Probe Cadence", mapReading(snapshot.every, "s")]],
      detail: "This enclosure is the real ownership boundary. Website Origin, Network Probe, News Runner, and Trader execute inside this EC2 host. The request stages and API Egress show their measured outbound paths."
    });
    ec2.appendChild(svg("rect", { x: xEc2, y: ec2Top, width: ec2Right - xEc2,
      height: ec2Bottom - ec2Top, rx: 15, "class": "net-map-ec2-body" }));
    ec2.appendChild(svg("rect", { x: xEc2 + 1, y: ec2Top + 1,
      width: ec2Right - xEc2 - 2, height: 58, rx: 14, "class": "net-map-ec2-header" }));
    ec2.appendChild(svg("rect", { x: xEc2 + 1, y: ec2Top + 44,
      width: ec2Right - xEc2 - 2, height: 15, "class": "net-map-ec2-header" }));
    ec2.appendChild(svg("line", { x1: xEc2 + 1, y1: ec2Top + 59,
      x2: ec2Right - 1, y2: ec2Top + 59, "class": "net-map-ec2-divider" }));
    addLogo(ec2, "ec2", xEc2 + 20, ec2Top + 15);
    ec2.appendChild(svg("text", { x: xEc2 + 62, y: ec2Top + 25,
      "class": "net-map-ec2-title" })).textContent = "Your AWS EC2";
    ec2.appendChild(svg("text", { x: xEc2 + 62, y: ec2Top + 45,
      "class": "net-map-ec2-meta" })).textContent = "ap-south-1 · Website Origin + Standing Workers";
    ec2.appendChild(svg("text", { x: ec2Right - 20, y: ec2Top + 24,
      "text-anchor": "end", "class": "net-map-ec2-state" })).textContent = stateLabel(coreState);
    ec2.appendChild(svg("text", { x: ec2Right - 20, y: ec2Top + 44,
      "text-anchor": "end", "class": "net-map-ec2-meta" })).textContent =
        "Origin " + shown(origin, "ms") + " · RX " + shown(hostReceived) + " · TX " + shown(hostSent);

    var browserToEdge = worst(browserState, tunnelState);
    route({
      d: pathFrom([[xLeft + browserWidth, yWebsite], [xEdge, yWebsite]]),
      state: browserToEdge, color: "#3b82f6", duration: 18, offset: 1,
      arrows: "both",
      info: {
        title: "Browser ↔ Cloudflare", state: browserToEdge,
        subtitle: "Public HTTPS · Request + Response",
        stats: [["Latest Browser Fetch", shown(browser, "ms")], ["Refresh Cadence", "Every 5 s"]],
        detail: "One slow light point indicates the path is active. It is not a packet counter. If this route turns red, the browser could not fetch the live page data."
      }
    });

    var knownLaneCount = typeof connections.value === "number";
    var laneCount = knownLaneCount ? Math.max(0, Math.min(4, Math.round(connections.value))) : 0;
    var tunnelPaths = [];
    [-24, -8, 8, 24].forEach(function (offset, index) {
      tunnelPaths.push({
        d: pathFrom([[xEdge + edgeWidth, yWebsite + offset], [xOrigin, yWebsite + offset]]),
        state: knownLaneCount && index >= laneCount ? "idle" : tunnelState
      });
    });
    route({
      d: pathFrom([[xEdge + edgeWidth, yWebsite], [xOrigin, yWebsite]]),
      paths: tunnelPaths, state: worst(tunnelState, originState), color: "#f38020",
      motionPaths: [tunnelPaths[0]], duration: 16, offset: 3, arrows: "both",
      info: {
        title: "Cloudflare Tunnel ↔ Website Origin", state: worst(tunnelState, originState),
        subtitle: "Four Outbound Encrypted Links",
        stats: [["Live Links", knownLaneCount ? laneCount + " / 4" : "No Measurement"],
          ["Edge Round Trip", shown(tunnelRtt, "ms")], ["Lost / Errors", shown(lost) + " / " + shown(errors)],
          ["Origin Round Trip", shown(origin, "ms")]],
        detail: "Telemetry reports the live connection count. The four conductors visualize that count; the UI does not claim to trace four individual tunnel sockets."
      }
    });

    route({
      d: pathFrom([[probeRight, yProbe - 18], [originProbeBusX, yProbe - 18],
        [originProbeBusX, yWebsite + 10], [originRight, yWebsite + 10]]),
      state: tradeState, color: "#2563eb", duration: 16, offset: 4,
      arrows: "forward",
      info: {
        title: "Network Probe → Website Origin", state: tradeState,
        subtitle: "Measured Network Results",
        stats: [["Spot", shown(spot, "ms")], ["Futures", shown(futures, "ms")],
          ["Clock Offset", shown(clockOffset, "ms")]],
        detail: "The Network Probe writes its measured results for Website Origin to serve to the browser."
      }
    });
    route({
      d: pathFrom([[xRunner, yNews], [xOrigin - 28, yNews],
        [xOrigin - 28, originBottom + 26], [xOrigin + 40, originBottom + 26],
        [xOrigin + 40, originBottom]]),
      state: newsState, color: "#0e7490", duration: 20, offset: 8,
      arrows: "forward",
      info: {
        title: "News Runner → Website Origin", state: newsState,
        subtitle: "Collected News Status",
        stats: [["Last Cycle", shown(newsDuration, "s")], ["P95", shown(newsP95)],
          ["Live Sources", shown(newsLive)]],
        detail: "The News Runner writes collection status for Website Origin to serve to the browser."
      }
    });

    var stagePath = pathFrom([[probeOut, yProbe], [splitX, yProbe], [splitX, ySpot],
      [xEgress, ySpot]]);
    route({
      d: stagePath, state: stageState, color: "#64748b", duration: 28, offset: 5,
      arrows: "forward",
      info: {
        title: "Shared Stage Diagnostics", state: stageState,
        subtitle: "Slower Boundary Across Spot + Futures Checks",
        stats: [["DNS", stageValue(dns)], ["TCP", stageValue(tcp)],
          ["TLS", stageValue(tls)], ["Reply", stageValue(server)]],
        detail: "The probe times each boundary separately for Spot and Futures. Every station shows the slower successful reading from the latest pair; the four values do not claim to be one traced request."
      }
    });
    var spotPath = pathFrom([[xEgress, ySpot], [xEgress, yWebsite], [xRight, yWebsite]]);
    route({
      d: spotPath, state: spotState, color: "#4169e1", duration: 28, offset: 6,
      arrows: "both",
      info: {
        title: "Network Probe ↔ Binance Spot", state: spotState,
        subtitle: "Measured Total HTTPS Round Trip",
        stats: [["Round Trip", shown(spot, "ms")], ["Endpoint", "api.binance.com"],
          ["Clock Offset", shown(clockOffset, "ms")]],
        detail: "This blue route is the real total request to Binance Spot. The neutral diagnostic rail beside it compares individual Spot and Futures boundaries and is not Spot-only."
      }
    });
    var futuresPath = pathFrom([[probeOut, yProbe], [xRight, yFutures]]);
    route({
      d: futuresPath, state: futuresState, color: "#1aa981", duration: 30, offset: 7,
      arrows: "both",
      info: {
        title: "Network Probe ↔ Binance Futures", state: futuresState,
        subtitle: "Measured Public HTTPS Path",
        stats: [["Round Trip", shown(futures, "ms")], ["Endpoint", "fapi.binance.com"],
          ["Purpose", "Hedge-Leg Reachability"]],
        detail: "This green route is the real total request to Binance Futures. The neutral diagnostic rail compares individual Spot and Futures boundaries and labels which host supplied each slower reading."
      }
    });
    route({
      d: pathFrom([[xRunner + runnerWidth, yNews], [xRight, yNews]]),
      state: newsState, color: "#0e7490", duration: 22, offset: 9, arrows: "both",
      info: {
        title: "News Runner ↔ Public Sources", state: newsState,
        subtitle: "Scheduled RSS + JSON Poll",
        stats: [["Cadence", shown(newsInterval, "s")], ["Last Cycle", shown(newsDuration, "s")],
          ["P95", shown(newsP95)], ["Live / Delayed / Failed",
            shown(newsLive) + " / " + shown(newsDelayed) + " / " + shown(newsFailed)]],
        detail: "The route covers outbound source requests, inbound responses, parsing, and completion of one news polling cycle."
      }
    });

    route({
      d: pathFrom([[xLeft + macWidth, yControl], [xSsm, yControl]]),
      state: "idle", color: "#7d8795", arrows: "both",
      info: {
        title: "Your Mac ↔ AWS Systems Manager", state: "idle", status: "On Demand",
        subtitle: "Owner Command + Output",
        stats: [["Activation", "Owner Session Only"], ["Live Telemetry", "Not Collected"]],
        detail: "This is the real on-demand control path, drawn muted because it has no standing traffic. The Network page does not claim to detect a current Mac session."
      }
    });
    route({
      d: pathFrom([[xSsm + ssmWidth, yControl], [xTrader, yControl]]),
      state: "idle", color: "#a855f7", arrows: "both",
      info: {
        title: "AWS Systems Manager ↔ Trader Command", state: "idle", status: "On Demand",
        subtitle: "Owner-Started EC2 Process",
        stats: [["Activation", "Owner Command Only"], ["Live Telemetry", "Not Collected"]],
        detail: "Systems Manager is the real route used to start Trader. This map shows that architecture but does not monitor whether a command is running right now."
      }
    });
    route({
      d: pathFrom([[xTrader + traderWidth, yControl], [secretsX, yControl]]),
      state: "idle", color: "#d64562", arrows: "forward",
      info: {
        title: "Trader Command → Secrets Manager", state: "idle", status: "On Demand",
        subtitle: "Credential Read Path",
        stats: [["Activation", "Trader Start Only"], ["Live Telemetry", "Not Collected"],
          ["UI Access", "Never"]],
        detail: "Trader uses this real credential path only when a command starts. The website never receives credentials and does not monitor individual reads."
      }
    });
    var traderApiY = yControl - 68;
    route({
      d: pathFrom([[xTrader + traderWidth, yControl], [xTrader + traderWidth + 46, yControl],
        [xTrader + traderWidth + 46, traderApiY], [xEgress, traderApiY],
        [xEgress, (yWebsite + yFutures) / 2]]),
      state: "idle", color: "#7c3aed", arrows: "forward",
      info: {
        title: "Trader → Binance APIs", state: "idle", status: "On Demand",
        subtitle: "Signed HTTPS Through API Egress",
        stats: [["Activation", "Owner Command Only"], ["Live Telemetry", "Not Collected"],
          ["Spot Host", "api.binance.com"],
          ["Futures Host", "fapi.binance.com"]],
        detail: "This is Trader's real signed-HTTPS route when an owner starts it. The Network page measures host reachability above but does not claim to trace live orders on this grey path."
      }
    });

    instrumentStage({
      x: dnsX, y: ySpot, kind: "dns", title: "DNS Resolution", value: stageValue(dns),
      caption: "Query ↔ IP Answer", state: dnsState,
      info: {
        title: "DNS Resolution", state: dnsState,
        subtitle: "Slower Spot/Futures DNS Boundary",
        stats: [["Latest Duration", shown(dns, "ms")], ["Slower Host", stageSource(dns)],
          ["Resolver", "AWS VPC Resolver"]],
        detail: "The backend resolves each Binance host separately and displays the slower latest reading. A failure here means one host returned no address, so its TCP connection could not begin."
      }
    });
    instrumentStage({
      x: tcpX, y: ySpot, kind: "tcp", title: "TCP Connect", value: stageValue(tcp),
      caption: "SYN · SYN-ACK · ACK", state: tcpState,
      info: {
        title: "TCP Connect", state: tcpState,
        subtitle: "Slower Spot/Futures TCP Boundary",
        stats: [["Latest Duration", shown(tcp, "ms")], ["Slower Host", stageSource(tcp)],
          ["Starts After", "DNS Resolution"]],
        detail: "The backend opens each Binance TCP connection separately and displays the slower latest reading. A failure here means one resolved host did not accept its connection."
      }
    });
    instrumentStage({
      x: tlsX, y: ySpot, kind: "tls", title: "TLS Security", value: stageValue(tls),
      caption: "Secure Session Setup", state: tlsState,
      info: {
        title: "TLS Security", state: tlsState,
        subtitle: "Slower Spot/Futures TLS Boundary",
        stats: [["Latest Duration", shown(tls, "ms")], ["Slower Host", stageSource(tls)],
          ["Starts After", "TCP Connect"]],
        detail: "The backend creates each encrypted Binance session separately and displays the slower latest reading. A failure here means one TCP connection opened but its secure session did not."
      }
    });
    instrumentStage({
      x: serverX, y: ySpot, kind: "server", title: "Binance Reply", value: stageValue(server),
      caption: "Server → First Byte", state: serverState,
      info: {
        title: "Binance Reply", state: serverState,
        subtitle: "Slower Spot/Futures Reply Boundary",
        stats: [["Latest Duration", shown(server, "ms")], ["Slower Host", stageSource(server)],
          ["Measurement", "Secure Request → First Byte"]],
        detail: "The backend requests server time from each Binance host and displays the slower latest first-byte wait. This is normally the largest part of either round trip."
      }
    });

    apiEgress({
      x: xEgress, y: (yWebsite + yFutures) / 2, top: yWebsite, bottom: yFutures,
      state: tradeState,
      info: {
        title: "API Egress", state: tradeState,
        subtitle: "EC2 Boundary → Binance Public APIs",
        stats: [["Spot", shown(spot, "ms")], ["Futures", shown(futures, "ms")]],
        detail: "This junction shows where the two measured HTTPS paths leave EC2. It is a visual boundary, not a separate latency measurement."
      }
    });

    endpoint({
      x: xLeft, y: yWebsite, width: browserWidth, logo: "browser", title: "Your Browser",
      subtitle: "Current Viewer", value: "Live Data Fetch " + shown(browser, "ms"),
      detail: "Refreshes Every 5 Seconds", state: browserState,
      info: {
        title: "Your Browser", state: browserState, subtitle: "Current Viewer",
        stats: [["Latest Fetch", shown(browser, "ms")], ["Cadence", "Every 5 s"]],
        detail: "This measurement includes download and JSON parsing in the current browser."
      }
    });
    endpoint({
      x: xEdge, y: yWebsite, width: edgeWidth, logo: "cloudflare", title: "Cloudflare",
      subtitle: "Edge + Encrypted Tunnel", value: amount(connections, "Live Connection", "Live Connections"),
      detail: "Edge " + shown(tunnelRtt, "ms") + " · Lost " + shown(lost) + " · Errors " + shown(errors),
      state: tunnelState,
      info: {
        title: "Cloudflare Edge + Tunnel", state: tunnelState,
        subtitle: "Public Edge → Website Origin",
        stats: [["Edge Round Trip", shown(tunnelRtt, "ms")], ["Live Links", shown(connections)],
          ["Lost / Errors", shown(lost) + " / " + shown(errors)]],
        detail: "Cloudflare terminates public HTTPS and forwards it through four outbound tunnel connections."
      }
    });
    service({
      x: xOrigin, y: yWebsite, width: originWidth, kind: "origin", title: "Website Origin",
      subtitle: "EC2 Web Service", value: "Local Round Trip " + shown(origin, "ms"),
      detail: "Serves UI + Live Data", state: originState,
      info: {
        title: "Website Origin", state: originState, subtitle: "EC2 Web Server",
        stats: [["Local Round Trip", shown(origin, "ms")], ["Serves", "UI + Live JSON"]],
        detail: "This is the exact process where the Cloudflare tunnel terminates and the website response begins."
      }
    });
    service({
      x: xProbe, y: yProbe, width: probeWidth, height: 102, kind: "probe", title: "Network Probe",
      subtitle: "Standing Monitor · Every " + mapReading(snapshot.every, "s"),
      value: "Spot " + shown(spot, "ms") + " · Futures " + shown(futures, "ms"),
      detail: "Clock Offset " + shown(clockOffset, "ms"), state: tradeState,
      info: {
        title: "Network Probe", state: tradeState, subtitle: "Standing EC2 Worker",
        stats: [["Cadence", mapReading(snapshot.every, "s")], ["Spot", shown(spot, "ms")],
          ["Futures", shown(futures, "ms")], ["Clock Offset", shown(clockOffset, "ms")]],
        detail: "One standing worker branches into the separately measured Spot and Futures routes."
      }
    });
    endpoint({
      x: xRight, y: yWebsite, width: endpointWidth, logo: "binance", title: "Binance Spot",
      subtitle: "api.binance.com", value: "Round Trip " + shown(spot, "ms"),
      detail: "Clock Offset " + shown(clockOffset, "ms"),
      state: spotState,
      info: {
        title: "Binance Spot", state: spotState, subtitle: "api.binance.com",
        stats: [["Round Trip", shown(spot, "ms")], ["Clock Offset", shown(clockOffset, "ms")],
          ["Use", "Spot + Margin Orders"]],
        detail: "This is the public host used by the Spot and Margin leg."
      }
    });
    endpoint({
      x: xRight, y: yFutures, width: endpointWidth, logo: "binance", title: "Binance Futures",
      subtitle: "fapi.binance.com", value: "Round Trip " + shown(futures, "ms"), detail: "Hedge-Leg API",
      state: futuresState,
      info: {
        title: "Binance Futures", state: futuresState, subtitle: "fapi.binance.com",
        stats: [["Round Trip", shown(futures, "ms")], ["Use", "Futures Hedge Leg"]],
        detail: "This is the separately measured Futures host used for the hedge leg."
      }
    });
    service({
      x: xRunner, y: yNews, width: runnerWidth, kind: "runner", title: "News Runner",
      subtitle: "Standing Polling Loop", value: "Last Cycle " + shown(newsDuration, "s"),
      detail: "Cadence " + shown(newsInterval, "s") + " · P95 " + shown(newsP95),
      state: newsRunnerState,
      info: {
        title: "News Runner", state: newsRunnerState, subtitle: "Standing EC2 Worker",
        stats: [["Cadence", shown(newsInterval, "s")], ["Last Cycle", shown(newsDuration, "s")],
          ["P95", shown(newsP95)]],
        detail: "The timer is the real standing polling loop, not a generic process box."
      }
    });
    endpoint({
      x: xRight, y: yNews, width: endpointWidth, logo: "news", title: "News Sources",
      subtitle: "Public RSS + JSON", value: amount(newsLive, "Live Group", "Live Groups"),
      detail: amount(newsDelayed, "Delayed", "Delayed") + " · " + amount(newsFailed, "Failed", "Failed"),
      state: newsSourceState,
      info: {
        title: "Public News Sources", state: newsSourceState, subtitle: "RSS + JSON Hosts",
        stats: [["Live", shown(newsLive)], ["Delayed", shown(newsDelayed)], ["Failed", shown(newsFailed)]],
        detail: "A warning or failure here points to the public source side, separately from the News Runner timer."
      }
    });
    endpoint({
      x: xLeft, y: yControl, width: macWidth, logo: "terminal", title: "Your Mac",
      subtitle: "Owner Terminal", value: "Starts Commands On Demand", state: "idle",
      info: {
        title: "Your Mac", state: "idle", status: "On Demand", subtitle: "Owner Terminal",
        stats: [["Activation", "Owner Session"], ["Live Telemetry", "Not Collected"]],
        detail: "This is the owner endpoint in the real control topology. The Network page does not monitor the Mac or infer whether a session is currently open."
      }
    });
    endpoint({
      x: xSsm, y: yControl, width: ssmWidth, logo: "ssm", title: "AWS Systems Manager",
      subtitle: "Owner Control Channel", value: "Commands + Output On Demand", state: "idle",
      info: {
        title: "AWS Systems Manager", state: "idle", status: "On Demand",
        subtitle: "Owner Control Channel",
        stats: [["Purpose", "Commands + Output"], ["Live Telemetry", "Not Collected"]],
        detail: "Systems Manager is the real owner control channel to EC2. Its presence here is architectural; this page does not read current session traffic."
      }
    });
    service({
      x: xTrader, y: yControl, width: traderWidth, kind: "trader", title: "Trader Command",
      subtitle: "Owner Started · On Demand", value: "Starts On Owner Command",
      detail: "Live Process State Not Collected", state: "idle",
      info: {
        title: "Trader Command", state: "idle", status: "On Demand",
        subtitle: "Owner-Started EC2 Process",
        stats: [["Activation", "Owner Command Only"], ["Live Telemetry", "Not Collected"],
          ["Credentials", "Read At Start"],
          ["API Traffic", "Spot + Futures While Running"]],
        detail: "Trader really starts on an owner command, reads credentials, uses both Binance paths, prints output, and exits. This Network page does not expose a live Trader process sensor."
      }
    });
    endpoint({
      x: secretsX, y: yControl, width: endpointWidth, logo: "secrets", title: "Secrets Manager",
      subtitle: "AWS Credentials Path", value: "Read At Command Start",
      detail: "Never Exposed To UI", state: "idle",
      info: {
        title: "AWS Secrets Manager", state: "idle", status: "On Demand",
        subtitle: "Trader Credential Read",
        stats: [["Activation", "Trader Start Only"], ["Live Telemetry", "Not Collected"],
          ["UI Access", "Never"]],
        detail: "The credential path is real and activates only while Trader starts. The UI cannot inspect credentials or observe individual reads."
      }
    });

    openSwitch({
      x: (xLeft + macWidth + xSsm) / 2, y: yControl, label: "Owner Session",
      info: {
        title: "Owner Session Switch", state: "idle", status: "On Demand",
        subtitle: "Your Mac ↔ AWS Systems Manager",
        stats: [["Diagram Meaning", "Owner-Activated Path"], ["Live Telemetry", "Not Collected"]],
        detail: "The open symbol identifies an on-demand boundary. It is architectural notation, not a live session indicator."
      }
    });
    openSwitch({
      x: (xSsm + ssmWidth + xTrader) / 2, y: yControl, label: "Start Trader",
      info: {
        title: "Trader Start Switch", state: "idle", status: "On Demand",
        subtitle: "AWS Systems Manager ↔ Trader Command",
        stats: [["Diagram Meaning", "Owner-Activated Path"], ["Live Telemetry", "Not Collected"]],
        detail: "The open symbol identifies where an owner command starts Trader. It is not a live process indicator."
      }
    });
    openSwitch({
      x: (xTrader + traderWidth + secretsX) / 2, y: yControl, label: "Read Credentials",
      info: {
        title: "Credential Read Switch", state: "idle", status: "On Demand",
        subtitle: "Trader Command → Secrets Manager",
        stats: [["Diagram Meaning", "Start-Time Read Path"], ["Live Telemetry", "Not Collected"]],
        detail: "The open symbol identifies the start-time credential boundary. It does not claim to observe a current Secrets Manager request."
      }
    });

    function sameSvgShape(current, next) {
      if (current.nodeType !== next.nodeType) { return false; }
      if (current.nodeType === 1 && current.tagName !== next.tagName) { return false; }
      if (current.childNodes.length !== next.childNodes.length) { return false; }
      for (var childIndex = 0; childIndex < current.childNodes.length; childIndex++) {
        if (!sameSvgShape(current.childNodes[childIndex], next.childNodes[childIndex])) { return false; }
      }
      return true;
    }

    function reconcileSvg(current, next) {
      if (!sameSvgShape(current, next)) { return false; }
      function sync(currentNode, nextNode) {
        if (currentNode.nodeType === 3) {
          if (currentNode.nodeValue !== nextNode.nodeValue) { currentNode.nodeValue = nextNode.nodeValue; }
          return;
        }
        Array.prototype.slice.call(currentNode.attributes || []).forEach(function (attribute) {
          if (!nextNode.hasAttribute(attribute.name)) { currentNode.removeAttribute(attribute.name); }
        });
        Array.prototype.slice.call(nextNode.attributes || []).forEach(function (attribute) {
          if (currentNode.tagName === "animateMotion" && attribute.name === "begin") { return; }
          if (currentNode.getAttribute(attribute.name) !== attribute.value) {
            currentNode.setAttribute(attribute.name, attribute.value);
          }
        });
        for (var index = 0; index < currentNode.childNodes.length; index++) {
          sync(currentNode.childNodes[index], nextNode.childNodes[index]);
        }
      }
      sync(current, next);
      return true;
    }

    var currentChart = stage.querySelector(".net-map-chart");
    if (!currentChart || !reconcileSvg(currentChart, chart)) {
      stage.replaceChildren(chart);
    }
    stage.scrollLeft = Math.min(netMapScroll, Math.max(0, stage.scrollWidth - stage.clientWidth));

  }

  window.addEventListener("resize", function () {
    clearTimeout(netResize);
    netResize = setTimeout(function () { if (netEl) { drawNet(); } }, 150);
  });
  side.addEventListener("transitionend", function (event) {
    if (event.propertyName === "width" && netEl) { drawNet(); }
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && netEl) {
      drawStatus();
      drawConnectionMap();
      fetchNet();
      if (netSync) { feedState("/api/net", undefined, netSync); }
      feedState("/api/news", undefined, function (v) {
        newsOn = v;
        drawConnectionMap();
      });
    }
    if (!document.hidden && logsEl) {
      fetchLogs();
      if (logsSync) { feedState("/api/logs", undefined, logsSync); }
    }
    if (!document.hidden && newsEl) { newsState(); }
  });

  function buildNetwork(page, head) {
    var acts = el("div", "set-actions");
    acts.appendChild(refreshButton(function () { fetchNet(true); }));
    var sw = el("button", "set-switch" + (netView.on ? " on" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", netView.on ? "true" : "false");
    sw.setAttribute("aria-label", "Network display");
    netSync = function (v) {
      netView.on = v;
      saveNet();
      sw.classList.toggle("on", v);
      sw.setAttribute("aria-checked", v ? "true" : "false");
      drawStatus();
      if (v) { fetchNet(); }
    };
    sw.addEventListener("click", function () { feedState("/api/net", !netView.on, netSync); });
    feedState("/api/net", undefined, netSync);
    feedState("/api/news", undefined, function (v) {
      newsOn = v;
      if (netEl) { drawConnectionMap(); }
    });
    acts.appendChild(sw);
    var status = acts.appendChild(el("span", "status"));
    netDot = status.appendChild(el("i", "status-dot"));
    netAge = status.appendChild(el("span"));
    head.appendChild(acts);
    page.classList.add("network");
    netEl = page.appendChild(el("div"));
    drawNet();
    fetchNet(true);
    netTimer = setInterval(fetchNet, 5000);
  }

  /* ---- one floating tooltip for every [data-tip] ---- */
  function showTip(el, point) {
    if (el.classList.contains("nav-row") && state() === "expanded") { return; }
    if (settings.tips === "off") { return; }
    var text = el.getAttribute("data-tip");
    if (!text) { return; }
    tip.className = "";
    tip.style.removeProperty("--tip-tone");
    tip.textContent = "";
    var circuitTitle = el.getAttribute("data-tip-title");
    if (circuitTitle) {
      var tone = el.getAttribute("data-tip-tone") || "idle";
      tip.className = "circuit-tip tone-" + tone;
      var colorSource = el.querySelector(".net-map-route-line:not(.idle):not(.unmeasured)")
        || el.querySelector(".net-map-route-line")
        || el.querySelector(".net-map-card-bg")
        || el.querySelector(".net-map-station-value")
        || el.querySelector(".net-map-egress-core")
        || el.querySelector(".net-map-ec2-body")
        || el.querySelector(".net-map-switch-contact");
      if (colorSource) {
        var colorStyle = getComputedStyle(colorSource);
        var sourceColor = colorSource.classList.contains("net-map-station-value")
          ? colorStyle.fill : colorStyle.stroke;
        if (sourceColor && sourceColor !== "none") {
          tip.style.setProperty("--tip-tone", sourceColor);
        }
      }
      tip.appendChild(document.createElement("div")).className = "circuit-tip-accent";
      var tipHead = tip.appendChild(document.createElement("div"));
      tipHead.className = "circuit-tip-head";
      var identity = tipHead.appendChild(document.createElement("div"));
      identity.className = "circuit-tip-identity";
      var tipTitle = identity.appendChild(document.createElement("div"));
      tipTitle.className = "circuit-tip-title";
      tipTitle.textContent = circuitTitle;
      var subtitle = el.getAttribute("data-tip-subtitle");
      if (subtitle) {
        var tipSub = identity.appendChild(document.createElement("div"));
        tipSub.className = "circuit-tip-sub";
        tipSub.textContent = subtitle;
      }
      var tipState = tipHead.appendChild(document.createElement("div"));
      tipState.className = "circuit-tip-state";
      tipState.textContent = el.getAttribute("data-tip-status") || "Status";
      var stats = [];
      try { stats = JSON.parse(el.getAttribute("data-tip-stats") || "[]"); } catch (ignore) { stats = []; }
      if (stats.length) {
        var readings = tip.appendChild(document.createElement("div"));
        readings.className = "circuit-tip-readings";
        var readingsHead = readings.appendChild(document.createElement("div"));
        readingsHead.className = "circuit-tip-readings-head";
        readingsHead.appendChild(document.createElement("span")).textContent = "Recorded Readings";
        readingsHead.appendChild(document.createElement("span")).textContent = "Latest Sample";
        var tipGrid = readings.appendChild(document.createElement("div"));
        tipGrid.className = "circuit-tip-grid";
        stats.forEach(function (stat) {
          var row = tipGrid.appendChild(document.createElement("div"));
          row.className = "circuit-tip-row";
          var key = row.appendChild(document.createElement("span"));
          key.className = "circuit-tip-key";
          key.textContent = stat[0];
          var value = row.appendChild(document.createElement("span"));
          value.className = "circuit-tip-value";
          value.textContent = stat[1];
        });
      }
      var detail = el.getAttribute("data-tip-detail");
      if (detail) {
        var tipDetail = tip.appendChild(document.createElement("div"));
        tipDetail.className = "circuit-tip-detail";
        var detailTitle = tipDetail.appendChild(document.createElement("div"));
        detailTitle.className = "circuit-tip-detail-title";
        detailTitle.textContent = "What This Means";
        tipDetail.appendChild(document.createElement("div")).textContent = detail;
      }
    } else {
      tip.textContent = text;
      if (el.getAttribute("data-kbd")) {
        var k1 = document.createElement("span");
        k1.className = "kbd"; k1.textContent = KBD;
        var k2 = document.createElement("span");
        k2.className = "kbd"; k2.textContent = "\\";
        tip.appendChild(k1); tip.appendChild(k2);
      }
    }
    var r = el.getBoundingClientRect();
    tip.style.left = "0px";
    tip.style.top = "0px";
    var z = zoomFactor();
    tip.style.maxWidth = Math.max(160, Math.min(360, window.innerWidth / z - 16)) + "px";
    tip.setAttribute("aria-hidden", "false");
    var preferredLeft = point && circuitTitle ? point.x + 14 : r.right + 10;
    tip.style.left = Math.round(Math.max(8, Math.min(preferredLeft,
      window.innerWidth - tip.offsetWidth * z - 8)) / z) + "px";
    var tipTop = point && circuitTitle
      ? point.y / z + 14
      : (r.top + r.height / 2) / z - tip.offsetHeight / 2;
    tip.style.top = Math.round(Math.max(8 / z,
      Math.min(tipTop, window.innerHeight / z - tip.offsetHeight - 8 / z))) + "px";
    tip.classList.add("on");
  }

  function hideTip() {
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    tip.classList.remove("on");
    tip.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("mouseover", function (ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest("[data-tip]") : null;
    if (!el) { return; }
    if (tipTimer) { clearTimeout(tipTimer); }
    var point = { x: ev.clientX, y: ev.clientY };
    tipTimer = setTimeout(function () { showTip(el, point); }, 120);
  });
  document.addEventListener("mouseout", function (ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest("[data-tip]") : null;
    if (!el) { return; }
    if (ev.relatedTarget && el.contains(ev.relatedTarget)) { return; }
    hideTip();
  });
  document.addEventListener("scroll", hideTip, true);

  /* boot the router last */
  window.addEventListener("hashchange", route);
  route();
})();
