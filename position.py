import time
from decimal import Decimal

from binance import (FAPI, SPOT, fut_rules, get, place, position_amt, post,
                     public, round_step, spot_free, spot_rules, wait_fill)


def watch(book, symbol, field, entry, sign, tp, stop, deadline):
    last = 0.0
    while True:
        price = Decimal(public(book + "?symbol=" + symbol)[field])
        pnl = sign * (price - entry) / entry * 100
        if pnl >= tp:
            reason = "take-profit"
        elif pnl <= -stop:
            reason = "stop"
        elif time.time() >= deadline:
            reason = "time"
        else:
            if time.time() - last >= 30:
                print(f"{time.strftime('%H:%M:%S')} {field[:3]} {price:f} pnl {pnl:+.3f}%, tp +{tp}% stop -{stop}% "
                      f"time exit {time.strftime('%H:%M:%S', time.localtime(deadline))}", flush=True)
                last = time.time()
            time.sleep(2)
            continue
        print(f"{time.strftime('%H:%M:%S')} {reason} exit at {field[:3]} {price:f}, pnl {pnl:+.3f}%", flush=True)
        return reason


def spot_long(symbol, amount, tp, stop, hours):
    t0 = time.time()
    srules = spot_rules(symbol)
    base = srules["baseAsset"]
    sfilters = {x["filterType"]: x for x in srules["filters"]}
    sstep = Decimal(sfilters["LOT_SIZE"]["stepSize"])
    smarket = Decimal(sfilters["MARKET_LOT_SIZE"]["stepSize"])
    if smarket != 0:
        sstep = smarket
    before = spot_free()
    buy = place(SPOT + "/api/v3/order", "LONG spot buy",
                {"symbol": symbol, "side": "BUY", "type": "MARKET", "quoteOrderQty": str(amount)})
    buy = wait_fill(SPOT + "/api/v3/order", "LONG spot buy", buy, symbol)
    opened = time.time()
    entry = Decimal(buy["cummulativeQuoteQty"]) / Decimal(buy["executedQty"])
    owned = spot_free().get(base, Decimal(0)) - before.get(base, Decimal(0))
    print(f"LONG spot buy {symbol} order {buy['orderId']} {buy['status']}, executed {buy['executedQty']} "
          f"for {buy['cummulativeQuoteQty']} USDT, entry avg {entry:f}", flush=True)
    reason = watch(SPOT + "/api/v3/ticker/bookTicker", symbol, "bidPrice", entry, 1,
                   tp, stop, opened + float(hours) * 3600)
    held = time.time()
    sell_qty = round_step(owned, sstep)
    sell = place(SPOT + "/api/v3/order", "LONG spot sell",
                 {"symbol": symbol, "side": "SELL", "type": "MARKET", "quantity": str(sell_qty)})
    sell = wait_fill(SPOT + "/api/v3/order", "LONG spot sell", sell, symbol)
    closed = time.time()
    exit_avg = Decimal(sell["cummulativeQuoteQty"]) / Decimal(sell["executedQty"])
    print(f"LONG spot sell {sell_qty} {symbol} order {sell['orderId']} {sell['status']}, "
          f"executed {sell['executedQty']} for {sell['cummulativeQuoteQty']} USDT, exit avg {exit_avg:f}")
    fee = {}
    for order in (buy, sell):
        for t in get(SPOT + "/api/v3/myTrades", {"symbol": symbol, "orderId": order["orderId"]}):
            fee[t["commissionAsset"]] = fee.get(t["commissionAsset"], Decimal(0)) + Decimal(t["commission"])
    print("fees " + ", ".join(f"{v:f} {k}" for k, v in fee.items()))
    after = spot_free()
    print(f"net result: {reason} exit, spot USDT {after.get('USDT', Decimal(0)) - before.get('USDT', Decimal(0)):+f}, "
          f"{base} change {after.get(base, Decimal(0)) - before.get(base, Decimal(0)):+f}")
    print(f"final balances: spot {after.get(base, Decimal(0)):f} {base}, {after.get('USDT', Decimal(0)):f} USDT")
    print(f"timings: open {int((opened - t0) * 1000)} ms, held {int(held - opened)} s, "
          f"close {int((closed - held) * 1000)} ms, total {int(closed - t0)} s")


def fut_trade(symbol, amount, tp, stop, hours, side):
    word = "LONG" if side == "BUY" else "SHORT"
    open_action = word + (" fut buy" if side == "BUY" else " fut sell")
    t0 = time.time()
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
    price = Decimal(public(book + "?symbol=" + symbol)["askPrice" if side == "BUY" else "bidPrice"])
    qty = round_step(amount / price, fstep)
    opened_ms = int(time.time() * 1000)
    order = place(FAPI + "/fapi/v1/order", open_action,
                  {"symbol": symbol, "side": side, "type": "MARKET", "quantity": str(qty)})
    order = wait_fill(FAPI + "/fapi/v1/order", open_action, order, symbol)
    opened = time.time()
    entry = Decimal(order["avgPrice"])
    print(f"{open_action} {qty} {symbol} order {order['orderId']} {order['status']}, "
          f"executed {order['executedQty']} at avg {entry:f}", flush=True)
    reason = watch(book, symbol, "bidPrice" if side == "BUY" else "askPrice", entry,
                   1 if side == "BUY" else -1, tp, stop, opened + float(hours) * 3600)
    held = time.time()
    close_qty = Decimal(order["executedQty"])
    close = place(FAPI + "/fapi/v1/order", word + " fut close",
                  {"symbol": symbol, "side": "SELL" if side == "BUY" else "BUY", "type": "MARKET",
                   "quantity": str(close_qty), "reduceOnly": "true"})
    close = wait_fill(FAPI + "/fapi/v1/order", word + " fut close", close, symbol)
    closed = time.time()
    print(f"{word} fut close {close_qty} {symbol} order {close['orderId']} {close['status']}, "
          f"executed {close['executedQty']} at avg {close['avgPrice']}")
    fee = Decimal(0)
    pnl = Decimal(0)
    for t in get(FAPI + "/fapi/v1/userTrades", {"symbol": symbol, "startTime": opened_ms}):
        if t["orderId"] in (order["orderId"], close["orderId"]):
            fee += Decimal(t["commission"])
            pnl += Decimal(t["realizedPnl"])
    funding = sum(Decimal(i["income"]) for i in get(FAPI + "/fapi/v1/income",
                  {"symbol": symbol, "incomeType": "FUNDING_FEE", "startTime": opened_ms}))
    fut1 = next(Decimal(b["balance"]) for b in get(FAPI + "/fapi/v2/balance", {}) if b["asset"] == "USDT")
    print(f"fees {fee:f} USDT, realized pnl {pnl:+f} USDT, "
          + (f"funding {funding:+f} USDT" if funding else "funding none charged or received"))
    print(f"net result: {reason} exit, futures USDT {fut1 - fut0:+f}")
    print(f"final: futures {fut1:f} USDT, position {position_amt(symbol):f}")
    print(f"timings: open {int((opened - t0) * 1000)} ms, held {int(held - opened)} s, "
          f"close {int((closed - held) * 1000)} ms, total {int(closed - t0)} s")


def long(argv):
    symbol = argv[2]
    amount = Decimal(argv[3])
    tp = Decimal(argv[4])
    stop = Decimal(argv[5])
    hours = Decimal(argv[6])
    venue = argv[7] if len(argv) > 7 else "spot"
    if venue not in ("spot", "fut"):
        raise SystemExit("venue must be spot or fut")
    print(f"LONG {symbol} {amount} USDT on {venue}, tp +{tp}%, stop -{stop}%, time exit after {hours} h",
          flush=True)
    if venue == "fut":
        fut_trade(symbol, amount, tp, stop, hours, "BUY")
    else:
        spot_long(symbol, amount, tp, stop, hours)


def short(argv):
    symbol = argv[2]
    amount = Decimal(argv[3])
    tp = Decimal(argv[4])
    stop = Decimal(argv[5])
    hours = Decimal(argv[6])
    print(f"SHORT {symbol} {amount} USDT on fut, tp +{tp}%, stop -{stop}%, time exit after {hours} h",
          flush=True)
    fut_trade(symbol, amount, tp, stop, hours, "SELL")
