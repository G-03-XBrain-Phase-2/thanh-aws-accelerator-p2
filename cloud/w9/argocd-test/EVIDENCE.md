# Báo Cáo Bằng Chứng - W9 GitOps, Observability Và Canary

## Tổng Quan Dự Án

Dự án `cloud/w9/argocd-test` triển khai ứng dụng frontend/backend theo mô hình GitOps bằng Argo CD. Backend được triển khai bằng Argo Rollouts để hỗ trợ canary release, có Prometheus metrics, SLO alert, email notification và cơ chế auto-abort khi canary lỗi.

Các thành phần chính:

- Argo CD app-of-apps: `root-app-argocd-test`.
- Backend Application: `argocd-test-be`.
- Frontend Application: `argocd-test-fe`.
- Namespace workload: `argocd-test`.
- Backend: Flask app expose `/metrics`.
- Frontend: Nginx static site.
- Observability: Prometheus, ServiceMonitor, PrometheusRule, Alertmanager config Secret.
- Canary: Argo Rollouts + AnalysisTemplate.
- Rollback: Git revert + Argo CD sync.

## 1. Argo CD Quản Lý Ứng Dụng Theo GitOps

Ảnh minh chứng:

![Argo CD applications](evidence/01-argocd-apps.png)

Kết quả ghi nhận:

- `root-app-argocd-test` ở trạng thái `Synced` và `Healthy`.
- `argocd-test-be` ở trạng thái `Synced` và `Healthy`.
- `argocd-test-fe` ở trạng thái `Synced` và `Healthy`.

Ý nghĩa:

Argo CD đang lấy manifest từ Git repository và tự động đồng bộ resource xuống Kubernetes cluster. Project dùng mô hình app-of-apps: root app quản lý các Application con của backend và frontend.

## 2. Argo CD Tree Có Đầy Đủ Resource Backend

Ảnh minh chứng:

![Argo CD backend tree](evidence/02-argocd-tree-1.png)
![Argo CD backend tree](evidence/02-argocd-tree-2.png)
![Argo CD backend tree](evidence/02-argocd-tree-3.png)

Kết quả ghi nhận:

Tree của `argocd-test-be` có các resource chính:

- Namespace `argocd-test`.
- Service `backend`.
- Rollout `backend`.
- ServiceMonitor `backend`.
- PrometheusRule `backend-slo-rules`.
- Alertmanager dùng Secret `alertmanager-config` trong namespace `monitoring`.
- AnalysisTemplate `backend-error-rate`.

Ý nghĩa:

Backend không chỉ được deploy như workload thông thường mà còn có đầy đủ resource cho observability, alerting và canary analysis.

## 3. Backend Và Frontend Chạy Trong Kubernetes

Ảnh minh chứng:

![Kubernetes resources](evidence/03-k8s-resources.png)

Kết quả ghi nhận:

- Namespace `argocd-test` tồn tại.
- Backend chạy bằng `Rollout`.
- Frontend chạy bằng `Deployment`.
- Pod backend/frontend ở trạng thái `Running`.
- Service `backend` và `frontend` tồn tại.
- Các resource monitoring và rollout analysis đã được tạo trong cluster.

Ý nghĩa:

Ứng dụng đã được Argo CD sync thành resource thật trong Kubernetes cluster.

## 4. Prometheus Scrape Được Metrics Backend

Ảnh minh chứng:

![Prometheus query](evidence/04-prometheus-query.png)

Kết quả ghi nhận:

Prometheus query `flask_http_request_total{namespace="argocd-test"}` trả về metric của backend.

Ý nghĩa:

Backend expose `/metrics` thành công và `ServiceMonitor/backend` đã giúp Prometheus scrape được dữ liệu.

## 5. SLO Alert BackendHighErrorRate Firing

Ảnh minh chứng:

![Prometheus alert firing](evidence/05-prometheus-alert-firing.png)

Kết quả ghi nhận:

- Prometheus đã load rule group `backend.slo`.
- Alert `BackendHighErrorRate` chuyển sang `Firing` khi backend lỗi cao.

Ý nghĩa:

`PrometheusRule/backend-slo-rules` tính error-rate từ metric `flask_http_request_total`. Khi tỉ lệ HTTP 5xx vượt 5% trong thời gian cấu hình, alert được kích hoạt.

## 6. Alertmanager Nhận Alert Và Gửi Email

Ảnh minh chứng Alertmanager:

![Alertmanager alert](evidence/06-alertmanager-alert.png)

Ảnh minh chứng email:

![Email received](evidence/07-email-received.png)

Kết quả ghi nhận:

- Alertmanager nhận alert `BackendHighErrorRate`.
- Email cá nhân nhận được cảnh báo từ Alertmanager.

Ý nghĩa:

Luồng alert end-to-end đã hoạt động:

```text
PrometheusRule
  -> Alertmanager
  -> Secret alertmanager-config
  -> Gmail SMTP
  -> Email cá nhân
```

## 7. Canary Bad Version Tự Abort Bằng AnalysisTemplate

Ảnh minh chứng:

![Rollout analysis failed](evidence/08-rollout-analysis-failed.png)

Kết quả ghi nhận:

- Rollout tạo ReplicaSet mới cho bad version.
- Canary đi tới step analysis.
- `AnalysisRun` được tạo.
- `AnalysisRun` fail do backend error rate vượt ngưỡng.
- Rollout abort bad canary và không promote lên 100%.

Ý nghĩa:

Argo Rollouts tự động kiểm tra chất lượng canary bằng `AnalysisTemplate/backend-error-rate`. Nếu Prometheus báo error rate xấu, bad version bị abort tự động.

## 8. Rollback Bằng Git Revert

Ảnh minh chứng Git revert:

![Git revert](evidence/09-git-revert.png)

Ảnh minh chứng Argo CD sau rollback:

![Rollback healthy](evidence/10-rollback-healthy.png)

Kết quả ghi nhận:

- Commit lỗi được revert bằng `git revert`.
- Commit revert được push lên Git.
- Argo CD sync lại trạng thái ổn định.
- Backend quay về version ổn định.
- Rollout `backend` Healthy.
- Alert được resolve.
- Rollback hoàn tất dưới 5 phút.

Ý nghĩa:

Rollback tuân thủ GitOps: không sửa tay trong cluster, mà đảo thay đổi bằng Git commit mới rồi để Argo CD đồng bộ cluster về trạng thái mong muốn.

## Checklist Bằng Chứng

Các ảnh minh chứng được đặt trong thư mục `evidence/`:

```text
evidence/01-argocd-apps.png
evidence/02-argocd-tree-1.png
evidence/02-argocd-tree-2.png
evidence/02-argocd-tree-3.png
evidence/03-k8s-resources.png
evidence/04-prometheus-query.png
evidence/05-prometheus-alert-firing.png
evidence/06-alertmanager-alert.png
evidence/07-email-received.png
evidence/08-rollout-analysis-failed.png
evidence/09-git-revert.png
evidence/10-rollback-healthy.png
```

## Cách Tạo Bằng Chứng

### 1. Baseline GitOps

```bash
kubectl -n argocd get applications
kubectl -n argocd-test get rollout,pods,svc
kubectl -n argocd-test get servicemonitor,prometheusrule,analysistemplate
```

Chụp:

```text
evidence/01-argocd-apps.png
evidence/03-k8s-resources.png
```

### 2. Cấu Hình Email An Toàn

File mẫu trong Git:

```text
cloud/w9/argocd-test/monitoring/alertmanager-config.yaml
```

File này không chứa password thật. Secret thật được tạo trực tiếp trong cluster.

Tạo Secret Alertmanager, thay `APP_PASSWORD` bằng Google App Password 16 ký tự:

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

Cho Alertmanager đọc Secret:

```bash
kubectl -n monitoring patch alertmanager monitoring-kube-prometheus-alertmanager \
  --type merge \
  -p '{"spec":{"configSecret":"alertmanager-config"}}'

kubectl -n monitoring delete pod alertmanager-monitoring-kube-prometheus-alertmanager-0
```

Kiểm tra:

```bash
kubectl -n monitoring exec alertmanager-monitoring-kube-prometheus-alertmanager-0 -- \
  cat /etc/alertmanager/config_out/alertmanager.env.yaml | grep -A40 BackendHighErrorRate
```

### 3. Prometheus Có Metric Backend

```bash
kubectl -n argocd-test delete pod load --ignore-not-found
kubectl -n argocd-test run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://backend:8080/; sleep 0.2; done"
```

Query Prometheus:

```promql
flask_http_request_total{namespace="argocd-test"}
```

Chụp:

```text
evidence/04-prometheus-query.png
```

### 4. Test Bad Canary, Alert Email Và Auto-Abort

Sửa `cloud/w9/argocd-test/k8s/backend/backend-deployment.yaml`:

```yaml
- name: ERROR_RATE
  value: "0.8"
- name: VERSION
  value: "v2-bad"
```

Commit và push:

```bash
git add cloud/w9/argocd-test/k8s/backend/backend-deployment.yaml
git commit -m "test bad backend canary"
git push
```

Theo dõi rollout:

```bash
kubectl argo rollouts get rollout backend -n argocd-test --watch
```

Chụp các ảnh:

```text
evidence/05-prometheus-alert-firing.png
evidence/06-alertmanager-alert.png
evidence/07-email-received.png
evidence/08-rollout-analysis-failed.png
```

Lệnh hỗ trợ chụp auto-abort:

```bash
kubectl -n argocd-test get analysisrun
kubectl -n argocd-test describe rollout backend
```

### 5. Rollback Bằng Git Revert

```bash
git log --oneline -5
git revert <COMMIT_TEST_BAD> --no-edit
git push
```

Nếu Rollout còn giữ state abort cũ:

```bash
kubectl argo rollouts retry rollout backend -n argocd-test
```

Chụp:

```text
evidence/09-git-revert.png
evidence/10-rollback-healthy.png
```

## Kết Luận Theo Acceptance Criteria

Dự án đáp ứng các yêu cầu chính:

- App được quản lý bằng GitOps thông qua Argo CD app-of-apps.
- Backend/frontend chạy trong namespace `argocd-test`.
- Backend expose Prometheus metrics qua `/metrics`.
- Prometheus scrape backend bằng `ServiceMonitor`.
- `PrometheusRule` tạo SLO alert `BackendHighErrorRate`.
- Secret `alertmanager-config` cấu hình Alertmanager gửi alert tới email cá nhân qua Gmail SMTP.
- Backend dùng Argo Rollouts canary.
- `AnalysisTemplate` query Prometheus để auto-abort bad version.
- Rollback được thực hiện bằng `git revert` và Argo CD sync lại trong dưới 5 phút.
