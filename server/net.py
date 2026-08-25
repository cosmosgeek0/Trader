import http.client
import json
import os
import re
import socket
import ssl
import time
import urllib.request

state = os.environ["STATE_DIRECTORY"]
news_state = "/var/lib/trader-news"
news_control = "/var/lib/trader-news-control/enabled"
EVERY = 30
KEEP = 24 * 3600

tls_context = ssl.create_default_context()
current = {}
previous = {}


def once(key, function):
    if key not in current:
        try:
            current[key] = function()
        except Exception as error:
            current[key] = error
    if isinstance(current[key], Exception):
        raise current[key]
    return current[key]


def change(key, value, scale=1):
    now = time.monotonic()
    before = previous.get(key)
    previous[key] = now, value
    if not before or value < before[1]:
        return False, 0
    delta = value - before[1]
    return round(delta / max(now - before[0], 0.001) * scale, 1), delta


def _cloudflare():
    text = urllib.request.urlopen("http://127.0.0.1:20241/metrics", timeout=5).read().decode()

    def metrics(name):
        rows = re.findall(r"^%s(?:\{([^}]*)\})? (\S+)$" % re.escape(name), text, re.M)
        return [({k: v for k, v in re.findall(r'(\w+)="([^"]*)"', labels or "")}, float(value))
                for labels, value in rows]

    def total(name):
        return sum(value for _, value in metrics(name))

    connections = int(total("cloudflared_tunnel_ha_connections"))
    rtts = [value for _, value in metrics("quic_client_smoothed_rtt")]
    locations = [labels["edge_location"].upper()
                 for labels, value in metrics("cloudflared_tunnel_server_locations") if value]
    lost, lost_count = change("cf_lost", total("quic_client_lost_packets"), 60)
    errors, error_count = change(
        "cf_errors", total("cloudflared_tunnel_request_errors") +
        total("cloudflared_proxy_connect_streams_errors"), 60)
    received, _ = change("cf_received", total("process_network_receive_bytes_total"), 1 / 1024)
    sent, _ = change("cf_sent", total("process_network_transmit_bytes_total"), 1 / 1024)
    missing = max(0, 4 - connections)
    return {
        "rtt": (round(max(rtts), 1) if rtts else None,
                f"{connections} conns · {' / '.join(locations)}", missing),
        "connections": (connections, "expected 4", missing),
        "lost": (lost, f"{int(lost_count)} since last check", int(lost_count)),
        "errors": (errors, f"{int(error_count)} since last check", int(error_count)),
        "received": (received, "cloudflared process"),
        "sent": (sent, "cloudflared process"),
    }


def cloudflare(part):
    return once("cloudflare", _cloudflare)[part]


def origin():
    started = time.perf_counter()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(5)
        connection.connect("/run/trader-ui-socket/ui.sock")
        connection.sendall(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n")
        response = connection.recv(64)
    status = int(response.split()[1])
    if status >= 500:
        raise RuntimeError(f"HTTP {status}")
    return round((time.perf_counter() - started) * 1000, 2), "local reply"


def _binance(host, path):
    wall_started = time.time() * 1000
    started = time.perf_counter()
    result = {part: None for part in ("dns", "tcp", "tls", "server", "total", "clock")}
    result.update(weight=None, failed=None, error=None)
    raw = None
    connection = None
    stage = "dns"
    try:
        address = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)[0]
        resolved = time.perf_counter()
        result["dns"] = round((resolved - started) * 1000, 1)
        stage = "tcp"
        raw = socket.socket(address[0], address[1], address[2])
        raw.settimeout(10)
        raw.connect(address[4])
        connected = time.perf_counter()
        result["tcp"] = round((connected - resolved) * 1000, 1)
        stage = "tls"
        connection = tls_context.wrap_socket(raw, server_hostname=host)
        raw = None
        secured = time.perf_counter()
        result["tls"] = round((secured - connected) * 1000, 1)
        stage = "server"
        connection.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode())
        response = http.client.HTTPResponse(connection)
        response.begin()
        answered = time.perf_counter()
        result["server"] = round((answered - secured) * 1000, 1)
        body = response.read()
        finished = time.perf_counter()
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        server_time = json.loads(body)["serverTime"]
        result.update(total=round((finished - started) * 1000, 1),
                      clock=round(server_time - (wall_started + time.time() * 1000) / 2, 1),
                      weight=response.getheader("x-mbx-used-weight-1m"))
    except Exception as error:
        result.update(failed=stage, error=f"{stage.upper()} {error!r:.90}")
    finally:
        if connection:
            connection.close()
        elif raw:
            raw.close()
    return result


def binance(market, part):
    host, path = (("api.binance.com", "/api/v3/time") if market == "spot" else
                  ("fapi.binance.com", "/fapi/v1/time"))
    result = once(market, lambda: _binance(host, path))
    note = f"{market} {result['error']}" if result["error"] else "weight " + str(result["weight"])
    return result[part], note


def trade_stage(part):
    spot = once("spot", lambda: _binance("api.binance.com", "/api/v3/time"))
    futures = once("futures", lambda: _binance("fapi.binance.com", "/fapi/v1/time"))
    readings = [(result[part], market) for market, result in (("spot", spot), ("futures", futures))
                if result[part] is not None]
    failures = [f"{market} {result['error']}" for market, result in (("spot", spot), ("futures", futures))
                if result["failed"] == part]
    if not readings:
        return (None, " · ".join(failures)) if failures else (False, "not reached")
    value, slower = max(readings)
    return (value, " · ".join(failures), len(failures)) if failures else (value, slower)


def clock():
    results = [(market, once(market, lambda host=host, path=path: _binance(host, path)))
               for market, host, path in (("spot", "api.binance.com", "/api/v3/time"),
                                          ("futures", "fapi.binance.com", "/fapi/v1/time"))]
    readings = [(market, result["clock"]) for market, result in results if result["clock"] is not None]
    note = " · ".join(f"{market} {value:+g}" if value is not None else f"{market} down"
                      for market, value in ((market, result["clock"]) for market, result in results))
    return (max(abs(value) for _, value in readings), note) if readings else (None, note)


def _news():
    with open(os.path.join(news_state, "news.json")) as file:
        data = json.load(file)
    with open(news_control) as file:
        if file.read(1) != "1":
            raise RuntimeError("off")
    age = round(time.time() - data["at"] / 1000)
    if age > 360:
        raise RuntimeError(f"stale {age}s")
    durations = sorted(source["duration_ms"] for source in data["sources"])
    statuses = {name: sum(1 for source in data["sources"] if source["status"] == name)
                for name in ("live", "delayed")}
    failed = [source["label"] for source in data["sources"] if source.get("failed")]
    note = f"{statuses['live']}/{len(data['sources'])} live"
    if failed:
        note += " · failed: " + ", ".join(failed[:3]) + (f" +{len(failed) - 3}" if len(failed) > 3 else "")
    return {
        "interval": False if data["interval_ms"] is None else round(data["interval_ms"] / 1000, 1),
        "duration": round(data["duration_ms"] / 1000, 1),
        "p95": round(durations[(95 * len(durations) - 1) // 100] / 1000, 1),
        "live": statuses["live"],
        "delayed": statuses["delayed"],
        "failed": sum(source.get("failed", source["status"] == "error") for source in data["sources"]),
        "note": note,
    }


def news(part):
    result = once("news", _news)
    value = result[part]
    event = int(value) if part == "failed" else 0
    return value, result["note"], event


def _host():
    received = sent = 0
    with open("/proc/net/dev") as file:
        for line in file:
            if ":" not in line:
                continue
            name, values = line.split(":", 1)
            if name.strip() == "lo":
                continue
            fields = values.split()
            received += int(fields[0])
            sent += int(fields[8])
    received, _ = change("host_received", received, 1 / 1024)
    sent, _ = change("host_sent", sent, 1 / 1024)
    return {"received": received, "sent": sent}


def host(part):
    return once("host", _host)[part], "all EC2 traffic"


SERIES = [
    ("origin", "Origin", "ms", origin),
    ("spot", "Spot", "ms", lambda: binance("spot", "total")),
    ("futures", "Futures", "ms", lambda: binance("futures", "total")),
    ("clock", "Clock offset", "ms", clock),
    ("trade_dns", "DNS", "ms", lambda: trade_stage("dns")),
    ("trade_tcp", "TCP", "ms", lambda: trade_stage("tcp")),
    ("trade_tls", "TLS", "ms", lambda: trade_stage("tls")),
    ("trade_server", "Binance", "ms", lambda: trade_stage("server")),
    ("cf_rtt", "Tunnel", "ms", lambda: cloudflare("rtt")),
    ("cf_connections", "Connections", "connections", lambda: cloudflare("connections")),
    ("cf_lost", "Lost packets", "per min", lambda: cloudflare("lost")),
    ("cf_errors", "Tunnel errors", "per min", lambda: cloudflare("errors")),
    ("cf_received", "Tunnel received", "KB/s", lambda: cloudflare("received")),
    ("cf_sent", "Tunnel sent", "KB/s", lambda: cloudflare("sent")),
    ("host_received", "EC2 received", "KB/s", lambda: host("received")),
    ("host_sent", "EC2 sent", "KB/s", lambda: host("sent")),
    ("news_interval", "Interval", "s", lambda: news("interval")),
    ("news_duration", "Cycle", "s", lambda: news("duration")),
    ("news_p95", "Slow source p95", "s", lambda: news("p95")),
    ("news_live", "Live groups", "sources", lambda: news("live")),
    ("news_delayed", "Delayed groups", "sources", lambda: news("delayed")),
    ("news_failed", "Failed feeds", "feeds", lambda: news("failed")),
]

if __name__ == "__main__":
    path = os.path.join(state, "net.json")
    try:
        with open(path) as file:
            data = json.load(file)
    except FileNotFoundError:
        data = {"t": [], "series": {}}
    for old in ("tunnel", "news", "cloudflare", "dns"):
        data["series"].pop(old, None)
    while True:
        now = int(time.time())
        current.clear()
        data["t"].append(now)
        for key, label, unit, measure in SERIES:
            row = data["series"].setdefault(key, {"values": [], "since": now})
            row["values"] += [False] * (len(data["t"]) - 1 - len(row["values"]))
            event = 0
            measured = ()
            try:
                measured = measure()
                value, note = measured[:2]
                if len(measured) > 2:
                    event = measured[2]
            except Exception as error:
                value, note = None, f"{error!r:.120}"
                print(f"{label} down: {note}", flush=True)
            row.update(label=label, unit=unit, note=note)
            row["values"].append(value)
            if value is None or event:
                row.setdefault("details", {})[str(now)] = note
            if len(measured) > 2:
                row.setdefault("events", [0] * (len(data["t"]) - 1)).append(event)
            elif "events" in row:
                row["events"].append(0)
        keep = next((i for i, stamp in enumerate(data["t"]) if stamp > now - KEEP), len(data["t"]))
        data["t"] = data["t"][keep:]
        for row in data["series"].values():
            row["values"] = row["values"][keep:]
            if "events" in row:
                row["events"] = row["events"][keep:]
            if "details" in row:
                row["details"] = {stamp: detail for stamp, detail in row["details"].items()
                                  if int(stamp) >= data["t"][0]}
        data.update(at=now * 1000, every=EVERY)
        with open(path + ".tmp", "w") as out:
            json.dump(data, out, separators=(",", ":"))
        os.replace(path + ".tmp", path)
        time.sleep(max(0, EVERY - (time.time() - now)))
