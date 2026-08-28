import time
from decimal import Decimal

from binance import (FAPI, SPOT, fut_rules, get, place, position_amt, post,
                     public, round_step, spot_free, spot_rules, wait_fill)


def bid_price(book, symbol):
    return Decimal(public(book + "?symbol=" + symbol)["bidPrice"])


def watch(book, symbol, entry, tp, stop, deadline):
    last = 0.0
    while True:
        bid = bid_price(book, symbol)
        pnl = (bid - entry) / entry * 100
        if pnl >= tp:
            reason = "take-profit"
        elif pnl <= -stop:
            reason = "stop"
        elif time.time() >= deadline:
            reason = "time"
        else:
            if time.time() - last >= 30:
                print(f"{time.strftime('%H:%M:%S')} bid {bid:f} pnl {pnl:+.3f}%, tp +{tp}% stop -{stop}% "
                      f"time exit {time.strftime('%H:%M:%S', time.localtime(deadline))}", flush=True)
                last = time.time()
            time.sleep(2)
            continue
        print(f"{time.strftime('%H:%M:%S')} {reason} exit at bid {bid:f}, pnl {pnl:+.3f}%", flush=True)
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
    reason = watch(SPOT + "/api/v3/ticker/bookTicker", symbol, entry, tp, stop, opened + float(hours) * 3600)
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


def fut_long(symbol, amount, tp, stop, hours):
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
    ask = Decimal(public(FAPI + "/fapi/v1/ticker/bookTicker?symbol=" + symbol)["askPrice"])
    qty = round_step(amount / ask, fstep)
    opened_ms = int(time.time() * 1000)
    buy = place(FAPI + "/fapi/v1/order", "LONG fut buy",
                {"symbol": symbol, "side": "BUY", "type": "MARKET", "quantity": str(qty)})
    buy = wait_fill(FAPI + "/fapi/v1/order", "LONG fut buy", buy, symbol)
    entry = Decimal(buy["avgPrice"])
    opened = time.time()
    print(f"LONG fut buy {qty} {symbol} order {buy['orderId']} {buy['status']}, "
          f"executed {buy['executedQty']} at avg {entry:f}", flush=True)
    reason = watch(FAPI + "/fapi/v1/ticker/bookTicker", symbol, entry, tp, stop, opened + float(hours) * 3600)
    held = time.time()
    close_qty = Decimal(buy["executedQty"])
    sell = place(FAPI + "/fapi/v1/order", "LONG fut close",
                 {"symbol": symbol, "side": "SELL", "type": "MARKET",
                  "quantity": str(close_qty), "reduceOnly": "true"})
    sell = wait_fill(FAPI + "/fapi/v1/order", "LONG fut close", sell, symbol)
    closed = time.time()
    print(f"LONG fut close {close_qty} {symbol} order {sell['orderId']} {sell['status']}, "
          f"executed {sell['executedQty']} at avg {sell['avgPrice']}")
    fee = Decimal(0)
    pnl = Decimal(0)
    for t in get(FAPI + "/fapi/v1/userTrades", {"symbol": symbol, "startTime": opened_ms}):
        if t["orderId"] in (buy["orderId"], sell["orderId"]):
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
        fut_long(symbol, amount, tp, stop, hours)
    else:
        spot_long(symbol, amount, tp, stop, hours)
