import base64
import hashlib
import json
import os
import secrets
import time

store = "/var/lib/trader-ui/logins.json"
issuer = "https://dawn-base-75dc.cloudflareaccess.com"
audience = "6cb3c228fa01505c8314c2b16b3414e14abc27b45a60426211ce31265373daeb"
with open(store) as file:
    devices = json.load(file)


def save():
    pending = store + ".tmp"
    with open(pending, "w") as file:
        json.dump(devices, file)
        file.flush()
        os.fsync(file.fileno())
    os.replace(pending, store)


def device(ua):
    if "iPhone" in ua:
        return "iPhone"
    if "iPad" in ua:
        return "iPad"
    if "Android" in ua:
        return "Android"
    for mark, name in (("Edg/", "Edge"), ("Firefox/", "Firefox"),
                       ("Chrome/", "Chrome"), ("Safari/", "Safari")):
        if mark in ua:
            return name
    return "Device"


def platform(ua):
    for mark, name in (("iPhone", "iOS"), ("iPad", "iPadOS"), ("Android", "Android"),
                       ("Mac OS X", "macOS"), ("Windows", "Windows"), ("CrOS", "ChromeOS"),
                       ("Linux", "Linux")):
        if mark in ua:
            return name
    return ""


def claims(token):
    try:
        segment = token.split(".")[1]
        data = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))
        audiences = data.get("aud", [])
        if isinstance(audiences, str):
            audiences = [audiences]
        now = time.time()
        if (data.get("iss") != issuer or audience not in audiences
                or data.get("type") != "app" or not data.get("identity_nonce")
                or float(data.get("nbf", 0)) > now or float(data["exp"]) <= now):
            return None
        return data
    except (IndexError, KeyError, TypeError, ValueError):
        return None


def headers(handler):
    handler.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                        "img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
                        "base-uri 'none'; form-action 'self'")
    handler.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    handler.send_header("Referrer-Policy", "no-referrer")
    handler.send_header("Strict-Transport-Security", "max-age=31536000")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("X-Frame-Options", "DENY")
    if getattr(handler, "new_cookie", False):
        handler.send_header("Set-Cookie", "device=" + handler.device_id
                            + "; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax")


def authorize(handler, post=False):
    handler.device_id = None
    for part in handler.headers.get("Cookie", "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == "device" and value:
            handler.device_id = value
            break
    data = claims(handler.headers.get("Cf-Access-Jwt-Assertion", ""))
    if data is None:
        handler.send_empty(403)
        return False
    handler.login = hashlib.sha256(data["identity_nonce"].encode()).hexdigest()
    if any(row.get("out") and row.get("login") == handler.login for row in devices.values()):
        ajax = handler.headers.get("X-Requested-With") == "XMLHttpRequest"
        handler.send_response(401 if ajax else 302)
        if not ajax:
            handler.send_header("Location", "/cdn-cgi/access/logout")
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        return False
    if post and (handler.headers.get("Origin") != "https://arbitrage.cosmosgeek.org"
                 or handler.headers.get_content_type() != "application/json"):
        handler.send_empty(403)
        return False
    return True


def sessions(handler):
    now = time.time()
    ip = handler.headers.get("Cf-Pseudo-IPv4") or handler.headers.get("CF-Connecting-IP")
    if not ip:
        handler.send_empty(403)
        return
    ua = handler.headers.get("User-Agent", "")
    row = devices.get(handler.device_id)
    if not row:
        same = [key for key, entry in devices.items() if entry.get("login") == handler.login]
        handler.device_id = (max(same, key=lambda key: devices[key]["last"])
                             if same else secrets.token_urlsafe(24))
        handler.new_cookie = True
        row = devices.get(handler.device_id)
    if not row:
        devices[handler.device_id] = {
            "first": now, "last": now, "ip": ip, "login": handler.login,
            "where": handler.headers.get("CF-IPCountry", "XX"),
            "name": device(ua), "os": platform(ua)}
        save()
    elif row.get("login") != handler.login:
        row.update(first=now, last=now, ip=ip, login=handler.login,
                   where=handler.headers.get("CF-IPCountry", "XX"),
                   name=device(ua), os=platform(ua))
        row.pop("out", None)
        save()
    else:
        row.update(last=now, ip=ip, where=handler.headers.get("CF-IPCountry", "XX"),
                   name=device(ua), os=platform(ua))

    def rank(entry):
        if entry.get("out"):
            return 2
        return 0 if now - entry["last"] <= 120 else 1

    rows = [{"id": key, "name": entry["name"], "os": entry.get("os") or platform(entry["name"]),
             "ip": entry["ip"], "where": entry["where"], "t": int(entry["first"]),
             "last": int(entry["last"]), "active": now - entry["last"] <= 120 and not entry.get("out"),
             "out": bool(entry.get("out")), "you": key == handler.device_id}
            for key, entry in sorted(
                devices.items(),
                key=lambda item: (item[0] != handler.device_id, rank(item[1]), -item[1]["first"]))]
    handler.send_body(json.dumps(rows).encode())


def logout(handler, data):
    target = devices.get(data.get("id") or handler.device_id)
    if target:
        for row in devices.values():
            if row.get("login") == target.get("login"):
                row["out"] = True
        save()
