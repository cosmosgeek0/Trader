import json
import os
import subprocess
import time

state = os.environ["STATE_DIRECTORY"]
UNITS = {"ui.service": "ui", "news.service": "news", "net.service": "net", "cloudflared.service": "tunnel"}
EVERY = 5
BEAT = 60
KEEP = 24 * 3600

path = os.path.join(state, "logs.json")
try:
    with open(path) as file:
        data = json.load(file)
    cursor = data.get("cursor")
except FileNotFoundError:
    data = {"entries": []}
    cursor = None

wrote = 0
while True:
    resync = cursor is None
    command = ["journalctl", "-q", "--no-pager", "-o", "json", "--output-fields=MESSAGE,_SYSTEMD_UNIT,UNIT,_PID"]
    for unit in UNITS:
        command += ["-u", unit]
    command += ["--since", "-24hours"] if resync else ["--after-cursor", cursor]
    run = subprocess.run(command, capture_output=True, text=True)
    if run.returncode:
        print(f"journalctl failed: {run.stderr.strip()[:200]}", flush=True)
        cursor = None
        time.sleep(EVERY)
        continue
    new = []
    for line in run.stdout.splitlines():
        entry = json.loads(line)
        key = UNITS.get(entry.get("_SYSTEMD_UNIT")) or UNITS.get(entry.get("UNIT"))
        message = entry.get("MESSAGE")
        if isinstance(message, list):
            message = bytes(message).decode("utf-8", "replace")
        cursor = entry["__CURSOR"]
        if key and message:
            item = {"ts": int(entry["__REALTIME_TIMESTAMP"]) // 1000000, "unit": key, "msg": message}
            if entry.get("_PID"):
                item["pid"] = int(entry["_PID"])
            new.append(item)
    now = int(time.time())
    if resync:
        data["entries"] = new
    else:
        data["entries"] += new
    if new or now - wrote >= BEAT:
        data["entries"] = [e for e in data["entries"] if e["ts"] > now - KEEP]
        data.update(at=now * 1000, every=BEAT, cursor=cursor)
        with open(path + ".tmp", "w") as out:
            json.dump(data, out, separators=(",", ":"))
        os.replace(path + ".tmp", path)
        wrote = now
    time.sleep(EVERY)
