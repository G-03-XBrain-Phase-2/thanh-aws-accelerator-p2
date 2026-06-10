const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
});

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "observability-demo",
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();