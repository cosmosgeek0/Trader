"use strict";

window.createDevices = function (ui) {
  var PAGE_SIZE = 20;
  var devEl = null;
  var sessRows = [];
  var knownIds = null;
  var drawnKey = null;
  var devPage = 1;
  var profile = document.getElementById("profile");
  var pop = document.getElementById("pop");
  var avatarEl = profile.querySelector(".avatar");
  var sessEl = document.getElementById("sessions");
  var regionName = null;
  try { regionName = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { /* old browser */ }

  function region(code) {
    if (code === "T1") { return "Tor"; }
    try { return (regionName && regionName.of(code)) || code; }
    catch (e) { return code; }
  }

  function deviceIcon(name) {
    var kind = name === "iPhone" || name === "Android" ? "phone"
      : name === "iPad" ? "tablet" : "monitor";
    var ico = document.querySelector('#sess-icons svg[data-d="' + kind + '"]').cloneNode(true);
    ico.classList.add("sess-ico");
    return ico;
  }

  function logoutButton(id, name, cls) {
    return ui.button("Log out", cls || "sess-out", function () {
      if (ui.settings.confirmLogout === "on" && !confirm("Log out " + name + "?")) { return; }
      fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
      })
        .then(pollSessions);
    });
  }

  function drawDevices() {
    if (!devEl) { return; }
    var x = devEl.scrollLeft;
    devEl.textContent = "";
    var pageCount = Math.max(1, Math.ceil(sessRows.length / PAGE_SIZE));
    devPage = Math.min(devPage, pageCount);
    var start = (devPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, sessRows.length);
    var head = document.createElement("div");
    head.className = "dev-row dev-head";
    ["Device", "OS", "Login · " + ui.timezone(),
      "Last active", "Location", "IP address"].forEach(function (text) {
      var c = document.createElement("span");
      c.textContent = text;
      head.appendChild(c);
    });
    devEl.appendChild(head);
    for (var i = start; i < end; i++) {
      var r = sessRows[i];
      var row = document.createElement("div");
      row.className = "dev-row";
      var name = document.createElement("span");
      name.className = "dev-name";
      name.appendChild(deviceIcon(r.name));
      var nm = document.createElement("span");
      nm.textContent = r.name;
      name.appendChild(nm);
      if (r.active) {
        var dot = document.createElement("i");
        dot.className = "dev-dot";
        name.appendChild(dot);
      }
      if (r.you) {
        var cur = document.createElement("span");
        cur.className = "dev-cur";
        cur.textContent = "Current device";
        name.appendChild(cur);
      }
      row.appendChild(name);
      var os = document.createElement("span");
      os.className = "dev-os";
      os.textContent = r.os || "—";
      row.appendChild(os);
      var time = document.createElement("span");
      time.className = "dev-time";
      time.textContent = ui.formatTime(r.t);
      row.appendChild(time);
      var seen = document.createElement("span");
      seen.className = "dev-last";
      seen.textContent = r.active ? "Now" : ui.formatTime(r.last);
      row.appendChild(seen);
      var where = document.createElement("span");
      where.className = "dev-where";
      where.textContent = region(r.where);
      row.appendChild(where);
      var ip = document.createElement("span");
      ip.className = "dev-ip";
      ip.textContent = r.ip;
      row.appendChild(ip);
      var act = document.createElement("span");
      act.className = "dev-act";
      if (r.out) {
        act.className += " sess-off";
        act.textContent = "Logged out";
      } else if (r.you) {
        act.appendChild(ui.button("Log out", "set-action dev-kick", selfLogout));
      } else {
        act.appendChild(logoutButton(r.id, r.name, "set-action dev-kick"));
      }
      row.appendChild(act);
      devEl.appendChild(row);
    }
    if (pageCount > 1) {
      var pages = document.createElement("div");
      pages.className = "dev-pages";
      for (var p = 1; p <= pageCount; p++) {
        (function (page) {
          var b = ui.button(String(page), "dev-page" + (page === devPage ? " on" : ""),
            function () { devPage = page; drawDevices(); });
          if (page === devPage) { b.setAttribute("aria-current", "page"); }
          pages.appendChild(b);
        })(p);
      }
      devEl.appendChild(pages);
    }
    devEl.scrollLeft = x;
  }

  function sessRow(r) {
    var row = document.createElement("div");
    row.className = "sess-row";
    row.appendChild(deviceIcon(r.name));
    var col = document.createElement("span");
    col.className = "sess-col";
    var name = document.createElement("b");
    name.textContent = r.name;
    var sub = document.createElement("small");
    sub.textContent = region(r.where);
    col.appendChild(name);
    col.appendChild(sub);
    row.appendChild(col);
    if (r.you) {
      var now = document.createElement("span");
      now.className = "sess-now";
      now.textContent = "Active now";
      row.appendChild(now);
    } else {
      row.appendChild(logoutButton(r.id, r.name));
    }
    return row;
  }

  function pollSessions() {
    fetch("/api/sessions", { headers: { "X-Requested-With": "XMLHttpRequest" } }).then(function (r) {
      if (r.status === 401) {
        location.reload();
        throw new Error("login expired");
      }
      if (!r.ok) { throw new Error(r.status); }
      return r.json();
    }).then(function (rows) {
      var prev = knownIds;
      knownIds = rows.filter(function (r) { return !r.out; }).map(function (r) { return r.id; });
      sessRows = rows;
      avatarEl.classList.toggle("on", rows.some(function (r) { return r.active; }));
      var drawn = JSON.stringify(rows.map(function (r) {
        return [r.id, r.name, r.os, r.t, r.active ? 0 : r.last, r.where, r.ip, r.out, r.you];
      }));
      if (drawn !== drawnKey) {
        drawnKey = drawn;
        sessEl.textContent = "";
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].out) { sessEl.appendChild(sessRow(rows[i])); }
        }
        drawDevices();
        if (!pop.hidden) { ui.placePop(); }
      }
      if (prev) {
        rows.forEach(function (r) {
          var known = prev.indexOf(r.id) !== -1;
          if (ui.settings.notifyDevices === "on" && !r.out && !r.you && !known) {
            ui.alertUser("New device signed in", r.name + " · " + region(r.where));
          }
          if (ui.settings.notifyLogouts === "on" && r.out && !r.you && known) {
            ui.alertUser("Device logged out", r.name + " · " + region(r.where));
          }
        });
      }
    }).catch(function () {
      /* keep the last known state; the next poll retries in 10 s */
    });
  }

  function selfLogout() {
    if (ui.settings.confirmLogout === "on" && !confirm("Log out this device?")) { return; }
    function leave() { location.reload(); }
    fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).then(leave, leave);
  }

  pop.querySelector(".pop-row.danger").addEventListener("click", function (ev) {
    ev.preventDefault();
    selfLogout();
  });
  pollSessions();
  setInterval(pollSessions, 10000);

  return {
    clear: function () { devEl = null; },
    show: function (rows) {
      devEl = rows;
      drawDevices();
      pollSessions();
    }
  };
};
