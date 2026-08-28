import sys

import account
import basis
import binance
import market
import position

action = sys.argv[1]

if action == "state":
    binance.state()
elif action == "account":
    account.account()
elif action == "orders":
    binance.orders()
elif action == "spot":
    binance.spot(sys.argv)
elif action == "fut":
    binance.fut(sys.argv)
elif action == "lev":
    binance.lev(sys.argv)
elif action == "check":
    binance.check(sys.argv)
elif action == "margin":
    binance.margin(sys.argv)
elif action == "move":
    binance.move(sys.argv)
elif action == "borrow":
    binance.borrow_asset(sys.argv[2], sys.argv[3])
elif action == "repay":
    binance.repay(sys.argv)
elif action == "quote":
    market.quote(sys.argv)
elif action == "scan":
    market.scan(sys.argv)
elif action == "table":
    market.table(sys.argv)
elif action == "board":
    market.board(sys.argv)
elif action == "events":
    market.events(sys.argv)
elif action == "volume":
    market.volume(sys.argv)
elif action == "feed":
    market.feed(sys.argv)
elif action == "view":
    market.view(sys.argv)
elif action == "auto":
    basis.auto(sys.argv)
elif action == "nbasis":
    basis.nbasis(sys.argv)
elif action == "rbasis":
    basis.rbasis(sys.argv)
elif action == "long":
    position.long(sys.argv)
elif action == "short":
    position.short(sys.argv)
else:
    raise SystemExit("unknown action: " + action)
