#!/usr/bin/env python3
"""
Local mock of the AutomationExercise API used by the k6 scripts.

Why: heavy load profiles should never be pointed at a public site we don't own. The mock lets the
scripts, thresholds and CI pipeline be exercised end to end, including realistic latency and an
optional error rate, with zero impact on anyone else.

Run:  python3 mock/mock_server.py --port 8080 --latency-ms 40 --jitter-ms 30 --error-rate 0
"""
import argparse
import json
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

CATEGORIES = [("Women", "Tops"), ("Women", "Dress"), ("Women", "Saree"), ("Men", "Tshirts"),
              ("Men", "Jeans"), ("Kids", "Dress"), ("Kids", "Tops & Shirts")]
BRANDS = ["Polo", "H&M", "Madame", "Mast & Harbour", "Babyhug", "Allen Solly Junior", "Kookie Kids", "Biba"]
NAMES = ["Blue Top", "Men Tshirt", "Sleeveless Dress", "Stylish Dress", "Winter Top", "Summer White Top",
         "Madame Top For Women", "Fancy Green Top", "Sleeves Printed Top", "Halter Top", "Sleeves Top and Short",
         "Cotton Saree", "Rust Red Saree", "Beautiful Peacock Blue Cotton Saree", "Lace Top For Women",
         "Soft Stretch Jeans", "Regular Fit Straight Jeans", "Grunt Blue Slim Fit Jeans", "Polo Shirt",
         "Pure Cotton V-Neck T-Shirt", "Green Side Placket Detail T-Shirt", "Premium Polo T-Shirts",
         "Pure Cotton Neon Green Tshirt", "Colour Blocked Shirt", "Kids Printed Dress", "Little Girls Mr. Panda Shirt",
         "Sleeveless Unicorn Patch Gown", "Cotton Mull Embroidered Dress", "Blue Cotton Indie Mickey Dress",
         "Long Maxi Tulle Fancy Dress", "Sleeveless Unicorn Print Fit", "Printed Off Shoulder Top",
         "Frozen Tops For Kids", "Full Sleeves Top Cherry"]

PRODUCTS = []
for i, name in enumerate(NAMES, start=1):
    usertype, category = CATEGORIES[i % len(CATEGORIES)]
    PRODUCTS.append({
        "id": i,
        "name": name,
        "price": f"Rs. {random.Random(i).randint(3, 30) * 100}",
        "brand": BRANDS[i % len(BRANDS)],
        "category": {"usertype": {"usertype": usertype}, "category": category},
    })

USERS = {}
USERS_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "AEMock/1.0"

    def log_message(self, *args):  # keep output quiet under load
        pass

    def _form(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode() if length else ""
        return {k: v[0] for k, v in parse_qs(raw).items()}

    def _send(self, payload):
        cfg = self.server.cfg
        time.sleep(max(0, (cfg.latency_ms + random.uniform(-cfg.jitter_ms, cfg.jitter_ms)) / 1000))
        if random.random() < cfg.error_rate:
            self.send_response(503)
            self.end_headers()
            return
        body = json.dumps(payload).encode()
        self.send_response(200)  # like the real API: HTTP 200, real status in responseCode
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/productsList":
            return self._send({"responseCode": 200, "products": PRODUCTS})
        if url.path == "/api/brandsList":
            return self._send({"responseCode": 200,
                               "brands": [{"id": p["id"], "brand": p["brand"]} for p in PRODUCTS]})
        if url.path == "/api/getUserDetailByEmail":
            email = parse_qs(url.query).get("email", [""])[0]
            if not email:
                return self._send({"responseCode": 400, "message": "Bad request, email parameter is missing in GET request."})
            with USERS_LOCK:
                user = USERS.get(email)
            if not user:
                return self._send({"responseCode": 404, "message": "Account not found with this email, try another email!"})
            safe = {k: v for k, v in user.items() if k != "password"}
            return self._send({"responseCode": 200, "user": safe})
        if url.path == "/health":
            return self._send({"status": "ok"})
        return self._send({"responseCode": 404, "message": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        form = self._form()
        if path == "/api/productsList":
            return self._send({"responseCode": 405, "message": "This request method is not supported."})
        if path == "/api/searchProduct":
            term = form.get("search_product")
            if term is None:
                return self._send({"responseCode": 400,
                                   "message": "Bad request, search_product parameter is missing in POST request."})
            t = term.lower()
            hits = [p for p in PRODUCTS if t in p["name"].lower() or t in p["category"]["category"].lower()
                    or t in p["category"]["usertype"]["usertype"].lower()]
            return self._send({"responseCode": 200, "products": hits})
        if path == "/api/createAccount":
            email = form.get("email")
            with USERS_LOCK:
                if email in USERS:
                    return self._send({"responseCode": 400, "message": "Email already exists!"})
                USERS[email] = form
            return self._send({"responseCode": 201, "message": "User created!"})
        if path == "/api/verifyLogin":
            email, password = form.get("email"), form.get("password")
            if not email or not password:
                return self._send({"responseCode": 400,
                                   "message": "Bad request, email or password parameter is missing in POST request."})
            with USERS_LOCK:
                user = USERS.get(email)
            ok = user is not None and user.get("password") == password
            return self._send({"responseCode": 200, "message": "User exists!"} if ok
                              else {"responseCode": 404, "message": "User not found!"})
        return self._send({"responseCode": 404, "message": "Not found"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        form = self._form()
        if path == "/api/deleteAccount":
            email, password = form.get("email"), form.get("password")
            with USERS_LOCK:
                user = USERS.get(email)
                if user and user.get("password") == password:
                    del USERS[email]
                    return self._send({"responseCode": 200, "message": "Account deleted!"})
            return self._send({"responseCode": 404, "message": "Account not found!"})
        return self._send({"responseCode": 404, "message": "Not found"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 inside Docker")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--latency-ms", type=float, default=40)
    parser.add_argument("--jitter-ms", type=float, default=30)
    parser.add_argument("--error-rate", type=float, default=0.0, help="0.02 = 2%% of requests return 503")
    cfg = parser.parse_args()
    server = ThreadingHTTPServer((cfg.host, cfg.port), Handler)
    server.cfg = cfg
    print(f"Mock API on http://{cfg.host}:{cfg.port} (latency {cfg.latency_ms}±{cfg.jitter_ms} ms, "
          f"error rate {cfg.error_rate:.0%})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
