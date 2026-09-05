# gap.py: watches the best bid and ask of every coin Binance trades as both USDT spot and USDT perpetual, sees every
# moment the two books cross by more than this account's four taker fees, and values each crossing as a program would
# have traded it: firing at first sight, after a fixed confirm, or when the other book confirms, landing one loop later,
# with both legs at market or as limit IOC at the prices seen; a reverse crossing only as far as the coin can be
# borrowed, net of its interest. Detection and replay only, no orders.
# python3 gap.py [fire level in percent, default 0.25]
import asyncio
import gc
import re
import resource
import sys
import time
import urllib.error
import urllib.request

import orjson
import uvloop
from picows import WSListener, WSMsgType, ws_connect

from binance import SPOT, get

fire = float(sys.argv[1]) / 100 if len(sys.argv) > 1 else 0.0025
spot_fee, fut_fee = 0.00075, 0.0005   # this account's taker fees with BNB, read live on Sep 5 2026
cost = 2 * (spot_fee + fut_fee)       # the four legs of a cycle, 0.25%
confirms = (0, 1, 2)                  # ms after first sight at which a fixed rule fires, if the crossing still stands
loops = (1.0, 1.5)                    # ms from firing to the order landing: 1.5 is this box today, 1.0 the target
rules = [f"{c}+{L:g}" for c in confirms for L in loops] + [f"E+{L:g}" for L in loops]   # E: the other book confirms
offsets = {int((c + L) * 1e6) for c in confirms for L in loops}   # ns after first sight at which a fixed rule lands
size_floor, size_cap = 100.0, 500.0
now_ns = time.perf_counter_ns


class Pair:
    __slots__ = ("name", "mult", "sb", "sa", "sB", "sA", "fb", "fa", "fB", "fA", "su", "st", "fu", "ft", "state", "open", "closed")

    def __init__(self, name, mult):
        self.name, self.mult = name, mult
        self.sb = self.sa = self.sB = self.sA = self.fb = self.fa = self.fB = self.fA = 0.0
        self.su = self.fu = 0     # the newest update id seen on each venue: a copy or an older one is dropped
        self.st = self.ft = 0     # when that update first arrived, to measure what the race saves
        self.state = None         # (t, sb, sa, sB, sA, fb, fa, fB, fA) at the latest frame: spot prices scaled to the perp, sizes in USDT
        self.open = None          # the crossing in progress
        self.closed = []          # crossings that ended but whose landing times have not all passed


def fetch(url):
    while True:
        try:
            return orjson.loads(urllib.request.urlopen(url, timeout=15).read())
        except urllib.error.HTTPError as error:  # a 418 is an IP ban that lasts minutes; asking again inside it extends it
            print(f"{url} answered {error.code}, asking again in 60 s", flush=True)
            time.sleep(60)


spot = {s["symbol"]: s["baseAsset"] for s in fetch("https://api.binance.com/api/v3/exchangeInfo")["symbols"]
        if s["quoteAsset"] == "USDT" and s["status"] == "TRADING" and s["isSpotTradingAllowed"]}
perp = {s["symbol"]: s["baseAsset"] for s in fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")["symbols"]
        if s["quoteAsset"] == "USDT" and s["status"] == "TRADING" and s["contractType"] == "PERPETUAL"}
spot_by_base = {base: sym for sym, base in spot.items()}
pairs, by_symbol, perp_streams = [], {}, []
for psym, base in perp.items():
    lots = re.match(r"(1000000|1000|1M)(.+)", base)
    if psym in spot:
        ssym, mult = psym, 1.0
    elif lots and lots.group(2) in spot_by_base:
        ssym, mult = spot_by_base[lots.group(2)], 1000.0 if lots.group(1) == "1000" else 1000000.0
    else:
        continue
    pair = Pair(ssym, mult)
    pairs.append(pair)
    by_symbol[ssym] = by_symbol[psym] = pair
    perp_streams.append(psym.lower() + "@bookTicker")
spot_streams = [p.name.lower() + "@bookTicker" for p in pairs] + ["btcusdt@trade"]

count = {"spot": 0, "fut": 0, "crossings": 0, "reconnects": 0}
work = [0] * 2000                               # frame handling time, 1 us buckets
lag = {"spot": [0] * 1000, "fut": [0] * 1000}   # distance behind the Binance clock, 0.1 ms buckets
race = {"spot": [0] * 1000, "fut": [0] * 1000}  # how much later the second copy of an update arrived, 0.1 ms buckets
live = {"spot": 0, "fut": 0}                    # connections currently up per venue, three are raced
trade = [0]                                     # the newest BTC trade id seen, so the clock is read once per trade
late = [0] * 1000                               # the loop's lateness at each 10 ms tick, 0.1 ms buckets
hmax = [0]                                      # the slowest frame handler since the last tick, us
tick = [0, 0, 0]                                # frames and involuntary switches at the last tick, late lines this minute
stalls = {"switch": 0, "burst": 0, "both": 0, "other": 0}   # late ticks by what the tick carried
pending = []                                    # (pair, crossing) waiting to be valued
stats = {}   # (rule, side) -> model -> fires, both legs filled, one leg filled, USDT net of interest, USDT before it;
             # and "borrow" -> fires with no borrow, interest charged
borrow = {}  # spot symbol -> (pool free in coins, hourly rate) when this account can borrow and sell the coin, else None
lines = []


def crossed(s):
    # side, gap and touch of a book state: 1 when the perp bid clears the spot ask, -1 when the spot bid clears the perp
    # ask; the gap is a fraction of the price paid, the touch the smaller side in USDT
    t, sb, sa, sB, sA, fb, fa, fB, fA = s
    if not (sa and fa):
        return 0, 0.0, 0.0
    if fb > sa:
        return 1, fb / sa - 1, min(sA, fB)
    if sb > fa:
        return -1, sb / fa - 1, min(sB, fA)
    return 0, 0.0, 0.0


def stands(side, s):
    d, gap, size = crossed(s)
    return d == side and gap >= fire and size >= size_floor


def check(p, t, venue):
    # a crossing runs from the first frame at or above the fire level on a real touch to the first frame below it.
    # Every crossing carries the book as it stood at each of its landing times: a frame that passes a landing time
    # records the state before it, and a landing time no frame has passed yet stands at the latest frame
    m = p.mult
    cur = (t, p.sb * m, p.sa * m, p.sB * p.sb, p.sA * p.sa, p.fb, p.fa, p.fB * p.fb, p.fA * p.fa)
    prev, p.state = p.state, cur
    o = p.open
    if o is not None or p.closed:
        for rec in ([o] if o is not None else []) + p.closed:
            marks = rec["marks"]
            for at in marks:
                if marks[at] is None and at <= t:
                    marks[at] = prev
    side, gap, size = crossed(cur)
    if o is not None:
        o["frames"][venue == "fut"] += 1
        if side == o["side"] and gap >= fire:
            if gap > o["peak"]:
                o["peak"], o["peaksize"] = gap, size
            if o["confirm"] is None and venue != o["venue"] and size >= size_floor:   # the other book agrees: event confirm
                o["confirm"] = cur
                for L in loops:
                    o["marks"][t + int(L * 1e6)] = None
            return
        o["end"] = t
        p.closed.append(o)
        pending.append((p, o))
        p.open = None
    elif side and gap >= fire and size >= size_floor:
        p.open = {"t0": t, "side": side, "venue": venue, "first": cur, "peak": gap, "peaksize": size, "frames": [0, 0],
                  "confirm": None, "end": None, "marks": {t + d: None for d in offsets}}
        count["crossings"] += 1


def outcome(side, seen, land, model, cap):
    # what the two legs made at landing, in USDT, and how many legs filled. M sends both at market and takes the book at
    # landing. I sends both as limit IOC at the prices seen when firing: a leg fills only if its price is still there,
    # and a leg that filled alone is flattened at once on the same book with its two fees
    t, sb, sa, sB, sA, fb, fa, fB, fA = land
    if not (sa and fa and sb and fb):
        return 0.0, 0
    if side > 0:
        both = (fb / sa - 1 - cost) * min(sA, fB, cap)
        spot, perp = sa <= seen[2], fb >= seen[5]
        one_spot, one_perp = (sb / sa - 1 - 2 * spot_fee) * min(sA, cap), (fb / fa - 1 - 2 * fut_fee) * min(fB, cap)
    else:
        both = (sb / fa - 1 - cost) * min(sB, fA, cap)
        spot, perp = sb >= seen[1], fa <= seen[6]
        one_spot, one_perp = (sb / sa - 1 - 2 * spot_fee) * min(sB, cap), (fb / fa - 1 - 2 * fut_fee) * min(fA, cap)
    if model == "M" or spot and perp:
        return both, 2
    if spot:
        return one_spot, 1
    if perp:
        return one_perp, 1
    return 0.0, 0


def score(rule, side, seen, land, p, rec):
    # a reverse fire borrows the coin: its size is also capped by the pool, and it pays the hourly rate on what it
    # borrows for the crossing's lifetime, one hour at least; a coin that cannot be borrowed and sold is worth 0
    s = stats.setdefault((rule, side), {"M": [0, 0, 0, 0.0, 0.0], "I": [0, 0, 0, 0.0, 0.0], "borrow": [0, 0.0]})
    cap, interest = size_cap, 0.0
    if side < 0:
        facts = borrow.get(p.name)
        if facts is None or facts[0] * p.sb < size_floor:
            s["borrow"][0] += 1
            s["M"][0] += 1
            s["I"][0] += 1
            return
        cap = min(size_cap, facts[0] * p.sb)
        interest = facts[1] * max(1.0, (rec["end"] - rec["t0"]) / 3.6e12) * min(crossed(seen)[2], cap)
        s["borrow"][1] += interest
    for model in "MI":
        made, legs = outcome(side, seen, land, model, cap)
        m = s[model]
        m[0] += 1
        m[1] += legs == 2
        m[2] += legs == 1
        m[3] += made - interest
        m[4] += made


def replay():
    # a crossing is valued once its last landing time has passed. A fixed rule fires at first sight, or c ms later if
    # the crossing still stands then; the event rule fires on the other book's confirming frame; each lands one loop
    # later on the book recorded for that instant
    now = now_ns()
    keep = []
    for p, rec in pending:
        marks = rec["marks"]
        if now <= max(marks):
            keep.append((p, rec))
            continue
        for at in marks:
            if marks[at] is None:
                marks[at] = p.state
        p.closed.remove(rec)
        t0, side = rec["t0"], rec["side"]
        for c in confirms:
            seen = rec["first"] if c == 0 else marks[t0 + int(c * 1e6)]
            if c and not stands(side, seen):
                continue
            for L in loops:
                score(f"{c}+{L:g}", side, seen, marks[t0 + int((c + L) * 1e6)], p, rec)
        if rec["confirm"] is not None:
            for L in loops:
                score(f"E+{L:g}", side, rec["confirm"], marks[rec["confirm"][0] + int(L * 1e6)], p, rec)
        facts = borrow.get(p.name)
        f, two = rec["first"], marks[t0 + 2_000_000]
        legs = (2, 5) if side > 0 else (1, 6)   # the prices the legs would hit: spot ask and perp bid, or spot bid and perp ask
        g0, z0 = crossed(f)[1:]
        lines.append(f"{time.strftime('%H:%M:%S')} {p.name} {'n' if side > 0 else 'r'} first {g0 * 100:.3f}% {z0:.0f} "
                     f"peak {rec['peak'] * 100:.3f}% {rec['peaksize']:.0f} lasted {(rec['end'] - t0) / 1e6:.1f} "
                     f"frames {rec['frames'][0]}/{rec['frames'][1]} · legs first {f[legs[0]]:g}/{f[legs[1]]:g} "
                     f"2ms {two[legs[0]]:g}/{two[legs[1]]:g}"
                     + (f" · E +{(rec['confirm'][0] - t0) / 1e6:.1f}ms" if rec["confirm"] is not None else "")
                     + ("" if side > 0 else f" · borrow {facts[0] * p.sb:.0f} USDT at {facts[1] * 100:.4f}%/h" if facts else " · no borrow") + " · "
                     + " ".join(f"{(at - t0) / 1e6:g}ms {crossed(marks[at])[1] * 100:.3f}% {crossed(marks[at])[2]:.0f}"
                                for at in sorted(marks) if at - t0 in offsets))
    pending[:] = keep


def timed(venue, t0):
    us = (now_ns() - t0) // 1000
    work[us if us < 1999 else 1999] += 1
    count[venue] += 1
    if us > hmax[0]:
        hmax[0] = us


def behind(venue, exchange_us):
    tenth_ms = (time.time_ns() // 1000 - exchange_us) // 100
    lag[venue][tenth_ms if 0 <= tenth_ms < 999 else 999] += 1


def saved(venue, ns):
    tenth_ms = ns // 100_000
    race[venue][tenth_ms if tenth_ms < 999 else 999] += 1


class Spot(WSListener):
    def on_ws_connected(self, transport):
        subscribe(transport, spot_streams)

    def on_ws_frame(self, transport, frame):
        t0 = now_ns()
        d = orjson.loads(frame.get_payload_as_memoryview())
        if "b" in d:
            p, u = by_symbol[d["s"]], d["u"]
            if u > p.su:
                p.su, p.st = u, t0
                p.sb, p.sB, p.sa, p.sA = float(d["b"]), float(d["B"]), float(d["a"]), float(d["A"])
                check(p, t0, "spot")
            elif u == p.su:
                saved("spot", t0 - p.st)
        elif "E" in d and d["t"] > trade[0]:
            trade[0] = d["t"]
            behind("spot", d["E"] if d["E"] > 10 ** 14 else d["E"] * 1000)
        timed("spot", t0)


class Fut(WSListener):
    def on_ws_connected(self, transport):
        subscribe(transport, perp_streams)

    def on_ws_frame(self, transport, frame):
        t0 = now_ns()
        d = orjson.loads(frame.get_payload_as_memoryview())
        if "b" in d:
            p, u = by_symbol[d["s"]], d["u"]
            if u > p.fu:
                p.fu, p.ft = u, t0
                p.fb, p.fB, p.fa, p.fA = float(d["b"]), float(d["B"]), float(d["a"]), float(d["A"])
                check(p, t0, "fut")
                behind("fut", d["E"] * 1000)
            elif u == p.fu:
                saved("fut", t0 - p.ft)
        timed("fut", t0)


def subscribe(transport, streams):
    for i in range(0, len(streams), 200):
        transport.send(WSMsgType.TEXT, orjson.dumps({"method": "SUBSCRIBE", "params": streams[i:i + 200], "id": i + 1}))


async def keep(venue, listener, url, delay):
    # three connections per venue race for as long as the program runs; the first copy of each update wins. A drop
    # reconnects at once, and only when every connection of a venue is down are its quotes cleared, so no gap can be
    # read against a book that is no longer being received. Start-up handshakes are spread out, one per loop tick
    await asyncio.sleep(delay)
    while True:
        try:
            transport, _ = await ws_connect(listener, url, enable_auto_ping=True, auto_ping_idle_timeout=2, auto_ping_reply_timeout=2)
            live[venue] += 1
            await transport.wait_disconnected()
            live[venue] -= 1
        except Exception as error:
            lines.append(f"{time.strftime('%H:%M:%S')} {venue} connect failed: {error}")
            await asyncio.sleep(0.2)
        if not live[venue]:
            for p in pairs:
                if venue == "spot":
                    p.sb = p.sa = 0.0
                else:
                    p.fb = p.fa = 0.0
                p.open = None
        count["reconnects"] += 1


def percentile(buckets, share):
    total = sum(buckets)
    seen = 0
    for i, n in enumerate(buckets):
        seen += n
        if seen >= total * share:
            return i
    return len(buckets) - 1


def top(buckets):
    return max((i for i, n in enumerate(buckets) if n), default=0)


async def facts():
    # once a minute, off the frame path: the coins this account can borrow on cross margin and sell spot, the pool
    # free per coin, and this account's hourly rate
    while True:
        try:
            assets, pool, rates, margin = await asyncio.gather(*(asyncio.to_thread(get, SPOT + path, params) for path, params in (
                ("/sapi/v1/margin/allAssets", {}), ("/sapi/v1/margin/available-inventory", {"type": "MARGIN"}),
                ("/sapi/v1/margin/crossMarginData", {}), ("/sapi/v1/margin/allPairs", {}))))
            lend = {a["assetName"] for a in assets if a["isBorrowable"]}
            sellable = {m["symbol"] for m in margin if m.get("isMarginTrade") and m.get("isSellAllowed")}
            hourly = {c["coin"]: float(c["dailyInterest"]) / 24 for c in rates}
            for p in pairs:
                coin = spot[p.name]
                borrow[p.name] = (float(pool["assets"].get(coin, 0)), hourly[coin]) if coin in lend and coin in hourly and p.name in sellable else None
        except Exception as error:
            lines.append(f"{time.strftime('%H:%M:%S')} borrow read failed: {error}")
        await asyncio.sleep(60)


async def report():
    due = time.perf_counter()
    n = 0
    while True:
        due += 0.01
        await asyncio.sleep(max(0.0, due - time.perf_counter()))
        behind_ms = (time.perf_counter() - due) * 1000   # a timer may fire up to a millisecond early: that is not lateness
        late[min(max(int(behind_ms * 10), 0), 999)] += 1
        frames, swaps = count["spot"] + count["fut"], resource.getrusage(resource.RUSAGE_SELF).ru_nivcsw
        carried, switched, tick[0], tick[1] = frames - tick[0], swaps - tick[1], frames, swaps
        if behind_ms >= 2.0:   # a stall (the timer itself rounds to 1 ms): what the tick carried says why; steady load is
            # about 150 frames per tick, so 300 is a burst, and switches with no frames mean the process was not running
            due = time.perf_counter()   # one stall is counted once: the schedule restarts instead of catching up tick by tick
            stalls["both" if switched and carried >= 300 else "switch" if switched else "burst" if carried >= 300 else "other"] += 1
            if tick[2] < 20:
                tick[2] += 1
                lines.append(f"{time.strftime('%H:%M:%S')} late {behind_ms:.1f} ms · frames {carried} in the tick · "
                             f"switches +{switched} · handler max {hmax[0]} us")
        hmax[0] = 0
        n += 1
        replay()
        if n % 100 == 0 and lines:
            sys.stdout.write("\n".join(lines) + "\n")
            lines.clear()
        if n % 6000 == 0:
            print(f"{time.strftime('%H:%M:%S')} spot {count['spot'] // 60}/s fut {count['fut'] // 60}/s · "
                  f"work p50 {percentile(work, 0.5)} us p99 {percentile(work, 0.99)} us max {top(work)} us · "
                  f"behind Binance fut p50 {percentile(lag['fut'], 0.5) / 10:.1f} ms p99 {percentile(lag['fut'], 0.99) / 10:.1f} ms, "
                  f"spot p50 {percentile(lag['spot'], 0.5) / 10:.1f} ms p99 {percentile(lag['spot'], 0.99) / 10:.1f} ms · "
                  f"loop late p50 {percentile(late, 0.5) / 10:.1f} p99 {percentile(late, 0.99) / 10:.1f} max {top(late) / 10:.1f} ms · "
                  f"stalls {sum(stalls.values())} ({', '.join(f'{k} {v}' for k, v in stalls.items())}) · "
                  f"crossings {count['crossings']} at {fire * 100:.2f}%, reconnects {count['reconnects']} · "
                  f"rss {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024} MB · race saved fut p50 {percentile(race['fut'], 0.5) / 10:.1f} ms "
                  f"p90 {percentile(race['fut'], 0.9) / 10:.1f} ms, spot p50 {percentile(race['spot'], 0.5) / 10:.1f} ms p90 {percentile(race['spot'], 0.9) / 10:.1f} ms, "
                  f"live {live['spot']}+{live['fut']}", flush=True)
            for side in (1, -1):   # confirm+loop in ms: how a fire would have done, both legs at market (M) or limit IOC (I);
                for r in rules:    # reverse rows net of borrow, the raw value in brackets
                    m, i, b = stats.get((r, side), {"M": [0, 0, 0, 0.0, 0.0], "I": [0, 0, 0, 0.0, 0.0], "borrow": [0, 0.0]}).values()
                    print(f"  {'n' if side > 0 else 'r'} rule {r:>5}: fires {m[0]:4d} · M {m[3] / max(m[0], 1):+.4f}/fire {m[3]:+8.2f} · "
                          f"I both {i[1] * 100 // max(i[0], 1):3d}% one {i[2] * 100 // max(i[0], 1):3d}% {i[3] / max(i[0], 1):+.4f}/fire {i[3]:+8.2f}"
                          + ("" if side > 0 else f" · raw M {m[4]:+.2f} I {i[4]:+.2f} · no borrow {b[0] * 100 // max(m[0], 1)}% interest {b[1]:.2f}"), flush=True)
            count["spot"] = count["fut"] = count["crossings"] = 0
            tick[0] = tick[2] = 0
            for buckets in (work, lag["spot"], lag["fut"], race["spot"], race["fut"], late):
                buckets[:] = [0] * len(buckets)
            for k in stalls:
                stalls[k] = 0
            stats.clear()


async def main():
    print(f"{len(pairs)} pairs, fire at {fire * 100:.2f}% on >= {size_floor:.0f} USDT, cost {cost * 100:.2f}%, confirms {confirms} ms, "
          f"loops {loops} ms, size cap {size_cap:.0f} USDT", flush=True)
    await asyncio.gather(
        *(keep("spot", Spot, "wss://stream.binance.com:9443/ws?timeUnit=MICROSECOND", 0.3 * i) for i in range(3)),
        *(keep("fut", Fut, "wss://fstream.binance.com/public/ws", 0.3 * i + 0.15) for i in range(3)),
        facts(), report())


gc.freeze()   # the start-up tables never need collecting; the frame path frees by reference count alone
gc.disable()
uvloop.run(main())
