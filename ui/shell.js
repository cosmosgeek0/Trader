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
      var pill = el("button", "news-pill" + (view.key === netView.tab ? " on" : ""), view.label);
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
      + "order paths are on demand.";
    stage.textContent = "";
    stage.appendChild(chart);
    stage.scrollLeft = Math.min(netMapScroll, Math.max(0, stage.scrollWidth - stage.clientWidth));

    var cloudX = Math.max(285, W * 0.17);
    var coreX = Math.max(cloudX + 315, W * 0.39);
    var rightX = W - 260;
    var browserBox = { x: 40, y: 116, w: 200, h: 124 };
    var cloudBox = { x: cloudX, y: 103, w: 220, h: 150 };
    var coreBox = { x: coreX, y: 52, w: 500, h: 570 };
    var spotBox = { x: rightX, y: 121, w: 220, h: 120 };
    var futuresBox = { x: rightX, y: 273, w: 220, h: 120 };
    var newsBox = { x: rightX, y: 416, w: 220, h: 130 };
    var secretsBox = { x: rightX, y: 572, w: 220, h: 100 };
    var macBox = { x: 40, y: 525, w: 200, h: 106 };
    var ssmBox = { x: cloudX, y: 525, w: 220, h: 106 };

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

    var knownLaneCount = typeof connections.value === "number";
    var laneCount = knownLaneCount ? Math.max(0, Math.min(4, Math.round(connections.value))) : 0;
    var renderedLanes = Math.max(1, laneCount);
    var tunnelCloudPins = [];
    var tunnelCorePins = [];
    for (var lane = 0; lane < renderedLanes; lane++) {
      var laneY = cloudBox.y + 60 + lane * 19;
      tunnelCloudPins.push(laneY - cloudBox.y);
      tunnelCorePins.push(laneY - coreBox.y);
      addWire({
        d: "M" + (cloudBox.x + cloudBox.w) + " " + laneY + "H" + coreBox.x,
        state: cloudCore, speed: speed(tunnelRtt, 2) + lane * 0.12, offset: 4 + lane,
        reverse: lane % 2 === 1, both: true,
        start: [cloudBox.x + cloudBox.w, laneY], end: [coreBox.x, laneY],
        tip: knownLaneCount && laneCount === 0
          ? "Expected Cloudflare tunnel path; currently no live connections"
          : knownLaneCount ? "Encrypted Cloudflare connection " + (lane + 1) + " of " + laneCount
            : "Expected encrypted Cloudflare path; live count unavailable"
      });
    }

    var edgeX = coreBox.x + coreBox.w;
    var spotY = spotBox.y + spotBox.h / 2;
    var futuresY = futuresBox.y + futuresBox.h / 2;
    var newsY = newsBox.y + newsBox.h / 2;
    var secretY = secretsBox.y + secretsBox.h / 2;
    addWire({ d: "M" + edgeX + " " + spotY + "H" + spotBox.x,
      state: spotPathState, speed: speed(spot, 150), offset: 10, both: true,
      start: [edgeX, spotY], end: [spotBox.x, spotY], tip: "EC2 to Binance Spot over public HTTPS" });
    addWire({ d: "M" + edgeX + " " + futuresY + "H" + futuresBox.x,
      state: futuresState, speed: speed(futures, 150), offset: 11, both: true,
      start: [edgeX, futuresY], end: [futuresBox.x, futuresY], tip: "EC2 to Binance Futures over public HTTPS" });
    addWire({ d: "M" + edgeX + " " + newsY + "H" + newsBox.x,
      state: newsState,
      speed: Math.max(4.5, Math.min(12, (typeof newsInterval.value === "number" ? newsInterval.value : 120) / 10)),
      offset: 14, both: true, start: [edgeX, newsY], end: [newsBox.x, newsY],
      tip: "News runner downloads RSS and JSON sources"
    });

    var macY = macBox.y + macBox.h / 2;
    var ssmY = ssmBox.y + ssmBox.h / 2;
    addWire({ d: "M" + (macBox.x + macBox.w) + " " + macY + "H" + ssmBox.x,
      state: "idle", start: [macBox.x + macBox.w, macY], end: [ssmBox.x, macY],
      tip: "Commands and output exist only while the owner connects" });
    addWire({ d: "M" + (ssmBox.x + ssmBox.w) + " " + ssmY + "H" + coreBox.x,
      state: "idle", start: [ssmBox.x + ssmBox.w, ssmY], end: [coreBox.x, ssmY],
      tip: "AWS Systems Manager control channel, on demand" });
    addWire({ d: "M" + edgeX + " " + secretY + "H" + secretsBox.x,
      state: "idle", start: [edgeX, secretY], end: [secretsBox.x, secretY],
      tip: "Trader retrieves credentials from Secrets Manager only when a command starts" });

    function addLogo(parent, kind, x, y) {
      var logo = parent.appendChild(svg("g", {
        "class": "net-circuit-logo " + kind, transform: "translate(" + x + " " + y + ")"
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
      group.appendChild(svg("rect", { width: box.w, height: box.h, rx: 12, "class": "net-circuit-surface",
        style: "stroke:color-mix(in srgb, " + data.brand + " 45%, var(--line-2))" }));
      group.appendChild(svg("path", {
        d: "M1 12Q1 1 12 1H" + (box.w - 12) + "Q" + (box.w - 1) + " 1 " + (box.w - 1)
          + " 12V52H1Z", "class": "net-circuit-node-bar",
        style: "fill:color-mix(in srgb, " + data.brand + " 12%, var(--panel))"
      }));
      addLogo(group, data.logo, 13, 12);
      group.appendChild(svg("text", { x: 53, y: 24, "class": "net-circuit-node-title" })).textContent = data.title;
      group.appendChild(svg("text", { x: 53, y: 41, "class": "net-circuit-node-kicker" })).textContent = data.kicker;
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
        d: "M1 15Q1 1 15 1H485Q499 1 499 15V65H1Z", "class": "net-circuit-core-head",
        style: "fill:color-mix(in srgb, #ff9900 12%, var(--panel))"
      }));
      addLogo(group, "ec2", 18, 18);
      group.appendChild(svg("text", { x: 58, y: 30, "class": "net-circuit-core-title" })).textContent = "YOUR AWS EC2";
      group.appendChild(svg("text", { x: 58, y: 48, "class": "net-circuit-core-meta" })).textContent =
        "ap-south-1 · origin + workers";
      group.appendChild(svg("text", { x: 478, y: 29, "class": "net-circuit-core-live" })).textContent =
        "origin " + shown(origin, "ms");
      group.appendChild(svg("text", { x: 478, y: 47, "class": "net-circuit-core-meta", "text-anchor": "end" })).textContent =
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
      innerWire("M273 147H250V177H16V300H22", tradeState, 23);
      innerWire("M124 262V286", newsState, 24);
      innerWire("M478 129H500", tradeTrunkState, 25, true);
      innerWire("M480 129V570", "idle", 0);
      innerWire("M480 281H500", futuresState, 0);
      innerWire("M227 207H250V274H480", newsState, 26, true);
      innerWire("M480 429H500", newsState, 0);
      innerWire("M480 570H500", "idle", 0);
      innerWire("M0 526H10V550H490V280H375V262", "idle", 0);
      group.appendChild(svg("circle", {
        cx: 480, cy: 129, r: 3.2, "class": "net-circuit-junction " + tradeTrunkState
      }));

      function chip(x, y, w, title, role, value, state) {
        var chipGroup = group.appendChild(svg("g", {
          transform: "translate(" + x + " " + y + ")", "class": "net-circuit-chip " + state
        }));
        chipGroup.appendChild(svg("rect", { width: w, height: 74, rx: 9, "class": "net-circuit-surface" }));
        chipGroup.appendChild(svg("text", { x: 14, y: 20, "class": "net-circuit-chip-title" })).textContent = title;
        chipGroup.appendChild(svg("text", { x: 14, y: 40, "class": "net-circuit-chip-role" })).textContent = role;
        chipGroup.appendChild(svg("text", { x: 14, y: 59, "class": "net-circuit-chip-value" })).textContent = value;
      }
      chip(22, 92, 205, "Website origin", "SERVES UI + LIVE JSON", "local RTT " + shown(origin, "ms"), originState);
      chip(273, 92, 205, "Network checker", "STANDING LOOP · " + reading(snapshot.every, "s").toUpperCase(),
        "Spot " + shown(spot, "ms") + " · F " + shown(futures, "ms"), tradeState);
      chip(22, 188, 205, "News runner", "STANDING LOOP · " + shown(newsInterval, "s"),
        "cycle " + shown(newsDuration, "s") + " · p95 " + shown(newsP95), newsState);
      chip(273, 188, 205, "Trader command", "OWNER STARTED · ON DEMAND",
        "signed orders when used", "idle");

      group.appendChild(svg("rect", { x: 22, y: 286, width: 456, height: 56, rx: 8, "class": "net-circuit-bus" }));
      group.appendChild(svg("text", { x: 36, y: 306, "class": "net-circuit-bus-title" })).textContent = "LIVE FILE BUS";
      group.appendChild(svg("text", { x: 36, y: 327, "class": "net-circuit-bus-value" })).textContent =
        "net.json + news.json";
      group.appendChild(svg("text", {
        x: 462, y: 327, "class": "net-circuit-bus-value", "text-anchor": "end"
      })).textContent = "workers write · website reads";

      group.appendChild(svg("rect", { x: 22, y: 363, width: 456, height: 96, rx: 9, "class": "net-circuit-stage-box" }));
      group.appendChild(svg("text", { x: 36, y: 383, "class": "net-circuit-bus-title" })).textContent =
        "LATEST SPOT REQUEST PATH";
      var stages = [
        ["DNS", shown(dns, "ms")], ["TCP", shown(tcp, "ms")],
        ["TLS", shown(tls, "ms")], ["SERVER", shown(server, "ms")]
      ];
      stages.forEach(function (item, index) {
        var x = 36 + index * 104;
        group.appendChild(svg("rect", {
          x: x, y: 395, width: 88, height: 48, rx: 6, "class": "net-circuit-stage-box"
        }));
        group.appendChild(svg("text", { x: x + 10, y: 413, "class": "net-circuit-stage-name" })).textContent = item[0];
        group.appendChild(svg("text", { x: x + 10, y: 433, "class": "net-circuit-stage-value" })).textContent = item[1];
        if (index < stages.length - 1) {
          group.appendChild(svg("path", {
            d: "M" + (x + 93) + " 419l6 4-6 4Z", "class": "net-circuit-stage-arrow"
          }));
        }
      });

      group.appendChild(svg("rect", { x: 22, y: 480, width: 456, height: 62, rx: 9, "class": "net-circuit-stage-box" }));
      group.appendChild(svg("text", { x: 36, y: 502, "class": "net-circuit-stage-name" })).textContent =
        "CLOCK / HOST SIGNALS";
      group.appendChild(svg("text", { x: 36, y: 525, "class": "net-circuit-stage-value" })).textContent =
        "Binance clock offset " + shown(clockOffset, "ms");
      group.appendChild(svg("text", {
        x: 462, y: 525, "class": "net-circuit-stage-value", "text-anchor": "end"
      })).textContent = "origin " + shown(origin, "ms");
      pins(group, coreBox,
        tunnelCorePins.map(function (y) { return { y: y, state: cloudCore }; })
          .concat([{ y: 526, state: "idle" }]),
        [{ y: 129, state: tradeTrunkState }, { y: 281, state: futuresState },
          { y: 429, state: newsState }, { y: 570, state: "idle" }]);
    }

    drawCore();
    module(browserBox, {
      title: "Your browser", kicker: "VIEWER", logo: "browser", state: browserState,
      brand: "#4285f4",
      lines: ["net.json fetch " + shown(browser, "ms"), "download + parse · every 5 s"],
      left: [], right: [{ y: browserBox.h / 2 - 8, state: browserEdge },
        { y: browserBox.h / 2 + 8, state: browserEdge }],
      tip: "Latest net.json download and JSON parse: " + shown(browser, "ms")
    });
    module(cloudBox, {
      title: "Cloudflare", kicker: "EDGE + TUNNEL", logo: "cloudflare", state: tunnelState,
      brand: "#f38020",
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
      brand: "#f0b90b",
      lines: ["round trip " + shown(spot, "ms"), "clock offset " + shown(clockOffset, "ms")],
      left: [spotBox.h / 2], right: [],
      tip: "EC2 to Binance Spot over public HTTPS: " + shown(spot, "ms")
    });
    module(futuresBox, {
      title: "Binance Futures", kicker: "FAPI.BINANCE.COM", logo: "binance", state: futuresState,
      brand: "#f0b90b",
      lines: ["round trip " + shown(futures, "ms"), "hedge-leg API path"],
      left: [futuresBox.h / 2], right: [],
      tip: "EC2 to Binance Futures over public HTTPS: " + shown(futures, "ms")
    });
    module(newsBox, {
      title: "News sources", kicker: "PUBLIC RSS + JSON", logo: "news", state: newsState,
      brand: "#f26522",
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
      brand: "#dd344c",
      lines: ["read only at command start"], left: [secretsBox.h / 2], right: [],
      tip: "Credentials are retrieved by Trader only when a command starts; the UI never receives them."
    });
    module(macBox, {
      title: "Your Mac", kicker: "OWNER TERMINAL", logo: "terminal", state: "idle",
      brand: "#3a3a3c",
      lines: ["starts commands on demand"], left: [], right: [macBox.h / 2],
      tip: "The owner-control path exists only when you connect."
    });
    module(ssmBox, {
      title: "AWS SSM", kicker: "SYSTEMS MANAGER", logo: "ssm", state: "idle",
      brand: "#e7157b",
      lines: ["commands + output on demand"], left: [ssmBox.h / 2], right: [ssmBox.h / 2],
      tip: "Systems Manager carries owner commands and output on demand."
    });

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
    var status = acts.appendChild(el("span", "status"));
    netDot = status.appendChild(el("i", "status-dot"));
    netAge = status.appendChild(el("span"));
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
