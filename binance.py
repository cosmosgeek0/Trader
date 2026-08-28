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
        raise SystemExit(action + " rejected: " + error.read().decode())
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
    symbol = argv[3]
    if side == "cancel":
        result = post(SPOT + "/api/v3/order", "SPOT cancel",
                      {"symbol": symbol, "orderId": argv[4]}, "DELETE")
        print(f"SPOT canceled {symbol} order {result['orderId']}, status {result['status']}")
    else:
        amount = Decimal(argv[4])
        if len(argv) > 5:
            price = Decimal(argv[5])
            filters = {f["filterType"]: f for f in json.load(urllib.request.urlopen(
                SPOT + "/api/v3/exchangeInfo?symbol=" + symbol))["symbols"][0]["filters"]}
            qty = round_step(amount / price, Decimal(filters["LOT_SIZE"]["stepSize"]))
            params = {"symbol": symbol, "side": side, "type": "LIMIT", "timeInForce": "GTC",
                      "quantity": str(qty), "price": str(price)}
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
