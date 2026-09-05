# ack.py: times the futures order lane from this host. Five rounds of one post-only limit buy of 0.01 ETH placed
# 4% under the mark, which cannot fill, then its cancel; prints each acknowledgement time, then checks that no
# order is left open. Zero fill, zero fee. python3 ack.py
import asyncio
import hashlib
import hmac
import sys
import time
import urllib.request

import orjson
import uvloop
from picows import WSListener, WSMsgType, ws_connect

from binance import API_KEY, API_SECRET, FAPI, get

symbol = "ETHUSDT"
mark = float(orjson.loads(urllib.request.urlopen(FAPI + f"/fapi/v1/premiumIndex?symbol={symbol}", timeout=10).read())["markPrice"])
price = f"{mark * 0.96:.2f}"


class Lane(WSListener):
    def __init__(self):
        self.waiting, self.sent = {}, 0

    def on_ws_frame(self, transport, frame):
        reply = orjson.loads(frame.get_payload_as_memoryview())
        future = self.waiting.pop(reply.get("id"), None)
        if future is not None and not future.done():
            future.set_result((reply, time.perf_counter_ns()))


def signed(params):
    p = dict(params, apiKey=API_KEY, timestamp=int(time.time() * 1000))
    payload = "&".join(f"{k}={v}" for k, v in sorted(p.items()))
    p["signature"] = hmac.new(API_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return p


async def ask(transport, lane, method, params):
    lane.sent += 1
    key = str(lane.sent)
    future = lane.waiting[key] = asyncio.get_running_loop().create_future()
    t0 = time.perf_counter_ns()
    transport.send(WSMsgType.TEXT, orjson.dumps({"id": key, "method": method, "params": signed(params)}))
    reply, t1 = await asyncio.wait_for(future, 10)
    return reply, (t1 - t0) / 1e6


async def main():
    transport, lane = await ws_connect(Lane, "wss://ws-fapi.binance.com/ws-fapi/v1")
    await ask(transport, lane, "order.status", {"symbol": symbol, "orderId": 1})  # a signed round trip warms the lane
    print(f"{symbol} post-only buy 0.01 at {price}, mark {mark:.2f}", flush=True)
    failed = False
    for round_ in range(1, 6):
        reply, ms = await ask(transport, lane, "order.place", {"symbol": symbol, "side": "BUY", "type": "LIMIT", "timeInForce": "GTX",
                                                             "quantity": "0.01", "price": price, "newOrderRespType": "RESULT"})
        if reply["status"] != 200:
            print(f"round {round_}: place refused {reply.get('error')}", flush=True)
            failed = True
            break
        order = reply["result"]
        print(f"round {round_}: place ack {ms:.2f} ms, status {order['status']}, orderId {order['orderId']}", flush=True)
        if order["status"] != "NEW":
            continue
        reply, ms = await ask(transport, lane, "order.cancel", {"symbol": symbol, "orderId": order["orderId"]})
        if reply["status"] != 200:
            print(f"CANCEL FAILED orderId {order['orderId']}: {reply.get('error')}", flush=True)
            failed = True
            break
        print(f"round {round_}: cancel ack {ms:.2f} ms, status {reply['result']['status']}", flush=True)
        await asyncio.sleep(0.5)
    transport.disconnect()
    open_orders = get(FAPI + "/fapi/v1/openOrders", {"symbol": symbol})
    print(f"open {symbol} orders on Binance now: {len(open_orders)}", flush=True)
    sys.exit(1 if failed or open_orders else 0)


uvloop.run(main())
