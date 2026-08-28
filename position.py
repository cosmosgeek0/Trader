import time
import urllib.error
from decimal import Decimal

from binance import (FAPI, SPOT, fut_rules, get, place, position_amt, post,
                     public, round_step, send, spot_free, spot_rules, wait_fill)


def watch(book, symbol, field, entry, sign, tp, stop, trail, deadline):
    last = 0.0
    peak = Decimal(0)
    pnl = Decimal(0)
    price = None
    while True:
        if time.time() >= deadline and price is not None:
            reason = "time"  # woken at the deadline; close now, last price is under 2 s old
        else:
            price = Decimal(public(book + "?symbol=" + symbol)[field])
            pnl = sign * (price - entry) / entry * 100
            if pnl > peak:
                peak = pnl
            if pnl >= tp:
                reason = "take-profit"
            elif pnl <= -stop:
                reason = "stop"
            elif trail is not None and peak - pnl >= trail:
                reason = "trail"
            elif time.time() >= deadline:
                reason = "time"
            else:
                if time.time() - last >= 30:
                    word = f", trail -{trail}% off peak {peak:+.3f}%" if trail is not None else ""
                    print(f"{time.strftime('%H:%M:%S')} {field[:3]} {price:f} pnl {pnl:+.3f}%, "
                          f"tp +{tp}% stop -{stop}%{word}, "
                          f"time exit {time.strftime('%H:%M:%S', time.localtime(deadline))}", flush=True)
                    last = time.time()
                time.sleep(min(2.0, max(0.0, deadline - time.time())))
                continue
        print(f"{time.strftime('%H:%M:%S')} {reason} exit at {field[:3]} {price:f}, "
              f"pnl {pnl:+.3f}% (peak {peak:+.3f}%)", flush=True)
        return reason


def rest(url, action, order, symbol, deadline):
    last = 0.0
    while order["status"] in ("NEW", "PARTIALLY_FILLED") and time.time() < deadline:
        if time.time() - last >= 30:
            print(f"{time.strftime('%H:%M:%S')} {action} resting at {order['price']}, "
                  f"filled {order['executedQty']} of {order['origQty']}", flush=True)
            last = time.time()
        time.sleep(min(2.0, max(0.0, deadline - time.time())))
        order = get(url, {"symbol": symbol, "orderId": order["orderId"]})
    if order["status"] in ("NEW", "PARTIALLY_FILLED"):
        try:
            send(url, {"symbol": symbol, "orderId": order["orderId"]}, "DELETE")
            print(f"{action} canceled at the time limit", flush=True)
        except urllib.error.HTTPError as error:  # a fill can race the cancel
            print(action, "cancel rejected:", error.read().decode(), flush=True)
        order = get(url, {"symbol": symbol, "orderId": order["orderId"]})
    if order["status"] == "FILLED":
        return order
    if Decimal(order["executedQty"]) == 0:
        print(f"{action} {order['status']}, nothing filled inside the time limit", flush=True)
        return None
    print(f"{action} {order['status']}, partial fill {order['executedQty']} of {order['origQty']}", flush=True)
    return order


def await_break(url, field, level, buying, deadline):
    last = 0.0
    while True:
        touch = Decimal(public(url)[field])
        if time.time() >= deadline:  # window over before this quote; nothing may open on it
            print(f"{time.strftime('%H:%M:%S')} break {level:f} not reached inside the window, "
                  f"now {touch:f}, nothing done", flush=True)
            return None
        if touch >= level if buying else touch <= level:
            print(f"{time.strftime('%H:%M:%S')} break {level:f} crossed at {touch:f}", flush=True)
            return touch
        if time.time() - last >= 30:
            print(f"{time.strftime('%H:%M:%S')} waiting for break {level:f}, "
                  f"{field[:3]} {touch:f}", flush=True)
            last = time.time()
        time.sleep(min(2.0, max(0.0, deadline - time.time())))


def spot_long(symbol, amount, tps, stop, hours, mode, level, trail):
    t0 = time.time()
    deadline = t0 + float(hours) * 3600
    srules = spot_rules(symbol)
    base = srules["baseAsset"]
    sfilters = {x["filterType"]: x for x in srules["filters"]}
    sstep = Decimal(sfilters["LOT_SIZE"]["stepSize"])
    sell_step = Decimal(sfilters["MARKET_LOT_SIZE"]["stepSize"])
    if sell_step == 0:
        sell_step = sstep
    before = spot_free()
    if mode == "limit":
        qty = round_step(amount / level, sstep)
        buy = place(SPOT + "/api/v3/order", "LONG spot buy",
                    {"symbol": symbol, "side": "BUY", "type": "LIMIT", "timeInForce": "GTC",
                     "quantity": str(qty), "price": str(level)})
        buy = rest(SPOT + "/api/v3/order", "LONG spot buy", buy, symbol, deadline)
        if buy is None:
            return
    else:
        if mode == "break":
            if await_break(SPOT + "/api/v3/ticker/bookTicker?symbol=" + symbol,
                           "askPrice", level, True, deadline) is None:
                return
        buy = place(SPOT + "/api/v3/order", "LONG spot buy",
                    {"symbol": symbol, "side": "BUY", "type": "MARKET", "quoteOrderQty": str(amount)})
        buy = wait_fill(SPOT + "/api/v3/order", "LONG spot buy", buy, symbol)
    opened = time.time()
    entry = Decimal(buy["cummulativeQuoteQty"]) / Decimal(buy["executedQty"])
    owned = spot_free().get(base, Decimal(0)) - before.get(base, Decimal(0))
    print(f"LONG spot buy {symbol} order {buy['orderId']} {buy['status']}, executed {buy['executedQty']} "
          f"for {buy['cummulativeQuoteQty']} USDT, entry avg {entry:f}", flush=True)
    remaining = owned
    exits = []
    held = opened
    for i, tp in enumerate(tps):
        if buy["status"] == "FILLED":
            reason = watch(SPOT + "/api/v3/ticker/bookTicker", symbol, "bidPrice", entry, 1,
                           tp, stop, trail, deadline)
        else:
            reason = "entry window"
        if held == opened:
            held = time.time()
        part = round_step(remaining, sell_step)
        if reason == "take-profit" and i < len(tps) - 1:
            half = round_step(remaining / 2, sell_step)
            if half > 0:
                part = half
        sell = place(SPOT + "/api/v3/order", "LONG spot sell",
                     {"symbol": symbol, "side": "SELL", "type": "MARKET", "quantity": str(part)})
        sell = wait_fill(SPOT + "/api/v3/order", "LONG spot sell", sell, symbol)
        exits.append(sell)
        remaining -= Decimal(sell["executedQty"])
        print(f"LONG spot sell {sell['executedQty']} {symbol} order {sell['orderId']} {sell['status']} "
              f"for {sell['cummulativeQuoteQty']} USDT, avg "
              f"{Decimal(sell['cummulativeQuoteQty']) / Decimal(sell['executedQty']):f}, "
              f"remaining {remaining:f}")
        if reason != "take-profit" or round_step(remaining, sell_step) == 0:
            break
    closed = time.time()
    fee = {}
    for order in [buy] + exits:
        for t in get(SPOT + "/api/v3/myTrades", {"symbol": symbol, "orderId": order["orderId"]}):
            fee[t["commissionAsset"]] = fee.get(t["commissionAsset"], Decimal(0)) + Decimal(t["commission"])
    print("fees " + ", ".join(f"{v:f} {k}" for k, v in fee.items()))
    after = spot_free()
    print(f"net result: {reason} exit, spot USDT {after.get('USDT', Decimal(0)) - before.get('USDT', Decimal(0)):+f}, "
          f"{base} change {after.get(base, Decimal(0)) - before.get(base, Decimal(0)):+f}")
    print(f"final balances: spot {after.get(base, Decimal(0)):f} {base}, {after.get('USDT', Decimal(0)):f} USDT")
    print(f"timings: open {int((opened - t0) * 1000)} ms, first exit {int(held - opened)} s after open, "
          f"done {int(closed - t0)} s from start")


def fut_trade(symbol, amount, tps, stop, hours, side, mode, level, trail):
    word = "LONG" if side == "BUY" else "SHORT"
    open_action = word + (" fut buy" if side == "BUY" else " fut sell")
    t0 = time.time()
    deadline = t0 + float(hours) * 3600
    ffilters = {x["filterType"]: x for x in fut_rules(symbol)["filters"]}
    fstep = Decimal(ffilters["MARKET_LOT_SIZE"]["stepSize"])
    if fstep == 0:
        fstep = Decimal(ffilters["LOT_SIZE"]["stepSize"])
    position = position_amt(symbol)
    if position != 0:
        raise SystemExit(f"{symbol} already has a futures position {position:f} that is not this trade's")
    fut0 = next(Decimal(b["balance"]) for b in get(FAPI + "/fapi/v2/balance", {}) if b["asset"] == "USDT")
    lev = post(FAPI + "/fapi/v1/leverage", "set leverage", {"symbol": symbol, "leverage": "1"})
    print(f"LEVERAGE {lev['leverage']}x {symbol}")
    book = FAPI + "/fapi/v1/ticker/bookTicker"
    touch_field = "askPrice" if side == "BUY" else "bidPrice"
    if mode == "limit":
        qty = round_step(amount / level, Decimal(ffilters["LOT_SIZE"]["stepSize"]))
        opened_ms = int(time.time() * 1000)
        order = place(FAPI + "/fapi/v1/order", open_action,
                      {"symbol": symbol, "side": side, "type": "LIMIT", "timeInForce": "GTC",
                       "quantity": str(qty), "price": str(level)})
        order = rest(FAPI + "/fapi/v1/order", open_action, order, symbol, deadline)
        if order is None:
            return
    else:
        if mode == "break":
            touch = await_break(book + "?symbol=" + symbol, touch_field, level, side == "BUY", deadline)
            if touch is None:
                return
        else:
            touch = Decimal(public(book + "?symbol=" + symbol)[touch_field])
        qty = round_step(amount / touch, fstep)
        opened_ms = int(time.time() * 1000)
        order = place(FAPI + "/fapi/v1/order", open_action,
                      {"symbol": symbol, "side": side, "type": "MARKET", "quantity": str(qty)})
        order = wait_fill(FAPI + "/fapi/v1/order", open_action, order, symbol)
    opened = time.time()
    entry = Decimal(order["avgPrice"])
    print(f"{open_action} {order['executedQty']} {symbol} order {order['orderId']} {order['status']} "
          f"at avg {entry:f}", flush=True)
    watch_field = "bidPrice" if side == "BUY" else "askPrice"
    close_side = "SELL" if side == "BUY" else "BUY"
    remaining = Decimal(order["executedQty"])
    exits = []
    held = opened
    for i, tp in enumerate(tps):
        if order["status"] == "FILLED":
            reason = watch(book, symbol, watch_field, entry, 1 if side == "BUY" else -1,
                           tp, stop, trail, deadline)
        else:
            reason = "entry window"
        if held == opened:
            held = time.time()
        part = remaining
        if reason == "take-profit" and i < len(tps) - 1:
            half = round_step(remaining / 2, fstep)
            if half > 0:
                part = half
        close = place(FAPI + "/fapi/v1/order", word + " fut close",
                      {"symbol": symbol, "side": close_side, "type": "MARKET",
                       "quantity": str(part), "reduceOnly": "true"})
        close = wait_fill(FAPI + "/fapi/v1/order", word + " fut close", close, symbol)
        exits.append(close)
        remaining -= Decimal(close["executedQty"])
        print(f"{word} fut close {close['executedQty']} {symbol} order {close['orderId']} {close['status']} "
              f"at avg {close['avgPrice']}, remaining {remaining:f}")
        if reason != "take-profit" or remaining == 0:
            break
    closed = time.time()
    ids = {order["orderId"]} | {c["orderId"] for c in exits}
    fee = Decimal(0)
    pnl = Decimal(0)
    for t in get(FAPI + "/fapi/v1/userTrades", {"symbol": symbol, "startTime": opened_ms}):
        if t["orderId"] in ids:
            fee += Decimal(t["commission"])
            pnl += Decimal(t["realizedPnl"])
    funding = sum(Decimal(i["income"]) for i in get(FAPI + "/fapi/v1/income",
                  {"symbol": symbol, "incomeType": "FUNDING_FEE", "startTime": opened_ms}))
    fut1 = next(Decimal(b["balance"]) for b in get(FAPI + "/fapi/v2/balance", {}) if b["asset"] == "USDT")
    print(f"fees {fee:f} USDT, realized pnl {pnl:+f} USDT, "
          + (f"funding {funding:+f} USDT" if funding else "funding none charged or received"))
    print(f"net result: {reason} exit, futures USDT {fut1 - fut0:+f}")
    print(f"final: futures {fut1:f} USDT, position {position_amt(symbol):f}")
    print(f"timings: open {int((opened - t0) * 1000)} ms, first exit {int(held - opened)} s after open, "
          f"done {int(closed - t0)} s from start")


def entry_args(argv, at):
    mode = argv[at] if len(argv) > at else "market"
    if mode not in ("market", "limit", "break"):
        raise SystemExit("entry must be market, limit PRICE, or break LEVEL")
    level = None
    if mode != "market":
        if len(argv) <= at + 1:
            raise SystemExit(mode + " entry needs a price")
        level = Decimal(argv[at + 1])
        at += 1
    trail = Decimal(argv[at + 1]) if len(argv) > at + 1 else None
    return mode, level, trail


def tp_args(word):
    tps = [Decimal(x) for x in word.split("/")]
    if len(tps) > 2:
        raise SystemExit("tp is one target, or A/B for half out at +A% and the rest at +B%")
    return tps


def long(argv):
    symbol = argv[2]
    amount = Decimal(argv[3])
    tps = tp_args(argv[4])
    stop = Decimal(argv[5])
    hours = Decimal(argv[6])
    venue = argv[7] if len(argv) > 7 else "spot"
    if venue not in ("spot", "fut"):
        raise SystemExit("venue must be spot or fut")
    mode, level, trail = entry_args(argv, 8)
    entry_word = "market" if mode == "market" else f"{mode} {level:f}"
    trail_word = f", trail {trail}%" if trail is not None else ""
    print(f"LONG {symbol} {amount} USDT on {venue} at {entry_word}, tp +{argv[4]}%, stop -{stop}%{trail_word}, "
          f"all inside {hours} h", flush=True)
    if venue == "fut":
        fut_trade(symbol, amount, tps, stop, hours, "BUY", mode, level, trail)
    else:
        spot_long(symbol, amount, tps, stop, hours, mode, level, trail)


def short(argv):
    symbol = argv[2]
    amount = Decimal(argv[3])
    tps = tp_args(argv[4])
    stop = Decimal(argv[5])
    hours = Decimal(argv[6])
    mode, level, trail = entry_args(argv, 7)
    entry_word = "market" if mode == "market" else f"{mode} {level:f}"
    trail_word = f", trail {trail}%" if trail is not None else ""
    print(f"SHORT {symbol} {amount} USDT on fut at {entry_word}, tp +{argv[4]}%, stop -{stop}%{trail_word}, "
          f"all inside {hours} h", flush=True)
    fut_trade(symbol, amount, tps, stop, hours, "SELL", mode, level, trail)
