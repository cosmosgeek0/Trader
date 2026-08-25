import html
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

state = os.environ["STATE_DIRECTORY"]
news_control = "/var/lib/trader-news-control/enabled"
AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
         "Chrome/126.0.0.0 Safari/537.36")

SOURCES = [  # label, domain, channel, feed urls, keywords a title must contain (empty = all titles)
    ("Federal Reserve Board", "federalreserve.gov", "official", [
        "https://www.federalreserve.gov/feeds/press_all.xml",
        "https://www.federalreserve.gov/feeds/press_monetary.xml",
        "https://www.federalreserve.gov/feeds/speeches_and_testimony.xml",
        "https://www.federalreserve.gov/feeds/bankinginfo-rss.xml",
    ], ()),
    ("BEA", "bea.gov", "official", ["https://apps.bea.gov/rss/rss.xml"], ()),
    ("SEC", "sec.gov", "official", [
        "https://www.sec.gov/news/pressreleases.rss",
        "https://www.sec.gov/news/speeches-statements.rss",
        "https://www.sec.gov/news/testimony.rss",
        "https://www.sec.gov/news/statements.rss",
    ], ()),
    ("CFTC", "cftc.gov", "official", [
        "https://www.cftc.gov/RSS/RSSGP/rssgp.xml",
        "https://www.cftc.gov/RSS/RSSENF/rssenf.xml",
        "https://www.cftc.gov/RSS/RSSST/rssst.xml",
    ], ()),
    ("ECB", "ecb.europa.eu", "official", [
        "https://www.ecb.europa.eu/rss/press.html",
        "https://www.ecb.europa.eu/rss/statpress.html",
        "https://www.ecb.europa.eu/rss/pub.html",
        "https://www.ecb.europa.eu/rss/operations.html",
    ], ()),
    ("Bank of England", "bankofengland.co.uk", "official", [
        "https://www.bankofengland.co.uk/rss/news",
        "https://www.bankofengland.co.uk/rss/publications",
        "https://www.bankofengland.co.uk/rss/speeches",
        "https://www.bankofengland.co.uk/rss/statistics",
    ], ()),
    ("Japan MOF", "mof.go.jp", "official", ["https://www.mof.go.jp/english/news.rss"], ()),
    ("Kraken", "blog.kraken.com", "venue", ["https://blog.kraken.com/category/product/asset-listings/feed"], ()),
    ("Binance Announcements", "binance.com", "venue", [
        "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=48",
        "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=161",
    ], ()),
    ("Bithumb", "bithumb.com", "venue", ["https://api.bithumb.com/v1/notices"], ()),
    ("Deribit", "insights.deribit.com", "venue", ["https://insights.deribit.com/exchange-updates/feed/"], ()),
    ("CME Group Crypto Notices", "cmegroup.com", "venue", ["https://feeds.feedburner.com/mediaroom/CMsF"],
     ("crypto", "cryptocurrency", "bitcoin", "ether", "ethereum", "xrp", "solana", "cardano", "chainlink", "stellar")),
    ("Coinbase Status", "status.coinbase.com", "venue", ["https://status.coinbase.com/history.rss"], ()),
    ("Kraken Status", "status.kraken.com", "venue", ["https://status.kraken.com/history.rss"], ()),
    ("Ethereum Foundation", "ethereum.org", "protocol", ["https://blog.ethereum.org/feed.xml"], ()),
    ("Bitcoin Core", "bitcoincore.org", "protocol", ["https://github.com/bitcoin/bitcoin/releases.atom"], ()),
    ("Geth", "geth.ethereum.org", "protocol", ["https://github.com/ethereum/go-ethereum/releases.atom"], ()),
    ("Nethermind", "nethermind.io", "protocol", ["https://github.com/NethermindEth/nethermind/releases.atom"], ()),
    ("Prysm", "offchainlabs.com", "protocol", ["https://github.com/OffchainLabs/prysm/releases.atom"], ()),
    ("Lighthouse", "sigmaprime.io", "protocol", ["https://github.com/sigp/lighthouse/releases.atom"], ()),
    ("Solana Agave", "solana.com", "protocol", ["https://github.com/anza-xyz/agave/releases.atom"], ()),
    ("Arbitrum Nitro", "arbitrum.io", "protocol", ["https://github.com/OffchainLabs/nitro/releases.atom"], ()),
    ("Optimism", "optimism.io", "protocol", ["https://github.com/ethereum-optimism/optimism/releases.atom"], ()),
    ("Base Status", "base.org", "protocol", ["https://status.base.org/history.rss"], ()),
    ("Polygon Status", "polygon.technology", "protocol", ["https://status.polygon.technology/history.rss"], ()),
    ("AvalancheGo", "avax.network", "protocol", ["https://github.com/ava-labs/avalanchego/releases.atom"], ()),
    ("Cosmos Gaia", "cosmos.network", "protocol", ["https://github.com/cosmos/gaia/releases.atom"], ()),
    ("Celestia Node", "celestia.org", "protocol", ["https://github.com/celestiaorg/celestia-node/releases.atom"], ()),
    ("Sui", "sui.io", "protocol", ["https://github.com/MystenLabs/sui/releases.atom"], ()),
    ("Aptos Core", "aptosfoundation.org", "protocol", ["https://github.com/aptos-labs/aptos-core/releases.atom"], ()),
    ("Chainlink", "chain.link", "protocol", ["https://github.com/smartcontractkit/chainlink/releases.atom"], ()),
    ("Uniswap v4", "uniswap.org", "protocol", ["https://github.com/Uniswap/v4-core/releases.atom"], ()),
    ("Aave v3", "aave.com", "protocol", ["https://github.com/aave/aave-v3-core/releases.atom"], ()),
    ("Lido", "lido.fi", "protocol", ["https://blog.lido.fi/rss/"], ()),
    ("Bitcoin Optech", "bitcoinops.org", "protocol", ["https://bitcoinops.org/feed.xml"], ()),
    ("Sky / Maker Forum", "forum.sky.money", "protocol", ["https://forum.sky.money/latest.rss"], ()),
    ("Curve Protocol", "curve.fi", "protocol", [
        "https://github.com/curvefi/curve-contract/releases.atom",
        "https://github.com/curvefi/curve-dao-contracts/releases.atom",
        "https://github.com/curvefi/curve-stablecoin/releases.atom",
    ], ()),
    ("dYdX", "dydx.exchange", "protocol", ["https://github.com/dydxprotocol/v4-chain/releases.atom"], ()),
    ("Jito Solana", "jito.network", "protocol", ["https://github.com/jito-foundation/jito-solana/releases.atom"], ()),
    ("Jupiter", "jup.ag", "protocol", ["https://github.com/jup-ag/jupiter-cpi/releases.atom"], ()),
    ("Wormhole", "wormhole.com", "protocol", ["https://github.com/wormhole-foundation/wormhole/releases.atom"], ()),
    ("LayerZero v2", "layerzero.network", "protocol", ["https://github.com/LayerZero-Labs/LayerZero-v2/releases.atom"], ()),
    ("Tether", "tether.io", "issuer", ["https://tether.io/feed/"], ()),
    ("PayPal USD", "paypal.com", "issuer", ["https://newsroom.paypal-corp.com/news?pagetemplate=rss"],
     ("pyusd", "paypal usd", "stablecoin", "stable coin", "crypto", "cryptocurrency", "digital asset", "blockchain")),
    ("BIS Press Releases", "bis.org", "official", ["https://www.bis.org/doclist/all_pressrels.rss"],
     ("crypto", "token", "stablecoin", "market", "monetary", "rate", "inflation", "central bank", "liquidity", "capital",
      "banking", "financial")),
    ("BIS Central Bank Speeches", "bis.org", "official", ["https://www.bis.org/doclist/cbspeeches.rss"],
     ("crypto", "token", "stablecoin", "market", "monetary", "rate", "inflation", "central bank", "liquidity", "capital",
      "banking", "financial")),
    ("BIS Statistics", "bis.org", "official", ["https://www.bis.org/doclist/all_statistics.rss"], ()),
    ("Japan FSA", "fsa.go.jp", "official", ["https://www.fsa.go.jp/fsaNewsListAll_rss2.xml"], ()),
    ("Crypto.news", "crypto.news", "editorial", ["https://crypto.news/feed/"], ()),
    ("Ledger Insights", "ledgerinsights.com", "editorial", ["https://www.ledgerinsights.com/feed/"], ()),
    ("Rekt", "rekt.news", "editorial", ["https://www.rekt.news/rss/feed.xml"], ()),
    ("BeInCrypto", "beincrypto.com", "editorial", ["https://beincrypto.com/feed/"], ()),
    ("CoinShares Research", "coinshares.com", "editorial", ["https://researchblog.coinshares.com/feed"], ()),
    ("FinancialJuice", "financialjuice.com", "finance", ["https://www.financialjuice.com/feed.ashx"], ()),
    ("WSJ Markets RSS", "wsj.com", "finance", ["https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"], ()),
    ("Benzinga", "benzinga.com", "finance", ["https://www.benzinga.com/feed"], ()),
    ("FT Alphaville", "ft.com", "finance", ["https://www.ft.com/alphaville?format=rss"], ()),
    ("CNBC Markets", "cnbc.com", "finance", ["https://www.cnbc.com/id/15839069/device/rss/rss.html"], ()),
    ("MarketWatch", "marketwatch.com", "finance", ["https://feeds.content.dowjones.io/public/rss/mw_topstories"], ()),
    ("Yahoo Finance", "finance.yahoo.com", "finance", ["https://finance.yahoo.com/news/rss"], ()),
    ("Investing.com News", "investing.com", "finance", ["https://www.investing.com/rss/news.rss"], ()),
    ("Nasdaq News / Market Activity", "nasdaq.com", "finance",
     ["https://www.nasdaq.com/feed/rssoutbound?category=Market%20Activity"], ()),
    ("CoinDesk", "coindesk.com", "editorial", ["https://www.coindesk.com/arc/outboundfeeds/rss/"], ()),
    ("The Block", "theblock.co", "editorial", ["https://www.theblock.co/rss.xml"], ()),
    ("Blockworks", "blockworks.com", "editorial", ["https://blockworks.com/feed"], ()),
    ("DL News", "dlnews.com", "editorial", ["https://www.dlnews.com/arc/outboundfeeds/rss/"], ()),
    ("Unchained", "unchainedcrypto.com", "editorial", ["https://unchainedcrypto.com/feed/"], ()),
    ("Protos", "protos.com", "editorial", ["https://protos.com/feed/"], ()),
    ("The Defiant", "thedefiant.io", "editorial", ["https://thedefiant.io/api/feed"], ()),
    ("Bankless", "bankless.com", "editorial", ["https://www.bankless.com/rss/feed"], ()),
    ("Glassnode Insights", "research.glassnode.com", "editorial", ["https://research.glassnode.com/rss/"], ()),
    ("Chainalysis", "chainalysis.com", "editorial", ["https://www.chainalysis.com/feed/"], ()),
    ("TRM Labs", "trmlabs.com", "editorial", ["https://www.trmlabs.com/resources/blog/rss.xml"], ()),
    ("WuBlockchain / Substack", "wublock.substack.com", "editorial", ["https://wublock.substack.com/feed"], ()),
    ("ZeroHedge", "zerohedge.com", "finance", ["https://cms.zerohedge.com/fullrss2.xml"], ()),
    ("WatcherGuru", "watcher.guru", "editorial", ["https://watcher.guru/news/feed"], ()),
    ("Cointelegraph", "cointelegraph.com", "editorial", ["https://cointelegraph.com/rss"], ()),
    ("Bitcoin Magazine", "bitcoinmagazine.com", "editorial", ["https://bitcoinmagazine.com/feed"], ()),
    ("CryptoPotato", "cryptopotato.com", "editorial", ["https://cryptopotato.com/feed/"], ()),
    ("NewsBTC", "newsbtc.com", "editorial", ["https://www.newsbtc.com/feed/"], ()),
    ("AMBCrypto", "ambcrypto.com", "editorial", ["https://ambcrypto.com/feed/"], ()),
    ("U.Today", "u.today", "editorial", ["https://u.today/rss"], ()),
    ("CoinGape", "coingape.com", "editorial", ["https://coingape.com/feed/"], ()),
    ("Crypto Briefing", "cryptobriefing.com", "editorial", ["https://cryptobriefing.com/feed/"], ()),
    ("The Daily Hodl", "dailyhodl.com", "editorial", ["https://dailyhodl.com/feed/"], ()),
    ("Cryptonews.com", "cryptonews.com", "editorial", ["https://cryptonews.com/news/feed/"], ()),
    ("Bitcoinist", "bitcoinist.com", "editorial", ["https://bitcoinist.com/feed/"], ()),
    ("CoinJournal", "coinjournal.net", "editorial", ["https://coinjournal.net/news/feed/"], ()),
    ("Coinpedia", "coinpedia.org", "editorial", ["https://coinpedia.org/feed/"], ()),
    ("Finbold", "finbold.com", "editorial", ["https://finbold.com/feed/"], ()),
    ("Bitcoin.com News", "news.bitcoin.com", "editorial", ["https://news.bitcoin.com/feed/"], ()),
    ("CNBC Finance", "cnbc.com", "finance", ["https://www.cnbc.com/id/10000664/device/rss/rss.html"], ()),
    ("CNBC Economy", "cnbc.com", "finance", ["https://www.cnbc.com/id/20910258/device/rss/rss.html"], ()),
    ("WSJ US Business", "wsj.com", "finance", ["https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness"], ()),
    ("Seeking Alpha", "seekingalpha.com", "finance", ["https://seekingalpha.com/market_currents.xml"], ()),
    ("Investing.com Crypto", "investing.com", "editorial", ["https://www.investing.com/rss/news_301.rss"], ()),
    ("Investing.com Economy", "investing.com", "finance", ["https://www.investing.com/rss/news_14.rss"], ()),
    ("The Economist Finance", "economist.com", "finance", ["https://www.economist.com/finance-and-economics/rss.xml"], ()),
    ("FT Markets", "ft.com", "finance", ["https://www.ft.com/markets?format=rss"], ()),
    ("FT Companies", "ft.com", "finance", ["https://www.ft.com/companies?format=rss"], ()),
    ("FT Cryptofinance", "ft.com", "editorial", ["https://www.ft.com/cryptofinance?format=rss"], ()),
    ("Bloomberg Markets", "bloomberg.com", "finance", ["https://feeds.bloomberg.com/markets/news.rss"], ()),
    ("Bloomberg Economics", "bloomberg.com", "finance", ["https://feeds.bloomberg.com/economics/news.rss"], ()),
    ("NYT Business", "nytimes.com", "finance", ["https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"], ()),
    ("NYT Economy", "nytimes.com", "finance", ["https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml"], ()),
    ("Guardian Business", "theguardian.com", "finance", ["https://www.theguardian.com/uk/business/rss"], ()),
    ("BBC Business", "bbc.com", "finance", ["https://feeds.bbci.co.uk/news/business/rss.xml"], ()),
    ("Decrypt", "decrypt.co", "editorial", ["https://decrypt.co/feed"], ()),
    ("CryptoSlate", "cryptoslate.com", "editorial", ["https://cryptoslate.com/feed/"], ()),
    ("Tree of Alpha", "treeofalpha.com", "firehose", ["https://news.treeofalpha.com/api/news?limit=400"], ()),
    ("Lookonchain", "lookonchain.com", "firehose",
     ["https://www.lookonchain.com/ashx/index.ashx?type=1&page=1&pageSize=24"], ()),
]

CATEGORIES = (
    ("Security", re.compile(r"\b(hack(ed)?|exploit(ed)?|breach(ed)?|stolen|drain(ed)?|depeg|bankruptcy|insolven(t|cy)|"
                            r"trading suspension|withdrawal halt|bridge pause|chain halt|service outage|emergency pause)\b",
                            re.I)),
    ("Macro", re.compile(r"\b(fomc|interest rate decision|rate decision|cpi|consumer price index|pce|ppi|payroll|"
                         r"employment situation|unemployment report|gdp|monetary policy (decision|statement|report)|"
                         r"central bank decision)\b", re.I)),
    ("Regulation", re.compile(r"\b(sec|cftc|regulator|lawsuit|court|enforcement|sanction|congress|senate|law|ruling)\b",
                              re.I)),
    ("Exchange", re.compile(r"\b(binance|coinbase|kraken|bybit|okx|upbit|bithumb|listing|delisting|exchange)\b", re.I)),
    ("On-Chain", re.compile(r"\b(whale|wallet|transfer(red)?|inflow|outflow|burn(ed)?|liquidat(ed|ion))\b", re.I)),
    ("Macro", re.compile(r"\b(fed|treasury|inflation|tariff|oil|dollar|yield|bond)\b", re.I)),
    ("Markets", re.compile(r"\b(stocks?|equit(y|ies)|nasdaq|s&p|dow|shares?|ipo|etf)\b", re.I)),
)


def category(title, channel):
    return next((name for name, pattern in CATEGORIES if pattern.search(title)),
                {"official": "Macro", "venue": "Exchange", "finance": "Markets"}.get(channel, "Crypto"))


def clean(text):
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(text or "")))).strip()
    return "".join(c for c in text if c.isprintable())[:300]


def when(text, zone=timezone.utc):
    text = str(text or "").strip().replace("Z", "+00:00")
    if text.isdigit():
        return int(text) // 1000 if len(text) > 12 else int(text)
    for parse in (parsedate_to_datetime, datetime.fromisoformat):
        try:
            stamp = parse(text)
        except (TypeError, ValueError):
            continue
        return int((stamp if stamp.tzinfo else stamp.replace(tzinfo=zone)).timestamp())
    return None


def http(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*"})
    with urllib.request.urlopen(request, timeout=8) as response:
        return response.read()


def feed(blob):
    nodes = [n for n in ET.fromstring(blob).iter() if n.tag.rsplit("}", 1)[-1] in ("item", "entry")]
    for node in nodes[:40]:
        title = link = ""
        stamp = None
        for child in node:
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "title" and not title:
                title = clean(child.text)
            elif tag == "link" and not link:
                link = (child.text or child.get("href") or "").strip()
            elif tag in ("pubDate", "published", "updated", "date") and stamp is None:
                stamp = when(child.text)
        yield {"ts": stamp, "title": title, "url": link}


def tree(blob):
    for raw in json.loads(blob):
        title = clean(raw.get("title"))
        author = re.match(r"([^:]{2,60})\(@\w+\):\s*", title)
        headline = title[author.end():] if author else title
        if re.fullmatch(r"https?://\S+", headline):
            continue
        url = str(raw.get("url") or "")
        host = re.sub(r"^www\.", "", urllib.parse.urlsplit(url).hostname or "")
        yield {"ts": int(raw["time"] / 1000), "title": headline if len(headline) >= 8 else title, "url": url,
               "source": author.group(1).strip() if author else host or "Tree of Alpha", "domain": host,
               "feed": "Tree of Alpha"}


def bithumb(blob):
    for notice in json.loads(blob)[:12]:
        yield {"ts": when(notice.get("published_at"), timezone(timedelta(hours=9))), "title": clean(notice.get("title")),
               "url": notice.get("pc_url") or ""}


def binance(blob):
    for article in json.loads(blob)["data"]["catalogs"][0]["articles"]:
        yield {"ts": article["releaseDate"] // 1000, "title": clean(article["title"]),
               "url": "https://www.binance.com/en/support/announcement/" + article["code"]}


def lookonchain(blob):
    for row in json.loads(blob.decode().replace("\\'", "'"))["content"][:24]:
        stamps = [when(v, timezone(timedelta(hours=8))) for k, v in row.items() if "time" in k.lower() or "date" in k.lower()]
        yield {"ts": next((s for s in stamps if s), None), "title": clean(row.get("stitle")), "url": ""}


PARSERS = {"Tree of Alpha": tree, "Binance Announcements": binance, "Bithumb": bithumb, "Lookonchain": lookonchain}


def fetch(source):
    started = time.perf_counter()
    label, domain, _, urls, words = source
    items = []
    failed = 0
    parsed = 0
    for url in urls:
        try:
            rows = list(PARSERS.get(label, feed)(http(url)))
        except Exception as error:
            failed += 1
            print(f"{label} failed: {url} {error!r:.160}", flush=True)
            continue
        parsed += len(rows)
        for row in rows:
            title = row["title"]
            if not title or not row["ts"] or (words and not re.search(
                    r"\b(%s)\b" % "|".join(map(re.escape, words)), title, re.I)):
                continue
            item = {"ts": row["ts"], "source": label, "domain": domain, "title": title,
                    "url": row["url"] if str(row["url"]).startswith("http") else ""}
            item.update({k: v for k, v in row.items() if k in ("source", "domain", "feed")})
            items.append(item)
    status = "error" if failed == len(urls) else "live" if parsed else "delayed"
    return items, status, round((time.perf_counter() - started) * 1000), failed


def cycle():
    t0 = time.time()
    with ThreadPoolExecutor(16) as pool:
        results = list(pool.map(fetch, SOURCES))
    try:
        with open(os.path.join(state, "news.json"), encoding="utf-8") as old:
            previous_data = json.load(old)
            previous = previous_data["items"]
    except FileNotFoundError:
        previous_data = {}
        previous = []
    channel = {s[0]: s[2] for s in SOURCES}
    now = int(time.time())
    seen = set()
    items = []
    for item in sorted([i for rows, _, _, _ in results for i in rows] + previous,
                       key=lambda i: i["ts"], reverse=True):
        keys = {item["url"] or item["source"] + item["title"],
                re.sub(r"\W+", "", item["title"].lower()) + str(item["ts"] // 86400)}
        if now - 7 * 86400 < item["ts"] < now + 900 and not keys & seen:
            seen |= keys
            label = item.get("feed", item["source"])
            if label in channel:
                item["category"] = category(item["title"], channel[label])
            items.append(item)
    counts = Counter(i.get("feed", i["source"]) for i in items)
    sources = [{"label": source[0], "domain": source[1], "status": result[1],
                "count": counts[source[0]], "duration_ms": result[2], "failed": result[3]}
               for source, result in zip(SOURCES, results)]
    finished = int(time.time() * 1000)
    with open(os.path.join(state, "news.tmp"), "w", encoding="utf-8") as out:
        json.dump({"at": finished,
                   "interval_ms": finished - previous_data["at"] if previous_data else None,
                   "duration_ms": round((time.time() - t0) * 1000),
                   "sources": sources, "items": items}, out,
                  ensure_ascii=False, separators=(",", ":"))
    os.replace(os.path.join(state, "news.tmp"), os.path.join(state, "news.json"))
    live = sum(1 for s in sources if s["status"] == "live")
    fetched = icons({s[1] for s in SOURCES} | {i["domain"] for i in items if i["domain"]})
    print(f"{len(items)} items from {live}/{len(sources)} live sources, {fetched} icons, in {time.time() - t0:.1f} s",
          flush=True)


def icons(domains):
    folder = os.path.join(state, "favicons")
    os.makedirs(folder, exist_ok=True)
    for name in os.listdir(folder):
        if name[:-4] not in domains:
            os.remove(os.path.join(folder, name))
    todo = [d for d in sorted(domains) if re.fullmatch(r"[a-z0-9.-]{4,64}", d)
            and not os.path.exists(os.path.join(folder, d + ".png"))]

    def icon(domain):
        try:
            blob = http("https://www.google.com/s2/favicons?domain=%s&sz=64" % domain)
        except Exception:
            return False
        path = os.path.join(folder, domain + ".png")
        with open(path + ".tmp", "wb") as out:
            out.write(blob)
        os.replace(path + ".tmp", path)
        return True

    with ThreadPoolExecutor(16) as pool:
        return sum(pool.map(icon, todo))


def enabled():
    with open(news_control) as file:
        return file.read(1) == "1"


if __name__ == "__main__":
    last = 0
    while True:
        if time.time() - last >= 120 and enabled():
            cycle()
            last = time.time()
        time.sleep(5)
