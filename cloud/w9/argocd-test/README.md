# W9 argocd-test - GitOps, Observability, Canary

Project này là lab W9 cho luồng:

```text
Git
  -> Argo CD sync manifest
  -> Kubernetes chạy frontend/backend
  -> Prometheus scrape backend metrics
  -> PrometheusRule tạo SLO alert
  -> Alertmanager gửi email
  -> Argo Rollouts canary + AnalysisTemplate auto-abort bản lỗi
```

Mục tiêu theo đề HTML:

- Mọi thay đổi workload đi qua Git.
- Argo CD `Synced`, reproduce được từ Git.
- Rollback bằng `git revert` dưới 5 phút.
- Có 1 SLO + 1 alert gửi email cá nhân khi inject lỗi.
- Bad canary tự abort về bản cũ bằng `AnalysisTemplate`.

## Trạng Thái Hiện Tại Của Code

Baseline backend trong Git là bản khỏe:

```yaml
ERROR_RATE: "0"
VERSION: "v1"
```

Khi muốn test bad canary, đổi qua Git thành:

```yaml
ERROR_RATE: "0.8"
VERSION: "v2-bad"
```

Sau khi test xong, rollback bằng:

```bash
git revert <commit-test-bad> --no-edit
git push
```

Nếu Argo CD vẫn `Degraded` sau khi Git đã quay về bản khỏe, thường là Rollout còn giữ state abort cũ. Chạy:

```bash
kubectl -n argocd patch application argocd-test-be --type merge -p '{"operation":null}'
kubectl argo rollouts retry rollout backend -n argocd-test
kubectl -n argocd annotate application argocd-test-be argocd.argoproj.io/refresh=hard --overwrite
```

## Cấu Trúc Thư Mục

```text
cloud/w9/argocd-test/
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
      backend-config.yaml
      backend-deployment.yaml
      backend-service.yaml
      servicemonitor.yaml
      prometheusrule.yaml
      analysis-template.yaml
      kustomization.yaml
    frontend/
      frontend-deployment.yaml
      frontend-service.yaml
      kustomization.yaml

  monitoring/
    alertmanager-config.yaml

  EVIDENCE.md
  evidence/
```

## Hai Namespace Quan Trọng

```text
argocd      = nơi chứa Argo CD Application objects
argocd-test = nơi chạy backend/frontend thật
monitoring  = nơi chạy Prometheus, Alertmanager, Grafana
```

Ví dụ `gitops/apps/be-app.yaml`:

```yaml
metadata:
  name: argocd-test-be
  namespace: argocd
```

Nghĩa là object `Application` nằm trong namespace `argocd`.

Còn:

```yaml
destination:
  namespace: argocd-test
```

Nghĩa là workload backend thật được deploy vào namespace `argocd-test`.

## Luồng GitOps

Root app:

```text
gitops/root-app.yaml
  -> đọc cloud/w9/argocd-test/gitops/apps
  -> tạo argocd-test-be
  -> tạo argocd-test-fe
```

Backend app:

```text
argocd-test-be
  -> đọc cloud/w9/argocd-test/k8s/backend
  -> deploy namespace, service, rollout, servicemonitor, prometheusrule, analysistemplate
```

Frontend app:

```text
argocd-test-fe
  -> đọc cloud/w9/argocd-test/k8s/frontend
  -> deploy frontend deployment + service
```

Các app có:

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

Ý nghĩa:

- `automated`: Argo CD tự sync khi Git đổi.
- `prune`: resource bị xóa khỏi Git thì cluster cũng bị xóa.
- `selfHeal`: sửa tay trong cluster sẽ bị kéo về đúng Git.

Vì có `selfHeal`, patch live để test thường bị Argo CD kéo lại. Muốn test đúng thì đổi qua Git.

## Backend App Và Metrics

Backend là Flask app:

```text
GET /        -> trả JSON, có thể trả 500 nếu ERROR_RATE > 0
GET /healthz -> readiness probe
GET /metrics -> Prometheus metrics
```

Trong `backend/app.py`, `prometheus-flask-exporter` tự tạo `/metrics`.

Biến môi trường:

```text
ERROR_RATE = tỷ lệ lỗi giả lập
VERSION    = version hiện tại
MESSAGE    = lấy từ ConfigMap backend-config
```

Baseline:

```yaml
ERROR_RATE: "0"
VERSION: "v1"
```

Bad version để test:

```yaml
ERROR_RATE: "0.8"
VERSION: "v2-bad"
```

## ServiceMonitor

File:

```text
k8s/backend/servicemonitor.yaml
```

`ServiceMonitor` nói với Prometheus:

```text
Tìm Service có label app=backend
Scrape port http
Path /metrics
Interval 15s
```

Luồng:

```text
backend pod
  -> Service backend
  -> ServiceMonitor backend
  -> Prometheus scrape /metrics
```

Kiểm tra:

```bash
kubectl -n argocd-test get servicemonitor backend
```

Prometheus query:

```promql
flask_http_request_total{namespace="argocd-test"}
```

## SLO Alert

File:

```text
k8s/backend/prometheusrule.yaml
```

Alert:

```text
BackendHighErrorRate
```

Query:

```promql
(
  (sum(rate(flask_http_request_total{namespace="argocd-test", status=~"5.."}[1m])) or vector(0))
  /
  clamp_min((sum(rate(flask_http_request_total{namespace="argocd-test"}[1m])) or vector(0)), 1)
) > 0.05
```

Ý nghĩa:

```text
Nếu HTTP 5xx > 5% tổng request trong cửa sổ 1 phút thì alert fire. Rule có `for: 30s`, nên trong lab chỉ cần lỗi giữ hơn khoảng 30 giây là alert có thể chuyển sang `Firing`.
```

`or vector(0)` dùng để tránh query trả rỗng khi chưa có lỗi 5xx. Nếu query rỗng, Argo Rollouts có thể lỗi kiểu `slice index out of range`.

`clamp_min(..., 1)` tránh chia cho 0 khi chưa có traffic.

## Alertmanager Email Bằng Secret

Project hiện không dùng `AlertmanagerConfig`. Thay vào đó dùng Secret chứa toàn bộ `alertmanager.yaml`.

File mẫu trong Git:

```text
monitoring/alertmanager-config.yaml
```

File này chỉ là mẫu, không chứa password thật:

```yaml
smtp_auth_password: REPLACE_AT_APPLY_TIME_DO_NOT_COMMIT_REAL_PASSWORD
```

Secret thật nằm trong cluster:

```text
namespace: monitoring
name: alertmanager-config
```

Alertmanager đọc Secret này nhờ:

```bash
kubectl -n monitoring patch alertmanager monitoring-kube-prometheus-alertmanager \
  --type merge \
  -p '{"spec":{"configSecret":"alertmanager-config"}}'
```

## Vì Sao Có `blackhole`?

Prometheus có nhiều alert hệ thống như:

```text
Watchdog
TargetDown
etcdDatabaseHighFragmentationRatio
```

Nếu route mặc định gửi về email, Gmail sẽ bị spam bởi các alert không liên quan tới bài lab.

Config hiện tại:

```text
route mặc định -> blackhole
route con match alertname="BackendHighErrorRate" -> personal-email
```

Nghĩa là:

```text
BackendHighErrorRate -> gửi Gmail
Watchdog/TargetDown/alert khác -> không gửi Gmail
```

## Flow Email

```text
Backend Flask /metrics
  -> ServiceMonitor scrape /metrics
  -> Prometheus lưu metric flask_http_request_total
  -> PrometheusRule tính error-rate
  -> BackendHighErrorRate Firing
  -> Alertmanager nhận alert
  -> Alertmanager đọc Secret monitoring/alertmanager-config
  -> route match alertname="BackendHighErrorRate"
  -> receiver personal-email
  -> Gmail SMTP gửi email
```

## Argo Rollouts Canary

File:

```text
k8s/backend/backend-deployment.yaml
```

Backend dùng `Rollout`, không dùng `Deployment`.

Strategy:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 25
      - analysis:
          templates:
            - templateName: backend-error-rate
      - setWeight: 50
      - analysis:
          templates:
            - templateName: backend-error-rate
      - setWeight: 100
```

Ý nghĩa:

```text
25% traffic/pod sang bản mới
  -> chạy analysis
50%
  -> chạy analysis
100% nếu analysis pass
```

## AnalysisTemplate Auto-Abort

File:

```text
k8s/backend/analysis-template.yaml
```

Analysis query Prometheus bằng cùng logic error-rate:

```text
result < 0.05  -> pass
result >= 0.05 -> fail
```

Config hiện tại:

```yaml
interval: 20s
count: 4
failureLimit: 3
```

Nghĩa là Rollout đo nhiều lần. Nếu metric xấu vượt giới hạn, AnalysisRun fail và Rollout abort.

## Vì Sao Test Bad Canary Thì Argo CD Báo Degraded?

Khi bạn đổi qua Git:

```yaml
ERROR_RATE: "0.8"
VERSION: "v2-bad"
```

backend bắt đầu trả nhiều HTTP 500.

Sau đó:

```text
Rollout tạo ReplicaSet mới
  -> chạy canary
  -> AnalysisTemplate query Prometheus
  -> error-rate >= 5%
  -> AnalysisRun Failed
  -> RolloutAborted
  -> Argo CD Health = Degraded
```

Đây là trạng thái đúng khi chứng minh bad version tự abort. Nó không có nghĩa cluster hỏng. Nó nghĩa là release lỗi đã bị chặn.

Muốn quay về Healthy, phải rollback bằng Git:

```bash
git revert <commit-test-bad> --no-edit
git push
kubectl argo rollouts retry rollout backend -n argocd-test
```

## Vì Sao Có Nhiều ReplicaSet Và AnalysisRun?

Trong Argo CD tree có thể thấy nhiều `ReplicaSet` và nhiều `AnalysisRun`. Đây là hành vi bình thường của Argo Rollouts, không phải tự nhiên sinh rác.

### Vì sao có nhiều ReplicaSet?

Backend không dùng `Deployment` thường mà dùng `Rollout`. Bên dưới `Rollout`, Kubernetes vẫn dùng `ReplicaSet` để giữ từng version của Pod template.

Mỗi lần đổi phần `spec.template` của backend qua Git, ví dụ:

```yaml
ERROR_RATE: "0.8"
VERSION: "v2-bad"
```

hoặc rollback lại:

```yaml
ERROR_RATE: "0"
VERSION: "v1"
```

thì Argo Rollouts tạo một `ReplicaSet` mới cho revision mới.

Ví dụ trong Argo CD tree:

```text
backend-5dbc4846c6  rev:17
backend-c7996f6bf   rev:16
backend-7cfdbb86fb  rev:10
```

Ý nghĩa:

- `rev:17` là revision mới nhất hiện tại.
- `rev:16` có thể là revision test lỗi trước đó.
- `rev:10` là revision cũ hơn còn được giữ lại trong history.
- ReplicaSet màu xanh/Healthy nghĩa là resource đó không crash, không đồng nghĩa tất cả đều đang nhận traffic.

Project có:

```yaml
revisionHistoryLimit: 2
```

để hạn chế số ReplicaSet cũ mà Rollout giữ lại. Tuy vậy, trong lúc test nhiều lần, bạn vẫn có thể thấy nhiều ReplicaSet trong Argo CD UI vì:

- Rollout đang giữ stable ReplicaSet và canary ReplicaSet.
- Argo CD cache/tree chưa refresh sạch ngay.
- Một vài ReplicaSet cũ còn tồn tại cho rollback/history.

### Vì sao pod chuyển dần dần qua version mới?

Canary release không thay toàn bộ pod một lần. Nó chuyển traffic/tỉ lệ pod theo từng bước để giảm rủi ro.

Trong file backend rollout có logic kiểu:

```yaml
steps:
  - setWeight: 25
  - analysis:
      templates:
        - templateName: backend-error-rate
  - setWeight: 50
  - analysis:
      templates:
        - templateName: backend-error-rate
  - setWeight: 100
```

Với `replicas: 4`, `setWeight` sẽ gần tương ứng như sau:

```text
setWeight: 25   -> khoảng 1 pod canary, 3 pod stable
setWeight: 50   -> khoảng 2 pod canary, 2 pod stable
setWeight: 100  -> toàn bộ pod chạy version mới
```

Luồng đúng:

```text
Git push version mới
  -> Argo CD sync Rollout
  -> Rollout tạo ReplicaSet mới
  -> chạy một phần pod canary
  -> AnalysisRun hỏi Prometheus error-rate
  -> nếu tốt thì tăng weight
  -> nếu xấu thì abort, giữ stable version
```

Vì vậy trong tree có lúc bạn thấy 2 nhánh pod/ReplicaSet cùng tồn tại. Đó là thời điểm Rollout đang giữ cả version stable và version canary.

### Vì sao có nhiều AnalysisRun?

Mỗi lần Rollout đi tới một step `analysis`, nó tạo một `AnalysisRun` mới. Nếu một rollout có 2 step analysis thì một revision có thể tạo nhiều AnalysisRun.

Ví dụ:

```text
backend-c7996f6bf-14-1
backend-c7996f6bf-14-3
backend-c7996f6bf-16-1
backend-c7996f6bf-16-3
```

Cách đọc tên:

```text
backend-<replicaset-hash>-<revision>-<analysis-step>
```

Trong đó:

- `<replicaset-hash>` cho biết AnalysisRun thuộc ReplicaSet nào.
- `<revision>` cho biết nó thuộc lần rollout thứ mấy.
- `<analysis-step>` cho biết nó được tạo ở step analysis nào.

Vì bạn test lỗi, rollback, rồi test lại nhiều lần nên có nhiều AnalysisRun là bình thường.

### Vì sao có AnalysisRun xanh và đỏ?

AnalysisRun màu xanh/Healthy nghĩa là lần đo đó pass.

Ví dụ:

```text
error-rate < 0.05
```

AnalysisRun màu đỏ/Degraded nghĩa là lần đo đó fail.

Ví dụ:

```text
error-rate >= 0.05
```

Trong lab này, AnalysisRun đỏ là bằng chứng tốt cho phần auto-abort:

```text
Backend lỗi cao
  -> Prometheus query trả error-rate xấu
  -> AnalysisRun Failed
  -> RolloutAborted
  -> Argo CD hiển thị Degraded
```

Sau khi bạn `git revert` commit lỗi và Rollout về Healthy, các AnalysisRun đỏ cũ vẫn có thể còn nằm trong tree như lịch sử. Nó không có nghĩa app hiện tại vẫn lỗi. Muốn biết hiện tại có ổn không, nhìn vào:

```bash
kubectl argo rollouts get rollout backend -n argocd-test
kubectl -n argocd get applications
kubectl -n argocd-test get pods
```

Kỳ vọng sau rollback:

```text
argocd-test-be   Synced   Healthy
backend pods     Running
rollout backend  Healthy
```

Đây là lịch sử rollout, không phải lỗi.

### Có xóa bớt được không?

Có thể xóa AnalysisRun cũ sau khi đã chụp evidence:

```bash
kubectl -n argocd-test delete analysisrun --all
```

Không nên xóa tay ReplicaSet hiện tại hoặc stable ReplicaSet nếu chưa chắc, vì Rollout đang dùng chúng để giữ version ổn định hoặc để rollback. Nếu muốn sạch hơn, ưu tiên để `revisionHistoryLimit` quản lý tự động.

## Quy Trình Test Đúng

### 1. Baseline Healthy

Backend trong Git phải là:

```yaml
ERROR_RATE: "0"
VERSION: "v1"
```

Check:

```bash
kubectl -n argocd get applications
kubectl argo rollouts get rollout backend -n argocd-test
```

Kỳ vọng:

```text
argocd-test-be Synced Healthy
Rollout backend Healthy
```

### 2. Cấu Hình Email

Tạo Secret thật bằng Google App Password:

```bash
kubectl -n monitoring create secret generic alertmanager-config \
  --from-literal=alertmanager.yaml="global:
  resolve_timeout: 5m
  smtp_smarthost: smtp.gmail.com:587
  smtp_from: lenguyennhatthanh72@gmail.com
  smtp_auth_username: lenguyennhatthanh72@gmail.com
  smtp_auth_password: APP_PASSWORD
  smtp_require_tls: true

route:
  receiver: blackhole
  routes:
    - receiver: personal-email
      matchers:
        - alertname=\"BackendHighErrorRate\"
      group_by:
        - alertname
      group_wait: 10s
      group_interval: 30s
      repeat_interval: 2h

receivers:
  - name: blackhole
  - name: personal-email
    email_configs:
      - to: lenguyennhatthanh72@gmail.com
        send_resolved: true" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Patch Alertmanager:

```bash
kubectl -n monitoring patch alertmanager monitoring-kube-prometheus-alertmanager \
  --type merge \
  -p '{"spec":{"configSecret":"alertmanager-config"}}'

kubectl -n monitoring delete pod alertmanager-monitoring-kube-prometheus-alertmanager-0
```

### 3. Tạo Traffic

```bash
kubectl -n argocd-test delete pod load --ignore-not-found
kubectl -n argocd-test run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://backend:8080/; sleep 0.2; done"
```

### 4. Tạo Bad Version Qua Git

Sửa:

```yaml
ERROR_RATE: "0.8"
VERSION: "v2-bad"
```

Commit:

```bash
git add cloud/w9/argocd-test/k8s/backend/backend-deployment.yaml
git commit -m "test bad backend canary"
git push
```

Theo dõi:

```bash
kubectl argo rollouts get rollout backend -n argocd-test --watch
```

Mở Prometheus:

```text
http://localhost:9090/alerts
```

Mở Alertmanager:

```text
http://localhost:9093
```

### 5. Rollback

```bash
git revert <commit-test-bad> --no-edit
git push
kubectl argo rollouts retry rollout backend -n argocd-test
```

## Evidence

File nộp bằng chứng:

```text
EVIDENCE.md
```

Ảnh đặt trong:

```text
evidence/
```

Các ảnh cần có:

```text
01-argocd-apps.png
02-argocd-tree.png
03-k8s-resources.png
04-prometheus-query.png
05-prometheus-alert-firing.png
06-alertmanager-alert.png
07-email-received.png
08-rollout-analysis-failed.png
09-git-revert.png
10-rollback-healthy.png
```
