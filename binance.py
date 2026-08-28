import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import ROUND_DOWN, Decimal

import boto3

secret_id = open("/home/ssm-user/secret-id.txt").read().strip()
secret = json.loads(
    boto3.client("secretsmanager", region_name="ap-south-1")
    .get_secret_value(SecretId=secret_id)["SecretString"]
)
API_KEY = secret["BINANCE_API_KEY"]
API_SECRET = secret["BINANCE_API_SECRET"]
SPOT = "https://api.binance.com"
FAPI = "https://fapi.binance.com"
reads = 0


def sign(params):
    params["timestamp"] = int(time.time() * 1000)
    query = urllib.parse.urlencode(params)
    return query + "&signature=" + hmac.new(API_SECRET.encode(), query.encode(), hashlib.sha256).hexdigest()


def send(url, params, method="POST"):
    request = urllib.request.Request(
        url, data=sign(params).encode(), headers={"X-MBX-APIKEY": API_KEY}, method=method
    )
    return json.load(urllib.request.urlopen(request, timeout=10))


def post(url, action, params, method="POST"):
    started = time.time()
    try:
        result = send(url, params, method)
    except urllib.error.HTTPError as error:
        body = error.read().decode()
        if error.code == 409:  # cancel-replace partial success: the cancel happened, the new order failed
            raise SystemExit(action + " partially failed: " + body)
        if error.code >= 500:  # Binance defines these as unknown: it may still have executed
            raise SystemExit(f"{action} unclear (HTTP {error.code}): Binance may have executed it; "
                             f"verify with the matching list or status command: " + body)
        raise SystemExit(action + " rejected: " + body)
    print(f"{action} {int((time.time() - started) * 1000)} ms")
    return result


def place(url, action, params):
    params["newClientOrderId"] = cid = f"hand{int(time.time() * 1000)}"
    started = time.time()
    result = None
    try:
        result = send(url, params)
    except urllib.error.HTTPError as error:
        problem = error.read().decode()
        if error.code < 500 and '"code":-1007' not in problem:
            raise SystemExit(action + " rejected: " + problem)
    except OSError as error:  # connection lost or timed out; Binance may still hold the order
        problem = str(error)
    if result is None:
        for attempt in range(5):  # an accepted order can appear on Binance with a delay
            try:
                result = get(url, {"symbol": params["symbol"], "origClientOrderId": cid})
                break
            except urllib.error.HTTPError as query_error:
                not_found = query_error.read().decode()
                if attempt < 4:
                    time.sleep(1)
        if result is None:
            raise SystemExit(action + " unclear (" + problem + ") and not found on Binance "
                             "after 5 queries over 4 s, not resent: " + not_found)
        print(action, "was unclear; continuing from Binance order", result["orderId"], result["status"])
        return result
    print(f"{action} {int((time.time() - started) * 1000)} ms")
    return result


def get(url, params):
    global reads
    reads += 1
    request = urllib.request.Request(url + "?" + sign(params), headers={"X-MBX-APIKEY": API_KEY})
    return json.load(urllib.request.urlopen(request, timeout=10))


def public(url):
    global reads
    reads += 1
    try:
        return json.load(urllib.request.urlopen(url, timeout=10))
    except urllib.error.HTTPError as error:
        if error.code in (418, 429):
            raise SystemExit(f"Binance rate limit {error.code} after {reads} requests: " + error.read().decode())
        raise


def round_step(qty, step, rounding=ROUND_DOWN):
    return (qty / step).to_integral_value(rounding=rounding) * step


def wait_fill(url, action, order, symbol):
    deadline = time.time() + 10
    while order["status"] != "FILLED":
        if order["status"] not in ("NEW", "PARTIALLY_FILLED"):
            raise SystemExit(f"{action} order {order['orderId']} {order['status']}, "
                             f"executed {order['executedQty']} of {order['origQty']}")
        if time.time() > deadline:
            raise SystemExit(f"{action} order {order['orderId']} not filled after 10 s, still {order['status']}, "
                             f"executed {order['executedQty']} of {order['origQty']}, left resting on Binance")
        order = get(url, {"symbol": symbol, "orderId": order["orderId"]})
        if order["status"] != "FILLED":
            time.sleep(0.5)
    return order


def position_amt(symbol):
    return Decimal(
        get(FAPI + "/fapi/v2/positionRisk", {"symbol": symbol})[0]["positionAmt"]
    )


def spot_free():
    acct = get(SPOT + "/api/v3/account", {"omitZeroBalances": "true"})
    return {b["asset"]: Decimal(b["free"]) for b in acct["balances"]}


def spot_rules(symbol):
    return json.load(urllib.request.urlopen(SPOT + "/api/v3/exchangeInfo?symbol=" + symbol))["symbols"][0]


def fut_rules(symbol):
    return next(s for s in json.load(urllib.request.urlopen(FAPI + "/fapi/v1/exchangeInfo"))["symbols"]
                if s["symbol"] == symbol)


def spot_price(symbol):
    return Decimal(json.load(urllib.request.urlopen(
        SPOT + "/api/v3/ticker/price?symbol=" + symbol))["price"])


def fut_price(symbol):
    return Decimal(json.load(urllib.request.urlopen(
        FAPI + "/fapi/v1/ticker/price?symbol=" + symbol))["price"])


def borrow_asset(asset, qty):
    for _ in range(10):  # transferred collateral is counted with a short delay
        if Decimal(get(SPOT + "/sapi/v1/margin/maxBorrowable", {"asset": asset})["amount"]) >= Decimal(qty):
            break
        time.sleep(1)
    result = post(SPOT + "/sapi/v1/margin/borrow-repay", "borrow",
                  {"type": "BORROW", "asset": asset, "amount": qty, "isIsolated": "FALSE"})
    print(f"BORROWED {qty} {asset} cross margin, id {result['tranId']}")


def state():
    print("SPOT")
    for b in get(SPOT + "/api/v3/account", {"omitZeroBalances": "true"})["balances"]:
        print(f"  {b['asset']} free {b['free']} locked {b['locked']}")
    print("FUTURES")
    for b in get(FAPI + "/fapi/v2/balance", {}):
        if Decimal(b["balance"]) != 0:
            print(f"  {b['asset']} balance {b['balance']} available {b['availableBalance']}")
    for p in get(FAPI + "/fapi/v2/positionRisk", {}):
        if Decimal(p["positionAmt"]) != 0:
            print(f"  position {p['symbol']} amt {p['positionAmt']} entry {p['entryPrice']} "
                  f"leverage {p['leverage']} uPnL {p['unRealizedProfit']}")
    print("MARGIN")
    for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]:
        if Decimal(a["netAsset"]) != 0 or Decimal(a["borrowed"]) != 0:
            print(f"  {a['asset']} free {a['free']} borrowed {a['borrowed']} "
                  f"interest {a['interest']} net {a['netAsset']}")


def orders():
    for label, url in (("SPOT", SPOT + "/api/v3/openOrders"),
                       ("FUT", FAPI + "/fapi/v1/openOrders"),
                       ("MARGIN", SPOT + "/sapi/v1/margin/openOrders")):
        rows = get(url, {})
        print(label, "open orders", len(rows))
        for o in rows:
            print(f"  {o['symbol']} {o['side']} {o['type']} id {o['orderId']} price {o['price']} "
                  f"qty {o['origQty']} filled {o['executedQty']} {o['status']}")


def spot(argv):
    side = argv[2]
    if side == "oco":  # spot's OCO pair rides under the spot command
        return oco(argv[1:])
    symbol = argv[3]
    if side == "cancel":
        result = post(SPOT + "/api/v3/order", "SPOT cancel",
                      {"symbol": symbol, "orderId": argv[4]}, "DELETE")
        print(f"SPOT canceled {symbol} order {result['orderId']}, status {result['status']}")
    elif side == "cancelall":
        results = post(SPOT + "/api/v3/openOrders", "SPOT cancel all", {"symbol": symbol}, "DELETE")
        for r in results:
            print(f"SPOT canceled {symbol} order {r['orderId']}, status {r['status']}")
    elif side == "status":
        o = get(SPOT + "/api/v3/order", {"symbol": symbol, "orderId": argv[4]})
        print(f"SPOT {o['symbol']} {o['side']} {o['type']} id {o['orderId']} price {o['price']} "
              f"qty {o['origQty']} filled {o['executedQty']} {o['status']}")
    else:
        amount = Decimal(argv[4])
        if len(argv) > 5:
            price = Decimal(argv[5])
            filters = {f["filterType"]: f for f in spot_rules(symbol)["filters"]}
            step = Decimal(filters["LOT_SIZE"]["stepSize"])
            qty = round_step(amount / price, step)
            params = {"symbol": symbol, "side": side, "type": "LIMIT", "timeInForce": "GTC",
                      "quantity": str(qty), "price": str(price)}
            if len(argv) > 6:
                mode = argv[6]
                if mode == "maker":
                    del params["timeInForce"]
                    params["type"] = "LIMIT_MAKER"
                    params["newOrderRespType"] = "FULL"  # LIMIT_MAKER defaults to the slim ACK reply
                elif mode in ("ioc", "fok"):
                    params["timeInForce"] = mode.upper()
                elif mode == "ice":
                    params["icebergQty"] = str(round_step(Decimal(argv[7]) / price, step))
                else:
                    raise SystemExit("spot mode must be maker, ioc, fok, or ice USDT")
        else:
            params = {"symbol": symbol, "side": side, "type": "MARKET", "quoteOrderQty": str(amount)}
        order = place(SPOT + "/api/v3/order", "SPOT " + side, params)
        print(f"SPOT {side} {symbol} order {order['orderId']} {order['status']}, "
              f"executed {order['executedQty']}, quote {order['cummulativeQuoteQty']}")


def fut(argv):
    side = argv[2]
    symbol = argv[3]
    if side == "cancel":
        result = post(FAPI + "/fapi/v1/order", "FUT cancel",
                      {"symbol": symbol, "orderId": argv[4]}, "DELETE")
        print(f"FUT canceled {symbol} order {result['orderId']}, status {result['status']}")
    elif side == "cancelall":
        result = post(FAPI + "/fapi/v1/allOpenOrders", "FUT cancel all", {"symbol": symbol}, "DELETE")
        print(f"FUT canceled all {symbol} open orders: {result['msg']}")
    elif side == "status":
        o = get(FAPI + "/fapi/v1/order", {"symbol": symbol, "orderId": argv[4]})
        print(f"FUT {o['symbol']} {o['side']} {o['type']} id {o['orderId']} price {o['price']} "
              f"qty {o['origQty']} filled {o['executedQty']} avg {o['avgPrice']} {o['status']}")
    elif side == "countdown":  # dead-man switch: cancels the symbol's orders unless refreshed
        result = post(FAPI + "/fapi/v1/countdownCancelAll", "FUT countdown",
                      {"symbol": symbol, "countdownTime": int(Decimal(argv[4]) * 1000)})
        print(f"FUT countdown {symbol} set to {result['countdownTime']} ms (0 disables)")
    elif side == "margintype":
        result = post(FAPI + "/fapi/v1/marginType", "FUT margin type",
                      {"symbol": symbol, "marginType": argv[4].upper()})
        print(f"FUT {symbol} margin type set {argv[4].upper()}: {result['msg']}")
    elif side == "close":
        position = position_amt(symbol)
        if position == 0:
            print(f"FUT {symbol} no position")
        else:
            label = "LONG" if position > 0 else "SHORT"
            close_side = "SELL" if position > 0 else "BUY"
            qty = abs(position)
            if len(argv) > 4:  # close only this many USDT of the position
                ffilters = {x["filterType"]: x for x in next(
                    s for s in json.load(urllib.request.urlopen(FAPI + "/fapi/v1/exchangeInfo"))["symbols"]
                    if s["symbol"] == symbol)["filters"]}
                step = Decimal(ffilters["MARKET_LOT_SIZE"]["stepSize"])
                if step == 0:
                    step = Decimal(ffilters["LOT_SIZE"]["stepSize"])
                mark = Decimal(json.load(urllib.request.urlopen(
                    FAPI + "/fapi/v1/ticker/price?symbol=" + symbol))["price"])
                qty = min(qty, round_step(Decimal(argv[4]) / mark, step))
            order = place(FAPI + "/fapi/v1/order", "FUT close",
                          {"symbol": symbol, "side": close_side, "type": "MARKET",
                           "quantity": str(qty), "reduceOnly": "true"})
            order = wait_fill(FAPI + "/fapi/v1/order", "FUT close", order, symbol)
            print(f"FUT closed {order['executedQty']} of {label} {abs(position)} {symbol}, "
                  f"position now {position_amt(symbol):f}")
    else:
        amount = Decimal(argv[4])
        frules = next(
            s for s in json.load(urllib.request.urlopen(FAPI + "/fapi/v1/exchangeInfo"))["symbols"]
            if s["symbol"] == symbol
        )
        ffilters = {f["filterType"]: f for f in frules["filters"]}
        if len(argv) > 5:
            price = Decimal(argv[5])
            qty = round_step(amount / price, Decimal(ffilters["LOT_SIZE"]["stepSize"]))
            params = {"symbol": symbol, "side": side, "type": "LIMIT", "timeInForce": "GTC",
                      "quantity": str(qty), "price": str(price)}
        else:
            market_step = Decimal(ffilters["MARKET_LOT_SIZE"]["stepSize"])
            step = market_step if market_step != 0 else Decimal(ffilters["LOT_SIZE"]["stepSize"])
            price = Decimal(json.load(urllib.request.urlopen(
                FAPI + "/fapi/v1/ticker/price?symbol=" + symbol))["price"])
            qty = round_step(amount / price, step)
            params = {"symbol": symbol, "side": side, "type": "MARKET", "quantity": str(qty)}
        order = place(FAPI + "/fapi/v1/order", "FUT " + side, params)
        print(f"FUT {side} {symbol} qty {qty} order {order['orderId']} {order['status']}")


def lev(argv):
    symbol = argv[2]
    if len(argv) > 3:
        lev = post(FAPI + "/fapi/v1/leverage", "set leverage",
                   {"symbol": symbol, "leverage": argv[3]})
        print(f"LEVERAGE set {lev['leverage']}x {symbol}, max notional {lev['maxNotionalValue']}")
    else:
        print(f"LEVERAGE {get(FAPI + '/fapi/v2/positionRisk', {'symbol': symbol})[0]['leverage']}x {symbol}")


def check(argv):
    symbol = argv[2]
    base = None
    try:
        s = json.load(urllib.request.urlopen(SPOT + "/api/v3/exchangeInfo?symbol=" + symbol))["symbols"][0]
        base = s["baseAsset"]
        f = {x["filterType"]: x for x in s["filters"]}
        market_step = f["MARKET_LOT_SIZE"]["stepSize"]
        if Decimal(market_step) == 0:
            market_step = f["LOT_SIZE"]["stepSize"]
        print(f"SPOT {s['status']}, limit step {f['LOT_SIZE']['stepSize']} min {f['LOT_SIZE']['minQty']}, "
              f"market step {market_step}, minNotional {f['NOTIONAL']['minNotional']} "
              f"(applies to market: {f['NOTIONAL']['applyMinToMarket']}), tick {f['PRICE_FILTER']['tickSize']}")
    except urllib.error.HTTPError:
        print("SPOT not listed")
    try:
        s = next(x for x in json.load(urllib.request.urlopen(FAPI + "/fapi/v1/exchangeInfo"))["symbols"]
                 if x["symbol"] == symbol)
        base = base or s["baseAsset"]
        f = {x["filterType"]: x for x in s["filters"]}
        print(f"FUTURES {s['status']}, limit step {f['LOT_SIZE']['stepSize']} min {f['LOT_SIZE']['minQty']}, "
              f"market step {f['MARKET_LOT_SIZE']['stepSize']} min {f['MARKET_LOT_SIZE']['minQty']}, "
              f"minNotional {f['MIN_NOTIONAL']['notional']}, tick {f['PRICE_FILTER']['tickSize']}, "
              f"leverage {get(FAPI + '/fapi/v2/positionRisk', {'symbol': symbol})[0]['leverage']}x")
    except StopIteration:
        print("FUTURES not listed")
    pair = any(p["symbol"] == symbol for p in get(SPOT + "/sapi/v1/margin/allPairs", {}))
    print("MARGIN cross pair", "available" if pair else "not available")
    borrowable = next((a["isBorrowable"] for a in get(SPOT + "/sapi/v1/margin/allAssets", {})
                       if a["assetName"] == base), False)
    print(base, "borrowable", borrowable)
    if borrowable:
        print(base, "maxBorrowable", get(SPOT + "/sapi/v1/margin/maxBorrowable", {"asset": base})["amount"],
              "hourly interest", get(SPOT + "/sapi/v1/margin/next-hourly-interest-rate",
                                     {"assets": base, "isIsolated": "FALSE"})[0]["nextHourlyInterestRate"])


def margin(argv):
    side = argv[2]
    symbol = argv[3]
    if side == "cancel":
        result = post(SPOT + "/sapi/v1/margin/order", "MARGIN cancel",
                      {"symbol": symbol, "orderId": argv[4], "isIsolated": "FALSE"}, "DELETE")
        print(f"MARGIN canceled {symbol} order {result['orderId']}, status {result['status']}")
    elif side == "cancelall":
        results = post(SPOT + "/sapi/v1/margin/openOrders", "MARGIN cancel all",
                       {"symbol": symbol, "isIsolated": "FALSE"}, "DELETE")
        for r in results:
            print(f"MARGIN canceled {symbol} order {r['orderId']}, status {r['status']}")
    elif side == "status":
        o = get(SPOT + "/sapi/v1/margin/order",
                {"symbol": symbol, "orderId": argv[4], "isIsolated": "FALSE"})
        print(f"MARGIN {o['symbol']} {o['side']} {o['type']} id {o['orderId']} price {o['price']} "
              f"qty {o['origQty']} filled {o['executedQty']} {o['status']}")
    else:
        qty = Decimal(argv[4])
        f = {x["filterType"]: x for x in json.load(urllib.request.urlopen(
            SPOT + "/api/v3/exchangeInfo?symbol=" + symbol))["symbols"][0]["filters"]}
        if len(argv) > 5:
            price = Decimal(argv[5])
            qty = round_step(qty, Decimal(f["LOT_SIZE"]["stepSize"]))
            params = {"symbol": symbol, "side": side, "type": "LIMIT", "timeInForce": "GTC",
                      "quantity": str(qty), "price": str(price), "isIsolated": "FALSE"}
        else:
            step = Decimal(f["MARKET_LOT_SIZE"]["stepSize"])
            step = step if step != 0 else Decimal(f["LOT_SIZE"]["stepSize"])
            qty = round_step(qty, step)
            params = {"symbol": symbol, "side": side, "type": "MARKET",
                      "quantity": str(qty), "isIsolated": "FALSE"}
        order = place(SPOT + "/sapi/v1/margin/order", "MARGIN " + side, params)
        print(f"MARGIN {side} {symbol} qty {qty} order {order['orderId']} {order['status']}, "
              f"executed {order['executedQty']}, quote {order['cummulativeQuoteQty']}")


def move(argv):
    src, dst, asset, qty = argv[2], argv[3], argv[4], argv[5]
    wallet = {"spot": "MAIN", "fut": "UMFUTURE", "margin": "MARGIN", "funding": "FUNDING"}
    result = post(SPOT + "/sapi/v1/asset/transfer", "move " + src + " to " + dst,
                  {"type": wallet[src] + "_" + wallet[dst], "asset": asset, "amount": qty})
    print(f"MOVED {qty} {asset} {src} -> {dst}, id {result['tranId']}")


def loan(argv):
    what = argv[2]
    if what == "list":
        for o in get(SPOT + "/sapi/v2/loan/flexible/ongoing/orders", {})["rows"]:
            print(f"LOAN {o['totalDebt']} {o['loanCoin']} against {o['collateralAmount']} "
                  f"{o['collateralCoin']}, LTV {o['currentLTV']}")
        return
    coin = argv[3]
    qty = argv[4]
    collateral = argv[5]
    if what == "borrow":
        r = post(SPOT + "/sapi/v2/loan/flexible/borrow", "LOAN borrow",
                 {"loanCoin": coin, "loanAmount": qty,
                  "collateralCoin": collateral, "collateralAmount": argv[6]})
        print(f"LOAN borrowed {r['loanAmount']} {r['loanCoin']} against {r['collateralAmount']} "
              f"{r['collateralCoin']}, status {r['status']}")
    elif what == "repay":
        params = {"loanCoin": coin, "collateralCoin": collateral}
        if qty == "all":
            debt = next(o["totalDebt"] for o in get(SPOT + "/sapi/v2/loan/flexible/ongoing/orders", {})["rows"]
                        if o["loanCoin"] == coin and o["collateralCoin"] == collateral)
            params.update(repayAmount=debt, fullRepayment="TRUE")
        else:
            params["repayAmount"] = qty
        r = post(SPOT + "/sapi/v2/loan/flexible/repay", "LOAN repay", params)
        print(f"LOAN repaid {coin}, remaining debt {r['remainingDebt']}, "
              f"remaining collateral {r['remainingCollateral']} {collateral}, "
              f"status {r['repayStatus']}")
    else:
        raise SystemExit("loan action must be list, borrow COIN QTY COLLATERAL CQTY, "
                         "or repay COIN QTY|all COLLATERAL")


def algo(argv):
    what = argv[2]
    if what == "list":
        rows = get(FAPI + "/fapi/v1/openAlgoOrders", {})
        print("ALGO open orders", len(rows))
        for o in rows:
            print(f"  {o['symbol']} {o['side']} {o['orderType']} algo {o['algoId']} "
                  f"trigger {o['triggerPrice']} qty {o['quantity']} closePosition {o['closePosition']} "
                  f"{o['algoStatus']}")
    elif what == "cancel":
        result = post(FAPI + "/fapi/v1/algoOrder", "ALGO cancel", {"algoId": argv[3]}, "DELETE")
        print(f"ALGO canceled algo {result['algoId']}, {result['msg']}")
    elif what in ("stop", "take"):
        symbol = argv[3]
        position = position_amt(symbol)
        if position == 0:
            raise SystemExit(f"ALGO {symbol} no position, side unknown")
        result = post(FAPI + "/fapi/v1/algoOrder", "ALGO " + what,
                      {"algoType": "CONDITIONAL", "symbol": symbol,
                       "side": "SELL" if position > 0 else "BUY",
                       "type": "STOP_MARKET" if what == "stop" else "TAKE_PROFIT_MARKET",
                       "triggerPrice": argv[4], "closePosition": "true"})
        print(f"ALGO {what} {symbol} {result['side']} {result['orderType']} algo {result['algoId']} "
              f"trigger {result['triggerPrice']} closePosition {result['closePosition']} {result['algoStatus']}")
    else:
        raise SystemExit("algo action must be stop SYMBOL LEVEL, take SYMBOL LEVEL, "
                         "list, or cancel ALGOID")


def amend(argv):
    where = argv[2]
    symbol = argv[3]
    order_id = argv[4]
    price = argv[5]
    if where == "spot":
        old = get(SPOT + "/api/v3/order", {"symbol": symbol, "orderId": order_id})
        params = {"symbol": symbol, "cancelOrderId": order_id,
                  "cancelReplaceMode": "STOP_ON_FAILURE", "side": old["side"],
                  "type": old["type"],
                  "quantity": str(Decimal(old["origQty"]) - Decimal(old["executedQty"])),
                  "price": price}
        if old["type"] == "LIMIT_MAKER":
            params["newOrderRespType"] = "FULL"  # LIMIT_MAKER defaults to the slim ACK reply
        else:
            params["timeInForce"] = old["timeInForce"]
        if Decimal(old["icebergQty"]) != 0:
            params["icebergQty"] = old["icebergQty"]
        result = post(SPOT + "/api/v3/order/cancelReplace", "SPOT amend", params)
        new = result["newOrderResponse"]
        print(f"SPOT amended {symbol} {old['side']} {old['price']} -> {new['price']}, "
              f"order {old['orderId']} -> {new['orderId']}, {new['status']}")
    elif where == "fut":
        old = get(FAPI + "/fapi/v1/order", {"symbol": symbol, "orderId": order_id})
        new = post(FAPI + "/fapi/v1/order", "FUT amend",
                   {"symbol": symbol, "orderId": order_id, "side": old["side"],
                    "quantity": old["origQty"], "price": price}, "PUT")
        print(f"FUT amended {symbol} {old['side']} {old['price']} -> {new['price']}, "
              f"order {new['orderId']}, {new['status']}")
    else:
        raise SystemExit("amend must be spot|fut SYMBOL ORDERID PRICE")


def oco(argv):
    what = argv[2]
    if what == "list":
        lists = get(SPOT + "/api/v3/openOrderList", {})
        print("OCO open lists", len(lists))
        for l in lists:
            print(f"  {l['symbol']} list {l['orderListId']} {l['listOrderStatus']}")
            for entry in l["orders"]:
                o = get(SPOT + "/api/v3/order", {"symbol": l["symbol"], "orderId": entry["orderId"]})
                print(f"    {o['side']} {o['type']} id {o['orderId']} price {o['price']} "
                      f"stop {o.get('stopPrice', '-')} qty {o['origQty']} {o['status']}")
    elif what == "cancel":
        result = post(SPOT + "/api/v3/orderList", "OCO cancel",
                      {"symbol": argv[3], "orderListId": argv[4]}, "DELETE")
        print(f"OCO canceled {argv[3]} list {result['orderListId']}, status {result['listOrderStatus']}")
        for r in result["orderReports"]:
            print(f"  {r['side']} {r['type']} id {r['orderId']} {r['status']}")
    elif what == "sell":
        symbol = argv[3]
        f = {x["filterType"]: x for x in spot_rules(symbol)["filters"]}
        qty = round_step(Decimal(argv[4]), Decimal(f["LOT_SIZE"]["stepSize"]))
        result = post(SPOT + "/api/v3/orderList/oco", "OCO sell",
                      {"symbol": symbol, "side": "SELL", "quantity": str(qty),
                       "aboveType": "LIMIT_MAKER", "abovePrice": argv[5],
                       "belowType": "STOP_LOSS_LIMIT", "belowStopPrice": argv[6],
                       "belowPrice": argv[7], "belowTimeInForce": "GTC"})
        print(f"OCO sell {symbol} qty {qty} list {result['orderListId']} {result['listOrderStatus']}")
        for r in result["orderReports"]:
            print(f"  {r['side']} {r['type']} id {r['orderId']} price {r['price']} "
                  f"stop {r.get('stopPrice', '-')} {r['status']}")
    else:
        raise SystemExit("oco action must be sell SYMBOL QTY TP_PRICE STOP_PRICE STOP_LIMIT_PRICE, "
                         "list, or cancel SYMBOL ORDERLISTID")


def flat(argv):
    scope = {"symbol": argv[2]} if len(argv) > 2 else {}
    spot_orders = get(SPOT + "/api/v3/openOrders", dict(scope))
    fut_orders = get(FAPI + "/fapi/v1/openOrders", dict(scope))
    margin_orders = get(SPOT + "/sapi/v1/margin/openOrders", dict(scope))
    algo_orders = get(FAPI + "/fapi/v1/openAlgoOrders", dict(scope))
    positions = [p for p in get(FAPI + "/fapi/v2/positionRisk", dict(scope))
                 if Decimal(p["positionAmt"]) != 0]
    print(f"FLAT {argv[2] if len(argv) > 2 else 'whole account'}: sweeping {len(spot_orders)} spot, "
          f"{len(fut_orders)} fut, {len(margin_orders)} margin, {len(algo_orders)} algo orders "
          f"and {len(positions)} positions "
          f"({', '.join(sorted({p['symbol'] for p in positions})) or 'none'})", flush=True)
    for symbol in sorted({o["symbol"] for o in spot_orders}):
        for r in post(SPOT + "/api/v3/openOrders", "FLAT spot cancel all", {"symbol": symbol}, "DELETE"):
            if "listOrderStatus" in r:  # an order list (OCO) swept as a unit
                print(f"  spot canceled {symbol} list {r['orderListId']}, status {r['listOrderStatus']}")
                for o in r["orderReports"]:
                    print(f"    {o['side']} {o['type']} id {o['orderId']} {o['status']}")
            else:
                print(f"  spot canceled {symbol} order {r['orderId']}, status {r['status']}")
    for symbol in sorted({o["symbol"] for o in fut_orders}):
        result = post(FAPI + "/fapi/v1/allOpenOrders", "FLAT fut cancel all", {"symbol": symbol}, "DELETE")
        print(f"  fut canceled all {symbol}: {result['msg']}")
    for symbol in sorted({o["symbol"] for o in margin_orders}):
        for r in post(SPOT + "/sapi/v1/margin/openOrders", "FLAT margin cancel all",
                      {"symbol": symbol, "isIsolated": "FALSE"}, "DELETE"):
            if "listOrderStatus" in r:  # an order list (OCO) swept as a unit
                print(f"  margin canceled {symbol} list {r['orderListId']}, status {r['listOrderStatus']}")
                for o in r["orderReports"]:
                    print(f"    {o['side']} {o['type']} id {o['orderId']} {o['status']}")
            else:
                print(f"  margin canceled {symbol} order {r['orderId']}, status {r['status']}")
    for o in algo_orders:
        result = post(FAPI + "/fapi/v1/algoOrder", "FLAT algo cancel", {"algoId": o["algoId"]}, "DELETE")
        print(f"  algo canceled {result['algoId']}, {result['msg']}")
    for p in positions:
        amt = Decimal(p["positionAmt"])
        close = place(FAPI + "/fapi/v1/order", "FLAT fut close " + p["symbol"],
                      {"symbol": p["symbol"], "side": "SELL" if amt > 0 else "BUY", "type": "MARKET",
                       "quantity": str(abs(amt)), "reduceOnly": "true"})
        close = wait_fill(FAPI + "/fapi/v1/order", "FLAT fut close " + p["symbol"], close, p["symbol"])
        print(f"  closed {p['symbol']} {amt:+f}, executed {close['executedQty']} at avg {close['avgPrice']}")
    left = [p for p in get(FAPI + "/fapi/v2/positionRisk", dict(scope)) if Decimal(p["positionAmt"]) != 0]
    print(f"FLAT done: spot orders {len(get(SPOT + '/api/v3/openOrders', dict(scope)))}, "
          f"fut orders {len(get(FAPI + '/fapi/v1/openOrders', dict(scope)))}, "
          f"margin orders {len(get(SPOT + '/sapi/v1/margin/openOrders', dict(scope)))}, "
          f"algo orders {len(get(FAPI + '/fapi/v1/openAlgoOrders', dict(scope)))}, positions {len(left)}")


def convert(argv):
    if argv[2] == "dust":
        r = post(SPOT + "/sapi/v1/asset/dust", "CONVERT dust", {"asset": argv[3]})
        for t in r["transferResult"]:
            print(f"CONVERT dust {t['fromAsset']} {t['amount']} -> {t['transferedAmount']} BNB, "
                  f"fee {t['serviceChargeAmount']}")
        print(f"CONVERT dust total {r['totalTransfered']} BNB, fee {r['totalServiceCharge']}")
        return
    from_asset, to_asset, amount = argv[2], argv[3], argv[4]
    quote = post(SPOT + "/sapi/v1/convert/getQuote", "CONVERT quote",
                 {"fromAsset": from_asset, "toAsset": to_asset, "fromAmount": amount})
    print(f"CONVERT quote {amount} {from_asset} -> {quote['toAmount']} {to_asset} "
          f"at {quote['ratio']}, valid {quote['validTimestamp']}")
    result = post(SPOT + "/sapi/v1/convert/acceptQuote", "CONVERT accept",
                  {"quoteId": quote["quoteId"]})
    deadline = time.time() + 10
    while result["orderStatus"] == "PROCESS" and time.time() < deadline:
        time.sleep(1)
        result = get(SPOT + "/sapi/v1/convert/orderStatus", {"orderId": result["orderId"]})
    if result["orderStatus"] != "SUCCESS":
        raise SystemExit(f"CONVERT order {result['orderId']} ended {result['orderStatus']}; "
                         f"verify with the Binance convert history")
    print(f"CONVERT done, order {result['orderId']}: {result['fromAmount']} {from_asset} -> "
          f"{result['toAmount']} {to_asset}")


def fees(argv):
    if argv[2] == "burn":
        if argv[3] not in ("on", "off"):
            raise SystemExit("fees burn takes exactly on or off")
        r = post(SPOT + "/sapi/v1/bnbBurn", "FEES burn",
                 {"spotBNBBurn": "true" if argv[3] == "on" else "false"})
        print(f"FEES spot BNB burn {'on' if r['spotBNBBurn'] else 'off'}")
        return
    symbol = argv[2]
    s = get(SPOT + "/sapi/v1/asset/tradeFee", {"symbol": symbol})[0]
    f = get(FAPI + "/fapi/v1/commissionRate", {"symbol": symbol})
    burn = get(SPOT + "/sapi/v1/bnbBurn", {})
    print(f"FEES {symbol}: spot maker {s['makerCommission']} taker {s['takerCommission']}, "
          f"fut maker {f['makerCommissionRate']} taker {f['takerCommissionRate']}, "
          f"spot BNB burn {'on' if burn['spotBNBBurn'] else 'off'}")


def ramp(argv):
    what = argv[2]
    if what == "address":
        params = {"coin": argv[3]}
        if len(argv) > 4:
            params["network"] = argv[4]
        r = get(SPOT + "/sapi/v1/capital/deposit/address", params)
        print(f"RAMP deposit {r['coin']} on {params.get('network', 'default network')}: {r['address']}"
              + (f" tag {r['tag']}" if r.get("tag") else ""))
    elif what == "networks":
        coin = next(c for c in get(SPOT + "/sapi/v1/capital/config/getall", {}) if c["coin"] == argv[3])
        for n in coin["networkList"]:
            print(f"RAMP {coin['coin']} {n['network']}: deposit {'on' if n['depositEnable'] else 'off'}, "
                  f"withdraw {'on' if n['withdrawEnable'] else 'off'}, "
                  f"fee {n['withdrawFee']}, min {n['withdrawMin']}")
    elif what == "history":
        for d in get(SPOT + "/sapi/v1/capital/deposit/hisrec", {}):
            print(f"RAMP in  {d['amount']} {d['coin']} {d.get('network', '')} "
                  f"{'done' if d['status'] == 1 else 'status ' + str(d['status'])} tx {d['txId']}")
        for w in get(SPOT + "/sapi/v1/capital/withdraw/history", {}):
            print(f"RAMP out {w['amount']} {w['coin']} {w.get('network', '')} "
                  f"{'done' if w['status'] == 6 else 'status ' + str(w['status'])} tx {w.get('txId', '')}")
    else:
        raise SystemExit("ramp is address ASSET [NETWORK], networks ASSET, or history; "
                         "no withdraw command exists by design")


def fmode(argv):
    if len(argv) > 2 and argv[2] == "multi":
        if argv[3] not in ("on", "off"):
            raise SystemExit("fmode multi takes exactly on or off")
        r = post(FAPI + "/fapi/v1/multiAssetsMargin", "FMODE multi",
                 {"multiAssetsMargin": "true" if argv[3] == "on" else "false"})
        print(f"FMODE multi-asset margin: {r['msg']}")
        return
    if len(argv) > 2 and argv[2] == "brackets":
        for b in get(FAPI + "/fapi/v1/leverageBracket", {"symbol": argv[3]})[0]["brackets"]:
            print(f"FMODE bracket {b['bracket']}: up to {b['notionalCap']} USDT, "
                  f"max leverage {b['initialLeverage']}x, maint {b['maintMarginRatio']}")
        return
    dual = get(FAPI + "/fapi/v1/positionSide/dual", {})
    multi = get(FAPI + "/fapi/v1/multiAssetsMargin", {})
    print(f"FMODE position mode {'hedge' if dual['dualSidePosition'] else 'one-way'}, "
          f"multi-asset margin {'on' if multi['multiAssetsMargin'] else 'off'}")


def guard(argv):
    symbol = argv[2]
    f = {x["filterType"]: x for x in spot_rules(symbol)["filters"]}
    qty = round_step(Decimal(argv[3]), Decimal(f["LOT_SIZE"]["stepSize"]))
    what = argv[4]
    if what not in ("stop", "take"):
        raise SystemExit("guard is stop|take: guard SYMBOL QTY stop|take STOPPRICE LIMITPRICE")
    order = place(SPOT + "/api/v3/order", "GUARD " + what,
                  {"symbol": symbol, "side": "SELL",
                   "type": "STOP_LOSS_LIMIT" if what == "stop" else "TAKE_PROFIT_LIMIT",
                   "timeInForce": "GTC", "quantity": str(qty), "stopPrice": argv[5],
                   "price": argv[6], "newOrderRespType": "FULL"})  # conditional types default to ACK
    print(f"GUARD {what} {symbol} qty {qty} order {order['orderId']} {order['status']}, "
          f"trigger {argv[5]}, limit {argv[6]}")


def income(argv):
    words = argv[2:]
    days = int(words.pop()) if words and words[-1].isdigit() else 7
    params = {"startTime": int((time.time() - days * 86400) * 1000), "limit": 1000, "page": 1}
    if words:
        params["symbol"] = words[0]
    kinds = {}
    symbols = {}
    nets = {}
    while True:
        rows = get(FAPI + "/fapi/v1/income", dict(params))
        for r in rows:
            amount = Decimal(r["income"])
            asset = r["asset"]
            kinds[(r["incomeType"], asset)] = kinds.get((r["incomeType"], asset), Decimal(0)) + amount
            symbols[(r["symbol"] or "-", asset)] = symbols.get((r["symbol"] or "-", asset), Decimal(0)) + amount
            nets[asset] = nets.get(asset, Decimal(0)) + amount
        if len(rows) < 1000:
            break
        params["page"] += 1
    print(f"INCOME {params.get('symbol', 'all symbols')} last {days} days")
    for (kind, asset), total in sorted(kinds.items()):
        print(f"  {kind} {total:+f} {asset}")
    if "symbol" not in params:
        for (sym, asset), total in sorted(symbols.items(), key=lambda x: x[1]):
            print(f"  {sym} {total:+f} {asset}")
    for asset, total in sorted(nets.items()):
        print(f"  net {total:+f} {asset}")


def past(argv):
    symbol = argv[2]
    n = int(argv[3]) if len(argv) > 3 else 10
    rows = []
    for venue, orders_url, trades_url in (
            ("spot", SPOT + "/api/v3/allOrders", SPOT + "/api/v3/myTrades"),
            ("fut", FAPI + "/fapi/v1/allOrders", FAPI + "/fapi/v1/userTrades")):
        fills = {}
        for t in get(trades_url, {"symbol": symbol, "limit": 1000}):
            fills.setdefault(t["orderId"], []).append(t)
        for o in get(orders_url, {"symbol": symbol, "limit": n * 3}):
            if o["status"] in ("NEW", "PARTIALLY_FILLED"):
                continue
            executed = Decimal(o["executedQty"])
            quote = Decimal(o.get("cummulativeQuoteQty") or o.get("cumQuote") or 0)
            avg = quote / executed if executed else Decimal(0)
            rows.append((o["updateTime"], venue, o, avg, fills.get(o["orderId"], [])))
    for when, venue, o, avg, mine in sorted(rows, key=lambda r: r[0])[-n:]:
        print(f"{time.strftime('%H:%M:%S', time.localtime(when / 1000))} {venue} {o['side']} "
              f"{o['type']} qty {o['origQty']} avg {avg:f} {o['status']}")
        for t in mine:
            print(f"  fill {t['qty']} at {t['price']}, fee {t['commission']} {t['commissionAsset']}")


def earn(argv):
    what = argv[2]
    if what == "list":
        for p in get(SPOT + "/sapi/v1/simple-earn/flexible/position", {"size": 100}).get("rows", []):
            print(f"EARN flexible {p['asset']} {p['totalAmount']}, product {p['productId']}, "
                  f"apr {p.get('latestAnnualPercentageRate', '?')}, redeeming {p.get('redeemingAmount', '0')}")
        return
    asset = argv[3]
    qty = argv[4]
    rows = get(SPOT + "/sapi/v1/simple-earn/flexible/list", {"asset": asset, "size": 100})["rows"]
    if not rows:
        raise SystemExit("no flexible product for " + asset)
    product = rows[0]["productId"]
    if what == "add":
        r = post(SPOT + "/sapi/v1/simple-earn/flexible/subscribe", "EARN add",
                 {"productId": product, "amount": qty, "autoSubscribe": "false"})
        print(f"EARN added {qty} {asset} flexible, purchase {r['purchaseId']}, success {r['success']}")
    elif what == "out":
        params = {"productId": product}
        if qty == "all":
            params["redeemAll"] = "true"
        else:
            params["amount"] = qty
        r = post(SPOT + "/sapi/v1/simple-earn/flexible/redeem", "EARN out", params)
        print(f"EARN redeemed {qty} {asset} flexible, redeem {r['redeemId']}, success {r['success']}")
    else:
        raise SystemExit("earn action must be list, add ASSET QTY, or out ASSET QTY|all")


def repay(argv):
    asset, qty = argv[2], argv[3]
    if qty == "all":
        entry = next(a for a in get(SPOT + "/sapi/v1/margin/account", {})["userAssets"]
                     if a["asset"] == asset)
        debt = Decimal(entry["borrowed"]) + Decimal(entry["interest"])
        if debt == 0:
            raise SystemExit(f"no {asset} debt to repay")
        qty = str(debt)
    result = post(SPOT + "/sapi/v1/margin/borrow-repay", "repay",
                  {"type": "REPAY", "asset": asset, "amount": qty, "isIsolated": "FALSE"})
    print(f"REPAID {qty} {asset} cross margin, id {result['tranId']}")
