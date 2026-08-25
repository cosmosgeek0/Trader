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
      ["blue", "Blue"], ["indigo", "Indigo"], ["violet", "Violet"]],
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
    blue: "#2557d6", indigo: "#5b5bd6", violet: "#7c3aed" };

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
    overview: "Empty by decision — sections arrive one at a time on your word.",
    account: "Not built yet — it arrives when you order it.",
    markets: "Not built yet — it arrives when you order it.",
    basis: "Not built yet — it arrives when you order it.",
    volume: "Not built yet — it arrives when you order it.",
    machine: "Not built yet — it arrives when you order it.",
    logs: "Not built yet — it arrives when you order it.",
    news: "",
    network: "",
    settings: ""
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
    pageEl.textContent = "";
    devices.clear();
    newsEl = null;
    newsBar = null;
    clearInterval(newsTimer);
    netEl = null;
    netPlot = null;
    netMap = null;
    clearInterval(netTimer);
    var page = document.createElement("div");
    page.className = "page-shell";
    var head = document.createElement("div");
    head.className = "set-head";
    var ttl = document.createElement("b");
    ttl.textContent = h.charAt(0).toUpperCase() + h.slice(1);
    head.appendChild(ttl);
    page.appendChild(head);
    if (PAGES[h]) {
      var sub = document.createElement("div");
      sub.className = "page-sub";
      sub.textContent = PAGES[h];
      page.appendChild(sub);
    }
    pageEl.appendChild(page);
    if (h === "settings") { buildSettings(page, head); }
    else if (h === "news") { buildNews(page, head); }
    else if (h === "network") { buildNetwork(page, head); }
    closePop();
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
    var tabs = document.createElement("div");
    tabs.className = "set-tabs";
    var body = document.createElement("div");
    OPTIONS.tab.forEach(function (pair) {
      var n = pair[0];
      var tb = document.createElement("button");
      tb.className = "set-tab" + (n === settings.tab ? " on" : "");
      tb.textContent = n;
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
      var col = document.createElement("div");
      col.className = "set-col";
      var t = document.createElement("div");
      t.className = "set-title";
      t.textContent = title;
      col.appendChild(t);
      var su = document.createElement("div");
      su.className = "set-sub";
      su.textContent = subText;
      col.appendChild(su);
      r.appendChild(col);
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
        ["Setting", "Value"].forEach(function (text) {
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

  function newsState(on) {
    fetch("/api/news", on === undefined ? { headers: { "X-Requested-With": "XMLHttpRequest" } }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: on }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        newsOn = d.on;
        drawSwitch();
        fetchNews();
      })
      .catch(function () { /* state unknown, stays as shown */ });
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
      if (name === "news") { newsPage = 1; }
      drawNews();
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
    buckets.forEach(function (b, x) {
      var y = 98;
      NEWS_CATS.forEach(function (c) {
        if (!b[c]) { return; }
        var h = Math.max(2, b[c] / max * 88);
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
    out.appendChild(searchBox("sources", "Search sources", newsSourceQuery, function (v) { newsSourceQuery = v; }));
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
    var now = new Date();
    var clockNow = new Intl.DateTimeFormat("en-US", { timeZone: settings.tz, minute: "numeric", second: "numeric" })
      .format(now).split(":").map(Number);
    var hourStart = Math.floor(now.getTime() / 1000) - clockNow[0] * 60 - clockNow[1];
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
    [["all", "All News", items.length]].concat(NEWS_CATS.map(function (c) { return [c, c, perCat[c] || 0]; }))
      .forEach(function (def) {
        var b = el("button", "news-pill" + (newsCat === def[0] ? " on" : ""));
        b.appendChild(document.createTextNode(def[1]));
        b.appendChild(el("span", "news-count", String(def[2])));
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
    var pager = el("div", "dev-pages");
    function pageButton(label, page, on) {
      var b = el("button", "dev-page" + (on ? " on" : ""), label);
      if (page < 1 || page > pages) { b.disabled = true; }
      else { b.addEventListener("click", function () { newsPage = page; drawNews(); }); }
      pager.appendChild(b);
    }
    if (!shown.length) {
      main.appendChild(el("div", "news-empty", "Nothing matches these filters."));
    } else {
      pageButton("‹", newsPage - 1);
      var from = Math.max(1, Math.min(newsPage - 2, pages - 4));
      var to = Math.min(pages, from + 4);
      if (from > 1) { pageButton("1", 1); }
      if (from > 2) { pager.appendChild(el("span", "news-page-gap", "…")); }
      for (var p = from; p <= to; p++) { pageButton(String(p), p, p === newsPage); }
      if (to < pages - 1) { pager.appendChild(el("span", "news-page-gap", "…")); }
      if (to < pages) { pageButton(String(pages), pages); }
      pageButton("›", newsPage + 1);
      pager.appendChild(el("span", "news-page-info",
        (start + 1) + "–" + Math.min(start + NEWS_PAGE_SIZE, shown.length) + " of " + shown.length));
      main.appendChild(pager);
    }
    cols.appendChild(main);

    var side = el("div", "news-side");
    side.appendChild(sourcesBox());
    side.appendChild(activityBox(shown, hourStart));
    var top = tally(shown, "source").slice(0, 8);
    var shades = {};
    top.forEach(function (p, i) { shades[p[0]] = "rgba(100, 116, 139, " + (1 - i * 0.09).toFixed(2) + ")"; });
    side.appendChild(barsBox("Top sources", top, shades));
    side.appendChild(barsBox("Categories", tally(shown, "category"), CATEGORY_COLOR));
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
    acts.appendChild(searchBox("news", "Search news…", newsQuery, function (v) { newsQuery = v; }));
    acts.appendChild(refreshButton(fetchNews));
    newsSwitch = el("button", "set-switch");
    newsSwitch.setAttribute("role", "switch");
    newsSwitch.setAttribute("aria-label", "News on or off");
    newsSwitch.addEventListener("click", function () { newsState(!newsOn); });
    acts.appendChild(newsSwitch);
    var live = acts.appendChild(el("span", "status"));
    newsDot = live.appendChild(el("i", "status-dot"));
    newsAge = live.appendChild(el("span"));
    var toolbar = page.appendChild(el("div", "news-toolbar"));
    newsBar = toolbar.appendChild(el("div", "news-pills"));
    toolbar.appendChild(acts);
    newsEl = page.appendChild(el("div", "news"));
    drawSwitch();
    if (newsData) { drawNews(); }
    newsState();
    newsTimer = setInterval(newsState, 60000);
  }

  /* ---- network: the probe's one file, one graph at a time ---- */
  var netData = null;
  var netOk = true;
  var netEl = null;
  var netDot = null;
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

  function fetchNet() {
    if (!netEl || !netView.on || document.hidden || netRequest) { return; }
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
    if (!netView.on) {
      netDot.className = "status-dot";
      netAge.textContent = "Off";
      return true;
    }
    var age = netData ? Math.round((Date.now() - netData.at) / 1000) : 0;
    var stale = !netOk || !netData || age > netData.every * 3;
    netDot.className = "status-dot " + (!netOk ? "dead" : !netData ? "" : stale ? "stale" : "live");
    netAge.textContent = !netOk ? "Offline" : !netData ? "" : (stale ? "Stale · " : "Live · ") + reading(age, "s");
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
    if (!netView.on) {
      netEl.appendChild(el("div", "page-sub", "Off — the probe keeps recording on the box."));
      return;
    }
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
      var pill = el("button", "news-pill" + (view.key === netView.tab ? " on" : ""), view.label);
      pill.setAttribute("aria-pressed", view.key === netView.tab ? "true" : "false");
      pill.addEventListener("click", function () { netView.tab = view.key; saveNet(); drawNet(); });
      pills.appendChild(pill);
    });
    var seg = el("div", "set-seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Network history range");
    [[1, "1H"], [6, "6H"], [24, "24H"]].forEach(function (o) {
      var b = el("button", "set-seg-btn" + (netView.range === o[0] ? " on" : ""), o[1]);
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
    var hours = netView.range;
    var now = Date.now() / 1000;
    var from = now - hours * 3600;
    var t = netData.t;
    var first = t.length;
    for (var i = 0; i < t.length; i++) { if (t[i] >= from) { first = i; break; } }
    var values = [];
    var failed = false;
    series.forEach(function (s) {
      for (var vi = first; vi < t.length; vi++) {
        if (!s.since || t[vi] >= s.since) {
          if (typeof s.values[vi] === "number") { values.push(s.values[vi]); }
          else if (s.values[vi] === null) { failed = true; }
        }
      }
    });
    if (!values.length) {
      if (failed) { values.push(0); }
      else {
        netPlot.appendChild(el("div", "page-sub", "No samples in this range."));
        netPlace = null;
        return;
      }
    }
    values.sort(function (a, b) { return a - b; });
    var lo = values[0];
    var hi = values[values.length - 1];
    var step = niceCeil(Math.max((hi - lo) / 5, hi * 0.02, 0.5));
    var bottom = Math.max(0, Math.floor((lo - step / 2) / step) * step);
    var ceilTop = Math.ceil((hi + step / 5) / step) * step;
    while ((ceilTop - bottom) / step < 4) {
      if (bottom > 0) { bottom = Math.max(0, bottom - step); }
      ceilTop += step;
    }
    var rows = Math.round((ceilTop - bottom) / step);
    var W = Math.max(netPlot.clientWidth, 860);
    var H = 380;
    var gutter = 56, right = 8;
    var plotW = Math.max(W - gutter - right, 1);
    var top = 38, axisH = 24;
    var plotH = H - top - axisH;
    var base = top + plotH;
    function x(ts) { return gutter + (ts - from) / (hours * 3600) * plotW; }
    function y(v) { return base - (v - bottom) / (ceilTop - bottom) * plotH; }
    var chart = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H,
      "class": "net-graph", role: "img", "aria-label": "Network history graph" });
    chart.appendChild(svg("title", {})).textContent = "Network history · " + hours + " hour" + (hours === 1 ? "" : "s");
    chart.appendChild(svg("desc", {})).textContent = "Time series for "
      + series.map(function (item) { return item.label; }).join(", ") + ". Failures are marked on the time axis.";
    var defs = chart.appendChild(svg("defs", {}));
    var palette = [ACCENTS[settings.accent], "#8b5cf6", "#2ebd85", "#e0812b"];
    var colors = series.map(function (_, index) { return palette[index % palette.length]; });
    var gradients = series.map(function (_, index) {
      var id = "netfade-" + Date.now() + "-" + index;
      var grad = defs.appendChild(svg("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }));
      grad.appendChild(svg("stop", { offset: 0, "stop-color": colors[index],
        "stop-opacity": series.length === 1 ? 0.38 : 0.12 }));
      grad.appendChild(svg("stop", { offset: 1, "stop-color": colors[index], "stop-opacity": 0 }));
      return id;
    });
    for (var g = 1; g < rows; g++) {
      var gv = bottom + step * g;
      chart.appendChild(svg("line", { x1: gutter, y1: y(gv), x2: W - right, y2: y(gv), "class": "grid" }));
      chart.appendChild(svg("text", { x: gutter - 8, y: y(gv) + 4, "text-anchor": "end" })).textContent
        = String(step < 1 ? Math.round(gv * 10) / 10 : Math.round(gv));
    }
    var major = hours === 1 ? 300 : hours === 6 ? 1800 : 7200;
    while (hours * 3600 / major > plotW / 62) { major *= 2; }
    var local = new Intl.DateTimeFormat("en-US", { timeZone: settings.tz, hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .format(new Date(now * 1000)).split(":").map(Number);
    var utc = new Date(now * 1000);
    var offsetMinutes = local[0] * 60 + local[1] - utc.getUTCHours() * 60 - utc.getUTCMinutes();
    if (offsetMinutes > 720) { offsetMinutes -= 1440; }
    if (offsetMinutes < -720) { offsetMinutes += 1440; }
    var offset = offsetMinutes * 60;
    for (var m = Math.ceil((from + offset) / major) * major - offset; m <= now; m += major) {
      chart.appendChild(svg("line", { x1: x(m), y1: top, x2: x(m), y2: base, "class": "grid" }));
      chart.appendChild(svg("text", { x: Math.min(Math.max(x(m), gutter + 18), W - right - 18),
        y: H - 6, "text-anchor": "middle" })).textContent = timeFmt.format(new Date(m * 1000));
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
    series.forEach(function (s, index) {
      var latest = false;
      if (s === netData.series.browser) {
        for (var li = t.length - 1; li >= first; li--) {
          if ((!s.since || t[li] >= s.since) && s.values[li] !== false && s.values[li] !== undefined) {
            latest = s.values[li];
            break;
          }
        }
      } else {
        var probeIndex = t.indexOf(netData.probeAt);
        if (probeIndex >= first && (!s.since || t[probeIndex] >= s.since)) { latest = s.values[probeIndex]; }
      }
      var lx = gutter + index * plotW / series.length;
      chart.appendChild(svg("circle", { cx: lx + 3, cy: 16, r: 3, "class": "legend-dot",
        style: "--net-line:" + colors[index] }));
      var legend = chart.appendChild(svg("text", { x: lx + 12, y: 20, "class": "legend-text" }));
      legend.textContent = s.label + " " + reading(latest, s.unit)
        + (series.length === 1 && s.note ? " · " + s.note : "");
    });
    var mark = chart.appendChild(svg("line", { y1: top, y2: base, "class": "hover", visibility: "hidden" }));
    var snaps = drawn.map(function (item) {
      return chart.appendChild(svg("circle", { r: 4, "class": "dot ring", visibility: "hidden",
        style: "--net-line:" + item.color }));
    });
    var chip = chart.appendChild(svg("g", { "class": "tag", visibility: "hidden" }));
    var chipRect = chip.appendChild(svg("rect", { y: top + 6, height: 20, rx: 5 }));
    var chipText = chip.appendChild(svg("text", { y: top + 20 }));
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
      var parts = [clock(t[chosen])];
      drawn.forEach(function (item, index) {
        var raw = item.series.values[chosen];
        if (item.series.since && t[chosen] < item.series.since || raw === undefined || raw === false) {
          snaps[index].setAttribute("visibility", "hidden");
          parts.push(item.series.label + " no sample");
          return;
        }
        snaps[index].setAttribute("visibility", raw === null ? "hidden" : "visible");
        if (raw !== null) {
          snaps[index].setAttribute("cx", px);
          snaps[index].setAttribute("cy", Math.max(y(raw), top + 2));
        }
        parts.push(item.series.label + " " + reading(raw, item.series.unit));
        var event = item.series.events && item.series.events[chosen] || 0;
        if (event) { parts.push(event + (event === 1 ? " issue" : " issues")); }
        var detail = item.series.details && item.series.details[t[chosen]];
        if (detail) { parts.push(detail.slice(0, 120)); }
      });
      chipText.textContent = parts.join(" · ");
      var w = chipText.getBBox().width + 16;
      var cx = Math.min(Math.max(px - w / 2, gutter), W - right - w);
      chipRect.setAttribute("x", cx);
      chipRect.setAttribute("width", w);
      chipText.setAttribute("x", cx + 8);
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
      if (series) {
        if (key === "browser") {
          for (var index = series.values.length - 1; index >= 0; index--) {
            if (series.values[index] !== false && series.values[index] !== undefined) {
              value = series.values[index];
              break;
            }
          }
        } else {
          var probeIndex = snapshot.t.indexOf(snapshot.probeAt);
          if (probeIndex >= 0) { value = series.values[probeIndex]; }
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
        label: series ? series.label : key
      };
    }

    function health(metrics, warning) {
      if (metrics.some(function (item) { return item.value === null; })) { return "down"; }
      if (metrics.some(function (item) { return item.value === false || item.value === undefined; })) {
        return "unmeasured";
      }
      return warning ? "warn" : "live";
    }

    function worst() {
      var rank = { live: 0, idle: 1, unmeasured: 1, warn: 2, down: 3 };
      var answer = "live";
      for (var i = 0; i < arguments.length; i++) {
        if (rank[arguments[i]] > rank[answer]) { answer = arguments[i]; }
      }
      return answer;
    }

    function shown(item, unit) {
      return reading(item.value, unit === undefined ? item.unit : unit);
    }

    function amount(item, singular, plural) {
      return typeof item.value === "number"
        ? item.value + " " + (item.value === 1 ? singular : plural)
        : reading(item.value);
    }

    var browser = metric("browser");
    var tunnelRtt = metric("cf_rtt");
    var connections = metric("cf_connections");
    var lost = metric("cf_lost");
    var errors = metric("cf_errors");
    var cfSent = metric("cf_sent");
    var cfReceived = metric("cf_received");
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
    var spotPathState = health([spot, dns, tcp, tls, server]);
    var tradeState = worst(spotPathState, futuresState);
    var tradeTrunkState = tradeState;
    if (spotPathState !== futuresState
        && ([spotPathState, futuresState].indexOf("live") >= 0 || [spotPathState, futuresState].indexOf("warn") >= 0)) {
      tradeTrunkState = "warn";
    }
    var newsState = health([newsLive, newsDelayed, newsFailed, newsInterval, newsDuration, newsP95],
      newsDelayed.value > 0 || newsFailed.value > 0);
    if (typeof newsLive.value === "number" && newsLive.value <= 0) { newsState = "down"; }
    var coreState = worst(originState, tradeState, newsState);
    var states = [browserState, tunnelState, originState, spotPathState, futuresState, newsState];
    var liveCount = states.filter(function (state) { return state === "live"; }).length;
    var warnCount = states.filter(function (state) { return state === "warn"; }).length;
    var downCount = states.filter(function (state) { return state === "down"; }).length;
    var unmeasuredCount = states.length - liveCount - warnCount - downCount;

    var head = el("div", "net-map-head");
    netMap.insertBefore(head, stage || null);
    var heading = head.appendChild(el("div", "net-map-heading"));
    heading.appendChild(el("b", "", "Live system circuit"));
    heading.appendChild(el("span", "",
      "Public data plane, EC2 workers, live files and the owner-control path"));
    var summary = head.appendChild(el("div", "net-map-summary"));
    function summaryItem(cls, text) {
      var item = summary.appendChild(el("span", cls || ""));
      item.appendChild(el("i"));
      item.appendChild(document.createTextNode(text));
    }
    summaryItem("", liveCount + " live");
    if (warnCount) { summaryItem("warn", warnCount + " attention"); }
    if (downCount) { summaryItem("down", downCount + " down"); }
    if (unmeasuredCount) { summaryItem("idle", unmeasuredCount + " unmeasured"); }
    summaryItem("idle", "owner paths on demand");

    var clientWidth = Math.max(netMap.clientWidth, 320);
    var W = Math.max(clientWidth, 2192);
    var H = 700;
    if (!stage) {
      stage = netMap.appendChild(el("div", "net-map-stage"));
      stage.addEventListener("scroll", function () { netMapScroll = stage.scrollLeft; });
    }
    var chart = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H,
      "class": "net-map-chart", role: "img", "aria-label": "Live network and process circuit" });
    chart.appendChild(svg("title", {})).textContent = "Live network and process circuit";
    chart.appendChild(svg("desc", {})).textContent =
      "Browser to Cloudflare path: " + browserState + "; latest net.json fetch: " + shown(browser, "ms") + ". "
      + "Cloudflare to origin tunnel: " + tunnelState + "; "
      + amount(connections, "live connection", "live connections") + "; lost " + shown(lost) + "; errors " + shown(errors) + ". "
      + "EC2 origin: " + originState + ". Latest Spot probe: " + shown(spot, "ms")
      + "; Futures probe: " + shown(futures, "ms") + ". News polling: " + newsState + "; "
      + amount(newsLive, "live news group", "live news groups") + ". Mac, Systems Manager, Secrets Manager and signed "
      + "order paths are on demand. External moving light scales from a measured RTT or cadence; internal light shows direction. "
      + "Neither is packet capture.";
    stage.textContent = "";
    stage.appendChild(chart);
    stage.scrollLeft = Math.min(netMapScroll, Math.max(0, stage.scrollWidth - stage.clientWidth));

    var defs = chart.appendChild(svg("defs", {}));
    var smallGrid = defs.appendChild(svg("pattern", {
      id: "net-circuit-grid-small", width: 10, height: 10, patternUnits: "userSpaceOnUse"
    }));
    smallGrid.appendChild(svg("path", { d: "M10 0H0V10", "class": "net-circuit-grid-small" }));
    var largeGrid = defs.appendChild(svg("pattern", {
      id: "net-circuit-grid-large", width: 50, height: 50, patternUnits: "userSpaceOnUse"
    }));
    largeGrid.appendChild(svg("rect", { width: 50, height: 50, fill: "url(#net-circuit-grid-small)" }));
    largeGrid.appendChild(svg("path", { d: "M50 0H0V50", "class": "net-circuit-grid-large" }));
    chart.appendChild(svg("rect", { width: W, height: H, fill: "url(#net-circuit-grid-large)",
      "class": "net-circuit-bg" }));

    var cloudX = Math.max(285, W * 0.17);
    var coreX = Math.max(cloudX + 315, W * 0.39);
    var rightX = W - 260;
    var browserBox = { x: 40, y: 116, w: 200, h: 124 };
    var cloudBox = { x: cloudX, y: 103, w: 220, h: 150 };
    var coreBox = { x: coreX, y: 52, w: 460, h: 570 };
    var spotBox = { x: rightX, y: 72, w: 220, h: 126 };
    var futuresBox = { x: rightX, y: 230, w: 220, h: 126 };
    var newsBox = { x: rightX, y: 388, w: 220, h: 138 };
    var secretsBox = { x: rightX, y: 558, w: 220, h: 100 };
    var macBox = { x: 40, y: 532, w: 200, h: 106 };
    var ssmBox = { x: cloudX, y: 532, w: 220, h: 106 };

    function zone(text, x, y, width) {
      chart.appendChild(svg("text", { x: x, y: y, "class": "net-circuit-zone" })).textContent = text;
      chart.appendChild(svg("line", {
        x1: x, y1: y + 9, x2: x + width, y2: y + 9, "class": "net-circuit-zone-rule"
      }));
    }
    zone("VIEWER / EDGE", 38, 28, Math.max(470, coreX - 82));
    zone("YOUR AWS EC2 · AP-SOUTH-1", coreX, 28, 460);
    zone("PUBLIC SERVICES", rightX, 28, 220);
    zone("OWNER CONTROL · ON DEMAND", 38, 510, Math.max(470, coreX - 82));

    function speed(item, base) {
      var value = typeof item.value === "number" ? item.value : base;
      return Math.max(1.25, Math.min(4.2, 1.05 + value / 95));
    }

    function flowStyle(seconds, offset) {
      var phase = -((Date.now() / 1000 + offset * 0.41) % seconds);
      return "--flow-speed:" + seconds.toFixed(2) + "s;--flow-delay:" + phase.toFixed(2) + "s";
    }

    function addWire(def) {
      var group = chart.appendChild(svg("g", {}));
      if (def.tip) { group.appendChild(svg("title", {})).textContent = def.tip; }
      group.appendChild(svg("path", { d: def.d, "class": "net-circuit-wire " + def.state }));
      if (def.state === "live" || def.state === "warn") {
        var seconds = def.speed || 2.2;
        group.appendChild(svg("path", {
          d: def.d, "class": "net-circuit-flow " + def.state + (def.reverse ? " reverse" : ""),
          style: flowStyle(seconds, def.offset || 0)
        }));
        if (def.both) {
          group.appendChild(svg("path", {
            d: def.d, "class": "net-circuit-flow " + def.state + (def.reverse ? "" : " reverse"),
            style: flowStyle(seconds * 1.08, (def.offset || 0) + 2)
          }));
        }
      }
      if (!def.noEnds) {
        group.appendChild(svg("circle", {
          cx: def.start[0], cy: def.start[1], r: 3.2, "class": "net-circuit-junction " + def.state
        }));
        group.appendChild(svg("circle", {
          cx: def.end[0], cy: def.end[1], r: 3.2, "class": "net-circuit-junction " + def.state
        }));
      }
      return group;
    }

    function wireLabel(x, y, title, sub, width) {
      width = width || Math.max(116, title.length * 6.4 + 20);
      var height = sub ? 35 : 23;
      var group = chart.appendChild(svg("g", {}));
      group.appendChild(svg("rect", {
        x: x - width / 2, y: y - 14, width: width, height: height, rx: 5,
        "class": "net-circuit-label-bg"
      }));
      group.appendChild(svg("text", { x: x, y: y, "class": "net-circuit-label" })).textContent = title;
      if (sub) {
        group.appendChild(svg("text", { x: x, y: y + 14, "class": "net-circuit-label-sub" })).textContent = sub;
      }
    }

    function openSwitch(x, y) {
      var group = chart.appendChild(svg("g", { transform: "translate(" + x + " " + y + ")" }));
      group.appendChild(svg("circle", { cx: -8, cy: 0, r: 2.2, "class": "net-circuit-junction idle" }));
      group.appendChild(svg("circle", { cx: 8, cy: 0, r: 2.2, "class": "net-circuit-junction idle" }));
      group.appendChild(svg("path", { d: "M-6 -1L5 -8", "class": "net-circuit-switch" }));
    }

    var browserEdge = worst(browserState, tunnelState);
    var cloudCore = worst(tunnelState, originState);
    var browserY = browserBox.y + browserBox.h / 2;
    var cloudY = cloudBox.y + cloudBox.h / 2;
    var browserSpeed = speed(browser, 180);
    addWire({
      d: "M" + (browserBox.x + browserBox.w) + " " + (browserY - 8) + "H" + cloudBox.x,
      state: browserEdge, speed: browserSpeed, offset: 1, start: [browserBox.x + browserBox.w, browserY - 8],
      end: [cloudBox.x, browserY - 8], tip: "Browser request over HTTPS"
    });
    addWire({
      d: "M" + (browserBox.x + browserBox.w) + " " + (browserY + 8) + "H" + cloudBox.x,
      state: browserEdge, speed: browserSpeed * 1.08, offset: 2, reverse: true,
      start: [browserBox.x + browserBox.w, browserY + 8], end: [cloudBox.x, browserY + 8],
      tip: "Page and live JSON response"
    });
    wireLabel((browserBox.x + browserBox.w + cloudBox.x) / 2, 77,
      "HTTPS · PAGE + LIVE JSON", "net.json fetch " + shown(browser, "ms"), 184);

    var knownLaneCount = typeof connections.value === "number";
    var laneCount = knownLaneCount ? Math.max(0, Math.min(4, Math.round(connections.value))) : 0;
    var renderedLanes = Math.max(1, laneCount);
    var tunnelCloudPins = [];
    var tunnelCorePins = [];
    var tunnelMiddle = (cloudBox.x + cloudBox.w + coreBox.x) / 2;
    for (var lane = 0; lane < renderedLanes; lane++) {
      var fromY = cloudBox.y + 60 + lane * 19;
      var toY = coreBox.y + 94 + lane * 16;
      tunnelCloudPins.push(fromY - cloudBox.y);
      tunnelCorePins.push(toY - coreBox.y);
      var bend = tunnelMiddle + (lane - (renderedLanes - 1) / 2) * 8;
      addWire({
        d: "M" + (cloudBox.x + cloudBox.w) + " " + fromY + "H" + bend + "V" + toY + "H" + coreBox.x,
        state: cloudCore, speed: speed(tunnelRtt, 2) + lane * 0.12, offset: 4 + lane,
        reverse: lane % 2 === 1, both: true,
        start: [cloudBox.x + cloudBox.w, fromY], end: [coreBox.x, toY],
        tip: knownLaneCount && laneCount === 0
          ? "Expected Cloudflare tunnel path; currently no live connections"
          : knownLaneCount ? "Encrypted Cloudflare connection " + (lane + 1) + " of " + laneCount
            : "Expected encrypted Cloudflare path; live count unavailable"
      });
    }
    wireLabel(tunnelMiddle, 278, "ENCRYPTED CLOUDFLARE TUNNEL",
      amount(connections, "live connection", "live connections") + " · edge " + shown(tunnelRtt, "ms"), 252);

    var branchX = coreBox.x + coreBox.w + Math.max(92, (rightX - coreBox.x - coreBox.w) * 0.46);
    var tradeStart = [coreBox.x + coreBox.w, coreBox.y + 129];
    var spotEnd = [spotBox.x, spotBox.y + spotBox.h / 2];
    var futuresEnd = [futuresBox.x, futuresBox.y + futuresBox.h / 2];
    addWire({ d: "M" + tradeStart[0] + " " + tradeStart[1] + "H" + branchX,
      state: tradeTrunkState, speed: Math.max(speed(spot, 150), speed(futures, 150)), offset: 9, both: true, noEnds: true,
      start: tradeStart, end: [branchX, tradeStart[1]], tip: "Shared EC2 public HTTPS trunk" });
    addWire({ d: "M" + branchX + " " + tradeStart[1] + "V" + spotEnd[1] + "H" + spotEnd[0],
      state: spotPathState, speed: speed(spot, 150), offset: 10, both: true, noEnds: true,
      start: [branchX, tradeStart[1]], end: spotEnd, tip: "EC2 to Binance Spot over public HTTPS" });
    addWire({ d: "M" + branchX + " " + tradeStart[1] + "V" + futuresEnd[1] + "H" + futuresEnd[0],
      state: futuresState, speed: speed(futures, 150), offset: 11, both: true, noEnds: true,
      start: [branchX, tradeStart[1]], end: futuresEnd, tip: "EC2 to Binance Futures over public HTTPS" });
    chart.appendChild(svg("circle", {
      cx: branchX, cy: tradeStart[1], r: 4, "class": "net-circuit-junction " + tradeTrunkState
    }));
    wireLabel((branchX + rightX) / 2, 212, "PUBLIC HTTPS · REST",
      "probes · signed orders on command", 280);

    var newsStart = [coreBox.x + coreBox.w, coreBox.y + 274];
    var newsEnd = [newsBox.x, newsBox.y + newsBox.h / 2];
    var newsBend = coreBox.x + coreBox.w + Math.max(100, (rightX - coreBox.x - coreBox.w) * 0.56);
    addWire({
      d: "M" + newsStart[0] + " " + newsStart[1] + "H" + newsBend + "V" + newsEnd[1] + "H" + newsEnd[0],
      state: newsState,
      speed: Math.max(4.5, Math.min(12, (typeof newsInterval.value === "number" ? newsInterval.value : 120) / 10)),
      offset: 14, both: true, start: newsStart, end: newsEnd,
      tip: "News runner downloads RSS and JSON sources"
    });
    wireLabel((newsBend + rightX) / 2, 432, "RSS + JSON POLLING",
      "poll " + shown(newsInterval, "s") + " · run " + shown(newsDuration, "s"), 232);

    var macY = macBox.y + macBox.h / 2;
    var ssmY = ssmBox.y + ssmBox.h / 2;
    var controlEnd = [coreBox.x, coreBox.y + 526];
    var macSwitchX = (macBox.x + macBox.w + ssmBox.x) / 2;
    var ssmSwitchX = (ssmBox.x + ssmBox.w + coreBox.x) / 2;
    addWire({
      d: "M" + (macBox.x + macBox.w) + " " + macY + "H" + (macSwitchX - 8)
        + "M" + (macSwitchX + 8) + " " + macY + "H" + ssmBox.x,
      state: "idle", start: [macBox.x + macBox.w, macY], end: [ssmBox.x, macY],
      tip: "Commands and output exist only while the owner connects"
    });
    addWire({
      d: "M" + (ssmBox.x + ssmBox.w) + " " + ssmY + "H" + (ssmSwitchX - 8)
        + "M" + (ssmSwitchX + 8) + " " + ssmY + "H" + (coreBox.x - 34)
        + "V" + controlEnd[1] + "H" + controlEnd[0],
      state: "idle", start: [ssmBox.x + ssmBox.w, ssmY], end: controlEnd,
      tip: "AWS Systems Manager control channel, on demand"
    });
    openSwitch(macSwitchX, macY);
    openSwitch(ssmSwitchX, ssmY);
    wireLabel((macBox.x + macBox.w + ssmBox.x) / 2, 650, "COMMANDS + OUTPUT", "on demand", 170);
    wireLabel((ssmBox.x + ssmBox.w + coreBox.x) / 2, 650, "AWS CONTROL CHANNEL", "on demand", 180);

    var secretStart = [coreBox.x + coreBox.w, coreBox.y + 510];
    var secretEnd = [secretsBox.x, secretsBox.y + secretsBox.h / 2];
    var secretBend = branchX + 18;
    var secretSwitchX = (secretBend + secretEnd[0]) / 2;
    addWire({
      d: "M" + secretStart[0] + " " + secretStart[1] + "H" + secretBend
        + "V" + secretEnd[1] + "H" + (secretSwitchX - 8)
        + "M" + (secretSwitchX + 8) + " " + secretEnd[1] + "H" + secretEnd[0],
      state: "idle", start: secretStart, end: secretEnd,
      tip: "Trader retrieves credentials from Secrets Manager only when a command starts"
    });
    openSwitch(secretSwitchX, secretEnd[1]);
    wireLabel((branchX + 18 + rightX) / 2, 535, "CREDENTIALS AT START", "on demand · never exposed to the UI", 242);

    function addLogo(parent, kind, x, y) {
      var logo = parent.appendChild(svg("g", {
        "class": "net-circuit-logo " + kind, transform: "translate(" + x + " " + y + ")"
      }));
      function serviceIcon(color, path) {
        logo.appendChild(svg("rect", { width: 24, height: 24, fill: color }));
        logo.appendChild(svg("path", { d: path, fill: "#fff" }));
      }
      if (kind === "browser") {
        logo.appendChild(svg("circle", { cx: 13, cy: 13, r: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }));
        logo.appendChild(svg("path", { d: "M3 13h20M13 3c4 4.7 4 15.3 0 20M13 3c-4 4.7-4 15.3 0 20", fill: "none",
          stroke: "currentColor", "stroke-width": 1.2 }));
      } else if (kind === "cloudflare") {
        var cloudflare = logo.appendChild(svg("g", { transform: "translate(-28 5) scale(.52)" }));
        cloudflare.appendChild(svg("path", {
          d: "M88.1 24c.3-1 .2-2-.3-2.6-.5-.6-1.2-1-2.1-1.1l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.5-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3-1.1-5.1-5.7-8.9-11.1-8.9-5 0-9.3 3.2-10.8 7.7-1-.7-2.2-1.1-3.6-1-2.4.2-4.3 2.2-4.6 4.6-.1.6 0 1.2.1 1.8-3.9.1-7.1 3.3-7.1 7.3 0 .4 0 .7.1 1.1 0 .2.2.3.3.3h32.1c.2 0 .4-.1.4-.3l.3-1.1z",
          fill: "#f48120"
        }));
        cloudflare.appendChild(svg("path", {
          d: "M93.6 12.8h-.5c-.1 0-.2.1-.3.2l-.7 2.4c-.3 1-.2 2 .3 2.6.5.6 1.2 1 2.1 1.1l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.2.9c-.1.1 0 .3.2.3h13.2c.2 0 .3-.1.3-.3.2-.8.4-1.7.4-2.6 0-5.2-4.3-9.5-9.5-9.5",
          fill: "#faad3f"
        }));
      } else if (kind === "ec2") {
        serviceIcon("#ed7100", "M15 9H10v5h5V9Zm1 0h1v1h-1v1h1v1h-1v1h1v1h-1v.308c0 .381-.311.692-.692.692H15v1h-1v-1h-1v1h-1v-1h-1v1h-1v-1h-.308A.693.693 0 0 1 9 14.308V14H8v-1h1v-1H8v-1h1v-1H8V9h1v-.308C9 8.311 9.311 8 9.692 8H10V7h1v1h1V7h1v1h1V7h1v1h.308c.381 0 .692.311.692.692V9Zm-4 10H5v-6h2v-1H4.8c-.442 0-.8.342-.8.762v6.457c0 .431.351.781.781.781H12.2c.442 0 .8-.342.8-.762V17h-1v2Zm8-14.219v7.438c0 .431-.351.781-.781.781H18v-1h1V5h-7v1h-1V4.781c0-.431.351-.781.781-.781h7.438c.43 0 .781.35.781.781Z");
      } else if (kind === "ssm") {
        serviceIcon("#e7157b", "M7.031 9.268c0 .137.009.274.024.406a.5.5 0 0 1-.122.392.503.503 0 0 1-.276.159C6.028 10.389 5 10.882 5 12.35c0 1.132.811 1.921 1.54 1.921h3.497v1H6.54c-1.227 0-2.54-1.174-2.54-2.921 0-1.415.751-2.5 2.032-2.976a8.21 8.21 0 0 1-.001-.106c0-1.62 1.1-3.299 2.559-3.907 1.7-.712 3.501-.359 4.817.943.348.345.643.752.881 1.214a2.03 2.03 0 0 1 1.077-.311c.903 0 1.915.651 2.147 2.071 1.256.334 2.47 1.288 2.47 3.093h-1c0-1.67-1.411-2.087-2.017-2.189a.5.5 0 0 1-.328-.208.505.505 0 0 1-.081-.379c-.077-.999-.689-1.388-1.191-1.388-.332 0-.645.164-.857.449a.5.5 0 0 1-.474.195.5.5 0 0 1-.397-.325 4.256 4.256 0 0 0-.934-1.511c-.489-.485-1.835-1.525-3.728-.731-1.09.454-1.944 1.765-1.944 2.984Zm8.674 6.836a.677.677 0 0 1-.473.207.68.68 0 0 1-.481-.188.677.677 0 0 1-.019-.955.677.677 0 0 1 .954-.018.677.677 0 0 1 .019.954Zm-.52-2.142a1.675 1.675 0 0 0-1.174.514 1.675 1.675 0 0 0 .046 2.368 1.675 1.675 0 0 0 2.369-.047 1.675 1.675 0 0 0-.046-2.368c-.323-.31-.722-.465-1.195-.467Zm2.942 3.389-.985-.198a.5.5 0 0 0-.393.087l-.504.369a.5.5 0 0 0-.202.345l-.116.992-1.459-.001-.115-.985a.5.5 0 0 0-.2-.344l-.51-.377a.5.5 0 0 0-.394-.088l-.978.195-.449-1.388.915-.42a.5.5 0 0 0 .268-.299l.191-.587a.5.5 0 0 0-.04-.4l-.492-.877 1.18-.857.676.734a.5.5 0 0 0 .371.162l.634-.004a.5.5 0 0 0 .364-.162l.672-.728 1.18.859-.49.873a.5.5 0 0 0-.041.397l.189.593a.5.5 0 0 0 .268.302l.912.419-.452 1.388Zm1.274-2.11-1.116-.514-.056-.175.602-1.07a.5.5 0 0 0-.142-.65l-1.899-1.382a.5.5 0 0 0-.661.066l-.827.895-.196.001-.827-.898a.5.5 0 0 0-.662-.066l-1.901 1.379a.5.5 0 0 0-.142.65l.603 1.074-.055.169-1.121.514a.5.5 0 0 0-.268.609l.725 2.235a.5.5 0 0 0 .573.336l1.196-.239.158.116.14 1.211a.5.5 0 0 0 .497.443l2.35.002a.5.5 0 0 0 .497-.442l.142-1.218.15-.11 1.205.242a.5.5 0 0 0 .574-.336l.728-2.233a.5.5 0 0 0-.267-.609Z");
      } else if (kind === "binance") {
        ["M13 2l4 4-4 4-4-4Z", "M6 9l4 4-4 4-4-4Z", "M20 9l4 4-4 4-4-4Z",
          "M13 16l4 4-4 4-4-4Z", "M13 9l4 4-4 4-4-4Z"].forEach(function (d) {
          logo.appendChild(svg("path", { d: d, fill: "currentColor" }));
        });
      } else if (kind === "news") {
        logo.appendChild(svg("circle", { cx: 6, cy: 20, r: 2.2, fill: "currentColor" }));
        logo.appendChild(svg("path", { d: "M5 12a9 9 0 0 1 9 9M5 5a16 16 0 0 1 16 16", fill: "none",
          stroke: "currentColor", "stroke-width": 3, "stroke-linecap": "round" }));
      } else if (kind === "terminal") {
        logo.appendChild(svg("rect", { x: 2, y: 3, width: 22, height: 19, rx: 3, fill: "none",
          stroke: "currentColor", "stroke-width": 1.4 }));
        logo.appendChild(svg("path", { d: "M6 9l4 4-4 4M13 17h6", fill: "none",
          stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      } else if (kind === "secrets") {
        serviceIcon("#dd344c", "M10.938 15.099h3.117v-2.132h-3.117v2.132Zm.576-3.132h1.972c-.06-1.059-.344-1.467-.972-1.467-.647 0-.937.408-1 1.467Zm3.041 0c.276 0 .5.223.5.5v3.132c0 .276-.224.5-.5.5h-4.118a.5.5 0 0 1-.5-.5v-3.132c0-.277.224-.5.5-.5h.077c.049-.944.332-2.467 2-2.467 1.645 0 1.924 1.523 1.972 2.467h.069ZM7.019 16.41l.81-.586a5.906 5.906 0 0 1-1.043-2.857H8v-1H6.787a5.893 5.893 0 0 1 1.042-2.839l-.81-.586a6.9 6.9 0 0 0-1.232 3.425H5v1h.786a6.906 6.906 0 0 0 1.233 3.443Zm8.795.704a5.91 5.91 0 0 1-2.847 1.024V17h-1v1.138a5.91 5.91 0 0 1-2.848-1.024l-.586.81a6.91 6.91 0 0 0 3.434 1.232V20h1v-.844a6.91 6.91 0 0 0 3.433-1.232l-.586-.81ZM9.119 7.838a5.91 5.91 0 0 1 2.848-1.023V8h1V6.815a5.91 5.91 0 0 1 2.847 1.024l.586-.811a6.9 6.9 0 0 0-3.433-1.209V5h-1v.819a6.9 6.9 0 0 0-3.434 1.21l.586.809Zm10.027 4.129a6.906 6.906 0 0 0-1.232-3.425l-.81.587a5.893 5.893 0 0 1 1.042 2.838H17v1h1.146a5.906 5.906 0 0 1-1.042 2.856l.81.587a6.906 6.906 0 0 0 1.232-3.443H20v-1h-.854Zm-2.369-3.094 1.979-1.979-.707-.707-1.979 1.979.707.707ZM8.155 16.08l-1.978 1.979.707.707 1.978-1.979-.707-.707Zm2.343-6.279L6.356 5.66l-.707.707 4.142 4.141.707-.707Zm5.726 5.716 3.38 3.38-.708.707-3.379-3.38.707-.707Z");
      }
      return logo;
    }

    function stateText(state) {
      return {
        live: "LIVE", warn: "ATTENTION", down: "DOWN",
        idle: "ON DEMAND", unmeasured: "NO DATA"
      }[state] || state.toUpperCase();
    }

    function pins(group, box, left, right) {
      function side(items, x1, x2) {
        (items || []).forEach(function (pin) {
          var y = typeof pin === "number" ? pin : pin.y;
          var state = typeof pin === "number" ? "" : " " + pin.state;
          group.appendChild(svg("line", {
            x1: x1, y1: y, x2: x2, y2: y, "class": "net-circuit-pin" + state
          }));
        });
      }
      side(left, -8, 0);
      side(right, box.w, box.w + 8);
    }

    function module(box, data) {
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + box.x + " " + box.y + ")",
        "class": "net-circuit-node " + data.state, "data-tip": data.tip || ""
      }));
      group.appendChild(svg("rect", { width: box.w, height: box.h, rx: 12, "class": "net-circuit-surface" }));
      group.appendChild(svg("path", {
        d: "M1 12Q1 1 12 1H" + (box.w - 12) + "Q" + (box.w - 1) + " 1 " + (box.w - 1)
          + " 12V52H1Z", "class": "net-circuit-node-bar"
      }));
      addLogo(group, data.logo, 15, 13);
      group.appendChild(svg("text", { x: 53, y: 24, "class": "net-circuit-node-title" })).textContent = data.title;
      group.appendChild(svg("text", { x: 53, y: 41, "class": "net-circuit-node-kicker" })).textContent = data.kicker;
      group.appendChild(svg("text", { x: box.w - 13, y: 24, "class": "net-circuit-state" })).textContent = stateText(data.state);
      group.appendChild(svg("circle", { cx: box.w - 17, cy: 41, r: 3.2, "class": "net-circuit-led" }));
      data.lines.forEach(function (line, index) {
        group.appendChild(svg("text", {
          x: 15, y: 75 + index * 19,
          "class": index === 0 ? "net-circuit-node-value" : "net-circuit-node-detail"
        })).textContent = line;
      });
      pins(group, box, data.left, data.right);
      return group;
    }

    function drawCore() {
      var group = chart.appendChild(svg("g", {
        transform: "translate(" + coreBox.x + " " + coreBox.y + ")",
        "class": "net-circuit-node net-circuit-core " + coreState,
        "data-tip": "Website, network checker, news runner and Trader command run on this EC2 machine."
      }));
      group.appendChild(svg("rect", {
        width: coreBox.w, height: coreBox.h, rx: 15, "class": "net-circuit-surface"
      }));
      group.appendChild(svg("path", {
        d: "M1 15Q1 1 15 1H445Q459 1 459 15V65H1Z", "class": "net-circuit-core-head"
      }));
      addLogo(group, "ec2", 18, 20);
      group.appendChild(svg("text", { x: 58, y: 30, "class": "net-circuit-core-title" })).textContent = "YOUR AWS EC2";
      group.appendChild(svg("text", { x: 58, y: 48, "class": "net-circuit-core-meta" })).textContent =
        "ap-south-1 · origin + workers";
      group.appendChild(svg("text", { x: 438, y: 29, "class": "net-circuit-core-live" })).textContent =
        stateText(coreState) + " · origin " + shown(origin, "ms");
      group.appendChild(svg("text", { x: 438, y: 47, "class": "net-circuit-core-meta", "text-anchor": "end" })).textContent =
        "RX " + shown(hostReceived) + " · TX " + shown(hostSent);

      function innerWire(d, state, flow, both) {
        group.appendChild(svg("path", { d: d, "class": "net-circuit-wire " + state }));
        if (flow && (state === "live" || state === "warn")) {
          group.appendChild(svg("path", {
            d: d, "class": "net-circuit-flow " + state,
            style: flowStyle(2.4, flow)
          }));
          if (both) {
            group.appendChild(svg("path", {
              d: d, "class": "net-circuit-flow " + state + " reverse",
              style: flowStyle(2.55, flow + 1)
            }));
          }
        }
      }
      var tunnelBusTop = Math.min.apply(null, tunnelCorePins.concat([126]));
      var tunnelBusBottom = Math.max.apply(null, tunnelCorePins.concat([126]));
      var tunnelBus = tunnelCorePins.map(function (y) { return "M0 " + y + "H12"; }).join("")
        + "M12 " + tunnelBusTop + "V" + tunnelBusBottom + "M12 126H22";
      innerWire(tunnelBus, cloudCore, 21, true);
      innerWire("M22 330H8V147H22", originState, 22);
      innerWire("M248 147H230V177H16V300H22", tradeState, 23);
      innerWire("M117 262V286", newsState, 24);
      innerWire("M438 129H460", tradeTrunkState, 25, true);
      innerWire("M438 209H440V129", "idle", 0);
      innerWire("M212 207H230V274H337M349 274H446M458 274H460", newsState, 26, true);
      innerWire("M438 241H456V510H460", "idle", 0);
      innerWire("M0 526H10V550H450V280H343V262", "idle", 0);
      group.appendChild(svg("circle", {
        cx: 440, cy: 129, r: 3.2, "class": "net-circuit-junction " + tradeTrunkState
      }));

      function chip(x, y, w, title, role, value, state) {
        var chipGroup = group.appendChild(svg("g", {
          transform: "translate(" + x + " " + y + ")", "class": "net-circuit-chip " + state
        }));
        chipGroup.appendChild(svg("rect", { width: w, height: 74, rx: 9, "class": "net-circuit-surface" }));
        chipGroup.appendChild(svg("circle", { cx: 14, cy: 16, r: 2.8, "class": "net-circuit-led" }));
        chipGroup.appendChild(svg("text", { x: 25, y: 20, "class": "net-circuit-chip-title" })).textContent = title;
        chipGroup.appendChild(svg("text", { x: 14, y: 40, "class": "net-circuit-chip-role" })).textContent = role;
        chipGroup.appendChild(svg("text", { x: 14, y: 59, "class": "net-circuit-chip-value" })).textContent = value;
      }
      chip(22, 92, 190, "Website origin", "SERVES UI + LIVE JSON", "local RTT " + shown(origin, "ms"), originState);
      chip(248, 92, 190, "Network checker", "STANDING LOOP · " + reading(snapshot.every, "s").toUpperCase(),
        "Spot " + shown(spot, "ms") + " · F " + shown(futures, "ms"), tradeState);
      chip(22, 188, 190, "News runner", "STANDING LOOP · " + shown(newsInterval, "s"),
        "cycle " + shown(newsDuration, "s") + " · p95 " + shown(newsP95), newsState);
      chip(248, 188, 190, "Trader command", "OWNER STARTED · ON DEMAND",
        "signed orders when used", "idle");

      group.appendChild(svg("rect", { x: 22, y: 286, width: 416, height: 56, rx: 8, "class": "net-circuit-bus" }));
      group.appendChild(svg("text", { x: 36, y: 306, "class": "net-circuit-bus-title" })).textContent = "LIVE FILE BUS";
      group.appendChild(svg("text", { x: 36, y: 327, "class": "net-circuit-bus-value" })).textContent =
        "net.json + news.json";
      group.appendChild(svg("text", {
        x: 422, y: 327, "class": "net-circuit-bus-value", "text-anchor": "end"
      })).textContent = "workers write · website reads";

      group.appendChild(svg("rect", { x: 22, y: 363, width: 416, height: 96, rx: 9, "class": "net-circuit-stage-box" }));
      group.appendChild(svg("text", { x: 36, y: 383, "class": "net-circuit-bus-title" })).textContent =
        "LATEST SPOT REQUEST PATH";
      var stages = [
        ["DNS", shown(dns, "ms")], ["TCP", shown(tcp, "ms")],
        ["TLS", shown(tls, "ms")], ["SERVER", shown(server, "ms")]
      ];
      stages.forEach(function (item, index) {
        var x = 36 + index * 98;
        group.appendChild(svg("rect", {
          x: x, y: 395, width: 82, height: 48, rx: 6, "class": "net-circuit-stage-box"
        }));
        group.appendChild(svg("text", { x: x + 10, y: 413, "class": "net-circuit-stage-name" })).textContent = item[0];
        group.appendChild(svg("text", { x: x + 10, y: 433, "class": "net-circuit-stage-value" })).textContent = item[1];
        if (index < stages.length - 1) {
          group.appendChild(svg("path", {
            d: "M" + (x + 87) + " 419l6 4-6 4Z", "class": "net-circuit-stage-arrow"
          }));
        }
      });

      group.appendChild(svg("rect", { x: 22, y: 480, width: 416, height: 62, rx: 9, "class": "net-circuit-stage-box" }));
      group.appendChild(svg("text", { x: 36, y: 502, "class": "net-circuit-stage-name" })).textContent =
        "CLOCK / HOST SIGNALS";
      group.appendChild(svg("text", { x: 36, y: 525, "class": "net-circuit-stage-value" })).textContent =
        "Binance clock offset " + shown(clockOffset, "ms");
      group.appendChild(svg("text", {
        x: 422, y: 525, "class": "net-circuit-stage-value", "text-anchor": "end"
      })).textContent = "origin " + shown(origin, "ms");
      pins(group, coreBox,
        tunnelCorePins.map(function (y) { return { y: y, state: cloudCore }; })
          .concat([{ y: 526, state: "idle" }]),
        [{ y: 129, state: tradeTrunkState }, { y: 274, state: newsState }, { y: 510, state: "idle" }]);
    }

    drawCore();
    module(browserBox, {
      title: "Your browser", kicker: "VIEWER", logo: "browser", state: browserState,
      lines: ["net.json fetch " + shown(browser, "ms"), "download + parse · every 5 s"],
      left: [], right: [{ y: browserBox.h / 2 - 8, state: browserEdge },
        { y: browserBox.h / 2 + 8, state: browserEdge }],
      tip: "Latest net.json download and JSON parse: " + shown(browser, "ms")
    });
    module(cloudBox, {
      title: "Cloudflare", kicker: "EDGE + TUNNEL", logo: "cloudflare", state: tunnelState,
      lines: ["edge RTT " + shown(tunnelRtt, "ms"),
        amount(connections, "live connection", "live connections"),
        "lost " + shown(lost) + " · errors " + shown(errors),
        "RX " + shown(cfReceived) + " · TX " + shown(cfSent)],
      left: [{ y: cloudY - cloudBox.y - 8, state: browserEdge },
        { y: cloudY - cloudBox.y + 8, state: browserEdge }],
      right: tunnelCloudPins.map(function (y) { return { y: y, state: cloudCore }; }),
      tip: amount(connections, "Cloudflare connection", "Cloudflare connections") + " · edge "
        + shown(tunnelRtt, "ms") + " · lost " + shown(lost) + " · errors " + shown(errors)
    });
    module(spotBox, {
      title: "Binance Spot", kicker: "API.BINANCE.COM", logo: "binance", state: spotState,
      lines: ["round trip " + shown(spot, "ms"), "clock offset " + shown(clockOffset, "ms")],
      left: [spotBox.h / 2], right: [],
      tip: "EC2 to Binance Spot over public HTTPS: " + shown(spot, "ms")
    });
    module(futuresBox, {
      title: "Binance Futures", kicker: "FAPI.BINANCE.COM", logo: "binance", state: futuresState,
      lines: ["round trip " + shown(futures, "ms"), "hedge-leg API path"],
      left: [futuresBox.h / 2], right: [],
      tip: "EC2 to Binance Futures over public HTTPS: " + shown(futures, "ms")
    });
    module(newsBox, {
      title: "News sources", kicker: "PUBLIC RSS + JSON", logo: "news", state: newsState,
      lines: [amount(newsLive, "live group", "live groups"),
        amount(newsDelayed, "delayed group", "delayed groups") + " · "
          + amount(newsFailed, "failed feed", "failed feeds"),
        "cadence " + shown(newsInterval, "s") + " · cycle " + shown(newsDuration, "s")],
      left: [newsBox.h / 2], right: [],
      tip: amount(newsLive, "live news group", "live news groups") + " · "
        + amount(newsFailed, "failed feed", "failed feeds") + " · p95 " + shown(newsP95)
    });
    module(secretsBox, {
      title: "Secrets Manager", kicker: "AWS CREDENTIALS PATH", logo: "secrets", state: "idle",
      lines: ["read only at command start"], left: [secretsBox.h / 2], right: [],
      tip: "Credentials are retrieved by Trader only when a command starts; the UI never receives them."
    });
    module(macBox, {
      title: "Your Mac", kicker: "OWNER TERMINAL", logo: "terminal", state: "idle",
      lines: ["starts commands on demand"], left: [], right: [macBox.h / 2],
      tip: "The owner-control path exists only when you connect."
    });
    module(ssmBox, {
      title: "AWS SSM", kicker: "SYSTEMS MANAGER", logo: "ssm", state: "idle",
      lines: ["commands + output on demand"], left: [ssmBox.h / 2], right: [ssmBox.h / 2],
      tip: "Systems Manager carries owner commands and output on demand."
    });

    var note = netMap.appendChild(el("div", "net-map-note"));
    note.appendChild(el("span", "",
      "External moving light scales from the latest RTT or cadence; internal light shows direction. It is an operational signal, not packet capture."));
    var sampleAge = hasSnapshot ? Math.max(0, Math.round((Date.now() - snapshot.at) / 1000)) : false;
    note.appendChild(el("span", "",
      "UI 5 s · probe " + reading(snapshot.every, "s") + " · sample age " + reading(sampleAge, "s")));
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
    }
  });

  function buildNetwork(page, head) {
    var acts = el("div", "set-actions");
    acts.appendChild(refreshButton(fetchNet));
    var status = acts.appendChild(el("span", "status"));
    netDot = status.appendChild(el("i", "status-dot"));
    netAge = status.appendChild(el("span"));
    var sw = el("button", "set-switch" + (netView.on ? " on" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", netView.on ? "true" : "false");
    sw.setAttribute("aria-label", "Network display");
    sw.addEventListener("click", function () {
      netView.on = !netView.on;
      saveNet();
      sw.classList.toggle("on", netView.on);
      sw.setAttribute("aria-checked", netView.on ? "true" : "false");
      drawNet();
      if (netView.on) { fetchNet(); }
    });
    acts.appendChild(sw);
    head.appendChild(acts);
    netEl = page.appendChild(el("div"));
    drawNet();
    fetchNet();
    netTimer = setInterval(fetchNet, 5000);
  }

  /* ---- one floating tooltip for every [data-tip] ---- */
  function showTip(el) {
    if (el.classList.contains("nav-row") && state() === "expanded") { return; }
    if (settings.tips === "off") { return; }
    var text = el.getAttribute("data-tip");
    if (!text) { return; }
    tip.textContent = text;
    if (el.getAttribute("data-kbd")) {
      var k1 = document.createElement("span");
      k1.className = "kbd"; k1.textContent = KBD;
      var k2 = document.createElement("span");
      k2.className = "kbd"; k2.textContent = "\\";
      tip.appendChild(k1); tip.appendChild(k2);
    }
    var r = el.getBoundingClientRect();
    tip.style.left = "0px";
    tip.style.top = "0px";
    var z = zoomFactor();
    tip.style.maxWidth = Math.max(160, Math.min(360, window.innerWidth / z - 16)) + "px";
    tip.setAttribute("aria-hidden", "false");
    tip.style.left = Math.round(Math.max(8, Math.min(r.right + 10,
      window.innerWidth - tip.offsetWidth * z - 8)) / z) + "px";
    var tipTop = (r.top + r.height / 2) / z - tip.offsetHeight / 2;
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
    tipTimer = setTimeout(function () { showTip(el); }, 150);
  });
  document.addEventListener("mouseout", function (ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest("[data-tip]") : null;
    if (!el) { return; }
    if (ev.relatedTarget && el.contains(ev.relatedTarget)) { return; }
    hideTip();
  });
  document.addEventListener("scroll", hideTip, true);

  /* ---- global search: opens on focus, grouped results, arrow/enter
     keys, ⌘K focus, dim click or blur closes. Index = the pages. ---- */
  var qsWrap = document.getElementById("qsearch");
  var qsBox = document.getElementById("qsearch-box");
  var qsInput = document.getElementById("qsearch-input");
  var qsKbd = document.getElementById("qsearch-k");
  var qsPop = document.getElementById("qsearch-pop");
  var qsDim = document.getElementById("qsearch-dim");
  qsDim.addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    qsClose();
  });
  var qsQ = "";
  var qsSel = 0;
  var qsOpen = false;
  var qsResults = [];

  var QS_PAGES = [
    { label: "Overview", hint: "Money page — empty by decision", page: "overview",
      keywords: "overview money pnl equity home dashboard" },
    { label: "Account", hint: "Not built yet", page: "account",
      keywords: "account balances wallet spot futures margin funds" },
    { label: "Markets", hint: "Not built yet", page: "markets",
      keywords: "markets pairs symbols prices tickers" },
    { label: "Basis", hint: "Not built yet", page: "basis",
      keywords: "basis spread carry premium funding" },
    { label: "Volume", hint: "Not built yet", page: "volume",
      keywords: "volume turnover flow" },
    { label: "Machine", hint: "Not built yet", page: "machine",
      keywords: "machine host server health" },
    { label: "Logs", hint: "Not built yet", page: "logs",
      keywords: "logs runs history output" },
    { label: "News", hint: "Headlines, sources, activity", page: "news",
      keywords: "news headlines sources feed articles" },
    { label: "Network", hint: "Connections and their history", page: "network",
      keywords: "network latency probe connections binance" },
    { label: "Settings", hint: "General, notifications, devices", page: "settings",
      keywords: "settings preferences general" }
  ];

  var QS_SETTINGS = [
    ["Theme", "General", "light dark system appearance"],
    ["Accent", "General", "colour color highlight focus"],
    ["Interface scale", "General", "zoom size bigger smaller"],
    ["Motion", "General", "animations reduced"],
    ["Density", "General", "compact comfortable rows spacing"],
    ["Font", "General", "inter system typeface"],
    ["Language", "General", "english hindi chinese spanish french formats"],
    ["Clock", "General", "time zone ist utc london new york tokyo"],
    ["Time format", "General", "24-hour 12-hour am pm"],
    ["Sidebar", "General", "collapsed expanded"],
    ["Default landing page", "General", "start home open"],
    ["Basis unit", "General", "percent bps basis points"],
    ["Currency", "General", "usd eur gbp inr jpy money"],
    ["Show seconds", "General", "clock seconds"],
    ["Clock date", "General", "day month date"],
    ["Striped tables", "General", "zebra rows shading"],
    ["Tooltips", "General", "hints hover"],
    ["Font smoothing", "General", "antialiasing macos"],
    ["Keep screen awake", "General", "sleep wake lock"],
    ["Confirm device logout", "General", "ask confirm"],
    ["Browser notifications", "Notifications", "permission enable alerts"],
    ["Device sign-ins", "Notifications", "alert new device login"],
    ["Device logouts", "Notifications", "alert logout"],
    ["Sound", "Notifications", "tone beep alert"],
    ["When", "Notifications", "always background alerts"]
  ];

  function qsOpenSettings(tab) {
    settings.tab = tab;
    saveSettings();
    if (location.hash === "#settings") { route(); } else { location.hash = "#settings"; }
  }

  var qsField = document.createElement("input");
  var qsList = document.createElement("div");
  var qsCount = document.createElement("span");
  (function () {
    var row = document.createElement("div");
    row.className = "ssr-input-row";
    row.appendChild(qsBox.querySelector("svg").cloneNode(true));
    qsField.className = "ssr-field";
    qsField.placeholder = "Search pages, settings, devices, news…";
    qsField.setAttribute("aria-label", "Search the site");
    row.appendChild(qsField);
    var esc = document.createElement("kbd");
    esc.className = "ssr-kbd";
    esc.textContent = "esc";
    row.appendChild(esc);
    qsList.className = "ssr-list";
    var foot = document.createElement("div");
    foot.className = "ssr-foot";
    [["↑↓", "navigate"], ["↵", "open"], ["esc", "close"]].forEach(function (pair) {
      var s = document.createElement("span");
      var k = document.createElement("kbd");
      k.className = "ssr-kbd";
      k.textContent = pair[0];
      s.appendChild(k);
      s.appendChild(document.createTextNode(pair[1]));
      foot.appendChild(s);
    });
    var grow = document.createElement("span");
    grow.className = "grow";
    foot.appendChild(grow);
    foot.appendChild(qsCount);
    qsPop.appendChild(row);
    qsPop.appendChild(qsList);
    qsPop.appendChild(foot);
  })();

  function qsPalette() {
    if (!qsOpen) {
      qsOpen = true;
      qsQ = "";
      qsField.value = "";
      qsSel = 0;
      if (!newsData) { try { fetchNews(); } catch (e) { /* news page code absent */ } }
      qsRender();
    }
    qsField.focus();
  }

  function qsClose() {
    if (!qsOpen) { return; }
    qsOpen = false;
    qsRender();
  }

  function qsScore(ql, label, extra) {
    var l = label.toLowerCase();
    if (l.indexOf(ql) === 0) { return 0; }
    if (l.indexOf(ql) !== -1) { return 1; }
    if (extra && extra.toLowerCase().indexOf(ql) !== -1) { return 2; }
    return -1;
  }

  function qsCompute() {
    var ql = qsQ.trim().toLowerCase();
    var out = [];
    var i;
    if (!ql) {
      for (i = 0; i < QS_PAGES.length; i++) {
        var pe = QS_PAGES[i];
        out.push({ group: "Pages", label: pe.label, hint: pe.hint, icon: pe.page,
          go: (function (pg) { return function () { location.hash = "#" + pg; }; })(pe.page) });
      }
      return out;
    }
    var scored = [];
    for (i = 0; i < QS_PAGES.length; i++) {
      var e = QS_PAGES[i];
      var s = qsScore(ql, e.label, e.hint + " " + e.keywords);
      if (s >= 0) {
        scored.push({ s: s, r: { group: "Pages", label: e.label, hint: e.hint, icon: e.page,
          go: (function (pg) { return function () { location.hash = "#" + pg; }; })(e.page) } });
      }
    }
    for (i = 0; i < QS_SETTINGS.length; i++) {
      var st = QS_SETTINGS[i];
      var s2 = qsScore(ql, st[0], st[1] + " " + st[2]);
      if (s2 >= 0) {
        scored.push({ s: s2 + 3, r: { group: "Settings", label: st[0], hint: st[1] + " setting", icon: "settings",
          go: (function (tab) { return function () { qsOpenSettings(tab); }; })(st[1]) } });
      }
    }
    var s3 = qsScore(ql, "Devices", "device sessions sign-ins logout");
    if (s3 >= 0) {
      scored.push({ s: s3 + 6, r: { group: "Devices", label: "Devices",
        hint: "Signed-in devices", icon: "settings",
        go: function () { qsOpenSettings("Devices"); } } });
    }
    var nw = 0;
    var items = newsData && newsData.items ? newsData.items : [];
    for (i = 0; i < items.length && nw < 8; i++) {
      var it = items[i];
      var s4 = qsScore(ql, it.title || "", (it.source || "") + " " + (it.category || ""));
      if (s4 >= 0) {
        nw++;
        scored.push({ s: s4 + 9, r: { group: "News", label: it.title,
          hint: (it.source || "") + (it.category ? " · " + it.category : ""), icon: "news",
          go: (function (u) { return function () { if (u) { window.open(u, "_blank", "noopener"); } else { location.hash = "#news"; } }; })(it.url) } });
      }
    }
    scored.sort(function (a, b) { return a.s - b.s; });
    for (i = 0; i < scored.length; i++) { out.push(scored[i].r); }
    return out;
  }

  function qsGo(e) {
    if (!e) { return; }
    e.go();
    qsClose();
  }

  function qsRowEl(e, i) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "ssr-row" + (i === qsSel ? " sel" : "");
    var mark = document.createElement("span");
    mark.className = "ssr-mark";
    var src = document.querySelector('.nav-row[data-page="' + e.icon + '"] svg');
    if (src) { mark.appendChild(src.cloneNode(true)); }
    var asset = document.createElement("span");
    asset.className = "ssr-asset";
    var lb = document.createElement("span");
    lb.className = "ssr-label";
    lb.textContent = e.label;
    var ht = document.createElement("span");
    ht.className = "ssr-hint";
    ht.textContent = e.hint;
    asset.appendChild(lb);
    asset.appendChild(ht);
    var right = document.createElement("span");
    right.className = "ssr-action";
    right.appendChild(document.createTextNode("Open"));
    var rk = document.createElement("kbd");
    rk.className = "ssr-kbd";
    rk.textContent = "↵";
    right.appendChild(rk);
    row.appendChild(mark);
    row.appendChild(asset);
    row.appendChild(right);
    row.setAttribute("data-i", String(i));
    row.addEventListener("mouseenter", function () {
      if (qsSel !== i) {
        qsSel = i;
        var all = qsList.querySelectorAll(".ssr-row");
        for (var r = 0; r < all.length; r++) {
          all[r].classList.toggle("sel",
            all[r].getAttribute("data-i") === String(i));
        }
      }
    });
    row.addEventListener("mousedown", function (ev) {
      if (ev.button === 0) { ev.preventDefault(); }
    });
    row.addEventListener("click", function () {
      qsGo(e);
    });
    return row;
  }

  function qsRender() {
    qsWrap.classList.toggle("open", qsOpen);
    qsBox.classList.toggle("on", qsOpen);
    qsPop.hidden = !qsOpen;
    qsDim.hidden = !qsOpen;
    if (!qsOpen) { return; }
    qsResults = qsCompute();
    qsList.textContent = "";
    qsCount.textContent = qsResults.length + (qsResults.length === 1 ? " result" : " results");
    if (!qsResults.length) {
      var none = document.createElement("div");
      none.className = "ssr-empty";
      none.textContent = "No matches across pages, settings, devices or the loaded news.";
      qsList.appendChild(none);
      return;
    }
    var lastGroup = "";
    for (var i = 0; i < qsResults.length; i++) {
      if (qsResults[i].group !== lastGroup) {
        lastGroup = qsResults[i].group;
        var gt = document.createElement("div");
        gt.className = "ssr-group-title";
        gt.textContent = lastGroup;
        qsList.appendChild(gt);
      }
      qsList.appendChild(qsRowEl(qsResults[i], i));
    }
    var selEl = qsList.querySelector(".ssr-row.sel");
    if (selEl && selEl.scrollIntoView) {
      selEl.scrollIntoView({ block: "nearest" });
    }
  }

  qsInput.readOnly = true;
  qsInput.addEventListener("focus", function () {
    qsInput.blur();
    qsPalette();
  });
  qsBox.addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    qsPalette();
  });
  qsField.addEventListener("blur", function () { qsClose(); });
  qsField.addEventListener("input", function () {
    qsQ = qsField.value;
    qsSel = 0;
    qsRender();
  });
  qsField.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!qsResults.length) { return; }
      qsSel = Math.min(qsSel + 1, qsResults.length - 1);
      qsRender();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!qsResults.length) { return; }
      qsSel = Math.max(qsSel - 1, 0);
      qsRender();
    } else if (ev.key === "Enter") {
      qsGo(qsResults[qsSel]);
    } else if (ev.key === "Escape") {
      ev.stopPropagation();
      qsClose();
    }
  });
  qsKbd.addEventListener("click", function () { qsPalette(); });
  document.addEventListener("keydown", function (ev) {
    if ((ev.key === "k" || ev.key === "K") && ev.metaKey) {
      ev.preventDefault();
      qsPalette();
    }
  });

  /* boot the router last */
  window.addEventListener("hashchange", route);
  route();
})();
