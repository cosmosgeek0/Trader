/* Quant shell — extracted clean from the old room: clock, collapsible
   sidebar, tooltips, router, account popup, theme system, ⌘K search
   over pages. Network pages, news plumbing, and every backend call
   removed. Pages are skeletons; they get designed one at a time. */
"use strict";

(function () {
  var clockEl = document.getElementById("clock");
  var clockFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "UTC"
  });

  function tickClock() {
    clockEl.textContent = clockFmt.format(new Date());
  }
  tickClock();
  setInterval(tickClock, 250);

  /* ---- elements ---- */
  var side = document.getElementById("side");
  var brandBtn = document.getElementById("brand-btn");
  var collapseBtn = document.getElementById("side-collapse");
  var tip = document.getElementById("tip");
  var pop = document.getElementById("pop");
  var profile = document.getElementById("profile");
  var tipTimer = null;
  var KEY = "quant.side";
  var THEME_KEY = "quant.theme";
  var KBD = "⌘";

  /* ---- theme: system | light | dark ---- */
  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  var themeChoice = "system";
  try {
    var t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark" || t === "system") { themeChoice = t; }
  } catch (e) { /* private mode */ }

  function applyTheme() {
    var resolved = themeChoice === "system"
      ? (mql.matches ? "dark" : "light") : themeChoice;
    document.documentElement.setAttribute("data-theme", resolved);
    var btns = pop.querySelectorAll(".tbtn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-theme-set") === themeChoice;
      btns[i].classList.toggle("on", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function setTheme(choice) {
    themeChoice = choice;
    try { localStorage.setItem(THEME_KEY, choice); } catch (e) { /* ok */ }
    applyTheme();
  }

  mql.addEventListener("change", function () {
    if (themeChoice === "system") { applyTheme(); }
  });
  applyTheme();

  pop.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest
      ? ev.target.closest("[data-theme-set]") : null;
    if (btn) { setTheme(btn.getAttribute("data-theme-set")); }
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
    var next = state() === "expanded" ? "collapsed" : "expanded";
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  apply(saved === "expanded" ? "expanded" : "collapsed");

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
    overview: ["Overview", "Empty by decision — sections arrive one at a time on your word."],
    basis: ["Basis", "Not built yet — it arrives when you order it."],
    volume: ["Volume", "Not built yet — it arrives when you order it."],
    machine: ["Machine", "Not built yet — it arrives when you order it."],
    logs: ["Logs", "Not built yet — it arrives when you order it."],
    settings: ["Settings", "The space is prepared — its sections land on your word."]
  };

  function route() {
    var h = (location.hash || "#overview").slice(1);
    if (!Object.prototype.hasOwnProperty.call(PAGES, h)) { h = "overview"; }
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-page") === h;
      rows[i].classList.toggle("active", on);
      if (on) { rows[i].setAttribute("aria-current", "page"); }
      else { rows[i].removeAttribute("aria-current"); }
    }
    pageEl.textContent = "";
    var page = document.createElement("div");
    page.className = "page-shell";
    var t = document.createElement("div");
    t.className = "page-title";
    t.textContent = PAGES[h][0];
    var sub = document.createElement("div");
    sub.className = "page-sub";
    sub.textContent = PAGES[h][1];
    page.appendChild(t);
    page.appendChild(sub);
    pageEl.appendChild(page);
    closePop();
  }

  /* ---- account popup: hover or click opens it ---- */
  var popTimer = null;

  function openPop() {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    if (!pop.hidden) { return; }
    pop.hidden = false;
    var r = profile.getBoundingClientRect();
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var left = Math.min(Math.max(8, Math.round(r.left - 4)),
      window.innerWidth - w - 8);
    var top = Math.max(8, Math.round(r.top - h - 10));
    pop.style.left = left + "px";
    pop.style.top = top + "px";
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

  /* ---- one floating tooltip for every [data-tip] ---- */
  function showTip(el) {
    if (el.classList.contains("nav-row") && state() === "expanded") { return; }
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
    tip.setAttribute("aria-hidden", "false");
    var h = tip.offsetHeight;
    tip.style.left = Math.round(r.right + 10) + "px";
    tip.style.top = Math.round(r.top + r.height / 2 - h / 2) + "px";
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
  var qsFocused = false;
  var qsResults = [];

  var QS_PAGES = [
    { label: "Overview", hint: "Money page — empty by decision",
      page: "overview", keywords: "overview money pnl equity home dashboard" },
    { label: "Basis", hint: "Not built yet", page: "basis",
      keywords: "basis gap spot perp edge funding arbitrage" },
    { label: "Volume", hint: "Not built yet", page: "volume",
      keywords: "volume surge candle spike momentum mover" },
    { label: "Machine", hint: "Not built yet", page: "machine",
      keywords: "machine trader authority policy execution quant" },
    { label: "Logs", hint: "Not built yet", page: "logs",
      keywords: "logs journal history trades receipts events" },
    { label: "Settings", hint: "Not built yet", page: "settings",
      keywords: "settings preferences theme language account" }
  ];

  function qsClose() {
    qsQ = "";
    qsInput.value = "";
    qsInput.blur();
  }

  function qsCompute() {
    var ql = qsQ.trim().toLowerCase();
    if (!ql) { return QS_PAGES.slice(); }
    var scored = [];
    for (var i = 0; i < QS_PAGES.length; i++) {
      var e = QS_PAGES[i];
      var l = e.label.toLowerCase();
      var score = -1;
      if (l.indexOf(ql) === 0) { score = 0; }
      else if (l.indexOf(ql) !== -1) { score = 2; }
      else if (e.keywords.indexOf(ql) !== -1) { score = 3; }
      if (score >= 0) { scored.push({ e: e, score: score }); }
    }
    scored.sort(function (a, b) { return a.score - b.score; });
    return scored.map(function (x) { return x.e; });
  }

  function qsGo(e) {
    if (!e) { return; }
    location.hash = "#" + e.page;
    qsClose();
  }

  function qsRowEl(e, i) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "ssr-row" + (i === qsSel ? " sel" : "");
    var mark = document.createElement("span");
    mark.className = "ssr-mark";
    mark.appendChild(document.querySelector(
      '.nav-row[data-page="' + e.page + '"] svg').cloneNode(true));
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
    right.textContent = "Open";
    row.appendChild(mark);
    row.appendChild(asset);
    row.appendChild(right);
    row.setAttribute("data-i", String(i));
    row.addEventListener("mouseenter", function () {
      if (qsSel !== i) {
        qsSel = i;
        var all = qsPop.querySelectorAll(".ssr-row");
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
    qsWrap.classList.toggle("open", qsFocused);
    qsBox.classList.toggle("on", qsFocused);
    if (!qsFocused) {
      qsPop.hidden = true;
      qsDim.hidden = true;
      return;
    }
    qsPop.hidden = false;
    qsDim.hidden = false;
    qsResults = qsCompute();
    qsPop.textContent = "";
    if (!qsResults.length) {
      var none = document.createElement("div");
      none.className = "ssr-empty";
      none.textContent = "No matches — try a page name.";
      qsPop.appendChild(none);
      return;
    }
    var gt = document.createElement("div");
    gt.className = "ssr-group-title";
    gt.textContent = "Pages";
    qsPop.appendChild(gt);
    for (var i = 0; i < qsResults.length; i++) {
      qsPop.appendChild(qsRowEl(qsResults[i], i));
    }
    var selEl = qsPop.querySelector(".ssr-row.sel");
    if (selEl && selEl.scrollIntoView) {
      selEl.scrollIntoView({ block: "nearest" });
    }
  }

  qsInput.addEventListener("focus", function () {
    qsFocused = true;
    qsSel = 0;
    qsRender();
  });
  qsInput.addEventListener("blur", function () {
    qsFocused = false;
    qsRender();
  });
  qsBox.addEventListener("mousedown", function (ev) {
    if (ev.target !== qsInput) {
      ev.preventDefault();
      qsInput.focus();
    }
  });
  qsInput.addEventListener("input", function () {
    qsQ = qsInput.value;
    qsSel = 0;
    qsRender();
  });
  qsInput.addEventListener("keydown", function (ev) {
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
  qsKbd.addEventListener("click", function () { qsInput.focus(); });
  document.addEventListener("keydown", function (ev) {
    if ((ev.key === "k" || ev.key === "K") && ev.metaKey) {
      ev.preventDefault();
      qsInput.focus();
    }
  });

  /* boot the router last */
  window.addEventListener("hashchange", route);
  route();
})();
