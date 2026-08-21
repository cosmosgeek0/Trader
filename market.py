import time
import urllib.error
import urllib.parse
from decimal import Decimal

import binance
from binance import FAPI, SPOT, get, public, round_step


def signed(url, params):
    try:
        return get(url, params)
    except urllib.error.HTTPError as error:
        if error.code in (418, 429):
            raise SystemExit(f"Binance rate limit {error.code} after {binance.reads} requests: "
                             + error.read().decode())
        raise


def walk(levels, qty):
    need = qty
    paid = Decimal(0)
    for price, avail in levels:
        take = min(need, Decimal(avail))
        paid += Decimal(price) * take
        need -= take
        if need == 0:
            return paid / qty
    return None


def executable(sym, amount, sside, fside, step):
    sd = public(SPOT + "/api/v3/depth?symbol=" + urllib.parse.quote(sym) + "&limit=100")
    fd = public(FAPI + "/fapi/v1/depth?symbol=" + urllib.parse.quote(sym) + "&limit=100")
    stop = Decimal(sd[sside][0][0])
    ftop = Decimal(fd[fside][0][0])
    qty = round_step(amount / max(stop, ftop), step)
    if qty == 0:
        return None, None, stop, ftop, qty
    return walk(sd[sside], qty), walk(fd[fside], qty), stop, ftop, qty


def exec_line(sexec, fexec, stop, ftop, qty, amount, reverse):
    if qty == 0:
        return f"    one lot exceeds {amount} USDT, no orderable quantity"
    if sexec is None or fexec is None:
        return f"    book thinner than qty {qty:f} within 100 levels"
    gap = (sexec - fexec) / fexec if reverse else (fexec - sexec) / sexec
    return (f"    exec for {amount} qty {qty:f}: spot {sexec:.8f} (slip {abs(sexec - stop) / stop * 100:.4f}%) "
            f"fut {fexec:.8f} (slip {abs(fexec - ftop) / ftop * 100:.4f}%), gap {gap * 100:+.4f}%")


def scan(argv):
    amount = Decimal(argv[2])
    t0 = time.time()
    start = binance.reads
    sbooks = {t["symbol"]: (Decimal(t["bidPrice"]), Decimal(t["askPrice"]))
              for t in public(SPOT + "/api/v3/ticker/bookTicker")
              if t["symbol"].endswith("USDT") and Decimal(t["bidPrice"]) > 0 and Decimal(t["askPrice"]) > 0}
    ssteps = {}
    for s in public(SPOT + "/api/v3/exchangeInfo")["symbols"]:
        if s["symbol"] in sbooks:
            f = {x["filterType"]: x for x in s["filters"]}
            step = Decimal(f["MARKET_LOT_SIZE"]["stepSize"])
            ssteps[s["symbol"]] = step if step != 0 else Decimal(f["LOT_SIZE"]["stepSize"])
    fsteps = {}
    for s in public(FAPI + "/fapi/v1/exchangeInfo")["symbols"]:
        if s["contractType"] == "PERPETUAL" and s["status"] == "TRADING" and s["quoteAsset"] == "USDT":
            f = {x["filterType"]: x for x in s["filters"]}
            fsteps[s["symbol"]] = Decimal(f["MARKET_LOT_SIZE"]["stepSize"])
    fbooks = {t["symbol"]: (Decimal(t["bidPrice"]), Decimal(t["askPrice"]))
              for t in public(FAPI + "/fapi/v1/ticker/bookTicker")
              if t["symbol"] in fsteps and Decimal(t["bidPrice"]) > 0 and Decimal(t["askPrice"]) > 0}
    common = sbooks.keys() & fbooks.keys()
    fund = {p["symbol"]: Decimal(p["lastFundingRate"]) for p in public(FAPI + "/fapi/v1/premiumIndex")}
    hours = {i["symbol"]: i["fundingIntervalHours"] for i in public(FAPI + "/fapi/v1/fundingInfo")}
    staker = Decimal(signed(SPOT + "/api/v3/account", {"omitZeroBalances": "true"})["commissionRates"]["taker"])
    borrowable = {a["assetName"] for a in signed(SPOT + "/sapi/v1/margin/allAssets", {}) if a["isBorrowable"]}
    pool = {asset: Decimal(free) for asset, free
            in signed(SPOT + "/sapi/v1/margin/available-inventory", {"type": "MARGIN"})["assets"].items()}
    print(f"{len(common)} common USDT symbols (spot book x trading perpetual), "
          f"read in {int((time.time() - t0) * 1000)} ms, reverse exclusion for {amount} USDT")
    rows = [(sym, (fbooks[sym][0] - sbooks[sym][1]) / sbooks[sym][1] * 100,
             (sbooks[sym][0] - fbooks[sym][1]) / fbooks[sym][1] * 100) for sym in common]
    print("NORMAL top 10 (fut bid - spot ask)")
    for sym, ngap, rgap in sorted(rows, key=lambda r: r[1], reverse=True)[:10]:
        print(f"  {sym} {ngap:+.4f}%  spot ask {sbooks[sym][1]} fut bid {fbooks[sym][0]}")
        print(exec_line(*executable(sym, amount, "asks", "bids", max(ssteps[sym], fsteps[sym])), amount, False))
        ftaker = Decimal(signed(FAPI + "/fapi/v1/commissionRate", {"symbol": sym})["takerCommissionRate"])
        print(f"    est: fees {(staker + ftaker) * 2 * 100:.4f}% round trip taker, "
              f"funding: short {'receives' if fund[sym] > 0 else 'pays'} "
              f"{abs(fund[sym]) * 100:.4f}%/{hours.get(sym, 8)}h")
    print("REVERSE top 10 (spot bid - fut ask), borrow pool covers the amount; account check per row")
    shown = 0
    for sym, _, rgap in sorted(rows, key=lambda r: r[2], reverse=True):
        if shown == 10:
            break
        base = sym[:-4]
        need = amount / sbooks[sym][0]
        if base not in borrowable:
            print(f"  excluded {sym} {rgap:+.4f}%: {base} not borrowable")
        elif pool.get(base, Decimal(0)) < need:
            print(f"  excluded {sym} {rgap:+.4f}%: pool {pool.get(base, Decimal(0))} {base} < {need:.8f} needed")
        else:
            ex = executable(sym, amount, "bids", "asks", max(ssteps[sym], fsteps[sym]))
            qty = ex[4]
            live = Decimal(signed(SPOT + "/sapi/v1/margin/maxBorrowable", {"asset": base})["amount"])
            if qty == 0:
                verdict = "no orderable quantity"
            elif pool[base] >= qty and live >= qty:
                verdict = "usable"
            else:
                verdict = f"not usable yet, needs {qty:f}"
            print(f"  {sym} {rgap:+.4f}%  spot bid {sbooks[sym][0]} fut ask {fbooks[sym][1]}, "
                  f"pool {pool[base]} {base}, account maxBorrowable {live:f}: {verdict}")
            print(exec_line(*ex, amount, True))
            ftaker = Decimal(signed(FAPI + "/fapi/v1/commissionRate", {"symbol": sym})["takerCommissionRate"])
            hourly = Decimal(signed(SPOT + "/sapi/v1/margin/next-hourly-interest-rate",
                                    {"assets": base, "isIsolated": "FALSE"})[0]["nextHourlyInterestRate"])
            print(f"    est: fees {(staker + ftaker) * 2 * 100:.4f}% round trip taker, "
                  f"funding: long {'pays' if fund[sym] > 0 else 'receives'} "
                  f"{abs(fund[sym]) * 100:.4f}%/{hours.get(sym, 8)}h, "
                  f"borrow {hourly * 100:.6f}%/h {base}")
            shown += 1
    print(f"{binance.reads - start} requests in {int(time.time() - t0)} s")


def table(argv):
    syms = argv[2:]
    hours = {i["symbol"]: i["fundingIntervalHours"] for i in public(FAPI + "/fapi/v1/fundingInfo")}
    prev = {}
    try:
        while True:
            fund = {p["symbol"]: Decimal(p["lastFundingRate"]) for p in public(FAPI + "/fapi/v1/premiumIndex")}
            print(time.strftime("%H:%M:%S"))
            for sym in syms:
                q = urllib.parse.quote(sym)
                t0 = time.time()
                sb = public(SPOT + "/api/v3/ticker/bookTicker?symbol=" + q)
                fb = public(FAPI + "/fapi/v1/ticker/bookTicker?symbol=" + q)
                s24 = public(SPOT + "/api/v3/ticker/24hr?symbol=" + q)
                f24 = public(FAPI + "/fapi/v1/ticker/24hr?symbol=" + q)
                read_ms = int((time.time() - t0) * 1000)
                sbid, sask = Decimal(sb["bidPrice"]), Decimal(sb["askPrice"])
                fbid, fask = Decimal(fb["bidPrice"]), Decimal(fb["askPrice"])
                ngap = (fbid - sask) / sask * 100
                rgap = (sbid - fask) / fask * 100
                rate = fund[sym]
                fage = int(time.time() * 1000) - int(fb["time"])
                dn = f"{ngap - prev[sym][0]:+.4f}" if sym in prev else "first"
                dr = f"{rgap - prev[sym][1]:+.4f}" if sym in prev else "first"
                prev[sym] = (ngap, rgap)
                print(f"  {sym} n {ngap:+.4f}% ({dn}) r {rgap:+.4f}% ({dr}) "
                      f"funding {rate * 100:+.4f}%/{hours.get(sym, 8)}h "
                      f"({'short receives, long pays' if rate > 0 else 'short pays, long receives'}) "
                      f"sVol {Decimal(s24['quoteVolume']) / 1000000:.1f}M "
                      f"fVol {Decimal(f24['quoteVolume']) / 1000000:.1f}M "
                      f"fut book stamp {fage} ms old, read {read_ms} ms", flush=True)
            time.sleep(2)
    except KeyboardInterrupt:
        return


def volume(argv):
    t0 = time.time()
    start = binance.reads
    ssyms = sorted(t["symbol"] for t in public(SPOT + "/api/v3/ticker/bookTicker")
                   if t["symbol"].endswith("USDT") and Decimal(t["bidPrice"]) > 0 and Decimal(t["askPrice"]) > 0)
    fsyms = sorted(s["symbol"] for s in public(FAPI + "/fapi/v1/exchangeInfo")["symbols"]
                   if s["contractType"] == "PERPETUAL" and s["status"] == "TRADING" and s["quoteAsset"] == "USDT")
    baseline = 30
    ratio_min = 5
    floor = 50000
    cutoff = int(time.time() // 60 * 60000)
    hits = []
    for label, url, syms in (("SPOT", SPOT + "/api/v3/klines", ssyms), ("FUT", FAPI + "/fapi/v1/klines", fsyms)):
        for sym in syms:
            rows = public(url + "?symbol=" + urllib.parse.quote(sym) + "&interval=1m&limit=" + str(baseline + 1)
                          + "&endTime=" + str(cutoff - 1))
            if len(rows) < baseline + 1:
                continue
            vol = Decimal(rows[-1][7])
            avg = sum(Decimal(r[7]) for r in rows[:-1]) / baseline
            if vol >= floor and avg > 0 and vol / avg >= ratio_min:
                hits.append((vol / avg, label, sym, vol, avg, int(rows[-1][0])))
    print(f"SPOT {len(ssyms)} USDT symbols and FUT {len(fsyms)} USDT perpetuals scanned independently, "
          f"the {time.strftime('%H:%M', time.gmtime(cutoff / 1000 - 60))} UTC closed 1m candle, "
          f"unusual = that candle >= {ratio_min}x the prior {baseline}-candle average and >= {floor} USDT, "
          f"{binance.reads - start} requests in {int(time.time() - t0)} s")
    for ratio, label, sym, vol, avg, opened in sorted(hits, reverse=True):
        print(f"  {label} {sym} {time.strftime('%H:%M', time.gmtime(opened / 1000))} UTC "
              f"vol {vol:.0f} USDT = {ratio:.1f}x avg {avg:.0f}")


def view(argv):
    sym = argv[2]
    q = urllib.parse.quote(sym)
    for label, url in (("SPOT", SPOT + "/api/v3/trades"), ("FUT", FAPI + "/fapi/v1/trades")):
        trades = public(url + "?symbol=" + q + "&limit=100")
        buy = sum(Decimal(t["quoteQty"]) for t in trades if not t["isBuyerMaker"])
        nbuy = sum(1 for t in trades if not t["isBuyerMaker"])
        sell = sum(Decimal(t["quoteQty"]) for t in trades if t["isBuyerMaker"])
        print(f"{label} last {len(trades)} trades: taker buy {buy:.0f} USDT ({nbuy}), "
              f"taker sell {sell:.0f} USDT ({len(trades) - nbuy})")
        print(f"  recent: " + " | ".join(
            f"{time.strftime('%H:%M:%S', time.gmtime(t['time'] / 1000))} "
            f"{'SELL' if t['isBuyerMaker'] else 'BUY'} {t['qty']} @ {t['price']}"
            for t in trades[-5:]))
    closes = public(SPOT + "/api/v3/klines?symbol=" + q + "&interval=1m&limit=61")
    cur = Decimal(closes[-1][4])
    moves = " ".join(f"{n}m {(cur / Decimal(closes[-1 - n][4]) - 1) * 100:+.2f}%" for n in (1, 5, 15, 60))
    print(f"price move (spot, last {cur}): {moves}")
    books = {}
    for label, url in (("SPOT", SPOT + "/api/v3/depth"), ("FUT", FAPI + "/fapi/v1/depth")):
        d = public(url + "?symbol=" + q + "&limit=100")
        bid, ask = Decimal(d["bids"][0][0]), Decimal(d["asks"][0][0])
        mid = (bid + ask) / 2
        bidsum = sum(Decimal(p) * Decimal(v) for p, v in d["bids"] if Decimal(p) >= mid * Decimal("0.998"))
        asksum = sum(Decimal(p) * Decimal(v) for p, v in d["asks"] if Decimal(p) <= mid * Decimal("1.002"))
        books[label] = (bid, ask)
        print(f"{label} bid {bid} ask {ask}, depth from top 100 levels within 0.2% of mid: "
              f"bids {bidsum:.0f} USDT asks {asksum:.0f} USDT")
    sbid, sask = books["SPOT"]
    fbid, fask = books["FUT"]
    print(f"normal basis (fut bid - spot ask) {fbid - sask:+f} ({(fbid - sask) / sask * 100:+.4f}%)")
    print(f"reverse basis (spot bid - fut ask) {sbid - fask:+f} ({(sbid - fask) / fask * 100:+.4f}%)")
    p = public(FAPI + "/fapi/v1/premiumIndex?symbol=" + q)
    hours = {i["symbol"]: i["fundingIntervalHours"] for i in public(FAPI + "/fapi/v1/fundingInfo")}
    rate = Decimal(p["lastFundingRate"])
    left = int(int(p["nextFundingTime"]) / 1000 - time.time())
    print(f"funding {rate * 100:+.4f}%/{hours.get(sym, 8)}h "
          f"({'short receives, long pays' if rate > 0 else 'short pays, long receives'}), "
          f"next in {left // 3600}h {left % 3600 // 60}m")


def quote(argv):
    symbol = argv[2]
    t0 = time.time()
    s = public(SPOT + "/api/v3/ticker/bookTicker?symbol=" + symbol)
    sbid, sask = Decimal(s["bidPrice"]), Decimal(s["askPrice"])
    t1 = time.time()
    f = public(FAPI + "/fapi/v1/ticker/bookTicker?symbol=" + symbol)
    fbid, fask = Decimal(f["bidPrice"]), Decimal(f["askPrice"])
    t2 = time.time()
    p = public(FAPI + "/fapi/v1/premiumIndex?symbol=" + symbol)
    rate = Decimal(p["lastFundingRate"])
    left = int(p["nextFundingTime"] / 1000 - time.time())
    t3 = time.time()
    base = public(SPOT + "/api/v3/exchangeInfo?symbol=" + symbol)["symbols"][0]["baseAsset"]
    borrowable = next((a["isBorrowable"] for a in get(SPOT + "/sapi/v1/margin/allAssets", {})
                       if a["assetName"] == base), False)
    if borrowable:
        maxb = get(SPOT + "/sapi/v1/margin/maxBorrowable", {"asset": base})["amount"]
        hourly = get(SPOT + "/sapi/v1/margin/next-hourly-interest-rate",
                     {"assets": base, "isIsolated": "FALSE"})[0]["nextHourlyInterestRate"]
    t4 = time.time()
    print(f"{symbol} SPOT bid {sbid} ask {sask}, FUT bid {fbid} ask {fask}")
    print(f"normal basis (fut bid - spot ask) {fbid - sask:+f} ({(fbid - sask) / sask * 100:+.4f}%)")
    print(f"reverse basis (spot bid - fut ask) {sbid - fask:+f} ({(sbid - fask) / fask * 100:+.4f}%)")
    print(f"funding last {rate * 100:+.4f}% "
          f"({'short receives, long pays' if rate > 0 else 'short pays, long receives'}), "
          f"next in {left // 3600}h {left % 3600 // 60}m")
    if borrowable:
        print(f"{base} borrowable, maxBorrowable {maxb}, hourly interest {hourly}")
    else:
        print(f"{base} not borrowable")
    print(f"read latency spot {int((t1 - t0) * 1000)} ms, fut {int((t2 - t1) * 1000)} ms, "
          f"funding {int((t3 - t2) * 1000)} ms, borrow {int((t4 - t3) * 1000)} ms, "
          f"total {int((t4 - t0) * 1000)} ms")
