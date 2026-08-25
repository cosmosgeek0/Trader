import hashlib
import json
import os
import re
import signal
import sys
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler
from socketserver import UnixStreamServer

import access

root = "/run/trader-ui-site"
news_state = "/var/lib/trader-news"
net_state = "/var/lib/trader-net"
logs_state = "/var/lib/trader-logs"
board_state = "/var/lib/trader-board"
account_state = "/var/lib/trader-account"
news_control = "/var/lib/trader-news-control/enabled"
socket_path = "/run/trader-ui-socket/ui.sock"


def news_enabled():
    with open(news_control) as file:
        return file.read(1) == "1"


rules_state = "/var/lib/trader-rules"

RULES = {
    "version": 1, "updated": 0,
    "machine": {"mode": "blocked", "lifetime_usdt": 500, "used_usdt": 0, "max_fees_usdt": 25},
    "futures": {"max_usdt": 50, "max_loss_usdt": 25, "max_leverage": 1},
    "excluded_assets": [],
    "wallets": {"spot": {"on": False, "use_usdt": 100, "move_usdt": 100},
                "margin": {"on": False, "use_usdt": 100, "move_usdt": 100},
                "futures": {"on": False, "use_usdt": 50, "move_usdt": 50},
                "funding": {"on": False, "use_usdt": 0, "move_usdt": 0},
                "loan": {"on": False, "borrow_usdt": 100}},
}

RULES_SPECIAL = {
    "machine.mode": ("blocked", "limited", "full"),
}


def rules_bad(doc, base, path=""):
    if isinstance(base, dict):
        if not isinstance(doc, dict) or set(doc) != set(base):
            return (path or "document") + ": keys must be exactly " + ", ".join(sorted(base))
        for key in base:
            err = rules_bad(doc[key], base[key], path + ("." if path else "") + key)
            if err:
                return err
        return None
    if path in RULES_SPECIAL:
        return None if doc in RULES_SPECIAL[path] else path + ": one of " + ", ".join(RULES_SPECIAL[path])
    if path == "excluded_assets":
        ok = isinstance(doc, list) and all(
            isinstance(a, str) and re.fullmatch(r"[A-Z0-9]{2,20}", a) for a in doc)
        return None if ok else path + ": list of asset codes"
    if isinstance(base, bool):
        return None if isinstance(doc, bool) else path + ": true or false"
    ok = isinstance(doc, (int, float)) and not isinstance(doc, bool) and doc >= 0
    return None if ok else path + ": a number, zero or more"


def rules_diff(old, new, path=""):
    out = []
    for key in new:
        if not path and key in ("version", "updated"):
            continue
        where = path + ("." if path else "") + key
        if isinstance(new[key], dict):
            out += rules_diff(old.get(key, {}), new[key], where)
        elif old.get(key) != new[key]:
            out.append(where + " " + json.dumps(old.get(key)) + " -> " + json.dumps(new[key]))
    return out


def rules_fill(doc, base):
    for key in list(doc):
        if key not in base:
            del doc[key]
    for key in base:
        if key not in doc:
            doc[key] = json.loads(json.dumps(base[key]))
        elif isinstance(base[key], dict) and isinstance(doc[key], dict):
            rules_fill(doc[key], base[key])
    return doc


def rules_load():
    try:
        with open(rules_state + "/rules.json") as file:
            return rules_fill(json.load(file), RULES)
    except FileNotFoundError:
        doc = json.loads(json.dumps(RULES))
        with open(rules_state + "/rules.tmp", "w") as out:
            json.dump(doc, out, separators=(",", ":"))
        os.chmod(rules_state + "/rules.tmp", 0o640)
        os.replace(rules_state + "/rules.tmp", rules_state + "/rules.json")
        return doc


class Handler(SimpleHTTPRequestHandler):
    server_version = "Trader"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=root, **kwargs)

    def log_message(self, *args):
        pass

    def clean_path(self):
        return urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)

    def end_headers(self):
        if self.clean_path() in ("/", "/index.html", "/shell.js", "/devices.js"):
            self.send_header("Cache-Control", "no-store")
        access.headers(self)
        super().end_headers()

    def send_empty(self, status):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_body(self, body, kind="application/json", cache="no-store", tag=None, status=200):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        if tag:
            self.send_header("ETag", tag)
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.send_empty(405)

    def do_GET(self):
        if not access.authorize(self):
            return
        path = self.clean_path()
        if path == "/api/sessions":
            access.sessions(self)
            return
        if path == "/api/news":
            self.send_body(json.dumps({"on": news_enabled()}).encode())
            return
        if path == "/api/rules":
            self.send_body(json.dumps({"rules": rules_load()}).encode())
            return
        folders = {"/news.json": news_state, "/net.json": net_state,
                   "/logs.json": logs_state, "/board.json": board_state,
                   "/account.json": account_state}
        if path in folders:
            try:
                with open(folders[path] + path, "rb") as file:
                    body = file.read()
            except FileNotFoundError:
                self.send_empty(404)
                return
            tag = '"' + hashlib.sha256(body).hexdigest()[:16] + '"'
            if self.headers.get("If-None-Match", "").replace("W/", "") == tag:
                self.send_empty(304)
                return
            self.send_body(body, cache="no-cache", tag=tag)
            return
        if path.startswith("/favicons/") and re.fullmatch(r"[a-z0-9.-]{4,64}\.png", path[10:]):
            try:
                with open(news_state + path, "rb") as file:
                    body = file.read()
            except FileNotFoundError:
                self.send_empty(404)
                return
            self.send_body(body, "image/png", "max-age=86400")
            return
        if path != "/" and path.endswith("/"):
            self.send_empty(404)
            return
        super().do_GET()

    def do_POST(self):
        if not access.authorize(self, True):
            return
        path = self.clean_path()
        if path not in ("/api/logout", "/api/news", "/api/rules"):
            self.send_empty(403)
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length)) if length else {}
        except ValueError:
            self.send_empty(400)
            return
        if path == "/api/rules":
            if not isinstance(data, dict):
                self.send_body(json.dumps({"error": "document: must be an object"}).encode(),
                               status=422)
                return
            current = rules_load()
            if data.get("version") != current["version"]:
                self.send_body(json.dumps({"error": "stale", "version": current["version"]}).encode(),
                               status=409)
                return
            err = rules_bad(data, RULES)
            if err:
                self.send_body(json.dumps({"error": err}).encode(), status=422)
                return
            lines = rules_diff(current, data)
            if lines:
                data["version"] = current["version"] + 1
                data["updated"] = int(time.time() * 1000)
                with open(rules_state + "/rules.tmp", "w") as out:
                    json.dump(data, out, separators=(",", ":"))
                os.chmod(rules_state + "/rules.tmp", 0o640)
                os.replace(rules_state + "/rules.tmp", rules_state + "/rules.json")
                stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
                with open(rules_state + "/rules.log", "a") as out:
                    for line in lines:
                        out.write(stamp + " " + line + "\n")
                os.chmod(rules_state + "/rules.log", 0o640)
            self.send_body(json.dumps({"rules": data if lines else current}).encode())
            return
        if path == "/api/news":
            with open(news_control, "w") as file:
                file.write("1" if data.get("on") is True else "0")
            self.send_body(json.dumps({"on": news_enabled()}).encode())
            return
        access.logout(self, data)
        self.send_body(b"{}")


def stop(*_):
    access.save()
    sys.exit(0)


signal.signal(signal.SIGTERM, stop)
try:
    os.unlink(socket_path)
except FileNotFoundError:
    pass
UnixStreamServer.request_queue_size = 128
server = UnixStreamServer(socket_path, Handler)
os.chmod(socket_path, 0o660)
server.serve_forever()
