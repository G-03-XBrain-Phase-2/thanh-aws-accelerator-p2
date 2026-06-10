# W9 Day B - Observability: SLI/SLO, OpenTelemetry, Prometheus, Grafana, Loki, Tempo

Thư mục này là lab Observability cho Kubernetes. Mục tiêu không chỉ là cài tool cho chạy, mà là hiểu được:

```text
Vì sao hệ thống lỗi?
Lỗi xảy ra ở đâu?
Lỗi ảnh hưởng bao nhiêu user/request?
Request chậm ở đoạn nào?
Có đang vi phạm SLO không?
Nếu alert bắn thì xử lý từ đâu?
```

Lab này gồm 3 luồng telemetry chính:

```text
Metrics  -> Prometheus -> Grafana
Logs     -> Promtail   -> Loki  -> Grafana
Traces   -> OTel SDK   -> OTel Collector -> Tempo -> Grafana
```

## 1. Cấu Trúc Thư Mục

```text
cloud/w9/day-b/
├── README.md
├── app/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── tracing.js
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── servicemonitor.yaml
│   └── kustomization.yaml
└── observability/
    ├── loki-values.yaml
    ├── otel-collector.yaml
    └── slo-rules.yaml
```

Vai trò từng phần:

| Đường dẫn | Vai trò |
|---|---|
| `app/server.js` | App Node.js demo, có endpoint `/`, `/health`, `/slow`, `/error`, `/metrics` |
| `app/tracing.js` | Cấu hình OpenTelemetry SDK để gửi traces |
| `app/Dockerfile` | Build image `observability-demo:v1` |
| `k8s/deployment.yaml` | Chạy app trong Kubernetes |
| `k8s/service.yaml` | Tạo Service để app có DNS và port ổn định |
| `k8s/servicemonitor.yaml` | Nói cho Prometheus biết cách scrape `/metrics` |
| `observability/loki-values.yaml` | Values Helm để cài Loki local bằng filesystem |
| `observability/otel-collector.yaml` | Cài OTel Collector nhận trace từ app và gửi sang Tempo |
| `observability/slo-rules.yaml` | PrometheusRule cho multi-window burn rate alert |

## 2. Observability Là Gì?

Observability là khả năng hiểu trạng thái bên trong hệ thống thông qua dữ liệu hệ thống phát ra bên ngoài.

Ba loại dữ liệu quan trọng nhất:

| Loại | Trả lời câu hỏi | Tool trong lab |
|---|---|---|
| Metrics | Hệ thống đang khỏe hay yếu? Lỗi bao nhiêu? Latency bao nhiêu? | Prometheus |
| Logs | Chính xác chuyện gì đã xảy ra? Error message là gì? | Loki |
| Traces | Một request đi qua những đoạn nào, đoạn nào chậm/lỗi? | Tempo |

Câu nhớ nhanh:

```text
Metrics cho biết "bao nhiêu".
Logs cho biết "chuyện gì".
Traces cho biết "đường đi và chậm ở đâu".
```

Ví dụ khi user báo "app chậm":

```text
1. Xem metrics: latency P95 có tăng không?
2. Xem logs: có error/timeout không?
3. Xem traces: request chậm ở handler, DB, hay service khác?
```

## 3. Monitoring vs Observability

Monitoring thường là theo dõi các tín hiệu đã biết trước:

```text
CPU cao không?
Pod có restart không?
Error rate có tăng không?
Latency P95 bao nhiêu?
```

Observability rộng hơn:

```text
Tại sao một request cụ thể bị chậm?
Service nào gây lỗi?
Lỗi chỉ xảy ra với route nào?
Sau deploy version mới, endpoint nào xấu đi?
```

Monitoring là một phần của Observability.

## 4. Kiến Trúc Lab

Kiến trúc tổng thể:

```text
                         ┌────────────────────┐
                         │      Grafana       │
                         │ dashboard/explore  │
                         └───────┬─────┬──────┘
                                 │     │
                 metrics query   │     │ logs/traces query
                                 │     │
             ┌───────────────────┘     └─────────────────────┐
             │                                               │
   ┌─────────▼─────────┐                         ┌───────────▼───────────┐
   │    Prometheus     │                         │     Loki / Tempo       │
   │ scrape /metrics   │                         │ logs / traces storage  │
   └─────────┬─────────┘                         └───────────▲───────────┘
             │                                               │
             │ scrape                                        │ push
             │                                               │
   ┌─────────▼─────────┐       traces        ┌────────────────┴──────────┐
   │ observability app │────────────────────►│      OTel Collector       │
   │ port 3000         │                     │ receive OTLP 4317/4318    │
   └─────────┬─────────┘                     └───────────────────────────┘
             │
             │ stdout logs
             ▼
       Kubernetes logs
             │
             ▼
         Promtail
             │
             ▼
           Loki
```

Trong lab:

```text
Namespace app:        observability-demo
Namespace monitoring: monitoring
App service:          observability-demo.observability-demo.svc.cluster.local:3000
OTel collector:       otel-collector.observability-demo.svc.cluster.local:4318
Tempo service:        tempo.monitoring.svc.cluster.local:3200, 4318
Loki gateway:         loki-gateway.monitoring.svc.cluster.local
Grafana local:        localhost:3001 qua port-forward
Prometheus local:     localhost:9090 qua port-forward
```

## 5. App Demo Làm Gì?

App Node.js có các endpoint:

| Endpoint | Ý nghĩa |
|---|---|
| `/` | Trả text đơn giản |
| `/health` | Health check |
| `/slow` | Giả lập request chậm khoảng 800ms |
| `/error` | Giả lập lỗi HTTP 500 |
| `/metrics` | Expose Prometheus metrics |

App tạo metrics bằng package `prom-client`:

```text
http_requests_total
http_request_duration_seconds
```

App tạo traces bằng OpenTelemetry SDK trong `tracing.js`.

App tạo logs bằng `console.log()` trong middleware request log.

Ví dụ log:

```json
{"method":"GET","path":"/slow","status":200,"duration_ms":802}
```

## 6. Metrics Flow: App -> Prometheus -> Grafana

Luồng metrics:

```text
App expose /metrics ở port 3000
        ↓
Kubernetes Service đặt tên port là http
        ↓
ServiceMonitor chọn Service có label app=observability-demo
        ↓
Prometheus Operator tạo scrape config
        ↓
Prometheus scrape /metrics mỗi 15s
        ↓
Grafana query Prometheus
```

### Vì Sao Prometheus Biết Port 3000?

Trong `service.yaml`:

```yaml
ports:
  - name: http
    port: 3000
    targetPort: 3000
```

Trong `servicemonitor.yaml`:

```yaml
endpoints:
  - port: http
    path: /metrics
    interval: 15s
```

ServiceMonitor không ghi trực tiếp `3000`. Nó ghi:

```text
port: http
```

Prometheus Operator sẽ tìm Service port có `name: http`, rồi biết port thật là `3000`.

Nếu Service thiếu `name: http`, Prometheus sẽ không scrape được.

Đây là lỗi bạn đã gặp trước đó.

### Các Label Khớp Nhau Như Thế Nào?

Deployment tạo Pod có label:

```yaml
labels:
  app: observability-demo
```

Service chọn Pod bằng:

```yaml
selector:
  app: observability-demo
```

ServiceMonitor chọn Service bằng:

```yaml
selector:
  matchLabels:
    app: observability-demo
```

Service có label:

```yaml
metadata:
  labels:
    app: observability-demo
```

Luồng chọn resource:

```text
ServiceMonitor chọn Service app=observability-demo
Service chọn Pod app=observability-demo
Prometheus scrape Service port http -> Pod port 3000 -> /metrics
```

## 7. Logs Flow: App -> Kubernetes Logs -> Promtail -> Loki -> Grafana

Luồng logs:

```text
console.log() trong Node.js app
        ↓
stdout của container
        ↓
Kubernetes lưu log pod trên node
        ↓
Promtail chạy dạng agent/DaemonSet đọc log pod
        ↓
Promtail đẩy log sang Loki
        ↓
Grafana query Loki bằng LogQL
```

### Loki Có Biết Port 3000 Không?

Không.

Loki không scrape port `3000`.

Loki không gọi `/metrics`.

Loki nhận logs từ Promtail. Promtail đọc stdout/stderr của container thông qua log file mà Kubernetes/container runtime ghi trên node.

Vì vậy:

```text
Prometheus cần biết app port 3000 để scrape /metrics.
Loki không cần biết app port 3000 để lấy logs.
```

### Vì Sao Query Loki Có Label `namespace`?

Promtail khi đọc log Kubernetes sẽ gắn metadata của Pod vào log stream, ví dụ:

```text
namespace
pod
container
app
job
```

Vì vậy trong Grafana Explore có thể query:

```logql
{namespace="observability-demo"}
```

hoặc:

```logql
{namespace="observability-demo"} |= "/error"
```

LogQL cơ bản:

| Query | Ý nghĩa |
|---|---|
| `{namespace="observability-demo"}` | Lấy toàn bộ log trong namespace |
| `{namespace="observability-demo"} |= "500"` | Log có chứa `500` |
| `{namespace="observability-demo"} |= "/slow"` | Log request `/slow` |
| `{namespace="observability-demo"} != "health"` | Loại log chứa `health` |

## 8. Traces Flow: App -> OTel Collector -> Tempo -> Grafana

Luồng traces:

```text
tracing.js khởi tạo OTel SDK
        ↓
auto-instrument Express/HTTP
        ↓
mỗi request tạo trace/span
        ↓
app gửi trace OTLP HTTP tới OTel Collector port 4318
        ↓
OTel Collector batch và export trace tới Tempo port 4318
        ↓
Grafana query Tempo qua port 3200
```

### Trace Là Gì?

Trace là toàn bộ hành trình của một request.

Ví dụ request `/slow`:

```text
Trace: GET /slow
  └── Span: express middleware
      └── Span: route handler /slow
```

Nếu là microservices thực tế:

```text
Trace: checkout request
  ├── frontend -> backend
  ├── backend -> payment-service
  ├── backend -> inventory-service
  └── backend -> database
```

### Span Là Gì?

Span là một đoạn công việc trong trace.

Span có thể có:

```text
name
start time
duration
status
attributes
trace_id
span_id
parent_span_id
```

Ví dụ:

```text
Span name: GET /slow
Duration: 805ms
Status: OK
service.name: observability-demo
```

### OTel SDK Làm Gì?

Trong `tracing.js`:

```js
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "observability-demo",
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()]
});
```

Ý nghĩa:

| Field | Ý nghĩa |
|---|---|
| `serviceName` | Tên service xuất hiện trong trace |
| `traceExporter` | Nơi app gửi trace |
| `getNodeAutoInstrumentations()` | Tự instrument HTTP/Express/Node libraries |

Trong Deployment:

```yaml
env:
  - name: OTEL_SERVICE_NAME
    value: observability-demo
  - name: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    value: http://otel-collector.observability-demo.svc.cluster.local:4318/v1/traces
```

Nghĩa là app gửi traces tới:

```text
OTel Collector service
namespace observability-demo
port 4318
path /v1/traces
```

### OTel Collector Làm Gì?

OTel Collector là trung gian.

Nó có 3 khối chính:

```text
receivers  -> nhận telemetry
processors -> xử lý telemetry
exporters  -> gửi telemetry đi nơi khác
```

Trong lab:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  debug:
    verbosity: detailed
  otlphttp/tempo:
    endpoint: http://tempo.monitoring.svc.cluster.local:4318
```

Ý nghĩa:

| Thành phần | Ý nghĩa |
|---|---|
| `otlp grpc 4317` | Nhận telemetry theo OTLP gRPC |
| `otlp http 4318` | Nhận telemetry theo OTLP HTTP |
| `batch` | Gom nhiều telemetry rồi gửi theo batch |
| `debug` | In telemetry ra log Collector để debug |
| `otlphttp/tempo` | Gửi trace sang Tempo bằng OTLP HTTP |

Pipeline:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug, otlphttp/tempo]
```

Nghĩa là:

```text
Trace đi vào receiver otlp
        ↓
qua processor batch
        ↓
được gửi ra debug log và Tempo
```

## 9. Loki vs Tempo: Sao Cả Hai Đều "Xem Được Lỗi"?

Loki và Tempo không giống nhau.

| Tool | Lưu gì? | Dùng để hỏi gì? |
|---|---|---|
| Loki | Logs | App đã log dòng gì? Error message là gì? |
| Tempo | Traces | Request đi qua đâu? Span nào chậm/lỗi? |

Ví dụ request `/error`:

Trong Loki bạn thấy log:

```json
{"method":"GET","path":"/error","status":500,"duration_ms":3}
```

Trong Tempo bạn thấy trace:

```text
GET /error
duration: 3ms
status: error
service.name: observability-demo
```

Loki giống "nhật ký sự kiện".

Tempo giống "bản đồ hành trình của request".

### Sao Không Dùng Một Cái Thôi?

Vì chúng trả lời câu hỏi khác nhau.

Nếu chỉ dùng logs:

```text
Bạn biết có lỗi 500, nhưng khó biết request đi qua service nào và chậm ở span nào.
```

Nếu chỉ dùng traces:

```text
Bạn biết request chậm ở span nào, nhưng có thể thiếu error message chi tiết từ app.
```

Thực tế nên dùng cả 3:

```text
Metrics báo vấn đề.
Logs cho chi tiết lỗi.
Traces chỉ vị trí chậm/lỗi trong luồng request.
```

## 10. Vì Sao Thấy Cài Nhiều Grafana?

Bạn không thật sự cần nhiều Grafana.

Trong lab này có một Grafana chính được cài bởi Helm chart:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring
```

Chart `kube-prometheus-stack` cài nhiều thứ:

```text
Prometheus Operator
Prometheus
Alertmanager
Grafana
kube-state-metrics
node-exporter
default dashboards
default alert rules
CRDs như ServiceMonitor, PrometheusRule
```

Sau đó khi cài Loki/Tempo, bạn không cần cài Grafana mới. Loki và Tempo chỉ là data source thêm vào Grafana hiện có.

Nếu bạn chạy thêm chart kiểu:

```bash
helm install grafana grafana/grafana
```

thì mới sinh thêm Grafana thứ hai. Trong lab này không cần làm vậy.

### Kiểm Tra Có Bao Nhiêu Grafana

```bash
helm list -n monitoring
kubectl get svc -n monitoring | grep grafana
kubectl get pods -n monitoring | grep grafana
```

Nếu chỉ có `monitoring-grafana` là đúng.

Nếu có nhiều service Grafana, bạn có thể đã cài nhiều release. Khi đó cần biết release nào đang dùng rồi mới xóa. Không xóa bừa.

## 11. Helm Cài Ra Những Gì?

### `kube-prometheus-stack`

Command:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring
```

Nó cài:

| Component | Vai trò |
|---|---|
| Prometheus Operator | Controller đọc ServiceMonitor/PrometheusRule và cấu hình Prometheus |
| Prometheus | Lưu metrics và chạy PromQL |
| Grafana | UI dashboard/explore |
| Alertmanager | Nhận alert từ Prometheus và route đi Slack/email/webhook |
| kube-state-metrics | Expose metrics về Kubernetes objects |
| node-exporter | Expose metrics node CPU/memory/disk/network |

### `grafana/loki`

Command:

```bash
helm install loki grafana/loki -n monitoring -f cloud/w9/day-b/observability/loki-values.yaml
```

Nó cài Loki để lưu logs.

Trong lab dùng:

```yaml
deploymentMode: SingleBinary
loki:
  storage:
    type: filesystem
```

Nghĩa là Loki chạy kiểu đơn giản, lưu trên filesystem/PVC local. Phù hợp lab, không phù hợp production lớn.

### `grafana/promtail`

Command:

```bash
helm install promtail grafana/promtail -n monitoring \
  --set config.clients[0].url=http://loki-gateway.monitoring.svc.cluster.local/loki/api/v1/push
```

Promtail đọc log pod trên node và push sang Loki.

### `grafana/tempo`

Command:

```bash
helm install tempo grafana/tempo -n monitoring
```

Tempo lưu traces.

Grafana query Tempo qua:

```text
http://tempo.monitoring.svc.cluster.local:3200
```

OTel Collector gửi trace vào Tempo qua:

```text
http://tempo.monitoring.svc.cluster.local:4318
```

## 12. Kubernetes Service Giao Tiếp Với Nhau Như Thế Nào?

Kubernetes tạo DNS nội bộ cho Service.

Format:

```text
<service-name>.<namespace>.svc.cluster.local
```

Ví dụ:

```text
observability-demo.observability-demo.svc.cluster.local
otel-collector.observability-demo.svc.cluster.local
tempo.monitoring.svc.cluster.local
loki-gateway.monitoring.svc.cluster.local
```

Pod trong cluster có thể gọi nhau bằng DNS này.

Máy local của bạn không gọi trực tiếp được DNS đó, vì đó là DNS nội bộ cluster.

Muốn gọi từ máy local thì dùng `kubectl port-forward`.

Ví dụ:

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

Sau đó browser vào:

```text
http://localhost:3001
```

### Port Quan Trọng

| Port | Component | Ý nghĩa |
|---:|---|---|
| 3000 | app demo | HTTP app và `/metrics` |
| 3001 local | Grafana port-forward | Bạn mở Grafana từ browser |
| 9090 local | Prometheus port-forward | Bạn mở Prometheus UI |
| 3100 | Loki API hoặc một số chart Tempo cũ | Hay gây nhầm |
| 3200 | Tempo query API | Grafana datasource Tempo dùng port này trong lab |
| 4317 | OTLP gRPC | App/Collector gửi telemetry gRPC |
| 4318 | OTLP HTTP | App/Collector gửi telemetry HTTP |

Lỗi bạn từng gặp:

```text
Grafana Tempo datasource dùng :3100 bị timeout
```

Fix:

```text
Đổi Tempo datasource URL thành http://tempo.monitoring.svc.cluster.local:3200
```

## 13. Grafana Có Những Tab Gì?

### Dashboards

Dùng để xem biểu đồ cố định:

```text
Request rate
Error rate
Latency P50/P95/P99
CPU/memory
Pod restarts
Node metrics
```

Dashboards phù hợp cho monitoring thường ngày.

### Explore

Dùng để điều tra nhanh.

Bạn chọn data source:

```text
Prometheus -> query metrics bằng PromQL
Loki       -> query logs bằng LogQL
Tempo      -> query traces bằng TraceQL
```

Explore là nơi dùng nhiều khi debug sự cố.

### Alerting

Dùng để xem, tạo, quản lý alert.

Trong lab, alert rules nằm ở PrometheusRule:

```text
cloud/w9/day-b/observability/slo-rules.yaml
```

### Connections / Data Sources

Dùng để cấu hình nguồn dữ liệu:

```text
Prometheus
Loki
Tempo
CloudWatch
Elasticsearch
InfluxDB
...
```

### Drilldown / Correlations

Một số bản Grafana có tính năng nhảy từ:

```text
metric -> logs
logs -> trace
trace -> profile
```

Trong thực tế, đây là hướng rất mạnh: alert từ metrics, click sang logs/traces để điều tra.

## 14. PromQL Cơ Bản Trong Lab

Request rate:

```promql
sum(rate(http_requests_total[5m]))
```

Error rate:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

P95 latency:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

Request theo route:

```promql
sum(rate(http_requests_total[5m])) by (route)
```

Error theo route:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (route)
```

Pod restarts:

```promql
kube_pod_container_status_restarts_total{namespace="observability-demo"}
```

## 15. SLI, SLO, SLA, Error Budget

### SLI

SLI là Service Level Indicator.

Nó là chỉ số đo được.

Ví dụ:

```text
Availability SLI = good requests / total requests
Latency SLI = requests under 300ms / total requests
```

### SLO

SLO là Service Level Objective.

Nó là mục tiêu nội bộ.

Ví dụ:

```text
Availability SLO: 99.9% request không bị 5xx trong 30 ngày
Latency SLO: 95% request dưới 300ms trong 30 ngày
```

### SLA

SLA là Service Level Agreement.

Nó thường là cam kết với khách hàng, có thể có phạt nếu vi phạm.

Nói ngắn:

```text
SLI = đo gì
SLO = mục tiêu bao nhiêu
SLA = cam kết chính thức với khách hàng
```

### Error Budget

Nếu SLO availability là 99.9%, error budget là:

```text
100% - 99.9% = 0.1% = 0.001
```

Nghĩa là bạn được phép lỗi tối đa 0.1% request trong window đo.

Nếu service có 1,000,000 request/tháng:

```text
Error budget = 1,000,000 * 0.001 = 1,000 bad requests
```

## 16. Burn Rate Và Multi-Window Alert

Burn rate là tốc độ tiêu hao error budget.

Công thức:

```text
burn rate = actual error rate / allowed error rate
```

Với SLO 99.9%:

```text
allowed error rate = 0.001
```

Nếu error rate hiện tại là 1%:

```text
burn rate = 0.01 / 0.001 = 10
```

Nghĩa là đang đốt error budget nhanh gấp 10 lần tốc độ cho phép.

### Fast Burn: 1h x 5m

Alert nhanh:

```text
burn_rate_1h > 14.4
and
burn_rate_5m > 14.4
```

Ý nghĩa:

```text
Sự cố đang nghiêm trọng trong 5 phút gần đây
và cũng đủ rõ trong cửa sổ 1 giờ
```

### Slow Burn: 6h x 30m

Alert chậm:

```text
burn_rate_6h > 6
and
burn_rate_30m > 6
```

Ý nghĩa:

```text
Lỗi không bùng nổ mạnh, nhưng kéo dài đủ lâu để đốt budget
```

Vì sao cần multi-window?

```text
5m quá nhạy, dễ false alarm.
6h quá chậm, phát hiện muộn.
Kết hợp nhiều window giúp alert vừa nhanh vừa đáng tin.
```

## 17. Hướng Dẫn Làm Lại Lab Từ Đầu

### 17.1. Build App Image Trong Minikube

```bash
minikube start
eval $(minikube docker-env)
docker build -t observability-demo:v1 cloud/w9/day-b/app
```

### 17.2. Deploy App

```bash
kubectl apply -k cloud/w9/day-b/k8s
kubectl get all -n observability-demo
```

Test app:

```bash
kubectl port-forward -n observability-demo svc/observability-demo 3000:3000
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/slow
curl http://localhost:3000/error
curl http://localhost:3000/metrics
```

### 17.3. Cài Prometheus Stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace monitoring
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring
```

Nếu namespace đã tồn tại:

```bash
kubectl get ns monitoring
```

Nếu release đã tồn tại:

```bash
helm list -n monitoring
```

### 17.4. Mở Grafana

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

Mở:

```text
http://localhost:3001
```

Login mặc định thường là:

```text
username: admin
password: prom-operator
```

Nếu không đúng, lấy password:

```bash
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d
```

### 17.5. Mở Prometheus

```bash
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Mở:

```text
http://localhost:9090
```

Targets:

```text
http://localhost:9090/targets
```

Tìm target `observability-demo`.

### 17.6. Apply SLO Rules

```bash
kubectl apply -f cloud/w9/day-b/observability/slo-rules.yaml
kubectl get prometheusrules -n monitoring
```

## 18. Cài Loki Và Promtail

### 18.1. Cài Loki Local

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki grafana/loki -n monitoring -f cloud/w9/day-b/observability/loki-values.yaml
```

Nếu lỗi release tồn tại:

```bash
helm list -n monitoring
helm uninstall loki -n monitoring
```

Rồi cài lại.

### 18.2. Cài Promtail

```bash
helm install promtail grafana/promtail -n monitoring \
  --set config.clients[0].url=http://loki-gateway.monitoring.svc.cluster.local/loki/api/v1/push
```

Kiểm tra:

```bash
kubectl get pods -n monitoring | grep loki
kubectl get pods -n monitoring | grep promtail
kubectl get svc -n monitoring | grep loki
```

### 18.3. Add Loki Datasource

Trong Grafana:

```text
Connections -> Data sources -> Add data source -> Loki
```

URL:

```text
http://loki-gateway.monitoring.svc.cluster.local
```

Nếu muốn test từ máy local:

```bash
kubectl port-forward -n monitoring svc/loki-gateway 3100:80
curl http://localhost:3100/ready
```

Lưu ý:

```text
loki-gateway.monitoring.svc.cluster.local chỉ dùng bên trong cluster.
Browser máy bạn không mở trực tiếp DNS này được.
```

## 19. Cài Tempo Và OTel Collector

### 19.1. Cài Tempo

```bash
helm install tempo grafana/tempo -n monitoring
kubectl get all -n monitoring | grep tempo
```

Tempo service trong lab có port:

```text
3200  -> query API cho Grafana
4318  -> OTLP HTTP receiver
4317  -> OTLP gRPC receiver
```

### 19.2. Add Tempo Datasource

Trong Grafana:

```text
Connections -> Data sources -> Add data source -> Tempo
```

URL:

```text
http://tempo.monitoring.svc.cluster.local:3200
```

Không dùng `3100` nếu service Tempo của bạn không expose port đó.

Test từ local:

```bash
kubectl port-forward -n monitoring svc/tempo 3200:3200
curl http://localhost:3200/ready
```

### 19.3. Deploy OTel Collector

```bash
kubectl apply -f cloud/w9/day-b/observability/otel-collector.yaml
kubectl get pods -n observability-demo
kubectl logs -n observability-demo deploy/otel-collector
```

### 19.4. Tạo Trace

Gọi app:

```bash
curl http://localhost:3000/
curl http://localhost:3000/slow
curl http://localhost:3000/error
```

Xem Collector log:

```bash
kubectl logs -n observability-demo deploy/otel-collector
```

Trong Grafana:

```text
Explore -> Tempo
```

Query:

```traceql
{resource.service.name="observability-demo"}
```

## 20. Debug Checklist

### App Pod Error Sau Khi Thêm Tracing

Triệu chứng:

```text
observability-demo pod Error hoặc CrashLoopBackOff
```

Kiểm tra:

```bash
kubectl logs -n observability-demo deploy/observability-demo
```

Lỗi thường gặp:

```text
Cannot find module './tracing'
```

Nguyên nhân:

```text
Dockerfile có require("./tracing") trong server.js nhưng chưa COPY tracing.js vào image.
```

Fix:

```dockerfile
COPY server.js .
COPY tracing.js .
```

Build lại:

```bash
eval $(minikube docker-env)
docker build -t observability-demo:v1 cloud/w9/day-b/app
kubectl rollout restart deployment observability-demo -n observability-demo
```

### Prometheus Không Thấy Target App

Kiểm tra:

```bash
kubectl get servicemonitor -n observability-demo
kubectl describe servicemonitor observability-demo -n observability-demo
kubectl get svc observability-demo -n observability-demo -o yaml
```

Lỗi thường gặp:

```text
ServiceMonitor endpoint port: http
nhưng Service không có ports[].name: http
```

Fix:

```yaml
ports:
  - name: http
    port: 3000
    targetPort: 3000
```

### `/metrics` Không Có Data

Gọi request trước:

```bash
curl http://localhost:3000/
curl http://localhost:3000/error
curl http://localhost:3000/slow
curl http://localhost:3000/metrics
```

Prometheus query:

```promql
http_requests_total
```

Nếu metric không có, kiểm tra app log.

### Loki Datasource Không Kết Nối Được

Kiểm tra service:

```bash
kubectl get svc -n monitoring | grep loki
```

Nếu Grafana datasource:

```text
http://loki-gateway.monitoring.svc.cluster.local
```

Nếu test từ local:

```bash
kubectl port-forward -n monitoring svc/loki-gateway 3100:80
curl http://localhost:3100/ready
```

Không mở trực tiếp `*.svc.cluster.local` từ browser máy local.

### Tempo Datasource Timeout

Kiểm tra service:

```bash
kubectl get svc -n monitoring | grep tempo
```

Nếu service có port `3200`, datasource URL là:

```text
http://tempo.monitoring.svc.cluster.local:3200
```

Không dùng:

```text
http://tempo.monitoring.svc.cluster.local:3100
```

nếu service không expose `3100`.

### OTel Collector Không Nhận Trace

Kiểm tra app env:

```bash
kubectl describe deployment observability-demo -n observability-demo
```

Cần có:

```text
OTEL_SERVICE_NAME=observability-demo
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector.observability-demo.svc.cluster.local:4318/v1/traces
```

Kiểm tra Collector:

```bash
kubectl get svc otel-collector -n observability-demo
kubectl logs -n observability-demo deploy/otel-collector
```

### Helm Install Loki Lỗi Bucket

Lỗi:

```text
Please define loki.storage.bucketNames.chunks
```

Nguyên nhân:

```text
Chart Loki bản mới mặc định muốn object storage.
```

Fix lab local:

```bash
helm install loki grafana/loki -n monitoring -f cloud/w9/day-b/observability/loki-values.yaml
```

Trong `loki-values.yaml` dùng:

```yaml
deploymentMode: SingleBinary
loki:
  useTestSchema: true
  storage:
    type: filesystem
```

### Image Không Update Dù Đã Build

Vì image tag vẫn là:

```text
observability-demo:v1
```

Và Kubernetes có thể dùng container cũ nếu không restart.

Fix:

```bash
eval $(minikube docker-env)
docker build -t observability-demo:v1 cloud/w9/day-b/app
kubectl rollout restart deployment observability-demo -n observability-demo
```

Hoặc đổi tag:

```text
observability-demo:v2
```

rồi sửa Deployment.

## 21. Tình Huống Thực Tế

### Tình Huống 1: User Báo App Chậm

Điều tra:

```text
1. Grafana dashboard: P95/P99 latency có tăng không?
2. Prometheus: route nào chậm?
3. Tempo: trace request chậm, span nào lâu nhất?
4. Loki: log có timeout/error không?
```

PromQL:

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)
```

Nếu `/slow` cao, kiểm tra trace `/slow`.

### Tình Huống 2: Deploy Xong Error 500 Tăng

Điều tra:

```text
1. Prometheus error rate tăng sau thời điểm deploy
2. Loki query log status 500
3. Tempo xem request lỗi đi qua service nào
4. Rollback nếu ảnh hưởng lớn
```

LogQL:

```logql
{namespace="observability-demo"} |= "500"
```

PromQL:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (route)
```

### Tình Huống 3: Pod Restart Liên Tục

Kiểm tra:

```bash
kubectl get pods -n observability-demo
kubectl describe pod -n observability-demo <pod-name>
kubectl logs -n observability-demo <pod-name> --previous
```

PromQL:

```promql
kube_pod_container_status_restarts_total{namespace="observability-demo"}
```

Nguyên nhân thường gặp:

```text
App crash do missing file/dependency
Env sai
Không connect được dependency
Liveness probe quá gắt
OOMKilled
```

### Tình Huống 4: Alert Bắn Nhưng User Không Báo Lỗi

Có thể:

```text
Alert quá nhạy
Traffic thấp nên tỷ lệ lỗi bị méo
Chỉ một route internal lỗi
Synthetic traffic gây lỗi
```

Cách xử lý:

```text
1. Kiểm tra traffic volume
2. Chia error rate theo route/status
3. Thêm điều kiện minimum request rate
4. Điều chỉnh alert window/threshold
```

### Tình Huống 5: Không Thấy Log Trong Loki

Kiểm tra:

```bash
kubectl get pods -n monitoring | grep promtail
kubectl logs -n monitoring daemonset/promtail
kubectl logs -n observability-demo deploy/observability-demo
```

Nếu app không log gì, Loki cũng không có gì để xem.

Gọi request để tạo log:

```bash
curl http://localhost:3000/
curl http://localhost:3000/error
```

### Tình Huống 6: Không Thấy Trace Trong Tempo

Kiểm tra theo thứ tự:

```text
1. App có tracing.js chưa?
2. Dockerfile có COPY tracing.js chưa?
3. Deployment có env OTEL_EXPORTER_OTLP_TRACES_ENDPOINT chưa?
4. OTel Collector service có port 4318 chưa?
5. Collector log có nhận span không?
6. Tempo datasource URL đúng port 3200 chưa?
```

## 22. Production Khác Lab Như Thế Nào?

Lab local:

```text
Loki SingleBinary + filesystem
Tempo đơn giản
Prometheus local
Grafana local
Không auth nghiêm ngặt
Không retention/tuning kỹ
```

Production thường cần:

```text
Object storage cho Loki/Tempo: S3/GCS/Azure Blob
Retention policy
Resource requests/limits
Horizontal scaling
Multi-tenant hoặc auth
Alertmanager routing
Dashboard provisioning
Backup
NetworkPolicy
TLS
RBAC chặt
Sampling traces
Log volume control
Cardinality control
```

### Cardinality Là Gì?

Cardinality là số lượng chuỗi metric khác nhau.

Ví dụ metric có label:

```text
user_id
request_id
email
```

sẽ tạo cực nhiều time series.

Điều này làm Prometheus nặng và tốn RAM.

Không nên dùng label có giá trị quá nhiều như:

```text
user_id
session_id
trace_id
raw_url chứa id động
```

Nên dùng:

```text
route="/users/:id"
status="200"
method="GET"
```

### Sampling Traces

Nếu production traffic lớn, không nên lưu 100% traces.

Có thể sample:

```text
Lưu 1% request bình thường
Lưu 100% request lỗi
Lưu 100% request latency cao
```

## 23. Ngoài Prometheus, Grafana, Loki, Tempo, OTel Còn Gì?

Các tool liên quan:

| Tool | Vai trò |
|---|---|
| Alertmanager | Route alert sang Slack/email/webhook |
| Jaeger | Trace backend, tương tự Tempo |
| Zipkin | Trace backend cũ/phổ biến |
| Elasticsearch/OpenSearch | Logs/search mạnh, thay thế Loki trong một số hệ thống |
| Fluent Bit | Log collector nhẹ, thay Promtail trong nhiều production |
| Vector | Log/metric/trace pipeline rất mạnh |
| Thanos | Long-term storage và global query cho Prometheus |
| Cortex/Mimir | Scalable Prometheus-compatible metrics backend |
| Grafana Mimir | Metrics backend scale lớn |
| Pyroscope | Continuous profiling |
| eBPF tools | Quan sát network/kernel/runtime không cần instrument code nhiều |
| CloudWatch | AWS metrics/logs |
| Datadog/New Relic | SaaS observability platform |

Trong Kubernetes thực tế, combo hay gặp:

```text
Prometheus + Grafana + Alertmanager
Loki hoặc ELK/OpenSearch
Tempo hoặc Jaeger
OpenTelemetry Collector
```

## 24. Checklist Ôn Tập

Cần nhớ:

```text
Metrics đo số liệu theo thời gian.
Logs ghi sự kiện chi tiết.
Traces mô tả đường đi request.
Prometheus scrape metrics từ /metrics.
ServiceMonitor nói cho Prometheus scrape Service nào.
Grafana chỉ là UI, không tự lưu mọi dữ liệu.
Loki lưu logs.
Promtail đọc pod logs và gửi Loki.
Tempo lưu traces.
OTel SDK tạo traces trong app.
OTel Collector nhận, xử lý, chuyển tiếp telemetry.
SLI là chỉ số đo.
SLO là mục tiêu.
Error budget là phần lỗi được phép.
Burn rate là tốc độ đốt error budget.
Multi-window burn rate giúp alert ít nhiễu hơn.
```

Câu trả lời ngắn khi được hỏi "Observability là gì?":

```text
Observability là khả năng hiểu hệ thống đang xảy ra chuyện gì thông qua metrics, logs và traces.
```

Câu trả lời ngắn khi được hỏi "Loki và Tempo khác nhau thế nào?":

```text
Loki lưu logs, Tempo lưu traces. Logs cho biết app đã ghi gì, traces cho biết request đi qua đâu và chậm/lỗi ở span nào.
```

Câu trả lời ngắn khi được hỏi "Prometheus biết app port 3000 bằng cách nào?":

```text
ServiceMonitor trỏ tới Service port tên http; Service port http map tới port 3000 của app.
```

Câu trả lời ngắn khi được hỏi "Vì sao không mở được *.svc.cluster.local trên browser?":

```text
Đó là DNS nội bộ Kubernetes, chỉ pod trong cluster resolve được. Từ máy local phải dùng kubectl port-forward.
```

## 25. Lệnh Tổng Hợp Hay Dùng

```bash
kubectl get pods -n observability-demo
kubectl get all -n observability-demo
kubectl logs -n observability-demo deploy/observability-demo
kubectl logs -n observability-demo deploy/otel-collector
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get servicemonitor -A
kubectl get prometheusrules -A
helm list -n monitoring
```

Port-forward:

```bash
kubectl port-forward -n observability-demo svc/observability-demo 3000:3000
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
kubectl port-forward -n monitoring svc/loki-gateway 3100:80
kubectl port-forward -n monitoring svc/tempo 3200:3200
```

Generate traffic:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/slow
curl http://localhost:3000/error
curl http://localhost:3000/metrics
```

Build/restart:

```bash
eval $(minikube docker-env)
docker build -t observability-demo:v1 cloud/w9/day-b/app
kubectl rollout restart deployment observability-demo -n observability-demo
```

## 26. Cách Kể Lại Flow Khi Đi Test/Phỏng Vấn

Nếu được hỏi về lab này, trả lời theo thứ tự:

```text
Em có một app Node.js expose /metrics và tạo logs/traces.
Prometheus scrape /metrics thông qua ServiceMonitor.
Grafana dùng Prometheus datasource để vẽ dashboard và kiểm tra SLO.
App log ra stdout, Promtail đọc pod logs rồi gửi Loki, Grafana query Loki bằng LogQL.
App dùng OpenTelemetry SDK tạo traces và gửi OTLP HTTP sang OTel Collector.
Collector batch trace và export sang Tempo.
Grafana dùng Tempo datasource để xem trace theo service.name.
Em cũng tạo PrometheusRule cho multi-window burn rate alert gồm fast 1h x 5m và slow 6h x 30m.
```

Đây là bức tranh đầy đủ của D2 Observability.
