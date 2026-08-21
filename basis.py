import time
import urllib.error
from decimal import ROUND_HALF_EVEN, ROUND_UP, Decimal

import market
from binance import (FAPI, SPOT, borrow_asset, fut_price, fut_rules, get, place,
                     position_amt, post, round_step, send, spot_free, spot_price,
                     spot_rules, wait_fill)


def auto(argv):
    symbol = argv[2]
    amount = Decimal(argv[3])
    entry = Decimal(argv[4])
    close = Decimal(argv[5])
    t0 = time.time()
    srules = spot_rules(symbol)
    base = srules["baseAsset"]
    sfilters = {x["filterType"]: x for x in srules["filters"]}
    sstep = Decimal(sfilters["LOT_SIZE"]["stepSize"])
    smarket = Decimal(sfilters["MARKET_LOT_SIZE"]["stepSize"])
    if smarket != 0:
        sstep = smarket
    fstep = Decimal({x["filterType"]: x for x in fut_rules(symbol)["filters"]}["MARKET_LOT_SIZE"]["stepSize"])
    step = max(sstep, fstep)
    print(f"AUTO watching {symbol}, {amount} USDT per leg, entry gap {entry}%, close gap {close}%", flush=True)

    def watch(threshold, closing):
        while True:
            sexec, fexec, _, _, qty = market.executable(symbol, amount, "asks", "bids", step)
            if sexec is None or fexec is None:
                print(f"{time.strftime('%H:%M:%S')} no executable prices for qty {qty:f}, waiting", flush=True)
            else:
                gap = (fexec - sexec) / sexec * 100
                word = "close" if closing else "entry"
                print(f"{time.strftime('%H:%M:%S')} executable normal gap {gap:+.4f}% (qty {qty:f}, "
                      f"spot {sexec:.8f} fut {fexec:.8f}), {word} at {threshold}%", flush=True)
                if gap <= threshold if closing else gap >= threshold:
                    print(f"{word} threshold reached at {gap:+.4f}%", flush=True)
                    return gap
            time.sleep(2)

    def fut_usdt():
        return next(Decimal(b["balance"]) for b in get(FAPI + "/fapi/v2/balance", {}) if b["asset"] == "USDT")

    entry_gap = watch(entry, False)
    watched = time.time()
    before = spot_free()
    fut0 = fut_usdt()
    opened_ms = int(time.time() * 1000)
    buy, short = open_normal(symbol, base, sstep, amount, before, time.time())
    opened = time.time()
    exit_gap = watch(close, True)
    held = time.time()
    fclose, sell = close_normal(symbol, base, sstep, spot_free(), time.time())
    closed = time.time()
    print(f"entry gap {entry_gap:+.4f}%, exit gap {exit_gap:+.4f}%")
    print(f"fills: spot buy {buy['executedQty']} for {buy['cummulativeQuoteQty']} USDT, "
          f"fut short {short['executedQty']} at avg {short['avgPrice']}, "
          f"fut close {fclose['executedQty']} at avg {fclose['avgPrice']}, "
          f"spot sell {sell['executedQty']} for {sell['cummulativeQuoteQty']} USDT")
    fee = {}
    for order in (buy, sell):
        for t in get(SPOT + "/api/v3/myTrades", {"symbol": symbol, "orderId": order["orderId"]}):
            fee[t["commissionAsset"]] = fee.get(t["commissionAsset"], Decimal(0)) + Decimal(t["commission"])
    for t in get(FAPI + "/fapi/v1/userTrades", {"symbol": symbol, "startTime": opened_ms}):
        if t["orderId"] in (short["orderId"], fclose["orderId"]):
            fee[t["commissionAsset"]] = fee.get(t["commissionAsset"], Decimal(0)) + Decimal(t["commission"])
    print("fees " + ", ".join(f"{v:f} {k}" for k, v in fee.items()))
    funding = sum(Decimal(i["income"]) for i in get(FAPI + "/fapi/v1/income",
                  {"symbol": symbol, "incomeType": "FUNDING_FEE", "startTime": opened_ms}))
    print(f"futures funding {funding:+f} USDT" if funding else "futures funding none charged or received")
    after = spot_free()
    fut1 = fut_usdt()
    dspot = after.get("USDT", Decimal(0)) - before.get("USDT", Decimal(0))
    dfut = fut1 - fut0
    dbase = after.get(base, Decimal(0)) - before.get(base, Decimal(0))
    print(f"net result: spot USDT {dspot:+f}, futures USDT {dfut:+f}, total {dspot + dfut:+f} USDT, "
          f"{base} change {dbase:+f}")
    print(f"final balances: spot {after.get(base, Decimal(0)):f} {base} and "
          f"{after.get('USDT', Decimal(0)):f} USDT, futures {fut1:f} USDT")
    print(f"timings: watched {int(watched - t0)} s, open {int((opened - watched) * 1000)} ms, "
          f"held {int(held - opened)} s, close {int((closed - held) * 1000)} ms, total {int(closed - t0)} s")
    settle(symbol, base, before)


def settle(symbol, base, before):
    after = spot_free()
    print(f"spot change {base} {after.get(base, Decimal(0)) - before.get(base, Decimal(0)):+f}, "
          f"USDT {after.get('USDT', Decimal(0)) - before.get('USDT', Decimal(0)):+f}")
    print(f"fut position {position_amt(symbol):f}")
    entry = next(a for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"] if a["asset"] == base)
    print(f"margin {base} borrowed {entry['borrowed']} interest {entry['interest']}")
    print("open orders spot", len(get(SPOT + "/api/v3/openOrders", {"symbol": symbol})),
          "fut", len(get(FAPI + "/fapi/v1/openOrders", {"symbol": symbol})),
          "margin", len(get(SPOT + "/sapi/v1/margin/openOrders", {"symbol": symbol})))


def open_normal(symbol, base, sstep, amount, before, t0):
    ffilters = {x["filterType"]: x for x in fut_rules(symbol)["filters"]}
    fstep = Decimal(ffilters["MARKET_LOT_SIZE"]["stepSize"])
    sprice = spot_price(symbol)
    fprice = fut_price(symbol)
    q = round_step(amount / max(sprice, fprice), max(sstep, fstep))
    lev = post(FAPI + "/fapi/v1/leverage", "set leverage", {"symbol": symbol, "leverage": "1"})
    print(f"LEVERAGE {lev['leverage']}x {symbol}")
    leg = place(SPOT + "/api/v3/order", "NBASIS spot buy",
                {"symbol": symbol, "side": "BUY", "type": "MARKET", "quantity": str(q)})
    leg = wait_fill(SPOT + "/api/v3/order", "NBASIS spot buy", leg, symbol)
    filled_at = time.time()
    print(f"NBASIS spot buy {q} {symbol}, order {leg['orderId']} {leg['status']}, "
          f"executed {leg['executedQty']}")
    owned = spot_free().get(base, Decimal(0)) - before.get(base, Decimal(0))
    hedge_qty = round_step(owned, fstep, ROUND_HALF_EVEN)
    hedge_at = time.time()
    hedge = place(FAPI + "/fapi/v1/order", "NBASIS fut short",
                  {"symbol": symbol, "side": "SELL", "type": "MARKET", "quantity": str(hedge_qty)})
    hedge = wait_fill(FAPI + "/fapi/v1/order", "NBASIS fut short", hedge, symbol)
    print(f"NBASIS fut short {hedge_qty} {symbol} against {owned:f} {base} received by the buy, "
          f"order {hedge['orderId']} {hedge['status']}, executed {hedge['executedQty']}")
    print(f"hedge submitted {int((hedge_at - filled_at) * 1000)} ms after spot fill confirmed, "
          f"open total {int((time.time() - t0) * 1000)} ms")
    return leg, hedge


def close_normal(symbol, base, sstep, before, t0):
    position = position_amt(symbol)
    if position >= 0:
        raise SystemExit(f"no {symbol} short position to close")
    q = -position
    sell_qty = round_step(min(q, before.get(base, Decimal(0))), sstep)
    if sell_qty == 0:
        raise SystemExit(f"no {base} free on spot to sell")
    hedge = place(FAPI + "/fapi/v1/order", "NBASIS fut close",
                  {"symbol": symbol, "side": "BUY", "type": "MARKET",
                   "quantity": str(q), "reduceOnly": "true"})
    hedge = wait_fill(FAPI + "/fapi/v1/order", "NBASIS fut close", hedge, symbol)
    filled_at = time.time()
    print(f"NBASIS fut close {q} {symbol}, order {hedge['orderId']} {hedge['status']}, "
          f"executed {hedge['executedQty']}")
    second_at = time.time()
    leg = place(SPOT + "/api/v3/order", "NBASIS spot sell",
                {"symbol": symbol, "side": "SELL", "type": "MARKET", "quantity": str(sell_qty)})
    leg = wait_fill(SPOT + "/api/v3/order", "NBASIS spot sell", leg, symbol)
    print(f"NBASIS spot sell {sell_qty} {symbol}, order {leg['orderId']} {leg['status']}, "
          f"executed {leg['executedQty']}")
    print(f"spot sell submitted {int((second_at - filled_at) * 1000)} ms after fut close fill confirmed, "
          f"close total {int((time.time() - t0) * 1000)} ms")
    return hedge, leg


def nbasis(argv):
    what = argv[2]
    symbol = argv[3]
    t0 = time.time()
    srules = spot_rules(symbol)
    base = srules["baseAsset"]
    sfilters = {x["filterType"]: x for x in srules["filters"]}
    sstep = Decimal(sfilters["LOT_SIZE"]["stepSize"])
    smarket = Decimal(sfilters["MARKET_LOT_SIZE"]["stepSize"])
    if smarket != 0:
        sstep = smarket
    before = spot_free()
    if what == "open":
        open_normal(symbol, base, sstep, Decimal(argv[4]), before, t0)
    else:
        close_normal(symbol, base, sstep, before, t0)
    settle(symbol, base, before)


def rbasis(argv):
    what = argv[2]
    symbol = argv[3]
    t0 = time.time()
    srules = spot_rules(symbol)
    base = srules["baseAsset"]
    sfilters = {x["filterType"]: x for x in srules["filters"]}
    sstep = Decimal(sfilters["LOT_SIZE"]["stepSize"])
    smarket = Decimal(sfilters["MARKET_LOT_SIZE"]["stepSize"])
    if smarket != 0:
        sstep = smarket
    if what == "open":
        amount = Decimal(argv[4])
        before = spot_free()
        if not next((a["isBorrowable"] for a in get(SPOT + "/sapi/v1/margin/allAssets", {})
                     if a["assetName"] == base), False):
            raise SystemExit(base + " is not borrowable")
        ffilters = {x["filterType"]: x for x in fut_rules(symbol)["filters"]}
        fstep = Decimal(ffilters["MARKET_LOT_SIZE"]["stepSize"])
        mprice = spot_price(symbol)
        fprice = fut_price(symbol)
        q = round_step(amount / max(mprice, fprice), max(sstep, fstep))
        margin = {a["asset"]: Decimal(a["free"])
                  for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]}
        for asset in (base, "USDT"):
            held = margin.get(asset, Decimal(0))
            if held > 0:
                raise SystemExit(f"margin already holds {held} {asset} that is not this trade's; "
                                 f"first: move margin spot {asset} {held}")
        lev = post(FAPI + "/fapi/v1/leverage", "set leverage", {"symbol": symbol, "leverage": "1"})
        print(f"LEVERAGE {lev['leverage']}x {symbol}")
        topup = post(SPOT + "/sapi/v1/asset/transfer", "fund margin",
                     {"type": "MAIN_MARGIN", "asset": "USDT", "amount": str(amount)})
        print(f"FUNDED margin {amount} USDT, id {topup['tranId']}")
        borrow_asset(base, str(q))
        leg = place(SPOT + "/sapi/v1/margin/order", "RBASIS margin sell",
                    {"symbol": symbol, "side": "SELL", "type": "MARKET",
                     "quantity": str(q), "isIsolated": "FALSE"})
        leg = wait_fill(SPOT + "/sapi/v1/margin/order", "RBASIS margin sell", leg, symbol)
        filled_at = time.time()
        print(f"RBASIS margin sell {q} {symbol}, order {leg['orderId']} {leg['status']}, "
              f"executed {leg['executedQty']}")
        hedge_at = time.time()
        hedge = place(FAPI + "/fapi/v1/order", "RBASIS fut long",
                      {"symbol": symbol, "side": "BUY", "type": "MARKET", "quantity": str(q)})
        hedge = wait_fill(FAPI + "/fapi/v1/order", "RBASIS fut long", hedge, symbol)
        print(f"RBASIS fut long {q} {symbol}, order {hedge['orderId']} {hedge['status']}, "
              f"executed {hedge['executedQty']}")
        print(f"hedge submitted {int((hedge_at - filled_at) * 1000)} ms after margin sell fill confirmed, "
              f"open total {int((time.time() - t0) * 1000)} ms")
        settle(symbol, base, before)
    else:
        before = spot_free()
        position = position_amt(symbol)
        if position > 0:
            hedge = place(FAPI + "/fapi/v1/order", "RBASIS fut close",
                          {"symbol": symbol, "side": "SELL", "type": "MARKET",
                           "quantity": str(position), "reduceOnly": "true"})
            hedge = wait_fill(FAPI + "/fapi/v1/order", "RBASIS fut close", hedge, symbol)
            print(f"RBASIS fut close {position} {symbol}, order {hedge['orderId']} {hedge['status']}, "
                  f"executed {hedge['executedQty']}")
        entry = next(a for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]
                     if a["asset"] == base)
        debt = Decimal(entry["borrowed"]) + Decimal(entry["interest"])
        if debt > 0:
            buyq = round_step(debt - Decimal(entry["free"]), sstep, ROUND_UP)
            if buyq > 0:
                leg = place(SPOT + "/sapi/v1/margin/order", "RBASIS margin buy",
                            {"symbol": symbol, "side": "BUY", "type": "MARKET",
                             "quantity": str(buyq), "isIsolated": "FALSE"})
                leg = wait_fill(SPOT + "/sapi/v1/margin/order", "RBASIS margin buy", leg, symbol)
                print(f"RBASIS margin buy {buyq} {symbol}, order {leg['orderId']} {leg['status']}, "
                      f"executed {leg['executedQty']}")
            entry = next(a for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]
                         if a["asset"] == base)
            debt = Decimal(entry["borrowed"]) + Decimal(entry["interest"])
            repay = post(SPOT + "/sapi/v1/margin/borrow-repay", "repay",
                         {"type": "REPAY", "asset": base, "amount": str(debt), "isIsolated": "FALSE"})
            print(f"REPAID {debt} {base} cross margin, id {repay['tranId']}")
        free = None
        for _ in range(10):  # margin balances settle with a delay after the buy and repay
            rows = {a["asset"]: a["free"] for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]}
            now = {asset: rows.get(asset, "0") for asset in (base, "USDT")}
            if now == free:
                break
            free = now
            time.sleep(1)
        locked = []
        for asset in (base, "USDT"):
            left = Decimal(free[asset])
            if left > 0:
                out = None
                for attempt in range(3):  # margin blocks transfer-out for minutes after trades
                    try:
                        started = time.time()
                        out = send(SPOT + "/sapi/v1/asset/transfer",
                                   {"type": "MARGIN_MAIN", "asset": asset, "amount": str(left)})
                        break
                    except urllib.error.HTTPError as error:
                        body = error.read().decode()
                        if '"code":-3020' not in body:
                            raise SystemExit("return collateral rejected: " + body)
                        if attempt < 2:
                            time.sleep(2)
                if out:
                    print(f"return collateral {int((time.time() - started) * 1000)} ms")
                    print(f"RETURNED {left} {asset} margin -> spot, id {out['tranId']}")
                else:
                    locked.append(f"{left} {asset}")
        print(f"close total {int((time.time() - t0) * 1000)} ms")
        settle(symbol, base, before)
        if locked:
            raise SystemExit("RBASIS close incomplete: " + " and ".join(locked)
                             + " still in margin, transfer-restricted by Binance; "
                             "rerun rbasis close later or return each with: move margin spot ASSET QTY")
