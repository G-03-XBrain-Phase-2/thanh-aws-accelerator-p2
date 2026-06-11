# W9 ArgoCD Test - Observability và Canary

Project này là lab GitOps cho buổi W9: deploy frontend/backend bằng Argo CD, đo metrics bằng Prometheus, và rollout backend theo chiến lược canary bằng Argo Rollouts.

Nói ngắn gọn:

```text
GitHub repo
  -> Argo CD root app
      -> backend Application
          -> namespace + Service + Rollout + ServiceMonitor
      -> frontend Application
          -> namespace + Service + Deployment
  -> Prometheus scrape backend /metrics
  -> Grafana hiển thị metrics
  -> Argo Rollouts điều khiển canary backend
```

## Mục Tiêu Lab

Project này đáp ứng các ý chính trong lab HTML:

- Mọi thay đổi workload đi qua Git.
- Argo CD tự sync manifest từ repo về cluster.
- Backend là Flask app có endpoint `/metrics`.
- Prometheus scrape metrics từ backend thông qua `ServiceMonitor`.
- Backend deploy bằng `Rollout` thay vì `Deployment` để có canary.
- Canary có các bước 25%, pause, 50%, pause 30s, 100%.
- Có thể promote hoặc abort canary bằng Argo Rollouts.
- Có SLO alert gửi email thông qua `PrometheusRule` + `AlertmanagerConfig`.
- Có auto-abort canary bằng `AnalysisTemplate` query Prometheus.

Phần challenge chính hiện đã có trong manifest: backend có alert email và Rollout có analysis tự kiểm tra error-rate. Nếu error-rate vượt ngưỡng, analysis fail và Argo Rollouts tự abort canary.

## Cấu Trúc Thư Mục

```text
cloud/w9/argocd-test/
  README.md

  backend/
    app.py
    Dockerfile

  frontend/
    index.html
    Dockerfile

  gitops/
    root-app.yaml
    apps/
      be-app.yaml
      fe-app.yaml

  k8s/
    kustomization.yaml

    backend/
      namespace.yaml
      kustomization.yaml
      backend-config.yaml
      backend-deployment.yaml
      backend-service.yaml
      servicemonitor.yaml
      prometheusrule.yaml
      alertmanagerconfig.yaml
      alertmanager-email-secret.yaml
      analysis-template.yaml

    frontend/
      kustomization.yaml
      frontend-deployment.yaml
      frontend-service.yaml
```

Ý nghĩa nhanh:

- `backend/`: source code và Dockerfile của API Flask.
- `frontend/`: static frontend chạy bằng nginx.
- `gitops/root-app.yaml`: Argo CD Application cha.
- `gitops/apps/`: các Application con do root app quản lý.
- `k8s/backend/`: manifest Kubernetes cho backend.
- `k8s/frontend/`: manifest Kubernetes cho frontend.
- `k8s/kustomization.yaml`: render tổng backend + frontend + namespace nếu muốn xem cả bộ bằng Kustomize.
- `.github/workflows/validate-argocd-test.yml`: CI validate manifest khi push hoặc mở Pull Request.

Lưu ý: namespace `argocd-test` được render từ `k8s/backend/namespace.yaml` khi render tổng. Frontend Application cũng có `CreateNamespace=true`, nên nếu sync frontend riêng trong lúc namespace chưa có, Argo CD vẫn có thể tạo namespace đích.

## Những Phần Đã Bổ Sung Từ Bài GitOps Buổi Sáng

File `W9-sang-gitops-final.html` yêu cầu nền GitOps trước khi sang Observability/Canary. Project này đã được bổ sung các phần sau để khớp hơn với bài sáng:

| Yêu cầu buổi sáng | Trạng thái trong project |
|---|---|
| App-of-apps | Có `gitops/root-app.yaml` quản lý `gitops/apps/` |
| Application con | Có `argocd-test-be` và `argocd-test-fe` |
| Automated sync | Có trong BE/FE/root app |
| Prune | Có `prune: true` |
| Self-heal | Có `selfHeal: true` |
| Sync waves | Có namespace/config/workload/service theo wave |
| Namespace khai báo bằng Git | Có trong `k8s/backend/namespace.yaml` và `k8s/frontend/namespace.yaml` |
| ConfigMap + envFrom | Có `backend-config.yaml` và backend Rollout đọc bằng `envFrom` |
| Root Kustomize tổng | Có `k8s/kustomization.yaml` |
| CI validate manifest | Có `.github/workflows/validate-argocd-test.yml` |
| SLO alert email | Có `PrometheusRule` + `AlertmanagerConfig` |
| Canary auto-abort | Có `AnalysisTemplate` gắn vào backend Rollout |

Điểm cần hiểu: branch protection không nằm trong source code. Phần đó phải bật trong GitHub UI: Settings -> Branches -> Add rule cho `main`, yêu cầu PR review và status check `validate-argocd-test`.

## Hai Loại Namespace Cần Phân Biệt

Trong project này có 2 namespace quan trọng:

```text
argocd      = nơi chứa Argo CD Application objects
argocd-test = nơi chạy backend/frontend thật
```

Ví dụ trong `gitops/apps/be-app.yaml`:

```yaml
metadata:
  name: argocd-test-be
  namespace: argocd
```

Đoạn này nghĩa là object `Application` tên `argocd-test-be` nằm trong namespace `argocd`.

Còn:

```yaml
destination:
  namespace: argocd-test
```

Đoạn này nghĩa là workload thật của backend sẽ được deploy vào namespace `argocd-test`.

Đây là điểm rất dễ nhầm: `metadata.namespace` của Application khác với `spec.destination.namespace`.

## Luồng GitOps Với Argo CD

### 1. Root App

File `gitops/root-app.yaml` là Application cha:

```yaml
metadata:
  name: root-app-argocd-test
  namespace: argocd
spec:
  source:
    path: cloud/w9/argocd-test/gitops/apps
  destination:
    namespace: argocd
```

Root app không deploy backend/frontend trực tiếp. Nó deploy các file Application con trong:

```text
cloud/w9/argocd-test/gitops/apps
```

Hiện có:

```text
be-app.yaml
fe-app.yaml
```

### 2. Backend App

`gitops/apps/be-app.yaml` trỏ tới:

```yaml
path: cloud/w9/argocd-test/k8s/backend
destination:
  namespace: argocd-test
```

Nghĩa là Argo CD sẽ đọc manifest trong `k8s/backend` và apply vào namespace `argocd-test`.

Backend app có:

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

Ý nghĩa:

- `automated`: Argo CD tự sync khi Git thay đổi.
- `prune: true`: resource nào không còn trong Git sẽ bị xóa khỏi cluster.
- `selfHeal: true`: nếu ai sửa tay trong cluster, Argo CD sẽ đưa về đúng Git.
- `CreateNamespace=true`: nếu namespace đích chưa có, Argo CD có thể tạo namespace.

### 3. Frontend App

`gitops/apps/fe-app.yaml` tương tự backend, nhưng source path là:

```yaml
path: cloud/w9/argocd-test/k8s/frontend
```

Frontend hiện là `Deployment` bình thường, chưa dùng Rollout.

## Sync Wave Là Gì?

Trong manifest có annotation:

```yaml
argocd.argoproj.io/sync-wave: "2"
```

Sync wave giúp Argo CD sắp xếp thứ tự apply resource.

Trong project này:

```text
wave 0 = Namespace
wave 1 = ConfigMap
wave 2 = Deployment/Rollout
wave 3 = Service
```

Ý tưởng:

1. Tạo namespace trước.
2. Tạo ConfigMap sau namespace.
3. Tạo workload sau khi ConfigMap đã có.
4. Tạo service sau hoặc cùng đợt sau.

Nếu không có sync wave, Kubernetes vẫn có thể xử lý được trong nhiều trường hợp, nhưng sync wave giúp GitOps dễ đọc và ổn định hơn.

Ví dụ trong backend:

```text
namespace.yaml          wave 0
backend-config.yaml     wave 1
backend-deployment.yaml wave 2
backend-service.yaml    wave 3
```

`backend-deployment.yaml` dùng:

```yaml
envFrom:
  - configMapRef:
      name: backend-config
```

Nghĩa là pod backend lấy biến môi trường từ `ConfigMap` tên `backend-config`. Nếu ConfigMap chưa tồn tại mà pod đã tạo trước, workload có thể lỗi cấu hình. Sync wave giúp giảm kiểu lỗi này.

## Backend Flask Và Metrics

Backend app nằm ở `backend/app.py`.

App dùng Flask:

```python
app = Flask(__name__)
PrometheusMetrics(app)
```

`PrometheusMetrics(app)` từ package `prometheus-flask-exporter` sẽ tự động tạo endpoint:

```text
/metrics
```

Backend có các endpoint:

```text
GET /        -> trả JSON, có thể lỗi 500 nếu ERROR_RATE > 0
GET /healthz -> readiness health check
GET /metrics -> Prometheus metrics
```

Biến môi trường:

```text
ERROR_RATE = tỉ lệ lỗi giả lập
VERSION    = version của backend, ví dụ v1 hoặc v2
MESSAGE    = message lấy từ ConfigMap backend-config
```

Trong Rollout hiện tại:

```yaml
envFrom:
  - configMapRef:
      name: backend-config
env:
  - name: ERROR_RATE
    value: "0"
  - name: VERSION
    value: "v1"
```

Nếu đổi `ERROR_RATE` thành `"0.5"`, khoảng 50% request `/` sẽ trả HTTP 500. Đây là cách inject lỗi để test SLO/canary.

`MESSAGE` đang được lấy từ `backend-config.yaml`. Đây là ví dụ của bài GitOps buổi sáng: cấu hình app nằm trong Git, Argo CD apply ConfigMap trước workload, app đọc config qua environment variable.

## ConfigMap Trong Dev Và Prod

`ConfigMap` dùng để lưu cấu hình không nhạy cảm:

```text
MESSAGE
FEATURE_FLAG
LOG_LEVEL
PUBLIC_API_URL
```

Không dùng ConfigMap cho password/token. Dữ liệu nhạy cảm nên dùng `Secret`, External Secrets, Sealed Secrets, hoặc secret manager của cloud provider.

Trong dev:

- Có thể để config đơn giản trong Git.
- Có thể dùng image tag dễ đọc như `v1`, `v2`.
- Có thể dùng `ERROR_RATE` để inject lỗi khi học SLO/canary.
- Có thể cho Argo CD auto-sync để vòng lặp học nhanh.

Trong prod:

- Không nên dùng tag `latest`.
- Nên dùng immutable tag hoặc digest, ví dụ `backend:1.4.2` hoặc `backend@sha256:...`.
- Config nên chia theo môi trường: dev/staging/prod.
- Secret không commit thẳng vào Git.
- Auto-sync cần cân nhắc: prod có thể cần manual sync hoặc PR approval.
- `prune: true` rất mạnh, nên dùng cẩn thận và review kỹ khi xóa resource.
- Canary nên đi kèm `AnalysisTemplate` tự đo metrics thay vì chỉ pause thủ công.

## Docker Image Trong Minikube

Backend image hiện được cấu hình:

```yaml
image: argocd-test-backend:v1
imagePullPolicy: IfNotPresent
```

Vì lab chạy local Minikube, không cần push image lên registry. Cần build image vào Minikube:

```bash
minikube image build -t argocd-test-backend:v1 cloud/w9/argocd-test/backend
```

Nếu dùng tag mới:

```bash
minikube image build -t argocd-test-backend:v2 cloud/w9/argocd-test/backend
```

`imagePullPolicy: IfNotPresent` bảo Kubernetes dùng image local nếu đã có trong node. Nếu để `Always`, pod có thể bị `ImagePullBackOff` vì cluster sẽ cố pull image từ registry.

Trong prod, cách làm sẽ khác:

```text
Developer push code
  -> CI build image
  -> CI push image lên registry
  -> CI/automation update Git manifest hoặc Helm values
  -> Argo CD sync từ Git
```

Ví dụ registry:

```text
ghcr.io/org/backend:1.0.0
123456789.dkr.ecr.ap-southeast-1.amazonaws.com/backend:1.0.0
```

Trong prod, cluster không nên phụ thuộc image local Minikube. Mọi node phải pull được image từ registry có phân quyền rõ ràng.

## Rollout Là Gì?

Kubernetes `Deployment` cập nhật app theo rolling update cơ bản. Argo Rollouts mở rộng khả năng deploy bằng các chiến lược nâng cao như:

- Canary
- Blue-green
- Analysis
- Manual promote/abort
- Auto rollback/abort dựa trên metric

Backend trong project này dùng:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: backend
```

Thay vì:

```yaml
apiVersion: apps/v1
kind: Deployment
```

Muốn Kubernetes hiểu `kind: Rollout`, cluster phải có Argo Rollouts CRD và controller.

Kiểm tra:

```bash
kubectl api-resources | grep -i rollout
kubectl -n argo-rollouts get pods
```

Nếu chưa có:

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argo-rollouts argo/argo-rollouts -n argo-rollouts --create-namespace
```

## Canary Trong Project Này

Backend Rollout có strategy:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 25
      - analysis:
          templates:
            - templateName: backend-error-rate
      - setWeight: 50
      - pause:
          duration: 30s
      - analysis:
          templates:
            - templateName: backend-error-rate
      - setWeight: 100
```

Ý nghĩa từng bước:

```text
setWeight: 25     -> đưa khoảng 25% pod sang version mới
analysis          -> query Prometheus để kiểm tra error-rate
setWeight: 50     -> nếu analysis pass, tiếp tục lên 50%
pause: 30s        -> dừng 30 giây để quan sát ngắn
analysis          -> kiểm tra error-rate lần nữa
setWeight: 100    -> nếu vẫn ổn, promote toàn bộ sang version mới
```

Trong lab hiện tại, Rollout đã có auto-abort bằng analysis. Nếu metric xấu, Rollout tự fail analysis và abort về version trước.

Bạn vẫn có thể can thiệp thủ công nếu muốn:

```bash
kubectl argo rollouts promote backend -n argocd-test
kubectl argo rollouts abort backend -n argocd-test
```

Promote nghĩa là chấp nhận đi tiếp.

Abort nghĩa là hủy canary và quay về ReplicaSet/version trước.

Theo dõi:

```bash
kubectl argo rollouts get rollout backend -n argocd-test --watch
```

## AnalysisTemplate Và Auto-Abort

File:

```text
cloud/w9/argocd-test/k8s/backend/analysis-template.yaml
```

`AnalysisTemplate` là resource của Argo Rollouts. Nó định nghĩa một bài kiểm tra chất lượng release.

Trong project này, analysis query Prometheus để tính error-rate backend:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: backend-error-rate
spec:
  metrics:
    - name: backend-error-rate
      interval: 30s
      count: 3
      failureLimit: 1
      successCondition: result[0] < 0.05
      failureCondition: result[0] >= 0.05
```

Ý nghĩa:

```text
interval: 30s        -> mỗi 30 giây query Prometheus một lần
count: 3             -> query tổng cộng 3 lần
failureLimit: 1      -> chỉ cần fail 1 lần là analysis fail
successCondition     -> pass nếu error-rate < 5%
failureCondition     -> fail nếu error-rate >= 5%
```

Prometheus query:

```promql
(
  sum(rate(flask_http_request_total{namespace="argocd-test", status=~"5.."}[1m]))
  /
  clamp_min(sum(rate(flask_http_request_total{namespace="argocd-test"}[1m])), 1)
)
```

Query này tính:

```text
số request 5xx mỗi giây / tổng request mỗi giây
```

`clamp_min(..., 1)` tránh lỗi chia cho 0 khi chưa có traffic.

Luồng auto-abort:

```text
Git đổi backend sang version mới
  -> Argo CD sync Rollout
  -> Argo Rollouts tạo ReplicaSet mới
  -> setWeight 25
  -> chạy AnalysisTemplate backend-error-rate
  -> query Prometheus
  -> nếu error-rate >= 5%
       analysis fail
       rollout abort
       backend quay về version trước
  -> nếu error-rate < 5%
       đi tiếp setWeight 50
       pause 30s
       chạy analysis lần nữa
       pass thì setWeight 100
```

Kiểm tra analysis:

```bash
kubectl -n argocd-test get analysistemplate
kubectl -n argocd-test get analysisrun
kubectl argo rollouts get rollout backend -n argocd-test --watch
```

Nếu analysis không chạy được, kiểm tra địa chỉ Prometheus trong `analysis-template.yaml`:

```yaml
address: http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090
```

Nếu service Prometheus của bạn tên khác, lấy tên thật:

```bash
kubectl -n monitoring get svc | grep prometheus
```

Sau đó sửa `address`.

## Service Là Gì?

Pod có IP tạm thời. Khi pod restart, IP có thể đổi. Service tạo ra một địa chỉ ổn định trong cluster để các workload khác gọi đến.

Backend service:

```yaml
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: backend
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

Ý nghĩa:

- Service tên `backend`.
- Trong namespace `argocd-test`, có thể gọi bằng `http://backend:8080`.
- Selector `app: backend` tìm các pod backend.
- `name: http` rất quan trọng vì `ServiceMonitor` sẽ tham chiếu port theo tên `http`.

## ServiceMonitor Là Gì?

`ServiceMonitor` là custom resource của Prometheus Operator, không phải resource Kubernetes mặc định.

Nó nói với Prometheus:

```text
Hãy tìm Service nào có label này,
rồi scrape endpoint /metrics ở port này,
với interval này.
```

File `k8s/backend/servicemonitor.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend
  namespace: argocd-test
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

Giải thích:

- `kind: ServiceMonitor`: resource cho Prometheus Operator.
- `metadata.namespace: argocd-test`: ServiceMonitor nằm cùng namespace với app.
- `labels.release: monitoring`: giúp kube-prometheus-stack release tên `monitoring` nhận ServiceMonitor này.
- `selector.matchLabels.app: backend`: tìm Service có label `app: backend`.
- `endpoints.port: http`: scrape port có tên `http` trên Service.
- `path: /metrics`: endpoint metric của Flask app.
- `interval: 15s`: scrape mỗi 15 giây.

Kiểm tra ServiceMonitor CRD:

```bash
kubectl api-resources | grep -i servicemonitor
```

Kiểm tra resource:

```bash
kubectl -n argocd-test get servicemonitor
```

Nếu Prometheus không thấy target, thử check:

```bash
kubectl -n argocd-test get svc backend -o yaml
kubectl -n argocd-test get servicemonitor backend -o yaml
kubectl -n monitoring get prometheus -o yaml
```

Các lỗi hay gặp:

- Service không có label `app: backend`.
- Service port không có `name: http`.
- ServiceMonitor selector không match label của Service.
- Prometheus Operator không chọn ServiceMonitor vì thiếu label `release: monitoring`.
- Prometheus CRD chưa được cài.

### Vì sao ServiceMonitor tốt hơn cấu hình scrape thủ công?

Trong Kubernetes, app thay đổi liên tục: pod scale lên/xuống, IP đổi, service đổi. Nếu cấu hình Prometheus scrape thủ công bằng IP tĩnh thì rất dễ hỏng.

`ServiceMonitor` cho phép khai báo theo kiểu Kubernetes-native:

```text
Prometheus Operator đọc ServiceMonitor
  -> tìm Service theo label
  -> lấy endpoint phía sau Service
  -> scrape /metrics định kỳ
```

Trong dev:

- Dùng `ServiceMonitor` để nhanh chóng thấy metrics trong Prometheus.
- Có thể scrape interval ngắn như `15s` để quan sát nhanh.

Trong prod:

- Nên chuẩn hóa label cho Service và ServiceMonitor.
- Nên kiểm soát namespace nào được Prometheus scrape.
- Nên tách ServiceMonitor theo team/app.
- Nên đặt alert dựa trên SLO thay vì alert mọi lỗi nhỏ.

## Prometheus Là Gì?

Prometheus là hệ thống thu thập và lưu metrics dạng time-series.

Điểm quan trọng:

- Prometheus dùng mô hình pull.
- App không đẩy metric sang Prometheus.
- Prometheus định kỳ scrape endpoint `/metrics`.
- Query bằng PromQL.

Trong project này:

```text
backend Flask
  exposes /metrics
Service backend
  exposes port http 8080
ServiceMonitor backend
  tells Prometheus to scrape backend:8080/metrics
Prometheus
  stores flask_http_request_total and other metrics
```

Tạo traffic:

```bash
kubectl -n argocd-test run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://backend:8080/; sleep 1; done"
```

Mở Prometheus:

```bash
kubectl -n monitoring get svc | grep prometheus
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Query:

```promql
flask_http_request_total{namespace="argocd-test"}
```

Tỉ lệ lỗi có thể query theo hướng:

```promql
sum(rate(flask_http_request_total{namespace="argocd-test", status=~"5.."}[5m]))
/
sum(rate(flask_http_request_total{namespace="argocd-test"}[5m]))
```

Tên label thực tế có thể khác tùy exporter. Hãy mở Prometheus và gõ `flask_http_request_total` để xem label hiện có.

### Prometheus trong dev và prod

Trong dev:

- Mục tiêu chính là học metric có tăng không.
- Query thủ công trong Prometheus UI là đủ.
- Retention ngắn cũng được.

Trong prod:

- Cần retention phù hợp.
- Cần Alertmanager.
- Cần rule rõ ràng: request rate, error rate, latency, saturation.
- Nên dùng SLO/burn-rate alert thay vì chỉ alert CPU cao.
- Cần dashboard Grafana cho service owner.
- Cần phân quyền xem/sửa dashboard và alert.

## Loki Là Gì?

Loki là hệ thống lưu logs, thường đi chung với Grafana.

Prometheus trả lời:

```text
Có vấn đề không?
```

Loki trả lời:

```text
Log cụ thể lúc đó là gì?
```

Trong stack của bạn, Loki được cài trong namespace `monitoring`. Promtail thường là agent đọc log từ pod/node và gửi về Loki.

Luồng log:

```text
backend pod stdout/stderr
  -> promtail đọc log
  -> Loki lưu log
  -> Grafana query log
```

Vì app Flask hiện tại log chưa nhiều, nếu muốn log rõ hơn có thể thêm logging trong `app.py`. Nhưng cho lab metric/canary, Loki là phần quan sát bổ sung.

Kiểm tra:

```bash
helm list -n monitoring
kubectl -n monitoring get pods | grep -E "loki|promtail"
```

### Loki trong dev và prod

Trong dev:

- Dùng để xem log pod khi test lỗi.
- Query theo namespace/app là đủ.

Trong prod:

- Cần chuẩn hóa label log: namespace, app, container, cluster, environment.
- Không nên log dữ liệu nhạy cảm.
- Cần retention và storage phù hợp.
- Cần liên kết log với trace qua `trace_id` nếu hệ thống có tracing.

## Jaeger Và Tempo Là Gì?

Jaeger và Tempo đều liên quan đến distributed tracing.

Trace trả lời:

```text
Request này đi qua những service nào?
Chậm ở bước nào?
Lỗi ở đâu?
```

Trong HTML có nhắc Jaeger như một công cụ trace phổ biến. Cluster của bạn trước đó có `tempo`, đây là một backend trace của Grafana ecosystem.

So sánh nhanh:

```text
Jaeger = trace system phổ biến, có UI riêng
Tempo  = trace backend của Grafana, tối ưu lưu trace và xem qua Grafana
```

Project hiện tại chưa instrument OpenTelemetry trong backend, nên chưa sinh trace đúng nghĩa. Nếu muốn có trace, cần thêm OpenTelemetry SDK vào Flask và cấu hình exporter gửi trace về OTel Collector/Tempo/Jaeger.

Hiện tại trong repo có tham khảo:

```text
cloud/w9/day-b/observability/otel-collector.yaml
```

File này liên quan đến OpenTelemetry Collector, có thể dùng cho bước mở rộng trace sau.

### Trace trong dev và prod

Trong dev:

- Trace giúp hiểu request đi qua những service nào.
- Có thể sample nhiều hơn để dễ debug.

Trong prod:

- Không nên sample 100% nếu traffic lớn.
- Cần propagation header chuẩn như `traceparent`.
- Nên đưa `trace_id` vào log để nhảy từ log sang trace.
- Nên dùng OpenTelemetry Collector làm lớp trung gian thay vì app gửi thẳng tới backend trace.

## Grafana Là Gì?

Grafana là dashboard UI để xem dữ liệu từ nhiều datasource:

```text
Prometheus -> metrics
Loki       -> logs
Tempo      -> traces
Jaeger     -> traces, nếu cài Jaeger
```

Trong lab này, Grafana dùng để:

- Xem request rate.
- Xem error rate.
- Xem latency percentile nếu exporter có metric latency.
- Xem log từ Loki.
- Vẽ dashboard SLO.
- Cấu hình alert nếu làm challenge.

Mở Grafana thường qua service của kube-prometheus-stack:

```bash
kubectl -n monitoring get svc | grep grafana
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

Sau đó mở:

```text
http://localhost:3000
```

Tài khoản/mật khẩu tùy theo Helm values khi cài `kube-prometheus-stack`. Nếu không nhớ, có thể xem secret Grafana trong namespace `monitoring`.

### Dashboard nên có gì?

Một dashboard backend tối thiểu nên có:

- Request rate.
- Error rate.
- p95/p99 latency.
- Pod count.
- Restart count.
- Rollout status.
- CPU/memory.
- Log panel từ Loki.

Trong prod, dashboard nên trả lời nhanh 3 câu:

```text
App có đang nhận traffic không?
User có bị lỗi/chậm không?
Nếu lỗi, bản release nào gây ra?
```

## SLO, SLI, SLA

### SLI

SLI là chỉ số đo thực tế.

Ví dụ:

```text
request success rate
error rate
p95 latency
availability
```

Trong project này, một SLI đơn giản:

```text
Tỉ lệ request thành công của backend
```

Tính bằng Prometheus:

```promql
1 -
(
  sum(rate(flask_http_request_total{namespace="argocd-test", status=~"5.."}[5m]))
  /
  sum(rate(flask_http_request_total{namespace="argocd-test"}[5m]))
)
```

### SLO

SLO là mục tiêu nội bộ.

Ví dụ:

```text
Backend success rate >= 99.9%
```

### SLA

SLA là cam kết với khách hàng/bên ngoài, thường có điều khoản phạt nếu vi phạm.

Trong lab, ta tập trung vào SLI/SLO hơn là SLA.

## Manual Canary Test

### 1. Build image v1

```bash
minikube image build -t argocd-test-backend:v1 cloud/w9/argocd-test/backend
```

### 2. Sync Argo CD

```bash
kubectl -n argocd get applications
```

Mong muốn:

```text
root-app-argocd-test Synced Healthy
argocd-test-be       Synced Healthy
argocd-test-fe       Synced Healthy
```

Kiểm tra workload:

```bash
kubectl get ns argocd-test
kubectl -n argocd-test get all
kubectl -n argocd-test get rollout
kubectl -n argocd-test get servicemonitor
kubectl -n argocd-test get prometheusrule
kubectl -n argocd-test get alertmanagerconfig
kubectl -n argocd-test get analysistemplate
```

### 3. Tạo traffic

```bash
kubectl -n argocd-test run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://backend:8080/; sleep 1; done"
```

### 4. Release v2

Build image:

```bash
minikube image build -t argocd-test-backend:v2 cloud/w9/argocd-test/backend
```

Sửa `k8s/backend/backend-deployment.yaml`:

```yaml
image: argocd-test-backend:v2
env:
  - name: VERSION
    value: "v2"
```

Commit và push:

```bash
git add cloud/w9/argocd-test
git commit -m "release backend v2"
git push
```

Theo dõi:

```bash
kubectl argo rollouts get rollout backend -n argocd-test --watch
```

Promote:

```bash
kubectl argo rollouts promote backend -n argocd-test
```

Abort:

```bash
kubectl argo rollouts abort backend -n argocd-test
```

## Git Revert Trong GitOps

GitOps coi Git là source of truth. Vì vậy rollback nên làm qua Git:

```bash
git revert <commit-id> --no-edit
git push
```

Hoặc nếu muốn revert mọi commit sau một commit cũ:

```bash
git revert <old-commit>..HEAD --no-edit
git push
```

Argo CD thấy commit mới trên Git và sync cluster về đúng trạng thái mới.

Không nên sửa tay resource trong cluster vì `selfHeal: true` sẽ đưa nó về lại Git.

## CI Validate Manifest

Project có workflow:

```text
.github/workflows/validate-argocd-test.yml
```

Workflow này chạy khi:

```text
pull_request thay đổi cloud/w9/argocd-test/**
push lên main thay đổi cloud/w9/argocd-test/**
```

Nó làm 2 việc:

1. Dùng `kubectl kustomize` để render manifest.
2. Dùng `kubeconform` để validate YAML/schema cơ bản.

Vì project dùng CRD như `Rollout` và `ServiceMonitor`, workflow dùng:

```bash
kubeconform -ignore-missing-schemas
```

Lý do: kubeconform không mặc định có schema cho mọi CRD. Trong prod, có thể nâng cấp bằng cách cung cấp schema CRD riêng để validate chặt hơn.

### CI trong dev

Trong dev, CI tối thiểu nên:

- Render Kustomize được.
- YAML không sai syntax.
- Manifest Kubernetes cơ bản hợp lệ.
- Không cần deploy thật.

### CI trong prod

Trong prod, CI nên mạnh hơn:

- Validate schema cho cả CRD.
- Policy check bằng OPA/Conftest hoặc Kyverno.
- Chặn image tag `latest`.
- Chặn container chạy privileged nếu không cần.
- Bắt buộc resource requests/limits.
- Bắt buộc readiness/liveness probe.
- Bắt buộc owner/team labels.
- Bắt buộc PR review.
- Bắt buộc status checks pass trước khi merge.

## Dev, Staging, Prod Nên Tổ Chức Thế Nào?

Lab hiện tại dùng một namespace:

```text
argocd-test
```

Đây là cách đơn giản cho học tập. Trong hệ thống thật, nên tách môi trường:

```text
argocd-test-dev
argocd-test-staging
argocd-test-prod
```

Hoặc tách cluster:

```text
dev cluster
staging cluster
prod cluster
```

### Cách 1: Tách bằng folder overlay

Ví dụ:

```text
k8s/
  base/
    backend/
    frontend/
  overlays/
    dev/
    staging/
    prod/
```

`base` chứa manifest chung. `overlays/dev` sửa replica ít, image dev, config dev. `overlays/prod` tăng replica, config prod, policy chặt hơn.

Ưu điểm:

- Dễ tái sử dụng manifest.
- Ít copy-paste.
- Phù hợp Kustomize.

Nhược điểm:

- Cần hiểu overlay/patch.
- Người mới dễ rối nếu tách quá sớm.

### Cách 2: Tách bằng folder riêng

Ví dụ:

```text
environments/
  dev/
  staging/
  prod/
```

Ưu điểm:

- Dễ nhìn.
- Dễ học.

Nhược điểm:

- Dễ copy-paste nhiều.
- Dễ lệch cấu hình giữa các môi trường.

### Gợi ý cho project này

Hiện tại nên giữ đơn giản:

```text
cloud/w9/argocd-test/k8s/backend
cloud/w9/argocd-test/k8s/frontend
```

Khi cần mở rộng prod/dev thật, hãy refactor sang:

```text
cloud/w9/argocd-test/k8s/base
cloud/w9/argocd-test/k8s/overlays/dev
cloud/w9/argocd-test/k8s/overlays/prod
```

Prod nên khác dev ở các điểm:

| Hạng mục | Dev | Prod |
|---|---|---|
| Replicas | 1-2 | >= 3 hoặc theo tải |
| Image tag | nhanh, test | immutable tag/digest |
| Auto sync | có thể bật | cân nhắc manual hoặc PR gate |
| Prune | bật để học | bật nhưng review kỹ |
| Secrets | có thể mock | dùng secret manager |
| Resources | có thể nhẹ | bắt buộc requests/limits |
| Probes | nên có | bắt buộc |
| Rollout | manual canary | analysis-based canary |
| Alerts | ít | đầy đủ SLO/burn rate |

## Prod Checklist

Nếu đưa pattern này lên prod, cần thêm:

- Image registry thật.
- Image tag bất biến.
- Resource requests/limits.
- Liveness probe nếu app cần.
- PodDisruptionBudget.
- HPA nếu traffic biến động.
- NetworkPolicy nếu cluster có policy engine.
- Secret management.
- Ingress/Gateway.
- TLS.
- SLO alert.
- Runbook khi rollout fail.
- Audit bằng PR và branch protection.
- Argo CD project/RBAC tách quyền theo team.

## Khi Nào Dùng Deployment, Khi Nào Dùng Rollout?

Dùng `Deployment` khi:

- App đơn giản.
- Không cần canary/blue-green.
- Lỗi có thể rollback thủ công nhanh.
- Môi trường dev/test.

Dùng `Rollout` khi:

- Cần release an toàn.
- Cần canary từng phần.
- Cần pause để quan sát.
- Cần auto-abort dựa trên metric.
- App có traffic thật và rủi ro release cao.

Trong project này:

```text
frontend = Deployment
backend  = Rollout
```

Lý do: backend có endpoint `/metrics`, có thể đo lỗi, phù hợp để làm canary và auto-abort sau này.

## Checklist Đúng Đề Bài

Đúng phần lab cơ bản khi:

```bash
kubectl -n argocd get applications
```

có:

```text
root-app-argocd-test Synced Healthy
argocd-test-be       Synced Healthy
argocd-test-fe       Synced Healthy
```

Và:

```bash
kubectl -n argocd-test get rollout
kubectl -n argocd-test get svc backend
kubectl -n argocd-test get servicemonitor
kubectl -n argocd-test get prometheusrule
kubectl -n argocd-test get alertmanagerconfig
kubectl -n argocd-test get analysistemplate
kubectl -n monitoring get pods
kubectl -n argo-rollouts get pods
```

Backend pod phải Running:

```bash
kubectl -n argocd-test get pods
```

Prometheus phải thấy metric:

```promql
flask_http_request_total{namespace="argocd-test"}
```

Rollout phải xem được:

```bash
kubectl argo rollouts get rollout backend -n argocd-test
```

Alert và auto-abort phải có:

```bash
kubectl -n argocd-test get prometheusrule backend-slo-rules
kubectl -n argocd-test get alertmanagerconfig backend-email-alerts
kubectl -n argocd-test get analysistemplate backend-error-rate
```

## Lỗi Thường Gặp

### App OutOfSync Missing

Kiểm tra:

```bash
kubectl -n argocd describe application argocd-test-be
```

Nguyên nhân hay gặp:

- Chưa sync app.
- Thiếu namespace.
- Thiếu CRD `Rollout`.
- Thiếu CRD `ServiceMonitor`.
- Image chưa build vào Minikube.

### Namespace Không Có

Kiểm tra:

```bash
kubectl get ns argocd-test
```

Có thể tạo tay để unblock:

```bash
kubectl create ns argocd-test
```

Trong GitOps, app BE/FE đã có:

```yaml
syncOptions:
  - CreateNamespace=true
```

### Pod ImagePullBackOff

Kiểm tra:

```bash
kubectl -n argocd-test describe pod <pod-name>
```

Nếu dùng Minikube, build image vào Minikube:

```bash
minikube image build -t argocd-test-backend:v1 cloud/w9/argocd-test/backend
```

### Rollout Không Apply Được

Kiểm tra CRD:

```bash
kubectl api-resources | grep -i rollout
```

Nếu không có, cài Argo Rollouts.

### ServiceMonitor Không Apply Được

Kiểm tra CRD:

```bash
kubectl api-resources | grep -i servicemonitor
```

Nếu không có, Prometheus Operator/kube-prometheus-stack chưa được cài đúng.

### Prometheus Không Thấy Metric

Kiểm tra từng lớp:

```bash
kubectl -n argocd-test get svc backend -o yaml
kubectl -n argocd-test get servicemonitor backend -o yaml
kubectl -n argocd-test get endpoints backend
kubectl -n argocd-test logs deploy/load
```

Kiểm tra app có `/metrics`:

```bash
kubectl -n argocd-test port-forward svc/backend 8080:8080
curl http://localhost:8080/metrics
```

## Trạng Thái Challenge Và Hướng Mở Rộng

Project hiện đã có các thành phần chính của challenge "Ship Smartly":

1. `AnalysisTemplate` query Prometheus.
2. Analysis đã được gắn vào `strategy.canary`.
3. `PrometheusRule` cho backend.
4. `AlertmanagerConfig` route alert về email.
5. README giải thích luồng vận hành.

Những phần còn cần làm để chứng minh khi nộp bài:

1. Cấu hình email thật thay cho placeholder.
2. Build image backend vào Minikube hoặc registry.
3. Tạo traffic để metric tăng.
4. Inject lỗi bằng `ERROR_RATE`.
5. Chụp ảnh/chứng minh:
   - metric tăng,
   - alert fire,
   - email nhận được,
   - canary bản lỗi tự abort bằng `AnalysisTemplate`,
   - rollback bằng `git revert`.

Ý tưởng auto-abort:

```text
Canary v2 được release
  -> Rollout chạy analysis
  -> AnalysisTemplate query Prometheus error rate
  -> nếu error rate quá ngưỡng
  -> Rollout tự abort về v1
```

Trong production, có thể mở rộng thêm:

- Burn-rate alert nhiều cửa sổ thời gian, ví dụ 5m/1h và 30m/6h.
- Critical alert gửi PagerDuty/Opsgenie, warning gửi email/Slack.
- `AnalysisTemplate` dùng nhiều metric cùng lúc: error-rate, p95 latency, pod restart.
- Tách config dev/staging/prod bằng Kustomize overlays.
- Dùng Secret manager thay cho Secret plaintext trong Git.

## Alert Email Đã Được Bổ Sung

Project hiện đã có phần alert email cơ bản cho backend:

```text
k8s/backend/prometheusrule.yaml
k8s/backend/alertmanagerconfig.yaml
k8s/backend/alertmanager-email-secret.yaml
```

Ba file này tạo thành luồng:

```text
Backend Flask /metrics
  -> ServiceMonitor scrape /metrics
  -> Prometheus lưu metric flask_http_request_total
  -> PrometheusRule đánh giá error rate
  -> alert BackendHighErrorRate fire
  -> Alertmanager nhận alert
  -> AlertmanagerConfig route alert tới receiver email
  -> SMTP gửi email tới người nhận
```

### 1. PrometheusRule

File:

```text
cloud/w9/argocd-test/k8s/backend/prometheusrule.yaml
```

Rule chính:

```yaml
alert: BackendHighErrorRate
expr: |
  (
    sum(rate(flask_http_request_total{namespace="argocd-test", status=~"5.."}[5m]))
    /
    sum(rate(flask_http_request_total{namespace="argocd-test"}[5m]))
  ) > 0.05
for: 2m
```

Ý nghĩa:

```text
Nếu hơn 5% request backend trả status 5xx
trong ít nhất 2 phút
thì bắn alert BackendHighErrorRate.
```

`labels.release: monitoring` giúp Prometheus Operator của kube-prometheus-stack chọn rule này nếu release Prometheus của bạn tên là `monitoring`.

Kiểm tra rule:

```bash
kubectl -n argocd-test get prometheusrule
kubectl -n argocd-test describe prometheusrule backend-slo-rules
```

### 2. AlertmanagerConfig

File:

```text
cloud/w9/argocd-test/k8s/backend/alertmanagerconfig.yaml
```

File này định nghĩa receiver email:

```yaml
receivers:
  - name: backend-email
    emailConfigs:
      - to: "your-email@example.com"
        from: "your-email@example.com"
        smarthost: "smtp.gmail.com:587"
```

Bạn phải sửa:

```text
to
from
authUsername
authIdentity
```

thành email thật của bạn.

Nếu dùng Gmail, thường cần App Password, không dùng mật khẩu Gmail thường.

### 3. Secret SMTP

File:

```text
cloud/w9/argocd-test/k8s/backend/alertmanager-email-secret.yaml
```

Hiện đang là placeholder:

```yaml
stringData:
  smtp-password: "CHANGE_ME_DO_NOT_USE_IN_PROD"
```

Không nên commit mật khẩu thật lên Git.

Cách tốt hơn cho lab là tạo secret bằng tay:

```bash
kubectl -n argocd-test create secret generic alertmanager-email-secret \
  --from-literal=smtp-password='APP_PASSWORD_CUA_BAN' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Sau đó có 2 lựa chọn:

1. Giữ file secret placeholder trong Git để lab dễ hiểu, nhưng trước khi sync thì sửa tạm local.
2. Bỏ secret thật khỏi Git, dùng External Secrets/Sealed Secrets trong môi trường thật.

Trong prod, tuyệt đối không commit password thật vào Git.

### 4. Điều kiện để AlertmanagerConfig được nhận

Không phải cứ tạo `AlertmanagerConfig` là Alertmanager tự nhận. kube-prometheus-stack phải được cấu hình để chọn AlertmanagerConfig theo label.

Kiểm tra:

```bash
kubectl -n monitoring get alertmanager -o yaml
```

Tìm các phần như:

```yaml
alertmanagerConfigSelector
alertmanagerConfigNamespaceSelector
```

Nếu Alertmanager không chọn config từ namespace `argocd-test`, bạn cần chỉnh Helm values của kube-prometheus-stack.

Ví dụ values mong muốn về mặt ý tưởng:

```yaml
alertmanager:
  alertmanagerSpec:
    alertmanagerConfigSelector:
      matchLabels:
        release: monitoring
    alertmanagerConfigNamespaceSelector: {}
```

Rồi upgrade Helm release `monitoring` theo values của bạn.

### 5. Cách test alert email

Bước 1: đảm bảo backend đang chạy:

```bash
kubectl -n argocd-test get pods
kubectl -n argocd-test get rollout backend
```

Bước 2: build/sync bản có lỗi cao. Sửa trong `backend-deployment.yaml`:

```yaml
env:
  - name: ERROR_RATE
    value: "0.8"
```

Commit/push:

```bash
git add cloud/w9/argocd-test
git commit -m "inject backend errors for alert test"
git push
```

Bước 3: tạo traffic:

```bash
kubectl -n argocd-test run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://backend:8080/; sleep 1; done"
```

Bước 4: mở Prometheus:

```bash
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Query:

```promql
flask_http_request_total{namespace="argocd-test"}
```

Vào tab Alerts trong Prometheus để xem `BackendHighErrorRate` chuyển từ Pending sang Firing.

Bước 5: kiểm tra Alertmanager:

```bash
kubectl -n monitoring get svc | grep alertmanager
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-alertmanager 9093:9093
```

Mở:

```text
http://localhost:9093
```

Nếu SMTP đúng, bạn sẽ nhận email.

### 6. Dev và Prod khác nhau thế nào?

Trong dev/lab:

- Có thể dùng Gmail App Password để test.
- Có thể để `ERROR_RATE=0.8` để ép alert fire.
- Có thể dùng threshold thấp như 5% trong 2 phút để thấy nhanh.
- Có thể tạo secret bằng tay.

Trong prod:

- Không commit SMTP password vào Git.
- Dùng External Secrets, Sealed Secrets, Vault, AWS Secrets Manager hoặc GCP Secret Manager.
- Alert nên gửi vào nhiều kênh: email, Slack, PagerDuty, Opsgenie.
- Không alert mọi lỗi nhỏ; nên alert theo SLO/burn rate.
- Alert phải có runbook: ai xử lý, kiểm tra gì, rollback thế nào.
- Phải có route theo severity:
  - warning: email/Slack
  - critical: paging/on-call

Ví dụ phân cấp:

```text
warning  -> gửi email cho team
critical -> gọi on-call qua PagerDuty/Opsgenie
```

### 7. Luồng vận hành khi alert bắn

Khi nhận email `BackendHighErrorRate`, xử lý theo luồng:

```text
1. Mở Grafana/Prometheus xem error rate.
2. Xem Argo Rollouts backend đang ở revision nào.
3. Xem logs backend qua Loki.
4. Nếu lỗi đến từ release mới, abort rollout:
   kubectl argo rollouts abort backend -n argocd-test
5. Nếu đã merge/push sai config, rollback bằng Git:
   git revert <commit-id> --no-edit
   git push
6. Xác nhận Argo CD sync về bản ổn.
7. Xác nhận alert resolved.
```

Đây là tinh thần của bài:

```text
GitOps + Observability + Canary
  -> phát hiện lỗi bằng metric
  -> cảnh báo qua email
  -> rollback bằng rollout abort hoặc git revert
```
