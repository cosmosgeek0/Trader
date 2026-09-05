# basis.py: one coin, both books live. Buys spot and shorts the perpetual at market on two warm websocket lanes,
# both legs sent back to back, when the perp bid clears the spot ask by more than this account's four taker fees;
# sized by the touch and the spot wallet; sells and covers at market when the books close back and the touch covers
# the position; a missed leg is flattened at once; an unknown leg stops everything. One cycle per run.
#   python3 basis.py fire ETHUSDT 500                one cycle now, entry then exit, without waiting for a crossing
#   python3 basis.py watch ETHUSDT 500 600           enter on the first crossing that clears cost on a real touch and
#                                                    still stands 2 ms later, within 600 s
#   python3 basis.py flatten ETHUSDT 0.197 0.197     sell that much coin and cover that much short, at market, nothing else
import asyncio
import hashlib
import hmac
import sys
import time
import urllib.error
import urllib.request
from decimal import ROUND_DOWN, Decimal

import orjson
import uvloop
from picows import WSListener, WSMsgType, ws_connect

from binance import API_KEY, API_SECRET, FAPI, SPOT, get

mode, symbol = sys.argv[1], sys.argv[2]
cap = Decimal(sys.argv[3]) if mode != "flatten" else Decimal(0)
seconds = float(sys.argv[4]) if mode == "watch" else 30.0
lanes = {"spot": "wss://ws-api.binance.com:443/ws-api/v3", "fut": "wss://ws-fapi.binance.com/ws-fapi/v1"}
feeds = {"spot": f"wss://stream.binance.com:9443/ws/{symbol.lower()}@bookTicker",
         "fut": f"wss://fstream.binance.com/public/ws/{symbol.lower()}@bookTicker"}
final = ("FILLED", "EXPIRED", "EXPIRED_IN_MATCH", "CANCELED", "REJECTED")
now = time.perf_counter_ns
secret = API_SECRET.encode()
confirm = 0.002   # replayed on az4, Sep 5 2026: a crossing still above cost 2 ms after first sight is alive at landing 77% of
floor = 100.0     # the time and worth +0.03 USDT a fire; fired at first sight it loses in every bucket. Touch under 100 USDT is noise


def read(url, params=None):
    # one start-up read, signed when params are given; a 418 is an IP ban that lasts minutes, asking inside it extends it
    while True:
        try:
            return get(url, params) if params is not None else orjson.loads(urllib.request.urlopen(url, timeout=15).read())
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            wait = float(error.headers.get("Retry-After", 60))
            print(f"{url} answered 429, asking again in {wait:g} s", flush=True)
            time.sleep(wait)


def lot(rules):
    # the step and ceiling a market order must obey on this venue: MARKET_LOT_SIZE where it is set, else LOT_SIZE
    kind = {f["filterType"]: f for f in rules}
    market, limit = kind.get("MARKET_LOT_SIZE", {}), kind["LOT_SIZE"]
    return Decimal(market.get("stepSize", "0")) or Decimal(limit["stepSize"]), Decimal(market.get("maxQty", "0")) or Decimal(limit["maxQty"])


def down(qty, size):
    return (qty / size).to_integral_value(rounding=ROUND_DOWN) * size


# this account's facts: the fee of each leg, the lot rules, both minimum notionals, the spot wallet
spot_rules = read(SPOT + f"/api/v3/exchangeInfo?symbol={symbol}")["symbols"][0]["filters"]
fut_rules = next(s for s in read(FAPI + "/fapi/v1/exchangeInfo")["symbols"] if s["symbol"] == symbol)["filters"]
(spot_step, spot_most), (fut_step, fut_most) = lot(spot_rules), lot(fut_rules)
step = max(spot_step, fut_step)
least = {"spot": float(next(f["minNotional"] for f in spot_rules if f["filterType"] == "NOTIONAL")),
         "fut": float(next(f["notional"] for f in fut_rules if f["filterType"] == "MIN_NOTIONAL"))}
spot_fee = float(read(SPOT + "/sapi/v1/asset/tradeFee", {"symbol": symbol})[0]["takerCommission"])
spot_fee *= 0.75 if read(SPOT + "/sapi/v1/bnbBurn", {})["spotBNBBurn"] else 1.0
fut_fee = float(read(FAPI + "/fapi/v1/commissionRate", {"symbol": symbol})["takerCommissionRate"])
fut_fee *= 0.9 if read(FAPI + "/fapi/v1/feeBurn", {})["feeBurn"] else 1.0
cost = 2 * spot_fee + 2 * fut_fee
wallet = Decimal(next(b["free"] for b in read(SPOT + "/api/v3/account", {})["balances"] if b["asset"] == "USDT"))
bnb_usdt = float(read(SPOT + "/api/v3/ticker/price?symbol=BNBUSDT")["price"])

book = {"sb": 0.0, "sa": 0.0, "sB": 0.0, "sA": 0.0, "sAq": "0", "st": 0,
        "fb": 0.0, "fa": 0.0, "fB": 0.0, "fA": 0.0, "fBq": "0", "ft": 0}
state = {"phase": "waiting", "best": -1.0, "task": None, "error": None, "armed": None, "timer": None}
held = {"spot": Decimal(0), "fut": Decimal(0)}
usdt = {"bought": 0.0, "sold": 0.0, "shorted": 0.0, "covered": 0.0, "fees": 0.0}
owed = []  # futures orders whose money is still to be read: (tag, "shorted" or "covered")
lane = {}
ready = {}
last = {"spot": -1, "fut": -1}
feed_live = {"spot": 0, "fut": 0}


class Lane(WSListener):
    def __init__(self):
        self.waiting, self.sent = {}, 0

    def on_ws_connected(self, transport):
        self.transport = transport

    def on_ws_frame(self, transport, frame):
        reply = orjson.loads(frame.get_payload_as_memoryview())
        future = self.waiting.pop(reply.get("id"), None)
        if future is not None and not future.done():
            future.set_result((reply, now()))

    def on_ws_disconnected(self, transport):
        seen = now()
        for future in self.waiting.values():
            if not future.done():
                future.set_result((None, seen))
        self.waiting.clear()


def prepare(lane, method, params):
    # a signed request, ready to send: apiKey and timestamp joined in, the sorted pairs signed with the secret
    lane.sent += 1
    params = dict(params, apiKey=API_KEY, timestamp=int(time.time() * 1000))
    payload = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    params["signature"] = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    return str(lane.sent), orjson.dumps({"id": str(lane.sent), "method": method, "params": params})


def plain(lane, method):
    lane.sent += 1
    key = str(lane.sent)
    return key, orjson.dumps({"id": key, "method": method})


def send(lane, key, data):
    future = lane.waiting[key] = asyncio.get_running_loop().create_future()
    try:
        lane.transport.send(WSMsgType.TEXT, data)
    except Exception:
        lane.waiting.pop(key, None)
        future.set_result((None, now()))
    return future


async def answer(lane, key, future):
    # the reply and its arrival time, or None when nothing came back in 10 s
    try:
        return await asyncio.wait_for(future, 10)
    except asyncio.TimeoutError:
        return None, now()
    finally:
        lane.waiting.pop(key, None)


async def ask(lane, method, params):
    key, data = prepare(lane, method, params)
    return (await answer(lane, key, send(lane, key, data)))[0]


async def call(venue, method, params):
    await asyncio.wait_for(ready[venue].wait(), 10)
    return await ask(lane[venue], method, params)


async def lookup(venue, tag):
    # the order as Binance records it under our own id, once that record is final and complete; its lookup runs a few
    # ms behind its fills, so ask up to ten times before giving up
    for _ in range(10):
        reply = await call(venue, "order.status", {"symbol": symbol, "origClientOrderId": tag})
        if reply and reply["status"] == 200 and reply["result"]["status"] in final and (venue == "spot" or "cumQuote" in reply["result"]):
            return reply["result"]
        await asyncio.sleep(0.02)
    raise LookupError(f"{venue} order {tag} not final after 10 reads: {reply and reply.get('error')}")


def settle(venue, side, qty, r):
    # what one market order did: (coin gained or given, USDT paid or received, fee in USDT). A spot fee taken in the coin
    # itself shrinks what is held; a futures order's money is read later, off the trading path
    filled = Decimal(r["executedQty"])
    if not filled:
        raise RuntimeError(f"{venue} {side} {qty} filled nothing: {r['status']}")
    if venue == "spot":
        quote = float(r["cummulativeQuoteQty"])
        fee = sum(float(f["commission"]) * (bnb_usdt if f["commissionAsset"] == "BNB" else 1.0 if f["commissionAsset"] == "USDT"
                                            else quote / float(filled)) for f in r["fills"])
        filled -= sum(Decimal(f["commission"]) for f in r["fills"] if f["commissionAsset"] not in ("BNB", "USDT"))
    else:
        quote = float(r["cumQuote"]) if "cumQuote" in r else None
        fee = quote * fut_fee if quote else 0.0
    usdt["fees"] += fee
    print(f"{venue} {side} {filled} {symbol}" + (f" for {quote:.4f} USDT at {quote / float(filled):.6g}" if quote else "")
          + f", fee {fee:.4f} USDT, orderId {r['orderId']}", flush=True)
    return filled, quote


async def resolve(venue, side, qty, tag, reply, sent):
    # a definite result for one sent order. Refused means nothing filled. No reply, a 5xx, or Binance's own "status
    # unknown" means ask for the record until it is final. A reply before the fill is completed the same way
    got, seen = reply
    direct = True
    if got is None or got["status"] >= 500 or (got.get("error") or {}).get("code") in (-1006, -1007):
        r = await lookup(venue, tag)
        direct = False
    elif got["status"] != 200:
        raise RuntimeError(f"{venue} {side} {qty} refused: {got.get('error')}")
    else:
        r = got["result"]
        if r.get("status") not in final:
            r = await lookup(venue, tag)
            direct = False
        if venue == "spot" and "fills" not in r:  # a looked-up spot order carries no fills: read its trades for the fees
            trades = await call("spot", "myTrades", {"symbol": symbol, "orderId": r["orderId"]})
            if trades is None or trades["status"] != 200:
                raise LookupError(f"spot trades for order {r['orderId']} unavailable: {trades and trades.get('error')}")
            r["fills"] = trades["result"]
            direct = False
    if not direct:
        seen = now()
    print(f"{venue} {side} {'final reply' if direct else 'resolved record'} {(seen - sent) / 1e6:.3f} ms", flush=True)
    return settle(venue, side, qty, r)


def market(active, venue, side, qty, closing):
    # one market order prepared for its lane, not yet sent: (tag, key, bytes)
    tag = f"b{now()}"
    params = {"symbol": symbol, "side": side, "type": "MARKET", "quantity": f"{qty:f}", "newClientOrderId": tag,
              "newOrderRespType": "FULL" if venue == "spot" else "RESULT"}
    if closing and venue == "fut":
        params["reduceOnly"] = "true"
    return (tag,) + prepare(active, "order.place", params)


async def both(spot_side, fut_side, spot_qty, fut_qty, closing):
    # both legs prepared first, then sent back to back; each leg's result is definite: filled, refused, or an unknown
    # that stops everything. Returns [(coin, usdt) or None per leg] and records fills into held and usdt
    active = dict(lane)
    orders = {"spot": market(active["spot"], "spot", spot_side, spot_qty, closing),
              "fut": market(active["fut"], "fut", fut_side, fut_qty, closing)}
    sent, futures = {}, {}
    quote_at = {"spot": book["st"], "fut": book["ft"]}
    for venue in orders:
        sent[venue] = now()
        futures[venue] = send(active[venue], orders[venue][1], orders[venue][2])
    finished = now()
    replies = await asyncio.gather(*(answer(active[v], orders[v][1], futures[v]) for v in orders))
    quote_age = (f"spot quote-to-send {(sent['spot'] - quote_at['spot']) / 1e3:.0f} us, perp quote-to-send "
                 f"{(sent['fut'] - quote_at['fut']) / 1e3:.0f} us, ") if quote_at["spot"] and quote_at["fut"] else ""
    print(f"{spot_side} spot {spot_qty} / {fut_side} perp {fut_qty}: {quote_age}"
          f"both sends within {(finished - sent['spot']) / 1e3:.0f} us", flush=True)
    results = await asyncio.gather(*(resolve(v, side, qty, orders[v][0], reply, sent[v]) for v, side, qty, reply
                                     in zip(orders, (spot_side, fut_side), (spot_qty, fut_qty), replies)), return_exceptions=True)
    out = []
    for venue, result in zip(orders, results):
        tag = orders[venue][0]
        if isinstance(result, RuntimeError):
            print(f"MISSED LEG: {result}", flush=True)
            out.append((Decimal(0), 0.0))
        elif isinstance(result, Exception):
            print(f"UNKNOWN LEG: {result!r}", flush=True)
            out.append(None)
        else:
            coin, quote = result
            held[venue] += coin if not closing else -coin
            if venue == "fut" and quote is None:
                owed.append((tag, "shorted" if fut_side == "SELL" else "covered"))
            elif venue == "spot":
                usdt["bought" if spot_side == "BUY" else "sold"] += quote
            else:
                usdt["shorted" if fut_side == "SELL" else "covered"] += quote
            out.append((coin, quote))
    if None in out:
        raise LookupError("a leg is unknown; nothing more is sent")
    return out


async def enter():
    q = down(min(Decimal(book["sAq"]), Decimal(book["fBq"]), spot_most, fut_most,
                 min(cap, wallet - 1) / Decimal(str(book["sa"]))), step)
    if float(q) * book["sa"] < max(least["spot"], floor) or float(q) * book["fb"] < max(least["fut"], floor):
        print(f"touch too thin: {q} {symbol} at spot ask {book['sa']} / perp bid {book['fb']}", flush=True)
        state["phase"] = "waiting" if mode == "watch" else "done"
        return
    await both("BUY", "SELL", q, q, False)
    excess = held["spot"] - held["fut"]  # more coin bought than shorted, or the reverse: flatten the difference at once
    if excess >= spot_step:
        gone, back = await one("spot", "SELL", down(excess, spot_step), True)
        held["spot"], usdt["sold"] = held["spot"] - gone, usdt["sold"] + back
    elif -excess >= fut_step:
        gone, back = await one("fut", "BUY", down(-excess, fut_step), True)
        held["fut"], usdt["covered"] = held["fut"] - gone, usdt["covered"] + back
    excess = held["spot"] - held["fut"]
    if excess >= spot_step or -excess >= fut_step:
        await leave()
        return
    if held["spot"] < step or held["fut"] < step:
        print(f"flat after entry: spot {held['spot']} perp {held['fut']}", flush=True)
        state["phase"] = "done"
        return
    state["phase"] = "holding"
    if mode == "fire" or closed():
        await leave()
    else:
        print(f"HOLD spot {held['spot']} perp short {held['fut']}", flush=True)


async def one(venue, side, qty, closing):
    # a single flattening order on one venue, resolved the same way as a pair
    active = lane[venue]
    tag, key, data = market(active, venue, side, qty, closing)
    sent = now()
    coin, quote = await resolve(venue, side, qty, tag, await answer(active, key, send(active, key, data)), sent)
    if quote is None:
        owed.append((tag, "covered" if side == "BUY" else "shorted"))
        quote = 0.0
    return coin, quote


def closed():
    # the books have closed back and the touch covers the position
    return book["fa"] <= book["sb"] and book["sB"] >= float(held["spot"]) and book["fA"] >= float(held["fut"])


async def leave():
    for _ in (1, 2):  # a leg that missed is sent again once; what is still open after that is printed for the owner
        want = {"spot": down(held["spot"], spot_step), "fut": down(held["fut"], fut_step)}
        if want["spot"] < spot_step and want["fut"] < fut_step:
            break
        if want["spot"] >= spot_step and want["fut"] >= fut_step:
            await both("SELL", "BUY", want["spot"], want["fut"], True)
        elif want["spot"] >= spot_step:
            gone, back = await one("spot", "SELL", want["spot"], True)
            held["spot"], usdt["sold"] = held["spot"] - gone, usdt["sold"] + back
        else:
            gone, back = await one("fut", "BUY", want["fut"], True)
            held["fut"], usdt["covered"] = held["fut"] - gone, usdt["covered"] + back
    state["phase"] = "done"


async def money():
    # the futures money read after the fact, and the cycle in USDT
    for tag, side in owed:
        r = await lookup("fut", tag)
        usdt[side] += float(r["cumQuote"])
        usdt["fees"] += float(r["cumQuote"]) * fut_fee
    net = usdt["sold"] - usdt["bought"] + usdt["shorted"] - usdt["covered"] - usdt["fees"]
    print(f"CYCLE {symbol}: spot bought {usdt['bought']:.4f} sold {usdt['sold']:.4f}, perp shorted {usdt['shorted']:.4f} "
          f"covered {usdt['covered']:.4f}, fees {usdt['fees']:.4f} (futures by rate), net {net:+.4f} USDT", flush=True)


async def run(step_coroutine):
    # one money step; its failure ends the run instead of leaving the loop free to fire again
    try:
        await step_coroutine
    except Exception as error:
        state["error"], state["phase"] = error, "done"


def on_book(venue, d):
    # a fresh top of book on one venue: decide from the pair of them
    update = int(d["u"])
    if update <= last[venue]:
        return
    last[venue] = update
    book[venue[0] + "b"], book[venue[0] + "B"] = float(d["b"]), float(d["B"])
    book[venue[0] + "a"], book[venue[0] + "A"] = float(d["a"]), float(d["A"])
    book[venue[0] + "Aq"], book[venue[0] + "Bq"], book[venue[0] + "t"] = d["A"], d["B"], now()
    if (not book["sa"] or not book["fa"] or not all(event.is_set() for event in ready.values())
            or state["task"] and not state["task"].done() or state["phase"] == "done"):
        return
    if state["phase"] == "waiting":
        gap = book["fb"] / book["sa"] - 1
        state["best"] = max(state["best"], gap)
        if mode == "fire":
            state["task"] = asyncio.ensure_future(run(enter()))
        elif gap > cost and book["sA"] * book["sa"] >= floor and book["fB"] * book["fb"] >= floor:
            if state["armed"] is None:  # a crossing above cost on a real touch: fire only if it still stands after confirm
                state["armed"] = now()
                state["timer"] = asyncio.get_running_loop().call_later(confirm, standing)
        else:
            disarm()
    elif state["phase"] == "holding" and closed():
        state["task"] = asyncio.ensure_future(run(leave()))


def disarm():
    if state["timer"] is not None:
        state["timer"].cancel()
    state["armed"] = state["timer"] = None


def standing():
    # confirm seconds after arming: the books as they stand now decide, a frame or not having come in between
    armed_at = state["armed"]
    state["armed"] = state["timer"] = None
    if armed_at is None or state["phase"] != "waiting" or not (book["sa"] and book["fa"]) or not all(e.is_set() for e in ready.values()):
        return
    gap = book["fb"] / book["sa"] - 1
    if gap > cost and book["sA"] * book["sa"] >= floor and book["fB"] * book["fb"] >= floor:
        print(f"CROSSING held {(now() - armed_at) / 1e6:.2f} ms: perp bid {book['fb']} over spot ask {book['sa']} by {gap * 100:+.4f}%", flush=True)
        state["task"] = asyncio.ensure_future(run(enter()))


class Feed(WSListener):
    def __init__(self, venue):
        self.venue = venue

    def on_ws_frame(self, transport, frame):
        d = orjson.loads(frame.get_payload_as_memoryview())
        if "b" in d:
            on_book(self.venue, d)


async def keep(venue):
    # one book feed for as long as the run lasts: a drop clears that venue's quotes, so nothing is decided against a
    # book no longer being received, and reconnects at once
    delay = 0.1
    while True:
        transport = None
        try:
            transport, _ = await ws_connect(lambda: Feed(venue), feeds[venue], enable_auto_ping=True, auto_ping_idle_timeout=2,
                                            auto_ping_reply_timeout=2)
            feed_live[venue] += 1
            delay = 0.1
            await transport.wait_disconnected()
        except Exception as error:
            print(f"{venue} feed: {error!r}", flush=True)
        finally:
            if transport is not None:
                feed_live[venue] -= 1
                if not transport.is_disconnected:
                    transport.disconnect()
            if not feed_live[venue]:
                for k in ("b", "a", "B", "A", "t"):
                    book[venue[0] + k] = 0.0
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)


async def connect_order(venue, count):
    async def candidate():
        transport = None
        try:
            transport, active = await ws_connect(Lane, lanes[venue], enable_auto_ping=True, auto_ping_idle_timeout=5,
                                                 auto_ping_reply_timeout=5)
            samples = []
            for _ in range(3):
                key, data = plain(active, "time")
                sent = now()
                reply, seen = await answer(active, key, send(active, key, data))
                if reply is None or reply.get("status") != 200:
                    raise ConnectionError(f"{venue} public time failed: {reply and reply.get('error')}")
                samples.append(seen - sent)
            peer = transport.underlying_transport.get_extra_info("peername")[0]
            return sorted(samples)[1], active, peer
        except BaseException:
            if transport is not None and not transport.is_disconnected:
                transport.disconnect()
            raise

    results = await asyncio.gather(*(candidate() for _ in range(count)), return_exceptions=True)
    good = [result for result in results if not isinstance(result, BaseException)]
    if not good:
        raise ConnectionError(f"{venue} order lane failed: " + "; ".join(repr(error) for error in results))
    public_ns, active, peer = min(good, key=lambda result: result[0])
    for result in good:
        if result[1] is not active:
            result[1].transport.disconnect()
    try:
        for _ in range(2):
            key, data = prepare(active, "order.status", {"symbol": symbol, "origClientOrderId": f"warm{now()}"})
            sent = now()
            warm, seen = await answer(active, key, send(active, key, data))
            expected_missing = warm and warm.get("status") == 400 and (warm.get("error") or {}).get("code") == -2013
            if not warm or warm.get("status") != 200 and not expected_missing:
                raise PermissionError(f"{venue} signed status failed: {warm and warm.get('error')}")
        print(f"{venue} order lane measured public-time median {public_ns / 1e6:.3f} ms, signed-status "
              f"{(seen - sent) / 1e6:.3f} ms, peer {peer}", flush=True)
        return active
    except BaseException:
        if not active.transport.is_disconnected:
            active.transport.disconnect()
        raise


async def reconnect(venue):
    while True:
        await lane[venue].transport.wait_disconnected()
        ready[venue].clear()
        delay = 0.1
        while True:
            try:
                lane[venue] = await connect_order(venue, 1)
                ready[venue].set()
                break
            except Exception as error:
                print(f"{venue} order lane: {error!r}", flush=True)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)


async def main():
    for name in lanes:
        ready[name] = asyncio.Event()
    order_tasks = []
    feed_tasks = []
    online = False
    try:
        opened = await asyncio.gather(*(connect_order(name, 3) for name in lanes), return_exceptions=True)
        failure = next((result for result in opened if isinstance(result, BaseException)), None)
        if failure:
            for active in opened:
                if not isinstance(active, BaseException) and not active.transport.is_disconnected:
                    active.transport.disconnect()
            raise failure
        for name, active in zip(lanes, opened):
            lane[name] = active
            ready[name].set()
        online = True
        order_tasks = [asyncio.create_task(reconnect(name)) for name in lanes]
        print(f"{symbol}: cap {min(cap, wallet - 1):.2f} USDT (asked {cap:.0f}, spot wallet {wallet:.2f}), four-leg cost "
              f"{cost * 100:.4f}%, lot step {step}, {mode}", flush=True)
        if mode == "flatten":
            held["spot"], held["fut"] = Decimal(sys.argv[3]), Decimal(sys.argv[4])
            await run(leave())
        else:
            deadline = time.time() + seconds
            feed_tasks = [asyncio.create_task(keep(v)) for v in feeds for _ in range(3)]
            while state["phase"] != "done":
                await asyncio.sleep(0.05)
                if state["phase"] == "waiting" and time.time() > deadline:
                    print(f"no crossing cleared {cost * 100:.4f}% in {seconds:.0f} s; best perp bid over spot ask "
                          f"{state['best'] * 100:+.4f}%", flush=True)
                    state["phase"] = "done"
                    break
    except Exception as error:
        state["error"] = state["error"] or error
    finally:
        for task in feed_tasks:
            task.cancel()
        await asyncio.gather(*feed_tasks, return_exceptions=True)
    if online:
        try:
            await money()
        except Exception as error:
            state["error"] = state["error"] or error
    for task in order_tasks:
        task.cancel()
    await asyncio.gather(*order_tasks, return_exceptions=True)
    for active in lane.values():
        if not active.transport.is_disconnected:
            active.transport.disconnect()
    if state["error"]:
        print(f"FAILED: {state['error']!r}", flush=True)
    if held["spot"] >= spot_step or held["fut"] >= fut_step:
        print(f"OPEN LEG: spot {held['spot']} perp short {held['fut']} still on Binance", flush=True)
    sys.exit(1 if state["error"] or held["spot"] >= spot_step or held["fut"] >= fut_step else 0)


uvloop.run(main())
