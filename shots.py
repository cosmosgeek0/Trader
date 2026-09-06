# shots.py: real shots at real crossings with the smallest money. Watches every coin traded as both USDT spot and
# USDT perpetual; when the perp bid clears the spot ask by more than this account's four taker fees on 100+ USDT of
# touch and is still there 2 ms later, sends a spot limit IOC buy at the seen ask and a perp limit IOC sell at the seen
# bid, back to back, one leg size in USDT. A leg whose price moved does not fill and costs nothing; a lone fill is
# flattened at market at once; both fills are held until the exit rule says so, or the max hold, then closed at market.
# Exit rules: close = the books closed back (perp ask <= spot bid); edge = the gap (perp bid over spot ask) shrank to at most
# half the four-leg cost; fund = the books closed back after the perp's next funding settlement, read at entry.
# Every line carries Binance's own timestamps. One shot at a time; stops after the shot count or the time window.
#   python3 shots.py 5 20 600 close 60      five shots, 20 USDT a leg, within 600 s, exit rule close, max hold 60 s
#   python3 shots.py tab 20 close 60        runs on: feeds the Basis tab every second with a paper twin of every crossing
#                                           it would fire on, and fires for real only while the tab's switch is on
import asyncio
import hashlib
import hmac
import os
import sys
import time
import urllib.request
from decimal import ROUND_DOWN, Decimal

import orjson
import uvloop
from picows import WSListener, WSMsgType, ws_connect

from binance import API_KEY, API_SECRET, FAPI, SPOT, get

tab = len(sys.argv) > 1 and sys.argv[1] == "tab"
if tab:
    shots_wanted, window = 10 ** 9, float("inf")
    leg = Decimal(sys.argv[2]) if len(sys.argv) > 2 else Decimal(20)
    rule = sys.argv[3] if len(sys.argv) > 3 else "close"
    hold_max = float(sys.argv[4]) if len(sys.argv) > 4 else 60.0
else:
    shots_wanted = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    leg = Decimal(sys.argv[2]) if len(sys.argv) > 2 else Decimal(20)
    window = float(sys.argv[3]) if len(sys.argv) > 3 else 600.0
    rule = sys.argv[4] if len(sys.argv) > 4 else "close"
    hold_max = float(sys.argv[5]) if len(sys.argv) > 5 else 60.0
switch, board, memory = "/var/lib/trader-basis-control/enabled", "/var/lib/trader-board/events.json", "/home/ssm-user/tab.json"
if rule not in ("close", "edge", "fund"):
    sys.exit(f"exit rule {rule}: use close, edge or fund")
confirm = 0.002
floor = float(leg)   # the only size that matters: the touch must cover our own order; the exchange minimums are applied per pair below
final = ("FILLED", "EXPIRED", "EXPIRED_IN_MATCH", "CANCELED", "REJECTED")
now = time.perf_counter_ns
clock = time.time_ns


def public(url):
    return orjson.loads(urllib.request.urlopen(url, timeout=15).read())


# this account's facts and the pairs a 20 USDT leg can trade on both venues
spot_info = {s["symbol"]: s for s in public(SPOT + "/api/v3/exchangeInfo")["symbols"]
             if s["quoteAsset"] == "USDT" and s["status"] == "TRADING" and s["isSpotTradingAllowed"]}
fut_info = {s["symbol"]: s for s in public(FAPI + "/fapi/v1/exchangeInfo")["symbols"]
            if s["quoteAsset"] == "USDT" and s["status"] == "TRADING" and s["contractType"] == "PERPETUAL"}
burn = 0.75 if get(SPOT + "/sapi/v1/bnbBurn", {})["spotBNBBurn"] else 1.0
fut_fee = float(get(FAPI + "/fapi/v1/commissionRate", {"symbol": "BTCUSDT"})["takerCommissionRate"]) * (0.9 if get(FAPI + "/fapi/v1/feeBurn", {})["feeBurn"] else 1.0)
spot_fee = float(get(SPOT + "/sapi/v1/asset/tradeFee", {"symbol": "BTCUSDT"})[0]["takerCommission"]) * burn
cost = 2 * spot_fee + 2 * fut_fee
rates = {x["symbol"]: float(x["lastFundingRate"]) for x in public(FAPI + "/fapi/v1/premiumIndex")}  # positive: the short is paid
pairs = {}
for sym, s in spot_info.items():
    f = fut_info.get(sym)
    if f is None:
        continue
    sf = {x["filterType"]: x for x in s["filters"]}
    ff = {x["filterType"]: x for x in f["filters"]}
    step = max(Decimal(sf["LOT_SIZE"]["stepSize"]), Decimal(ff["LOT_SIZE"]["stepSize"]))
    least = max(float(sf["NOTIONAL"]["minNotional"]), float(ff["MIN_NOTIONAL"]["notional"]))
    if least <= float(leg):
        pairs[sym] = {"step": step, "sb": 0.0, "sa": 0.0, "sB": 0.0, "sA": 0.0, "fb": 0.0, "fa": 0.0, "fB": 0.0, "fA": 0.0,
                      "sa_s": "", "fb_s": "", "su": 0, "fu": 0, "E": 0, "T": 0, "armed": None, "timer": None, "rate": rates.get(sym, 0.0)}
state = {"busy": False, "shots": 0, "held": {}, "net": 0.0, "funding": 0.0, "fees": 0.0, "done": False}
paper, closed, live = {}, [], {"spot": 0, "fut": 0}   # paper twins by coin, closed rows newest first, feed connections up
today = {"date": time.strftime("%Y-%m-%d", time.gmtime()), "closed": {"n": 0, "r": 0}, "made": {"n": 0.0, "r": 0.0}}  # n real, r paper
lanes = {"spot": "wss://ws-api.binance.com:443/ws-api/v3?timeUnit=MICROSECOND", "fut": "wss://ws-fapi.binance.com/ws-fapi/v1"}
feeds = {"spot": "wss://stream.binance.com:9443/ws", "fut": "wss://fstream.binance.com/public/ws"}
lane = {}
journal = open("/home/ssm-user/shots.log", "a")   # every line also lands here, so a dead runner cannot lose the record


def log(text):
    line = f"{time.strftime('%H:%M:%S')}.{clock() // 1000 % 1000000:06d} {text}"
    journal.write(line + "\n")
    journal.flush()
    try:
        print(line, flush=True)
    except OSError:  # the runner's ssh pipe can die mid-run; the journal already has the line, the money path goes on
        pass


class Lane(WSListener):
    def __init__(self):
        self.waiting, self.sent = {}, 0

    def on_ws_connected(self, transport):
        self.transport = transport

    def on_ws_frame(self, transport, frame):
        reply = orjson.loads(frame.get_payload_as_memoryview())
        future = self.waiting.pop(reply.get("id"), None)
        if future is not None and not future.done():
            future.set_result((reply, now(), clock()))


def signed(lane_, method, params):
    lane_.sent += 1
    p = dict(params, apiKey=API_KEY, timestamp=int(time.time() * 1000))
    payload = "&".join(f"{k}={v}" for k, v in sorted(p.items()))
    p["signature"] = hmac.new(API_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    key = str(lane_.sent)
    lane_.waiting[key] = asyncio.get_running_loop().create_future()
    return key, orjson.dumps({"id": key, "method": method, "params": p})


async def reply(lane_, key):
    try:
        return await asyncio.wait_for(lane_.waiting[key], 10)
    except asyncio.TimeoutError:
        lane_.waiting.pop(key, None)
        return None, now(), clock()


async def ask(venue, method, params):
    key, data = signed(lane[venue], method, params)
    lane[venue].transport.send(WSMsgType.TEXT, data)
    return (await reply(lane[venue], key))[0]


async def record(venue, sym, tag):
    # the order as Binance has it under our own id, once final; the lookup runs a few ms behind the fill
    for _ in range(10):
        r = await ask(venue, "order.status", {"symbol": sym, "origClientOrderId": tag})
        if r and r["status"] == 200 and r["result"]["status"] in final:
            return r["result"]
        await asyncio.sleep(0.02)
    raise LookupError(f"{venue} {tag} not final after 10 reads")


def filled(venue, r):
    # (quantity, USDT, fee USDT, Binance's stamp) of one order reply
    q = Decimal(r["executedQty"])
    if venue == "spot":
        usdt = float(r["cummulativeQuoteQty"])
        fee = 0.0
        for f in r.get("fills", []):  # a fee taken in the coin itself shrinks what is held; price it at the fill
            if f["commissionAsset"] == "BNB":
                fee += float(f["commission"]) * bnb_usdt
            elif f["commissionAsset"] == "USDT":
                fee += float(f["commission"])
            else:
                q -= Decimal(f["commission"])
                fee += float(f["commission"]) * usdt / float(r["executedQty"])
        if "fills" not in r:  # a looked-up order carries no fills: charge the fee by this account's rate
            fee = usdt * spot_fee
        stamp = int(r.get("transactTime") or r.get("updateTime") or 0)
        if stamp > 10 ** 14:
            stamp //= 1000   # spot stamps come in microseconds on this lane; keep every stamp in milliseconds
    else:
        usdt = float(r.get("cumQuote", 0)) or float(r.get("avgPrice", 0)) * float(q)
        fee = usdt * fut_fee
        stamp = int(r.get("updateTime") or 0)
    return q, usdt, fee, stamp


async def order(venue, sym, side, qty, price=None, closing=False):
    # one order on one lane: limit IOC at a price, or market when price is None; returns (qty, usdt, fee, stamp, ack ms)
    tag = f"s{now()}"
    params = {"symbol": sym, "side": side, "quantity": f"{qty:f}", "newClientOrderId": tag,
              "newOrderRespType": "FULL" if venue == "spot" else "RESULT"}
    if price is None:
        params["type"] = "MARKET"
    else:
        params.update(type="LIMIT", timeInForce="IOC", price=price)
    if closing and venue == "fut":
        params["reduceOnly"] = "true"
    key, data = signed(lane[venue], "order.place", params)
    sent = now()
    lane[venue].transport.send(WSMsgType.TEXT, data)
    got, seen, _ = await reply(lane[venue], key)
    if got is None or got["status"] >= 500 or (got.get("error") or {}).get("code") in (-1006, -1007):
        r = await record(venue, sym, tag)
    elif got["status"] != 200:
        raise RuntimeError(f"{venue} {side} {qty} {sym} refused: {got.get('error')}")
    else:
        r = got["result"]
        if r.get("status") not in final or (venue == "fut" and "cumQuote" not in r and Decimal(r["executedQty"])):
            r = await record(venue, sym, tag)
    q, usdt, fee, stamp = filled(venue, r)
    return q, usdt, fee, stamp, (seen - sent) / 1e6, r.get("orderId")


def trading():
    try:
        return open(switch).read().strip() == "1"
    except OSError:
        return False


def row_for(sym, p, size, real):
    gap = (p["fb"] / p["sa"] - 1) * 100
    return {"t": clock() // 1000000, "sym": sym, "side": "n", "taken": clock() // 1000000, "gap": gap, "net": gap - cost * 100,
            "size": size, "qty": 0, "spot": p["sa"], "fut": p["fb"], "now": gap, "fund": 0.0, "cost": 0.0, "made": None,
            "held": None, "lots": 1, "borrow": 0.0, "real": real, "since": time.time(), "entry": p["fb"] / p["sa"] - 1}


def mark(r, p):
    # the row's value if closed on the books now, as a percent of its size: entry edge plus the exit edge minus the fees
    if p["sa"] and p["fa"]:
        r["now"] = (r["entry"] + (p["sb"] / p["fa"] - 1) - cost) * 100


def close_row(r, made, why):
    r["made"], r["held"] = made, int((time.time() - r["since"]) * 1000)
    closed.insert(0, r)
    del closed[300:]
    key = "n" if r["real"] else "r"
    today["closed"][key] += 1
    today["made"][key] += made
    log(f"{'REAL' if r['real'] else 'PAPER'} closed {r['sym']}: {why}, made {made:+.4f} USDT after {r['held']} ms")


def paper_open(sym, p):
    # the paper lane runs the old tab's rule at the new speed, so its day number compares with the old tab's:
    # take at the touch up to 500 USDT a coin, add when the gap comes back wider than any add before, hold until the
    # books close back and never book a loss. Real shots use the exit rule and max hold given on the command line
    r = paper.get(sym)
    gap = p["fb"] / p["sa"] - 1
    touch = min(p["sA"] * p["sa"], p["fB"] * p["fb"])
    if r is None:
        r = row_for(sym, p, min(touch, 500.0), False)
        r["peak"] = gap
        paper[sym] = r
        log(f"PAPER {sym}: perp bid {p['fb']} over spot ask {p['sa']} by {r['gap']:+.4f}% on {r['size']:.0f} USDT")
    elif gap > r["peak"] and r["size"] < 500.0:
        add = min(touch, 500.0 - r["size"])
        r["entry"] = (r["entry"] * r["size"] + gap * add) / (r["size"] + add)
        r["size"] += add
        r["lots"] += 1
        r["peak"] = gap
        r["gap"], r["net"] = r["entry"] * 100, (r["entry"] - cost) * 100
        log(f"PAPER {sym} add {add:.0f} USDT at {gap * 100:+.4f}%, position {r['size']:.0f} USDT, {r['lots']} lots")


def paper_check(sym, p):
    # the paper twin closes only when the books close back, so the close pays at least what the entry promised
    r = paper.get(sym)
    if r is None or not (p["sa"] and p["fa"] and p["sb"]):
        return
    mark(r, p)
    if p["fa"] <= p["sb"]:
        del paper[sym]
        close_row(r, r["size"] * (r["entry"] + (p["sb"] / p["fa"] - 1) - cost), "books closed back")


async def shot(sym):
    p = pairs[sym]
    seen_sa, seen_fb, seen_E, seen_T, seen_at = p["sa_s"], p["fb_s"], p["E"], p["T"], clock()
    row = row_for(sym, p, float(leg), True)
    qty = (leg / Decimal(seen_sa) / p["step"]).to_integral_value(rounding=ROUND_DOWN) * p["step"]
    state["shots"] += 1
    k = state["shots"]
    log(f"SHOT {k} {sym}: perp bid {seen_fb} over spot ask {seen_sa} by {(float(seen_fb) / float(seen_sa) - 1) * 100:+.4f}%, "
        f"cost {cost * 100:.4f}%, touch spot {p['sA'] * p['sa']:.0f} perp {p['fB'] * p['fb']:.0f} USDT, perp frame E {seen_E} T {seen_T}, "
        f"host clock {seen_at // 1000000} ({seen_at // 1000000 - seen_E} ms after E), qty {qty}, funding rate {p['rate'] * 100:+.4f}%")
    t_send = clock()
    spot_task = asyncio.ensure_future(order("spot", sym, "BUY", qty, seen_sa))
    fut_task = asyncio.ensure_future(order("fut", sym, "SELL", qty, seen_fb))
    results = await asyncio.gather(spot_task, fut_task, return_exceptions=True)
    legs = [(Decimal(0), 0.0, 0.0, 0, 0.0, None) if isinstance(g, BaseException) else g for g in results]
    unknown = []
    for venue, got in zip(("spot", "fut"), results):
        if isinstance(got, RuntimeError):  # refused by Binance: nothing filled on that leg, the other leg stands
            log(f"SHOT {k} {venue} refused: {got}")
        elif isinstance(got, BaseException):  # no answer: that leg's state is unknown
            unknown.append(venue)
    if unknown:  # stop with what is known on record; the unknown leg must be checked on Binance by hand
        state["held"] = {"sym": sym, "spot": legs[0][0], "fut": legs[1][0], "since": time.time(), "bought": 0.0, "shorted": 0.0}
        raise LookupError(f"{sym} {' and '.join(unknown)} leg state unknown, verify on Binance")
    (sq, su, sf, ss, sms, sid), (fq, fu, ff, fs, fms, fid) = legs
    state["fees"] += sf + ff
    log(f"SHOT {k} spot: filled {sq} for {su:.4f} USDT at {su / float(sq) if sq else 0:.6g}, fee {sf:.4f}, ack {sms:.2f} ms, "
        f"Binance stamp {ss} ({ss - seen_E} ms after perp E, {ss - t_send // 1000000} ms after send), orderId {sid}")
    log(f"SHOT {k} perp: filled {fq} for {fu:.4f} USDT at {fu / float(fq) if fq else 0:.6g}, fee {ff:.4f}, ack {fms:.2f} ms, "
        f"Binance stamp {fs} ({fs - seen_E} ms after perp E, {fs - seen_T} ms after perp T, {fs - t_send // 1000000} ms after send), orderId {fid}, "
        f"both orders built and queued {(t_send - seen_at) // 1000} us after the decision")
    if sq < p["step"] and fq < p["step"]:
        log(f"SHOT {k} MISS: nothing filled, flat")
        return
    h = state["held"] = {"sym": sym, "spot": sq, "fut": fq, "since": time.time(), "bought": su, "shorted": fu, "row": row, "fees_in": sf + ff}
    if sq != fq:  # a lone or unequal fill: close the whole of both legs at market at once; a difference order can
        log(f"SHOT {k} UNEQUAL spot {sq} perp {fq}: closing both at market")  # fall under a step or a minimum
        await leave("unequal fill")
        return
    log(f"SHOT {k} HOLD {sq} {sym}, entry edge {fu - su:+.4f} USDT before fees")
    if rule == "fund":
        h["funding"] = int((await asyncio.to_thread(public, FAPI + f"/fapi/v1/premiumIndex?symbol={sym}"))["nextFundingTime"])
        log(f"SHOT {k} next funding at {h['funding']}, {(h['funding'] - fs) / 1000:.0f} s after the perp fill stamp")


async def leave(why):
    h = state["held"]
    sym = h["sym"]
    p = pairs[sym]
    log(f"EXIT {sym}: {why}, held {time.time() - h['since']:.1f} s, gap {(p['fb'] / p['sa'] - 1) * 100:+.4f}% "
        f"(spot {p['sb']}/{p['sa']}, perp {p['fb']}/{p['fa']})")
    empty = (Decimal(0), 0.0, 0.0, 0, 0.0, None)
    tasks = {v: asyncio.ensure_future(order(v, sym, "SELL" if v == "spot" else "BUY", h[v], None, True))
             for v in ("spot", "fut") if h[v] >= p["step"]}  # only the legs that exist; each is booked on its own result
    got = dict(zip(tasks, await asyncio.gather(*tasks.values(), return_exceptions=True)))
    for v, r in got.items():
        if isinstance(r, BaseException):
            log(f"EXIT {v} failed: {r!r}")
            got[v] = empty
    sq, su, sf, ss, sms, sid = got.get("spot", empty)
    fq, fu, ff, fs, fms, fid = got.get("fut", empty)
    state["fees"] += sf + ff
    state["net"] += su - h["bought"] + h["shorted"] - fu
    cycle = su - h["bought"] + h["shorted"] - fu - sf - ff - h.get("fees_in", 0.0)
    log(f"EXIT spot sold {sq} for {su:.4f} USDT at {su / float(sq) if sq else 0:.6g}, fee {sf:.4f}, ack {sms:.2f} ms, Binance stamp {ss}, orderId {sid}; "
        f"perp bought {fq} for {fu:.4f} at {fu / float(fq) if fq else 0:.6g}, fee {ff:.4f}, ack {fms:.2f} ms, Binance stamp {fs}, orderId {fid}")
    left = {"spot": h["spot"] - sq, "fut": h["fut"] - fq}
    state["held"] = {}
    if left["spot"] >= p["step"] or left["fut"] >= p["step"]:
        log(f"OPEN LEG {sym}: spot {left['spot']} perp short {left['fut']} still on Binance")
        state["held"] = {"sym": sym, "spot": left["spot"], "fut": left["fut"], "since": time.time(), "bought": 0.0, "shorted": 0.0}
        state["done"] = True
    rows = await asyncio.to_thread(get, FAPI + "/fapi/v1/income", {"symbol": sym, "incomeType": "FUNDING_FEE", "startTime": int(h["since"] * 1000)})
    funding = sum(float(r["income"]) for r in rows)
    state["funding"] += funding
    log(f"EXIT funding received {funding:+.4f} USDT in {len(rows)} settlements")
    if "row" in h:
        close_row(h["row"], cycle + funding, why)


async def run(coro):
    state["busy"] = True
    try:
        await coro
    except Exception as error:
        log(f"FAILED: {error!r}")
        state["done"] = True
    state["busy"] = False


def standing(sym):
    p = pairs[sym]
    p["timer"] = None
    armed = p["armed"]
    p["armed"] = None
    if armed is None or state["busy"] or state["held"] or state["done"] or state["shots"] >= shots_wanted or not (p["sa"] and p["fb"]):
        return
    if p["fb"] / p["sa"] - 1 > cost and p["sA"] * p["sa"] >= floor and p["fB"] * p["fb"] >= floor:
        if tab and not trading():  # switch off: the crossing feeds the paper lane instead of money
            paper_open(sym, p)
            return
        state["busy"] = True
        asyncio.ensure_future(run(shot(sym)))


def on_book(venue, d):
    p = pairs.get(d["s"])
    if p is None:
        return
    u = d["u"]
    if u <= p[venue[0] + "u"]:
        return
    p[venue[0] + "u"] = u
    p[venue[0] + "b"], p[venue[0] + "B"], p[venue[0] + "a"], p[venue[0] + "A"] = float(d["b"]), float(d["B"]), float(d["a"]), float(d["A"])
    if venue == "spot":
        p["sa_s"] = d["a"]
    else:
        p["fb_s"], p["E"], p["T"] = d["b"], d.get("E", 0), d.get("T", 0)
    if tab and d["s"] in paper:
        paper_check(d["s"], p)
        if d["s"] in paper and not (p["fb"] / p["sa"] - 1 > paper[d["s"]]["peak"]):
            return  # an open twin waits for the close-back; only a wider gap than any add before arms an add
    h = state["held"]
    if h and h["sym"] == d["s"] and not state["busy"] and not state["done"] and p["fa"] and p["sb"]:
        if rule == "edge" and p["fb"] / p["sa"] - 1 <= cost / 2:
            why = "gap within half the cost"
        elif rule == "fund" and p["T"] >= h["funding"] and p["fa"] <= p["sb"]:
            why = "books closed back after the funding"
        elif rule == "close" and p["fa"] <= p["sb"]:
            why = "books closed back"
        else:
            why = ""
        if why:
            state["busy"] = True
            asyncio.ensure_future(run(leave(why)))
            return
    if not (p["sa"] and p["fb"]) or state["busy"] or state["held"] or state["done"] or state["shots"] >= shots_wanted:
        return
    if p["fb"] / p["sa"] - 1 > cost and p["sA"] * p["sa"] >= floor and p["fB"] * p["fb"] >= floor and (rule != "fund" or p["rate"] > 0):
        if p["armed"] is None:  # the fund rule only holds a short that is paid at the settlement
            p["armed"] = now()
            p["timer"] = asyncio.get_running_loop().call_later(confirm, standing, d["s"])
    elif p["armed"] is not None:
        p["timer"].cancel()
        p["armed"] = p["timer"] = None


class Feed(WSListener):
    def __init__(self, venue):
        self.venue = venue

    def on_ws_connected(self, transport):
        streams = [s.lower() + "@bookTicker" for s in pairs]
        for i in range(0, len(streams), 200):
            transport.send(WSMsgType.TEXT, orjson.dumps({"method": "SUBSCRIBE", "params": streams[i:i + 200], "id": i + 1}))

    def on_ws_frame(self, transport, frame):
        d = orjson.loads(frame.get_payload_as_memoryview())
        if "b" in d:
            on_book(self.venue, d)


async def keep(venue, delay):
    await asyncio.sleep(delay)
    while not state["done"]:
        try:
            transport, _ = await ws_connect(lambda: Feed(venue), feeds[venue], enable_auto_ping=True, auto_ping_idle_timeout=2, auto_ping_reply_timeout=2)
            live[venue] += 1
            await transport.wait_disconnected()
            live[venue] -= 1
        except Exception as error:
            log(f"{venue} feed: {error!r}")
            await asyncio.sleep(0.2)


def write_board(started):
    # the tab's file, written whole and swapped in: the day's real and paper numbers, every open twin and shot, the closed rows
    open_rows = list(paper.values()) + ([state["held"]["row"]] if state["held"] and "row" in state["held"] else [])
    for r in open_rows:
        mark(r, pairs[r["sym"]])
    doc = {"at": clock() // 1000000, "started": started, "ready": live["spot"] > 0 and live["fut"] > 0, "pairs": len(pairs),
           "coverage": sum(1 for p in pairs.values() if p["sa"] and p["fa"]), "cap": 500.0, "floor": float(leg), "wait": {"n": 2, "r": 0},
           "trading": trading(), "rule": rule, "hold": hold_max, "today": today, "open": len(open_rows),
           "unreal": sum(r["size"] * r["now"] / 100 for r in open_rows), "carry": state["funding"],
           "rows": [{k: v for k, v in r.items() if k not in ("since", "entry", "peak")} for r in open_rows + closed]}
    with open(board + ".tmp", "w") as out:
        out.write(orjson.dumps(doc).decode())
    os.chmod(board + ".tmp", 0o640)
    os.replace(board + ".tmp", board)
    with open(memory + ".tmp", "w") as out:
        out.write(orjson.dumps({"today": today, "closed": closed}).decode())
    os.replace(memory + ".tmp", memory)


async def keep_board():
    started = clock() // 1000000
    try:
        kept = orjson.loads(open(memory, "rb").read())
        if kept["today"]["date"] == today["date"]:
            today.update(kept["today"])
            closed.extend(kept["closed"])
    except (OSError, ValueError, KeyError):
        pass
    while not state["done"]:
        await asyncio.sleep(1)
        if today["date"] != time.strftime("%Y-%m-%d", time.gmtime()):
            today.update({"date": time.strftime("%Y-%m-%d", time.gmtime()), "closed": {"n": 0, "r": 0}, "made": {"n": 0.0, "r": 0.0}})
        try:
            write_board(started)
        except OSError as error:
            log(f"board: {error!r}")


async def main():
    global bnb_usdt
    bnb_usdt = float(public(SPOT + "/api/v3/ticker/price?symbol=BNBUSDT")["price"])
    for name in lanes:
        lane[name] = (await ws_connect(Lane, lanes[name], enable_auto_ping=True, auto_ping_idle_timeout=5, auto_ping_reply_timeout=5))[1]
        await ask(name, "order.status", {"symbol": "BTCUSDT", "orderId": 1})  # a signed round trip warms the lane
    log(f"{len(pairs)} pairs, leg {leg} USDT, spot taker {spot_fee * 100:.4f}% perp taker {fut_fee * 100:.4f}% four legs {cost * 100:.4f}%, "
        f"confirm {confirm * 1000:.0f} ms, touch floor {floor:.0f} USDT, exit {rule}, max hold {hold_max:.0f} s, {shots_wanted} shots in {window:.0f} s")
    tasks = [asyncio.ensure_future(keep(v, i * 0.3)) for i, v in enumerate(("spot", "fut", "spot", "fut", "spot", "fut"))]
    if tab:
        tasks.append(asyncio.ensure_future(keep_board()))
    started = time.time()
    while not state["done"]:
        await asyncio.sleep(0.05)
        if state["held"] and not state["busy"] and time.time() - state["held"]["since"] > hold_max:
            await run(leave(f"max hold {hold_max:.0f} s"))
        elif not state["held"] and not state["busy"] and (state["shots"] >= shots_wanted or time.time() - started > window):
            break
    for t in tasks:
        t.cancel()
    log(f"DONE {state['shots']} shots, gross {state['net']:+.4f} USDT, funding {state['funding']:+.4f}, fees {state['fees']:.4f}, "
        f"net {state['net'] + state['funding'] - state['fees']:+.4f}"
        + (f", OPEN {state['held']}" if state["held"] else ""))
    sys.exit(1 if state["held"] else 0)


uvloop.run(main())
