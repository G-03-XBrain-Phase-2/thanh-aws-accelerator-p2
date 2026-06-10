const express = require("express");
const client = require("prom-client");

const app = express();
const port = process.env.PORT || 3000;

client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5]
});

function observe(route, handler) {
  return async (req, res) => {
    const end = httpRequestDuration.startTimer();
    try {
      await handler(req, res);
    } finally {
      const status = String(res.statusCode);
      httpRequestsTotal.inc({ method: req.method, route, status });
      end({ method: req.method, route, status });
    }
  };
}

app.get("/", observe("/", async (req, res) => {
  res.send("Observability demo app");
}));

app.get("/health", observe("/health", async (req, res) => {
  res.json({ status: "ok" });
}));

app.get("/slow", observe("/slow", async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 800));
  res.json({ message: "slow response" });
}));

app.get("/error", observe("/error", async (req, res) => {
  res.status(500).json({ error: "simulated error" });
}));

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(port, () => {
  console.log(`observability-demo listening on port ${port}`);
});