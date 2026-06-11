import os
import random
from flask import Flask, jsonify
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
PrometheusMetrics(app)

ERROR_RATE = float(os.getenv("ERROR_RATE", "0"))
VERSION = os.getenv("VERSION", "v1")
MESSAGE = os.getenv("MESSAGE", "hello from argocd-test")


@app.get("/")
def index():
    if random.random() < ERROR_RATE:
        return jsonify(error="injected", version=VERSION), 500

    return jsonify(ok=True, message=MESSAGE, service="backend", version=VERSION)


@app.get("/healthz")
def healthz():
    return "ok", 200
