import json
import os
import re
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


def universe():
    spots = {s["symbol"]: s["baseAsset"] for s in public(SPOT + "/api/v3/exchangeInfo")["symbols"]
             if s["quoteAsset"] == "USDT" and s["status"] == "TRADING" and s["isSpotTradingAllowed"]}
    perps = {s["symbol"]: s["baseAsset"] for s in public(FAPI + "/fapi/v1/exchangeInfo")["symbols"]
             if s["contractType"] == "PERPETUAL" and s["status"] == "TRADING" and s["quoteAsset"] == "USDT"}
    by_base = {base: sym for sym, base in spots.items()}
    fut_of = {}
    for fsym, base in perps.items():
        m = re.match(r"(1000000|1000|1M)(.+)", base)
        if fsym not in spots and m and m.group(2) in by_base:
            fut_of[by_base[m.group(2)]] = (fsym, {"1000": 1000, "1000000": 1000000, "1M": 1000000}[m.group(1)])
        else:
            fut_of[fsym] = (fsym, 1)
    return spots, perps, fut_of


def events(argv):
    import asyncio

    import websockets

    spots, perps, fut_of = universe()
    both = {sym: fut for sym, fut in fut_of.items() if sym in spots}
    futmap = {fut[0]: (sym, Decimal(fut[1])) for sym, fut in both.items()}
    sfil = {}
    for s in public(SPOT + "/api/v3/exchangeInfo")["symbols"]:
        if s["symbol"] in both:
            f = {x["filterType"]: x for x in s["filters"]}
            lot, mkt = f["LOT_SIZE"], f["MARKET_LOT_SIZE"]
            step = Decimal(mkt["stepSize"]) or Decimal(lot["stepSize"])
            minq = max(Decimal(lot["minQty"]), Decimal(mkt["minQty"]))
            maxs = [Decimal(x["maxQty"]) for x in (lot, mkt) if Decimal(x["maxQty"]) > 0]
            maxq = min(maxs) if maxs else Decimal(0)
            noti = Decimal(f["NOTIONAL"]["minNotional"]) if f["NOTIONAL"]["applyMinToMarket"] else Decimal(0)
            sfil[s["symbol"]] = (step, minq, maxq, noti)
    ffil = {}
    for s in public(FAPI + "/fapi/v1/exchangeInfo")["symbols"]:
        if s["symbol"] in futmap:
            f = {x["filterType"]: x for x in s["filters"]}
            ffil[s["symbol"]] = (Decimal(f["MARKET_LOT_SIZE"]["stepSize"]),
                                 Decimal(f["MARKET_LOT_SIZE"]["minQty"]),
                                 Decimal(f["MARKET_LOT_SIZE"]["maxQty"]),
                                 Decimal(f["MIN_NOTIONAL"]["notional"]))
    staker = Decimal(signed(SPOT + "/api/v3/account", {"omitZeroBalances": "true"})["commissionRates"]["taker"])
    ftaker = Decimal(signed(FAPI + "/fapi/v1/commissionRate", {"symbol": "ETHUSDT"})["takerCommissionRate"])
    fees = float((staker + ftaker) * 2 * 100)
    pairs = {p["symbol"] for p in signed(SPOT + "/sapi/v1/margin/allPairs", {})
             if p["isMarginTrade"] and p["isSellAllowed"] and p["isBuyAllowed"]}
    borrowable = {a["assetName"] for a in signed(SPOT + "/sapi/v1/margin/allAssets", {}) if a["isBorrowable"]}
    pool = {}
    quotes = {}
    live = {}
    done = []
    above = {}
    pending = {}
    seen = set()
    ready = {"s": False, "f": False}
    try:
        old = json.load(open("/var/lib/trader-board/events.json"))
        for e in old.get("events", []):
            if "usd" not in e:
                continue
            if e.pop("live", False):
                e["close"] = old["at"]
                e["why"] = "cut"
            if "close" in e:
                e["dur"] = round((e["close"] - e["open"]) / 1000, 3)
            done.append(e)
        done.sort(key=lambda e: e["open"])
        del done[:-300]
    except (FileNotFoundError, ValueError):
        pass
    print(f"EVENTS watching {len(both)} pairs, fees {fees:.2f}%, bar = spread + fees, "
          f"size = matched touch dollars, {len(done)} prior events kept", flush=True)

    def gauge(sym):
        q = quotes.get(sym)
        if not q or "s" not in q or "f" not in q:
            return None
        sb, sa = q["s"][0], q["s"][1]
        fb, fa = q["f"][0], q["f"][1]
        if sb <= 0 or sa <= 0 or fb <= 0 or fa <= 0:
            return None
        mult = futmap[both[sym][0]][1]
        smid = (sb + sa) / 2
        fmid = (fb + fa) / 2 / mult
        bas = float((fmid - smid) / smid * 100)
        spr = float((sa - sb) / smid * 100) + float((fa - fb) / (fmid * mult) * 100)
        return bas, spr, abs(bas) - spr - fees

    def close_event(e, now, why):
        e["close"] = now
        e["dur"] = round((now - e["open"]) / 1000, 3)
        e["why"] = why
        done.append(e)
        del done[:-300]
        del live[e["sym"]]
        print(f"CLOSE {e['sym']} {why} after {e['dur']}s, peak net {e['peak']:+.3f}%", flush=True)

    def touch_usd(sym, dirn):
        q = quotes[sym]
        sb, sa, sqb, sqa = q["s"][:4]
        fb, fa, fqb, fqa = q["f"][:4]
        fsym = both[sym][0]
        mult = futmap[fsym][1]
        sstep, sminq, smaxq, snoti = sfil[sym]
        fstep, fminq, fmaxq, fnoti = ffil[fsym]
        if dirn == "+":
            tokens = min(sqa, fqb * mult)
            price = sa
            fpx = fb
        else:
            tokens = min(sqb, fqa * mult, pool.get(spots[sym], Decimal(0)))
            price = sb
            fpx = fa
        if smaxq > 0:
            tokens = min(tokens, smaxq)
        if fmaxq > 0:
            tokens = min(tokens, fmaxq * mult)
        tokens = round_step(tokens, max(sstep, fstep * mult))
        if tokens < sminq or tokens < fminq * mult:
            return 0
        usd = tokens * price
        if usd < snoti or tokens * fpx / mult < fnoti:
            return 0
        return round(float(usd))

    def evaluate(sym, now):
        g = gauge(sym)
        e = live.get(sym)
        if g is None:
            above.pop(sym, None)
            seen.discard(sym)
            pending.pop(sym, None)
            return
        bas, spr, net = g
        d = "+" if bas > 0 else "-"
        if net <= 0:
            pending.pop(sym, None)
        if net < -0.05:
            above.pop(sym, None)
        fresh = sym not in seen
        seen.add(sym)
        if e is not None:
            if (bas > 0) != (e["dir"] == "+"):
                close_event(e, now, "flip")
                e = None
            else:
                if net > e["peak"]:
                    e["peak"] = net
                    e["pbas"] = bas
                    e["upk"] = touch_usd(sym, e["dir"])
                if net <= 0:
                    close_event(e, now, "faded")
                return
        if fresh:
            if net > 0:
                above[sym] = d
            return
        p = pending.get(sym)
        if p is not None and p["dir"] != d:
            del pending[sym]
            p = None
        if p is not None:
            if now - p["open"] >= 300:
                del pending[sym]
                live[sym] = {"sym": sym, "dir": d, "open": p["open"], "skew": p["skew"],
                             "bas": p["bas"], "spr": p["spr"], "net": p["net"], "usd": p["usd"],
                             "upk": p["usd"] if p["net"] >= net else touch_usd(sym, d),
                             "peak": max(p["net"], net), "pbas": p["bas"] if p["net"] >= net else bas}
                print(f"OPEN {sym} {d} net {p['net']:+.3f}% size ${p['usd']} "
                      f"bas {p['bas']:+.3f}% spr {p['spr']:.3f}% confirmed after {now - p['open']} ms", flush=True)
            return
        if net > 0 and above.get(sym) != d:
            if bas < 0 and (sym not in pairs or spots[sym] not in borrowable
                            or pool.get(spots[sym], Decimal(0)) <= 0):
                return
            above[sym] = d
            q = quotes[sym]
            pending[sym] = {"dir": d, "open": now, "skew": int(abs(q["s"][4] - q["f"][4])),
                            "bas": round(bas, 4), "spr": round(spr, 4), "net": round(net, 4),
                            "usd": touch_usd(sym, d)}

    async def pools():
        while True:
            try:
                rows = await asyncio.to_thread(signed, SPOT + "/sapi/v1/margin/available-inventory",
                                               {"type": "MARGIN"})
                fresh = {a: Decimal(v) for a, v in rows["assets"].items()}
                pool.clear()
                pool.update(fresh)
                now = int(time.time() * 1000)
                for sym in list(seen):
                    if sym not in live:
                        evaluate(sym, now)
            except (Exception, SystemExit) as error:
                pool.clear()
                print("pool refresh failed, pool marked unknown:", error, flush=True)
            await asyncio.sleep(30)

    async def flush():
        while True:
            await asyncio.sleep(1)
            rows = [dict(e, live=True) for e in sorted(live.values(), key=lambda e: e["open"], reverse=True)]
            rows += [dict(e, live=False) for e in reversed(done)][:300 - len(rows)]
            keys = ("sym", "dir", "open", "skew", "bas", "spr", "net", "usd", "upk", "peak", "pbas",
                    "close", "dur", "why", "live")
            out = [{k: round(e[k], 4) if k in ("peak", "pbas") else e[k] for k in keys if k in e} for e in rows]
            with open("/var/lib/trader-board/events.tmp", "w") as f:
                json.dump({"at": int(time.time() * 1000), "fees": fees,
                           "ready": ready["s"] and ready["f"], "events": out}, f)
            os.replace("/var/lib/trader-board/events.tmp", "/var/lib/trader-board/events.json")

    async def stream(url, names, venue):
        while True:
            ready[venue] = False
            for sym, q in quotes.items():
                q.pop(venue, None)
                seen.discard(sym)
                above.pop(sym, None)
                pending.pop(sym, None)
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    for i in range(0, len(names), 100):
                        await ws.send(json.dumps({"method": "SUBSCRIBE", "params": names[i:i + 100], "id": i + 1}))
                    async for raw in ws:
                        d = json.loads(raw)
                        s = d.get("s")
                        if venue == "s":
                            sym = s if s in both else None
                        else:
                            sym = futmap[s][0] if s in futmap else None
                        if sym:
                            now = int(time.time() * 1000)
                            ready[venue] = True
                            quotes.setdefault(sym, {})[venue] = (Decimal(d["b"]), Decimal(d["a"]),
                                                                 Decimal(d["B"]), Decimal(d["A"]), now)
                            evaluate(sym, now)
            except (websockets.WebSocketException, OSError, json.JSONDecodeError) as error:
                ready[venue] = False
                for sym, q in quotes.items():
                    q.pop(venue, None)
                    seen.discard(sym)
                    above.pop(sym, None)
                    pending.pop(sym, None)
                print(venue, "stream reconnect:", error, flush=True)
                await asyncio.sleep(3)

    async def main():
        await asyncio.gather(
            stream("wss://stream.binance.com:9443/ws", [s.lower() + "@bookTicker" for s in both], "s"),
            stream("wss://fstream.binance.com/ws", [f.lower() + "@bookTicker" for f in futmap], "f"),
            pools(), flush())

    asyncio.run(main())


def board(argv):
    spots, perps, fut_of = universe()
    coins = {c["coin"]: c["name"] for c in signed(SPOT + "/sapi/v1/capital/config/getall", {})}
    tokens = spots.keys() | fut_of.keys()
    count = {"both": len(spots.keys() & fut_of.keys()), "spot": len(spots.keys() - fut_of.keys()),
             "fut": len(fut_of.keys() - spots.keys()), "total": len(tokens)}
    pool = {}
    pool_at = 0.0
    day = {}
    day_at = 0.0
    hour = {}
    hour_at = 0.0
    anchors = []
    mark = False
    try:
        while True:
            tick = time.time()
            if tick - pool_at > 30:
                pool = {a: Decimal(v) for a, v in signed(SPOT + "/sapi/v1/margin/available-inventory",
                                                         {"type": "MARGIN"})["assets"].items()}
                pool_at = time.time()
            if time.time() - day_at > 60:
                day = {("s", t["symbol"]): t for t in public(SPOT + "/api/v3/ticker/24hr")}
                day.update({("f", t["symbol"]): t for t in public(FAPI + "/fapi/v1/ticker/24hr")})
                day_at = time.time()
                mark = True
            if time.time() - hour_at > 180:
                hours = {i["symbol"]: i["fundingIntervalHours"] for i in public(FAPI + "/fapi/v1/fundingInfo")}
                names = sorted(spots)
                hour = {}
                for i in range(0, len(names), 100):
                    for t in public(SPOT + "/api/v3/ticker?windowSize=1h&symbols=" + urllib.parse.quote(
                            json.dumps(names[i:i + 100], separators=(",", ":"), ensure_ascii=False))):
                        hour[t["symbol"]] = Decimal(t["quoteVolume"])
                hour_at = time.time()
            sb = {t["symbol"]: t for t in public(SPOT + "/api/v3/ticker/bookTicker") if t["symbol"] in spots}
            fb = {t["symbol"]: t for t in public(FAPI + "/fapi/v1/ticker/bookTicker") if t["symbol"] in perps}
            prem = {p["symbol"]: p for p in public(FAPI + "/fapi/v1/premiumIndex") if p["symbol"] in perps}
            back = min((a for a in anchors if time.time() - a[0] >= 3300),
                       key=lambda a: abs(time.time() - a[0] - 3600), default=None)
            if back:
                back = (time.time() - back[0], back[1])
            rows = []
            for sym in tokens:
                fsym, mult = fut_of.get(sym, (None, 1))
                s, f, p = sb.get(sym), fb.get(fsym), prem.get(fsym)
                sd = day.get(("s", sym)) if sym in spots else None
                fd = day.get(("f", fsym)) if fsym else None
                base = spots.get(sym) or perps[fsym]
                r = {"sym": sym, "cat": "both" if sym in spots and fsym else "spot" if sym in spots else "fut",
                     "pool": pool.get(base, Decimal(0)) > 0}
                if coins.get(base, base) != base:
                    r["name"] = coins[base]
                if fsym and fsym != sym:
                    r.update(fsym=fsym, mult=mult)
                if s:
                    r.update(sbid=s["bidPrice"], sask=s["askPrice"])
                if f:
                    r.update(fbid=f["bidPrice"], fask=f["askPrice"])
                if p:
                    r.update(fund=round(float(Decimal(p["lastFundingRate"]) * 100), 6), hours=hours.get(fsym, 8))
                if s and f and Decimal(s["bidPrice"]) > 0 and Decimal(f["bidPrice"]) > 0:
                    smid = (Decimal(s["bidPrice"]) + Decimal(s["askPrice"])) / 2
                    fmid = (Decimal(f["bidPrice"]) + Decimal(f["askPrice"])) / 2 / mult
                    r["bas"] = round(float((fmid - smid) / smid * 100), 4)
                if sd:
                    r.update(svol=round(float(sd["quoteVolume"])), schg=float(sd["priceChangePercent"]))
                if fd:
                    r.update(fvol=round(float(fd["quoteVolume"])), fchg=float(fd["priceChangePercent"]))
                if sd and fd and float(sd["quoteVolume"]) > 0:
                    r["ratio"] = round(float(fd["quoteVolume"]) / float(sd["quoteVolume"]), 2)
                if sd and sym in hour and float(sd["quoteVolume"]) > 0:
                    r["v1x"] = round(float(hour[sym]) * 24 / float(sd["quoteVolume"]), 1)
                if back and sym in back[1] and "bas" in r:
                    r["bh"] = round((r["bas"] - back[1][sym]) * 3600 / back[0], 4)
                rows.append(r)
            with open("/var/lib/trader-board/board.tmp", "w") as out:
                json.dump({"at": int(time.time() * 1000), "count": count, "rows": rows}, out)
            os.replace("/var/lib/trader-board/board.tmp", "/var/lib/trader-board/board.json")
            if mark:
                anchors.append((time.time(), {r["sym"]: r["bas"] for r in rows if "bas" in r}))
                anchors = [a for a in anchors if time.time() - a[0] <= 4200]
                mark = False
            lead_r = sorted([r for r in rows if "bas" in r and r["pool"] and r["bas"] < 0], key=lambda r: r["bas"])[:5]
            lead_n = sorted([r for r in rows if "bas" in r], key=lambda r: r["bas"], reverse=True)[:5]
            print(time.strftime("%H:%M:%S") + f" {count['total']} tokens ({count['both']} both, {count['spot']} spot-only, "
                  f"{count['fut']} fut-only) | neg pool>0 "
                  + " ".join(f"{r['sym']} {r['bas']:+.2f}%" for r in lead_r) + " | pos "
                  + " ".join(f"{r['sym']} {r['bas']:+.2f}%" for r in lead_n), flush=True)
            time.sleep(max(0.0, 1 - (time.time() - tick)))
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
