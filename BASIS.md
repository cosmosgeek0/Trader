# Basis: where Trader stands and why the direction changed

Written 2026-09-06 for any chat or person starting on this repository, and checked sentence by sentence by an Astra GPT-6 critic against the day's records before it was committed. Figures come from five different sources, named each time: host measurements, Binance's own records, Glassnode's public monitor, paper runs, and the owner's report. Nothing here is a claim of profit.

## What Trader is now

One thing: the Binance basis, spot against USDT perpetual, on the same exchange. The website's other tabs are not the project. The website exists because it was already built; the Basis tab is the only tab that matters, and it now runs on the new host. Volume, news, network, logs, machine, account: not the direction.

## What changed, in order

1. Old live record (Binance records): the old runner made eight real cycles on 2026-08-28, all losses, −6.52 USDT in total. Old-host HTTP order round trips were 3.5 ms for futures and 6.5 ms for spot (host measurement). The paper feed of that time had a separate 19 ms deliberate wait before taking a crossing (its own code). The chats of 2026-09-04 and 2026-09-05 concluded from that record that the trade had no edge; the owner refused the conclusion and demanded measurement (chat record).
2. Several measured parts of the path turned out far shorter than the 3 ms a builder had called the floor. Of the three Tokyo zones shown by Glassnode's monitor, zone id apne1-az4 had the lowest websocket ping round trip to the futures endpoint: 0.27 ms, against 2.35 ms from the old host's zone (Glassnode, read in a browser on 2026-09-05). A new host was running in that zone by 2026-09-05; our own box there measured warm ping medians of 0.70 ms on futures and 1.04 ms on spot. None of this establishes a floor for the complete trading path.
3. Paper tab (read on the old host at 15:17 UTC on 2026-09-05): +66.13 USDT on closed positions that day and −6.16 on eight positions still open, about +60 combined; the closed total excludes losses on positions still open. The owner reported around 120 USDT the next day; the builder did not check that reading.
4. On 2026-09-05 the first real orders were placed from the new host at about 20 USDT a leg. All entry legs filled at the seen prices. The completed cycles lost money at the exit. Details below.

## The host, measured

- `i-0b3f6321572cb5f88`, c7i.large, zone id apne1-az4, fixed IP 52.194.194.36, reached with `ssh az4`. The old host `i-007520206c48bb9b6` was stopped on 2026-09-05 23:09 UTC; its disk and IP are kept until 2026-09-12.
- Feed, three raced websocket connections per venue, first copy wins: host arrival time minus Binance's event stamp was 1.2 ms median and 2.0 ms p99 for futures book updates. A BTC spot trade sample had a median of 0.7 to 0.9 ms; spot book updates carry no stamp, so their delay is not measured. Frame handling 1 to 4 µs median, 20 to 23 µs p99. Steady loop lateness p99 under 1 ms.
- Other feeds, compared on matching update ids, 60-second samples over ten symbols: the binary SBE feed arrived 48 µs later than the JSON websocket at the median and first 48% of the time; FIX market data arrived 93 µs later and first 26% of the time. These samples do not rule out a faster path. Among three, five and eight raced full-stream copies, three had the lowest loop lateness; five and eight made it much worse on this two-vCPU box. Splitting subscriptions into groups of 91 streams showed no gain. In a separate 20-second test by an independent critic, the earliest of three connections carrying only BTC and ETH led one all-USDT connection by 0.93 ms on BTC futures and 0.74 ms on ETH futures; subscription size and copy count both differed, and it is untested for the coins that carry the crossings.
- Order lane, warm websocket: signed spot order tests answered in 0.77 ms median; order tests do not reach the matching engine. Futures ping 0.70 ms median. Real orders: Binance's own stamps put acceptance 0 to 1 ms after our send, at millisecond resolution. In two same-connection tests with a read-only Ed25519 key, session login reduced the spot response median by about 0.15 ms; futures showed no consistent difference. Using it for orders needs a trading key the owner has not created.
- Not tested here: CPU sleep depth, interrupt coalescing and busy polling. They need the owner's approval before any change.

## The live shots, on Binance's records

Program: `shots.py`. It watches every coin traded as both spot and perpetual, fires when the perp bid clears the spot ask by more than this account's four taker fees (0.24% with BNB) and the crossing still stands 2 ms later, sends a spot limit IOC buy and a perp limit IOC sell at the seen prices, 20 USDT a leg, holds by an exit rule, then closes at market.

- 2026-09-05 21:02 to 21:05 UTC, old host: three MITO shots. Binance's orders and trades reconstruct cycle results of −0.050, −0.035 and −0.034 USDT after the 60 s exits, before fees.
- 2026-09-05 21:16 to 21:24 UTC, new host: seven shots on MITO and TST. All 14 entry legs filled at exactly the seen prices, with entry edges of +0.06 to +0.08 USDT each (0.31 to 0.40% gross). Binance accepted each order 0 to 1 ms after send. Shots 5 to 7 fired on perp frames 26 ms to 3.8 s old, so this sample does not establish fills on brief crossings. Every position exited at market after 60 s. Together the cycles lost 0.2050 USDT before fees and 0.5412 after fees.
- What the sample shows: on standing crossings, the fills were the prices seen and the orders landed within a millisecond. What it does not show: any profit, or any fill on a crossing that lives milliseconds.
- A later fifteen-minute sample on ten coins: five premium episodes exceeded 0.24%; none reached the close-back condition, perp ask at or below spot bid, within the window. MITO's gap stayed at 0.40 to 0.52% for the whole 905 s; the readings at the time put the index 0.73% above Binance spot mid and the perp mark 0.1 to 0.2% below the index, with a negative funding rate, the short paying. TST's funding-rate reading was +0.0636% for a four-hour interval, which would pay the short at settlement; no funding receipt is established yet.
- A one-shot funding test started at 23:00 UTC on 2026-09-05: enter only a coin with positive funding, hold through 00:00 UTC. Its result was unknown when this was written; it is appended below when known.

## The paper replay, and what it is worth

`gap.py` watches the same 362 pairs and replays every crossing against loop times of 0.5 to 5 ms, per leg, under a market model and a limit-IOC model, with a borrow check for the reverse side. In 15-, 30- and 20-minute windows on a Saturday, the IOC model assigned negative values to first-sight entries in every tested bucket; at a 2 ms confirmation it declared both legs filled on 90 to 97% of fires; no exit was modeled; for 94 to 96% of reverse fires the borrow check returned zero. An independent critic listed fifteen defects in that valuation, among them sizing chosen at landing, fills declared from price alone, one-leg flatten timing, no exit, capital reused across overlapping crossings, borrow read as pool inventory. Which of them are fixed is recorded in the commit history of `gap.py`, not here. Treat every replay number as paper.

## How money runs

Only through `run.txt`, executed by the owner's runner on the live host (a first line `@HOST` names another host). Legs are 10 to 30 USDT until the owner says otherwise. No chat places an order by hand. Read-only checks run with `ssh az4`.

## Files

- `gap.py`: watch and replay, no orders.
- `shots.py`: real tiny shots with the exit rules close, edge, fund, and a journal at `/home/ssm-user/shots.log` on the host.
- `basis.py`: the single-coin cycle program with the same 2 ms trigger and market orders, kept.
- `ack.py`: written to time the futures order lane with post-only orders; its behavior is not verified in this record.
- `market.py events`: the paper feed behind the Basis tab.
- `AGENTS.md`: the rules. Its first two sections exist because of this week: attack every claim, and do the narrow thing.

## What is not proven

- Any profit, on any rule, live.
- Whether holding across a funding settlement pays more than the exit costs.
- Whether crossings that live under 2 ms hold money a faster loop could take; the current IOC replay assigns them negative values at first sight, but it does not model completed cycles.
- Live fills above about 20 USDT a leg; available size above that is not established.

## The lesson that governs the work

In this week's chats a builder called 3 ms the floor of the loop, and by the owner's account earlier builders had called 20 ms the floor; the measured parts of the path then came in far under both. The tests found delays that could be cut; they did not establish the fastest possible loop. The rule now: no limit is stated without a measurement on this host or a dated source read in full, every number carries its source, and the owner's last instruction is the whole task.
