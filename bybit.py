import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

import boto3


secret = json.loads(
    boto3.client("secretsmanager", region_name="ap-south-1")
    .get_secret_value(SecretId="Trader/Bybit")["SecretString"]
)
API_KEY = secret["BYBIT_API_KEY"]
API_SECRET = secret["BYBIT_API_SECRET"]
BASE = "https://api.bybit.com"
RECV_WINDOW = "5000"


def get(path, params=None):
    query = urllib.parse.urlencode(params or {})
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        API_SECRET.encode(),
        (timestamp + API_KEY + RECV_WINDOW + query).encode(),
        hashlib.sha256,
    ).hexdigest()
    request = urllib.request.Request(
        BASE + path + ("?" + query if query else ""),
        headers={
            "X-BAPI-API-KEY": API_KEY,
            "X-BAPI-TIMESTAMP": timestamp,
            "X-BAPI-RECV-WINDOW": RECV_WINDOW,
            "X-BAPI-SIGN": signature,
        },
    )
    response = json.load(urllib.request.urlopen(request, timeout=10))
    if response["retCode"] != 0:
        raise SystemExit(f"Bybit rejected {path}: {response['retCode']} {response['retMsg']}")
    return response["result"]


if __name__ == "__main__":
    info = get("/v5/user/query-api")
    print("BYBIT", info["note"], "READ-WRITE" if info["readOnly"] == 0 else "READ-ONLY")
    print("IPS", ",".join(info["ips"]))
    print("PERMISSIONS", json.dumps(info["permissions"], separators=(",", ":"), sort_keys=True))
