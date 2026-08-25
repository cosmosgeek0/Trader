import json
import os
import time
from decimal import Decimal

import binance

STATE = "/var/lib/trader-account"
EVERY = 10


def prices():
    out = {"USDT": Decimal(1)}
    for t in binance.public(binance.SPOT + "/api/v3/ticker/bookTicker"):
        if t["symbol"].endswith("USDT"):
            out[t["symbol"][:-4]] = Decimal(t["bidPrice"])
    return out


def value(price, asset, amount):
    rate = price.get(asset)
    if rate is None and asset.startswith("LD"):
        rate = price.get(asset[2:])
    return float(Decimal(amount) * (rate or Decimal(0)))


def snapshot():
    price = prices()
    rows = []
    spot = binance.get(binance.SPOT + "/api/v3/account", {"omitZeroBalances": "true"})
    for b in spot["balances"]:
        if b["asset"].startswith("LD") and price.get(b["asset"]) is None \
                and price.get(b["asset"][2:]) is not None:
            continue  # Simple Earn wrapper; the position endpoints below are the canonical view
        amount = Decimal(b["free"]) + Decimal(b["locked"])
        rows.append({"wallet": "spot", "asset": b["asset"], "amount": float(amount),
                     "locked": float(Decimal(b["locked"])),
                     "value": value(price, b["asset"], amount)})
    for kind, url in (("flexible", "/sapi/v1/simple-earn/flexible/position"),
                      ("locked", "/sapi/v1/simple-earn/locked/position")):
        for pos in binance.get(binance.SPOT + url, {"size": 100}).get("rows", []):
            amount = Decimal(pos.get("totalAmount") or pos.get("amount"))
            rows.append({"wallet": "earn", "asset": pos["asset"], "amount": float(amount),
                         "earn": kind, "value": value(price, pos["asset"], amount)})
    for b in binance.send(binance.SPOT + "/sapi/v1/asset/get-funding-asset", {}):
        amount = Decimal(b["free"]) + Decimal(b["locked"]) + Decimal(b["freeze"])
        if amount == 0:
            continue
        rows.append({"wallet": "funding", "asset": b["asset"], "amount": float(amount),
                     "locked": float(Decimal(b["locked"]) + Decimal(b["freeze"])),
                     "value": value(price, b["asset"], amount)})
    margin = binance.get(binance.SPOT + "/sapi/v1/margin/account", {})
    for a in margin["userAssets"]:
        if Decimal(a["netAsset"]) == 0 and Decimal(a["borrowed"]) == 0 and Decimal(a["interest"]) == 0:
            continue
        rows.append({"wallet": "margin", "asset": a["asset"], "amount": float(Decimal(a["netAsset"])),
                     "borrowed": float(Decimal(a["borrowed"])), "interest": float(Decimal(a["interest"])),
                     "value": value(price, a["asset"], a["netAsset"])})
    fut = binance.get(binance.FAPI + "/fapi/v2/account", {})
    for a in fut["assets"]:
        if Decimal(a["walletBalance"]) == 0:
            continue
        rows.append({"wallet": "fut", "asset": a["asset"], "amount": float(Decimal(a["walletBalance"])),
                     "pnl": float(Decimal(a["unrealizedProfit"])),
                     "value": value(price, a["asset"], a["walletBalance"])})
    loans = binance.get(binance.SPOT + "/sapi/v2/loan/flexible/ongoing/orders", {})
    for o in loans.get("rows", []):
        rows.append({"wallet": "loan", "asset": o["loanCoin"], "amount": -float(Decimal(o["totalDebt"])),
                     "ltv": float(Decimal(o["currentLTV"])),
                     "value": -value(price, o["loanCoin"], o["totalDebt"])})
        rows.append({"wallet": "loan", "asset": o["collateralCoin"], "collateral": True,
                     "amount": float(Decimal(o["collateralAmount"])),
                     "value": value(price, o["collateralCoin"], o["collateralAmount"])})
    orders = []
    for venue, url in (("spot", binance.SPOT + "/api/v3/openOrders"),
                       ("margin", binance.SPOT + "/sapi/v1/margin/openOrders"),
                       ("fut", binance.FAPI + "/fapi/v1/openOrders")):
        for o in binance.get(url, {}):
            orders.append({"venue": venue, "symbol": o["symbol"], "side": o["side"],
                           "type": o["type"], "price": o["price"], "qty": o["origQty"],
                           "filled": o["executedQty"], "status": o["status"],
                           "ts": o["time"] // 1000})
    positions = [{"symbol": p["symbol"], "amount": float(Decimal(p["positionAmt"])),
                  "entry": float(Decimal(p["entryPrice"])), "pnl": float(Decimal(p["unrealizedProfit"])),
                  "leverage": int(p["leverage"])}
                 for p in fut["positions"] if Decimal(p["positionAmt"]) != 0]
    assets = {r["asset"] for r in rows if r["wallet"] in ("spot", "margin", "earn")}
    syms = sorted({a + "USDT" for a in assets if a in price and a != "USDT"}
                  | {p["symbol"] for p in positions})
    wallets = {}
    for r in rows:
        wallets[r["wallet"]] = wallets.get(r["wallet"], 0) + r["value"]
    wallets["fut"] = wallets.get("fut", 0) + float(Decimal(fut["totalUnrealizedProfit"]))
    total = sum(wallets.values())
    return syms, {
        "rows": rows, "positions": positions, "orders": orders,
        "wallets": wallets, "total": round(total, 2),
        "margin": {"level": float(margin["marginLevel"]),
                   "borrowed": sum(value(price, a["asset"], a["borrowed"]) for a in margin["userAssets"]),
                   "net": value(price, "BTC", margin["totalNetAssetOfBtc"])},
        "futures": {"balance": float(Decimal(fut["totalWalletBalance"])),
                    "pnl": float(Decimal(fut["totalUnrealizedProfit"])),
                    "maintenance": float(Decimal(fut["totalMaintMargin"])),
                    "margin_balance": float(Decimal(fut["totalMarginBalance"]))},
    }


def history(syms):
    now = int(time.time() * 1000)
    month = now - 29 * 86400000
    rows = []
    for sym in syms:
        for venue, url, params in (
                ("spot", binance.SPOT + "/api/v3/allOrders", {"symbol": sym, "limit": 20}),
                ("margin", binance.SPOT + "/sapi/v1/margin/allOrders", {"symbol": sym, "size": 20}),
                ("fut", binance.FAPI + "/fapi/v1/allOrders", {"symbol": sym, "limit": 20})):
            for o in binance.get(url, params):
                if o["status"] in ("NEW", "PARTIALLY_FILLED"):
                    continue
                filled = Decimal(o["executedQty"])
                quote = Decimal(o.get("cummulativeQuoteQty") or o.get("cumQuote") or 0)
                rows.append({"kind": "order", "venue": venue, "ts": o["updateTime"] // 1000,
                             "symbol": o["symbol"], "side": o["side"], "otype": o["type"],
                             "price": str(quote / filled if filled and quote else Decimal(o["price"])),
                             "qty": o["origQty"], "filled": o["executedQty"], "status": o["status"]})
    for d in binance.get(binance.SPOT + "/sapi/v1/capital/deposit/hisrec", {}):
        rows.append({"kind": "deposit", "ts": d["insertTime"] // 1000, "asset": d["coin"],
                     "amount": float(Decimal(d["amount"])),
                     "status": "Completed" if d["status"] == 1 else "Pending",
                     "detail": d.get("network", "")})
    for w in binance.get(binance.SPOT + "/sapi/v1/capital/withdraw/history", {}):
        rows.append({"kind": "withdraw", "ts": int(time.mktime(time.strptime(
                         w["applyTime"], "%Y-%m-%d %H:%M:%S"))), "asset": w["coin"],
                     "amount": -float(Decimal(w["amount"])),
                     "status": "Completed" if w["status"] == 6 else "Pending",
                     "detail": w.get("network", "")})
    names = {"MAIN": "spot", "UMFUTURE": "futures", "MARGIN": "margin", "FUNDING": "funding"}
    for kind in ("MAIN_UMFUTURE", "UMFUTURE_MAIN", "MAIN_MARGIN", "MARGIN_MAIN",
                 "MARGIN_UMFUTURE", "UMFUTURE_MARGIN", "MAIN_FUNDING", "FUNDING_MAIN",
                 "FUNDING_UMFUTURE", "UMFUTURE_FUNDING", "MARGIN_FUNDING", "FUNDING_MARGIN"):
        got = binance.get(binance.SPOT + "/sapi/v1/asset/transfer",
                          {"type": kind, "startTime": month, "size": 100})
        for m in got.get("rows", []):
            src, dst = kind.split("_")
            rows.append({"kind": "transfer", "ts": m["timestamp"] // 1000, "asset": m["asset"],
                         "amount": float(Decimal(m["amount"])),
                         "status": "Completed" if m["status"] == "CONFIRMED" else m["status"],
                         "detail": names[src] + " → " + names[dst]})
    for direction in ("BORROW", "REPAY"):
        got = binance.get(binance.SPOT + "/sapi/v1/margin/borrow-repay",
                          {"type": direction, "startTime": month, "size": 100})
        for m in got.get("rows", []):
            rows.append({"kind": direction.lower(), "ts": int(m["timestamp"]) // 1000, "asset": m["asset"],
                         "amount": float(Decimal(m.get("principal") or m.get("amount"))),
                         "status": str(m.get("status", "")).capitalize(), "detail": "cross margin"})
    for kind, url, coin, amt, when in (
            ("borrow", "/sapi/v2/loan/flexible/borrow/history", "loanCoin", "initialLoanAmount", "borrowTime"),
            ("repay", "/sapi/v2/loan/flexible/repay/history", "loanCoin", "repayAmount", "repayTime")):
        got = binance.get(binance.SPOT + url, {"startTime": month, "size": 100})
        for m in got.get("rows", []):
            rows.append({"kind": kind, "ts": int(m[when]) // 1000, "asset": m[coin],
                         "amount": float(Decimal(m[amt])),
                         "status": str(m.get("status", "")).capitalize(), "detail": "flexible loan"})
    flow = binance.get(binance.SPOT + "/sapi/v1/convert/tradeFlow",
                       {"startTime": month, "endTime": now})
    for c in flow.get("list", []):
        rows.append({"kind": "convert", "ts": c["createTime"] // 1000, "asset": c["fromAsset"],
                     "amount": -float(Decimal(c["fromAmount"])),
                     "status": c["orderStatus"].capitalize(),
                     "detail": c["fromAmount"] + " " + c["fromAsset"] + " → "
                               + c["toAmount"] + " " + c["toAsset"]})
    rows.sort(key=lambda r: -r["ts"])
    return {"at": now, "rows": rows[:200]}


def key_flags():
    r = binance.get(binance.SPOT + "/sapi/v1/account/apiRestrictions", {})
    return {"at": int(time.time() * 1000), "futures": r["enableFutures"],
            "withdrawals": r["enableWithdrawals"],
            "transfers": r["enableInternalTransfer"] or r["permitsUniversalTransfer"],
            "trade": r["enableSpotAndMarginTrading"], "margin": r["enableMargin"],
            "ip": r["ipRestrict"], "created": r["createTime"] // 1000}


def account():
    path = os.path.join(STATE, "account.json")
    day = None
    past = None
    key = None
    series = []
    try:
        with open(path) as file:
            old = json.load(file)
        day = old.get("day")
        past = old.get("past")
        key = old.get("key")
        series = old.get("series", [])
    except FileNotFoundError:
        pass
    ran = False
    while True:
        started = time.time()
        syms, data = snapshot()
        if not past or time.time() * 1000 - past["at"] >= 1800000:
            past = history(syms)
        if not key or time.time() * 1000 - key["at"] >= 1800000:
            key = key_flags()
        data["past"] = past
        data["history"] = past["rows"]
        data["key"] = key
        now = int(time.time())
        if not series or now - series[-1][0] >= 60:
            series.append([now, data["total"]])
            series = [s for s in series if s[0] > now - 86400]
        data["series"] = series
        stamp = time.strftime("%Y-%m-%d", time.gmtime())
        if not day:
            day = {"date": stamp, "total": data["total"], "seeded": True}
        elif day.get("date") != stamp:
            day = {"date": stamp, "total": data["total"]}
            if not ran:
                day["seeded"] = True
        data.update(at=int(time.time() * 1000), every=EVERY, day=day)
        with open(path + ".tmp", "w") as out:
            json.dump(data, out)
        os.replace(path + ".tmp", path)
        shown = "—" if day.get("seeded") else f"{data['total'] - day['total']:+.2f}"
        print(f"{len(data['rows'])} holdings, {len(data['positions'])} positions, "
              f"{len(data['orders'])} open orders, {len(data['history'])} history rows, "
              f"total {data['total']:.2f} USDT, day {shown}", flush=True)
        ran = True
        time.sleep(max(0, EVERY - (time.time() - started)))
