# W10 Lab - Production-Ready Mini Platform

Tài liệu này tổng hợp toàn bộ kiến thức của lab W10 theo 2 buổi:

- Morning: RBAC + Admission + GitOps guardrails.
- Afternoon: Secrets rotation + Supply chain security + multi-tenant take-home.

Mục tiêu không phải chỉ là apply YAML cho xanh. Mục tiêu thật là hiểu một platform nhỏ được bảo vệ nhiều lớp:

```text
GitOps làm source of truth
RBAC giới hạn ai được làm gì
Gatekeeper chặn manifest xấu
ESO đồng bộ secret từ AWS về Kubernetes
Trivy scan image trước khi push
Cosign ký image
Sigstore Policy Controller chặn image chưa ký
ResourceQuota/LimitRange/NetworkPolicy cô lập tenant mới
```

Khi hoàn thành đúng, cluster chứng minh được các điều sau:

```text
Developer chỉ có quyền trong namespace được cấp.
Manifest thiếu security guardrail bị admission chặn.
Secret thật không nằm trong Git.
Kubernetes Secret được sync từ AWS Secrets Manager.
Image có HIGH/CRITICAL CVE làm CI fail.
Image chưa ký bị admission reject.
Tenant payments kế thừa guardrail cũ, không phải viết policy mới.
```

---

## 1. Bức Tranh Tổng Thể

Mọi request vào Kubernetes đi qua flow:

```text
kubectl / ArgoCD / controller
  |
  v
Authentication
  |
  v
Authorization
  |
  v
Admission Control
  |
  v
etcd
```

Ý nghĩa từng bước:

| Bước | Trả lời câu hỏi | Ví dụ |
|---|---|---|
| Authentication | Bạn là ai? | `alice`, `bob`, `system:serviceaccount:demo:api-sa` |
| Authorization | Bạn được làm gì? | `alice` có được create Deployment trong `demo` không? |
| Admission | Object này có được tồn tại không? | Pod có chạy root không? image có `:latest` không? |
| etcd | Lưu object | Chỉ lưu nếu qua hết các bước trên |

Điểm quan trọng:

```text
RBAC kiểm tra actor/action.
Admission kiểm tra nội dung object.
```

Ví dụ:

```text
alice có quyền create Pod trong demo.
Nhưng Pod dùng nginx:latest.
RBAC allow.
Gatekeeper deny.
Pod không được tạo.
```

---

## 2. Cấu Trúc Lab Hiện Tại

```text
cloud/w10/lab/
├── README.md
├── .gitignore
├── app-common/
│   └── demo-namespace.yaml
├── app-api/
│   ├── rollout.yaml
│   ├── service.yaml
│   └── servicemonitor.yaml
├── app-analysis/
│   └── analysis-template.yaml
├── app-alert/
│   ├── email-secret.yaml
│   ├── prometheus-rules.yaml
│   └── README.md
├── argocd/
│   ├── root.yaml
│   └── apps/
│       ├── app-common.yaml
│       ├── app-api.yaml
│       ├── app-analysis.yaml
│       ├── app-alert.yaml
│       ├── k8s-prometheus.yaml
│       ├── k8s-rollout.yaml
│       ├── rbac.yaml
│       ├── gatekeeper-template.yaml
│       ├── gatekeeper-constraint.yaml
│       ├── eso.yaml
│       ├── eso-config.yaml
│       ├── policy-controller.yaml
│       ├── policies.yaml
│       ├── payments.yaml
│       └── payments-app.yaml
├── rbac/
│   ├── roles.yaml
│   └── rolebindings.yaml
├── gatekeeper/
│   ├── templates/
│   └── constraints/
├── eso/
│   ├── secret-store.yaml
│   └── external-secret.yaml
├── policies/
│   └── cluster-image-policy.yaml
├── signing/
│   ├── cosign.pub
│   └── cosign.key
├── tenants/
│   └── payments/
│       ├── namespace.yaml
│       ├── rbac.yaml
│       ├── quota-limitrange.yaml
│       ├── networkpolicy.yaml
│       └── README.md
├── apps/
│   └── payments/
│       ├── deployment.yaml
│       └── service.yaml
├── evidence/
│   ├── payments-bad-latest-pod.yaml
│   ├── payments-no-limits-pod.yaml
│   └── payments-quota-too-large-pod.yaml
├── runbooks/
│   ├── secret-rotation-failure.md
│   ├── image-signature-denied.md
│   └── cve-exception-adr.md
└── src/
    └── api/
        ├── app.py
        └── Dockerfile
```

Lưu ý bảo mật:

```text
signing/cosign.key là private key.
Không được commit private key.
Chỉ commit signing/cosign.pub.
```

---

## 3. GitOps Flow Với ArgoCD

Lab dùng App of Apps pattern.

```text
argocd/root.yaml
  |
  v
argocd/apps/*.yaml
  |
  +-- common
  +-- rbac
  +-- gatekeeper templates
  +-- gatekeeper constraints
  +-- eso operator
  +-- eso config
  +-- policy-controller
  +-- image policies
  +-- monitoring
  +-- rollout controller
  +-- api app
  +-- payments tenant
  +-- payments app
```

Apply root:

```bash
kubectl apply -f cloud/w10/lab/argocd/root.yaml
```

`root.yaml` trỏ vào:

```text
cloud/w10/lab/argocd/apps
```

Tức là root app sẽ tạo toàn bộ child apps trong folder đó.

### Vì sao cần sync-wave?

Nhiều resource phụ thuộc CRD/controller có trước.

Ví dụ:

```text
ESO operator phải cài trước.
Sau đó mới apply SecretStore/ExternalSecret.
```

Nếu làm ngược:

```text
no matches for kind SecretStore
```

Ví dụ Gatekeeper:

```text
ConstraintTemplate phải apply trước.
Constraint apply sau.
```

Nếu làm ngược:

```text
no matches for kind K8sDisallowedTags
```

Ví dụ Sigstore:

```text
policy-controller phải cài trước.
ClusterImagePolicy apply sau.
```

Nếu làm ngược:

```text
no matches for kind ClusterImagePolicy
```

---

## 4. ArgoCD Application Files

### `argocd/root.yaml`

Root app quản lý toàn bộ child applications.

Quan trọng:

```yaml
source:
  repoURL: https://github.com/G-03-XBrain-Phase-2/thanh-aws-accelerator-p2.git
  path: cloud/w10/lab/argocd/apps
  targetRevision: main
```

Nghĩa là ArgoCD lấy manifest child app từ GitHub branch `main`.

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

Ý nghĩa:

| Field | Ý nghĩa |
|---|---|
| `automated` | Tự sync khi Git thay đổi |
| `prune: true` | Xóa resource ngoài cluster nếu Git đã xóa |
| `selfHeal: true` | Nếu ai sửa tay ngoài cluster, ArgoCD kéo về đúng Git |

### `argocd/apps/app-common.yaml`

Sync `app-common/`, hiện chứa namespace `demo`.

Đây là app nền tảng cho workload chính.

### `argocd/apps/rbac.yaml`

Sync `rbac/` để tạo role, clusterrole, binding cho user lab.

### `argocd/apps/gatekeeper-template.yaml`

Sync `gatekeeper/templates/`.

Nó tạo các `ConstraintTemplate`.

### `argocd/apps/gatekeeper-constraint.yaml`

Sync `gatekeeper/constraints/`.

Nó tạo các `Constraint` thật sự enforce vào namespace `demo` và `payments`.

### `argocd/apps/eso.yaml`

Cài External Secrets Operator từ Helm chart.

Nó tạo controller và CRDs:

```text
SecretStore
ExternalSecret
ClusterSecretStore
```

### `argocd/apps/eso-config.yaml`

Sync `eso/`, gồm:

```text
secret-store.yaml
external-secret.yaml
```

App này phải chạy sau `eso.yaml`.

### `argocd/apps/policy-controller.yaml`

Cài Sigstore Policy Controller.

Controller này làm admission verify image signature.

### `argocd/apps/policies.yaml`

Sync `policies/`, gồm `ClusterImagePolicy`.

App này phải chạy sau `policy-controller.yaml`.

### `argocd/apps/k8s-rollout.yaml`

Cài Argo Rollouts controller.

Controller này quản lý resource:

```text
kind: Rollout
```

### `argocd/apps/k8s-prometheus.yaml`

Cài `kube-prometheus-stack`:

```text
Prometheus
Alertmanager
Grafana
Prometheus Operator
ServiceMonitor CRD
PrometheusRule CRD
```

### `argocd/apps/app-api.yaml`

Sync `app-api/`:

```text
Rollout
Service
ServiceMonitor
```

### `argocd/apps/app-analysis.yaml`

Sync `app-analysis/`, chứa AnalysisTemplate cho Argo Rollouts.

### `argocd/apps/app-alert.yaml`

Sync `app-alert/`, chứa PrometheusRule và cấu hình alert.

### `argocd/apps/payments.yaml`

Sync tenant infrastructure:

```text
tenants/payments/
```

Gồm namespace, RBAC, quota, LimitRange, NetworkPolicy.

### `argocd/apps/payments-app.yaml`

Sync workload của team payments:

```text
apps/payments/
```

---

## 5. RBAC Morning Lab

RBAC trả lời câu hỏi:

```text
Subject nào được verb gì trên resource nào?
```

Công thức:

```text
Subject -> RoleBinding/ClusterRoleBinding -> Role/ClusterRole -> rules
```

### `rbac/roles.yaml`

File này tạo:

```text
Role developer trong namespace demo
ClusterRole sre
ClusterRole viewer
```

#### Role `developer`

```yaml
kind: Role
metadata:
  namespace: demo
  name: developer
```

Role là namespaced.

Nghĩa là role này chỉ có ý nghĩa trong namespace `demo`.

Quyền:

```yaml
resources:
  - pods
  - configmaps
  - services
verbs:
  - get
  - list
  - create
  - update
  - watch
  - patch
  - delete
```

Developer được thao tác Pod, ConfigMap, Service trong `demo`.

Với API group `apps`:

```yaml
resources:
  - deployments
  - replicasets
```

Developer được thao tác Deployment và ReplicaSet.

#### ClusterRole `sre`

ClusterRole là cluster-scoped.

`sre` có quyền xem và xóa một số workload:

```text
pods
configmaps
services
pods/log
events
deployments
replicasets
```

SRE có `delete`, nhưng không có `create/update/patch` trong file hiện tại.

#### ClusterRole `viewer`

Viewer chỉ có:

```text
get
list
watch
```

Không có create, update, patch, delete.

### `rbac/rolebindings.yaml`

File này gắn quyền cho user.

#### `alice-developer`

```yaml
kind: RoleBinding
metadata:
  namespace: demo
  name: alice-developer
subjects:
  - kind: User
    name: alice
roleRef:
  kind: Role
  name: developer
```

Nghĩa là:

```text
alice có Role developer trong namespace demo.
```

Alice không tự động có quyền trong `payments`, `prod`, `kube-system`.

#### `bob-sre`

```yaml
kind: ClusterRoleBinding
subjects:
  - kind: User
    name: bob
roleRef:
  kind: ClusterRole
  name: sre
```

Nghĩa là:

```text
bob có ClusterRole sre ở phạm vi cluster.
```

#### `carol-viewer`

Carol có quyền xem ở phạm vi cluster.

Không có quyền sửa/xóa.

### Test RBAC

```bash
kubectl auth can-i create deployments -n demo --as=alice
kubectl auth can-i get secrets -n demo --as=alice
kubectl auth can-i delete pods -n demo --as=bob
kubectl auth can-i create deployments -n demo --as=carol
```

Kỳ vọng:

```text
alice create deployments trong demo -> yes
alice get secrets trong demo -> no
bob delete pods -> yes
carol create deployments -> no
```

### Lý thuyết quan trọng

RBAC là cộng quyền.

Nếu user có 2 binding:

```text
Binding A cho get pods
Binding B cho get secrets
```

Thì user có cả 2 quyền.

Kubernetes RBAC không có deny rule.

---

## 6. Gatekeeper Admission Guardrails

Gatekeeper là admission controller.

Nó chặn object trước khi object được lưu vào etcd.

Gatekeeper có 2 lớp:

```text
ConstraintTemplate
Constraint
```

### ConstraintTemplate

Template định nghĩa:

```text
Tên kind policy mới
Schema parameters
Logic kiểm tra
Message lỗi
```

Ví dụ:

```yaml
kind: ConstraintTemplate
metadata:
  name: k8sdisallowedtags
spec:
  crd:
    spec:
      names:
        kind: K8sDisallowedTags
```

Sau khi apply template, Kubernetes biết kind mới:

```text
K8sDisallowedTags
```

### Constraint

Constraint dùng kind do template tạo ra.

Ví dụ:

```yaml
kind: K8sDisallowedTags
metadata:
  name: container-image-must-not-have-latest-tag
```

Constraint nói:

```text
Áp policy vào namespace nào?
Áp vào kind nào?
Parameter là gì?
Enforce ra sao?
```

### Các policy trong lab

Lab hiện có 5 guardrails:

| File | Kind | Mục tiêu |
|---|---|---|
| `disallow-latest-tag.yaml` | `K8sDisallowedTags` | Cấm image `:latest` |
| `require-limits.yaml` | `K8sRequiredResources` | Bắt container có CPU/memory limits |
| `disallow-root-user.yaml` | `K8sPSPAllowedUsers` | Cấm container chạy root |
| `disallow-host-network.yaml` | `K8sPSPHostNetworkingPorts` | Cấm `hostNetwork` |
| `limit-replicas.yaml` | `K8sReplicaLimits` | Giới hạn số replicas |

### Scope namespace

Các constraint chính áp vào:

```yaml
namespaces:
  - demo
  - payments
```

Vì sao không apply toàn cluster?

Vì policy như `require-limits` có thể chặn Pod hệ thống:

```text
argocd
monitoring
kube-system
external-secrets
```

Trong lab trước đó, monitoring từng bị chặn vì webhook job không có limits. Vì vậy scope namespace là cách làm thực tế hơn.

### enforcementAction

```yaml
enforcementAction: deny
```

Nghĩa là object vi phạm sẽ bị chặn.

Các mode hay gặp:

| Mode | Có chặn không? | Dùng khi nào |
|---|---|---|
| `dryrun` | Không | Đo impact trước |
| `warn` | Không | Báo cảnh báo cho client |
| `deny` | Có | Enforce thật |

---

## 7. Progressive Delivery: Argo Rollouts

### `app-api/rollout.yaml`

File này tạo Argo Rollout `api` trong namespace `demo`.

Khác Deployment thường:

```text
Deployment rollout đơn giản.
Argo Rollout hỗ trợ canary, blue-green, analysis, auto rollback.
```

Phần chính:

```yaml
kind: Rollout
metadata:
  name: api
  namespace: demo
spec:
  replicas: 4
```

Mục tiêu là chạy 4 replicas khi rollout hoàn tất.

Container:

```yaml
image: ghcr.io/g-03-xbrain-phase-2/w10-api:v0.0.1-a1bf92e
```

Image phải lowercase.

Sai:

```text
ghcr.io/G-03-XBrain-Phase-2/w10-api:...
```

Đúng:

```text
ghcr.io/g-03-xbrain-phase-2/w10-api:...
```

Vì Docker registry yêu cầu repository name lowercase.

Security context:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
```

Dùng để pass Gatekeeper policy cấm root.

Resources:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
```

Dùng để pass Gatekeeper policy require limits.

Canary strategy:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 10
      - pause: {duration: 2m}
      - setWeight: 50
      - pause: {duration: 2m}
      - setWeight: 100
```

Ý nghĩa:

```text
Đẩy version mới cho 10% traffic/pods.
Đợi.
Đẩy lên 50%.
Đợi.
Đẩy lên 100%.
```

Analysis:

```yaml
analysis:
  templates:
    - templateName: success-rate
  startingStep: 1
```

Argo Rollouts query Prometheus để xem app có đủ healthy không.

Nếu metric fail:

```text
Rollout abort/rollback.
```

### Test rollout

```bash
kubectl get rollout api -n demo
kubectl describe rollout api -n demo
kubectl get pods -n demo -l app=api
kubectl get analysisrun -n demo
```

---

## 8. Monitoring Và Alerting

### `k8s-prometheus.yaml`

Cài kube-prometheus-stack.

Nó gồm:

```text
Prometheus
Alertmanager
Grafana
Prometheus Operator
CRD ServiceMonitor
CRD PrometheusRule
```

Trong values có:

```yaml
prometheus:
  prometheusSpec:
    serviceMonitorSelectorNilUsesHelmValues: false
```

Ý nghĩa:

```text
Prometheus có thể scrape ServiceMonitor ngoài chart mặc định.
```

### `app-api/servicemonitor.yaml`

ServiceMonitor nói cho Prometheus:

```text
Hãy scrape metrics từ service api.
```

Nếu ServiceMonitor missing, ArgoCD báo:

```text
Resource not found in cluster: monitoring.coreos.com/v1/ServiceMonitor
```

Nguyên nhân thường là:

```text
kube-prometheus-stack chưa cài CRD ServiceMonitor
hoặc monitoring stack bị xóa/chưa sync lại
```

### `app-alert/prometheus-rules.yaml`

PrometheusRule định nghĩa alert dựa trên metric.

AlertManager gửi email nếu rule firing.

### Lỗi thường gặp

Nếu AnalysisRun lỗi:

```text
lookup kube-prometheus-stack-prometheus.monitoring.svc: no such host
```

Nghĩa là Prometheus service chưa tồn tại.

Nguyên nhân:

```text
monitoring namespace bị xóa
kube-prometheus-stack chưa sync
chart render lỗi
CRD/webhook bị Gatekeeper chặn
```

---

## 9. ESO: Secrets Rotation Không Commit Secret

Mục tiêu của Lab 2.1:

```text
Secret thật nằm ở AWS Secrets Manager.
ESO sync về Kubernetes Secret.
Đổi value trên AWS, Kubernetes Secret đổi trong <60s.
Không commit AWS credentials vào Git.
```

Flow:

```text
AWS Secrets Manager
  |
  | ESO refreshInterval 30s
  v
Kubernetes Secret app-db-secret
  |
  v
App đọc secret
```

### `eso/secret-store.yaml`

SecretStore trả lời:

```text
Provider nào?
Region nào?
Auth bằng gì?
```

File hiện tại:

```yaml
kind: SecretStore
metadata:
  name: aws-store
  namespace: demo
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-southeast-1
```

Provider là AWS Secrets Manager ở region `ap-southeast-1`.

Auth:

```yaml
auth:
  secretRef:
    accessKeyIDSecretRef:
      name: awssm-secret
      key: access-key
    secretAccessKeySecretRef:
      name: awssm-secret
      key: secret-access-key
```

ESO sẽ đọc AWS access key từ Kubernetes Secret `awssm-secret`.

Tạo secret này thủ công:

```bash
kubectl create secret generic awssm-secret \
  -n demo \
  --from-literal=access-key="$AWS_ACCESS_KEY_ID" \
  --from-literal=secret-access-key="$AWS_SECRET_ACCESS_KEY"
```

Không commit `awssm-secret` vào Git.

Production nên dùng:

```text
IRSA hoặc EKS Pod Identity
```

Vì static key sống lâu, dễ lộ, khó rotate.

### `eso/external-secret.yaml`

ExternalSecret trả lời:

```text
Lấy secret nào?
Map field nào?
Tạo Kubernetes Secret tên gì?
Sync bao lâu một lần?
```

File hiện tại:

```yaml
refreshInterval: 30s
secretStoreRef:
  name: aws-store
target:
  name: app-db-secret
```

ESO sẽ sync mỗi 30 giây và tạo/cập nhật Kubernetes Secret:

```text
app-db-secret
```

Mapping:

```yaml
data:
  - secretKey: DB_USERNAME
    remoteRef:
      key: w10/lab/demo/app
      property: username
  - secretKey: DB_PASSWORD
    remoteRef:
      key: w10/lab/demo/app
      property: password
```

Nếu AWS Secrets Manager có JSON:

```json
{
  "username": "appuser",
  "password": "pass-v1"
}
```

Thì Kubernetes Secret sẽ có:

```text
DB_USERNAME=appuser
DB_PASSWORD=pass-v1
```

### Tạo AWS secret

```bash
aws secretsmanager create-secret \
  --name w10/lab/demo/app \
  --secret-string '{"username":"appuser","password":"pass-v1"}' \
  --region ap-southeast-1
```

Nếu secret đã tồn tại:

```bash
aws secretsmanager put-secret-value \
  --secret-id w10/lab/demo/app \
  --secret-string '{"username":"appuser","password":"pass-v1"}' \
  --region ap-southeast-1
```

### Test ESO sync

```bash
kubectl get secretstore -n demo
kubectl get externalsecret -n demo
kubectl get secret app-db-secret -n demo
```

Decode:

```bash
kubectl get secret app-db-secret -n demo \
  -o jsonpath='{.data.DB_USERNAME}' | base64 -d; echo
```

```bash
kubectl get secret app-db-secret -n demo \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

Rotate:

```bash
aws secretsmanager put-secret-value \
  --secret-id w10/lab/demo/app \
  --secret-string '{"username":"appuser","password":"pass-v2"}' \
  --region ap-southeast-1
```

Sau dưới 60 giây:

```bash
kubectl get secret app-db-secret -n demo \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

Kỳ vọng:

```text
pass-v2
```

### Env var vs volume

Nếu app đọc secret bằng env var:

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-db-secret
        key: DB_PASSWORD
```

Thì khi Kubernetes Secret đổi:

```text
Env var trong process không tự đổi.
```

Muốn đổi phải restart Pod hoặc app có reload riêng.

Nếu app mount secret bằng volume:

```yaml
volumes:
  - name: app-db-secret
    secret:
      secretName: app-db-secret
```

Kubelet có thể cập nhật file trong volume sau khi Secret đổi.

Nhưng app vẫn phải:

```text
đọc lại file mỗi lần cần
hoặc watch file
hoặc có reload mechanism
```

Kết luận:

```text
ESO đảm bảo Kubernetes Secret đổi.
Pod không restart chỉ chứng minh được nếu app đọc secret qua volume/reload/watch.
```

---

## 10. Supply Chain Security: Trivy + Cosign + Admission

Mục tiêu Lab 2.2:

```text
CI fail nếu image có HIGH/CRITICAL CVE.
Image được ký sau khi build.
Cluster reject image chưa ký.
```

Flow:

```text
Source code
  |
  v
GitHub Actions
  |
  v
Docker build
  |
  v
Trivy scan
  |
  +-- HIGH/CRITICAL -> fail
  |
  v
Push GHCR
  |
  v
Cosign sign
  |
  v
Sigstore Policy Controller verify at admission
```

### `.github/workflows/build-push.yml`

Workflow chính build image.

Các bước quan trọng:

1. Checkout code.
2. Tính semantic version.
3. Build image tạm để scan.
4. Trivy scan.
5. Login GHCR.
6. Build + push image.
7. Install Cosign.
8. Sign pushed image tags.
9. Update rollout.yaml với tag mới.
10. Commit version update.
11. Create git tag.

### Trivy step

```yaml
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@0.24.0
  with:
    image-ref: w10-api:scan
    format: table
    vuln-type: os,library
    severity: HIGH,CRITICAL
    ignore-unfixed: true
    exit-code: "1"
```

Ý nghĩa:

| Field | Ý nghĩa |
|---|---|
| `image-ref` | Image cần scan |
| `vuln-type` | Scan OS package và application library |
| `severity` | Chỉ xét HIGH/CRITICAL |
| `ignore-unfixed` | Bỏ qua CVE chưa có bản vá |
| `exit-code: "1"` | Có finding thì CI fail |

Trivy trả lời:

```text
Image có CVE/misconfig/secret hardcode không?
```

Trivy không trả lời:

```text
Image có được ký bởi identity đáng tin không?
```

### Cosign signing

Cosign key-based dùng:

```text
private key -> ký image
public key  -> verify image
```

Tạo key:

```bash
cosign generate-key-pair
```

Kết quả:

```text
cosign.key
cosign.pub
```

Nguyên tắc:

```text
cosign.key -> GitHub Secret, không commit
cosign.pub -> commit vào repo
```

GitHub Secrets cần có:

```text
COSIGN_PRIVATE_KEY
COSIGN_PASSWORD
```

Workflow ký:

```bash
cosign sign --yes --key env://COSIGN_PRIVATE_KEY "$tag"
```

Vì sao phải push trước khi ký?

```text
Cosign lưu signature cạnh image trong registry.
Cluster admission cũng verify image/signature từ registry.
Image local trên máy bạn không có ý nghĩa với cluster.
```

### `policies/cluster-image-policy.yaml`

File này là Sigstore Policy Controller policy.

```yaml
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: w10-api-must-be-signed
spec:
  images:
    - glob: ghcr.io/g-03-xbrain-phase-2/w10-api*
  authorities:
    - key:
        data: |
          -----BEGIN PUBLIC KEY-----
          ...
          -----END PUBLIC KEY-----
```

Ý nghĩa:

```text
Mọi image match ghcr.io/g-03-xbrain-phase-2/w10-api* phải verify được bằng public key này.
```

Nếu image chưa ký:

```text
Admission reject.
```

Nếu image ký bằng private key tương ứng:

```text
Admission allow.
```

### Label bật policy

Sigstore Policy Controller thường enforce namespace có label:

```text
policy.sigstore.dev/include=true
```

Nếu namespace chưa có label, policy có thể chưa chặn.

Quy trình an toàn:

```text
1. Build image.
2. Trivy pass.
3. Push image.
4. Cosign sign.
5. Verify local pass.
6. Gắn label namespace.
7. Deploy workload.
```

Nếu gắn label trước khi image được ký, app có thể bị chặn.

### Verify local

```bash
cosign verify \
  --key cloud/w10/lab/signing/cosign.pub \
  ghcr.io/g-03-xbrain-phase-2/w10-api:v0.0.1-a1bf92e
```

---

## 11. Tenant Payments: Multi-Tenant Take-Home

Mục tiêu:

```text
Onboard team payments an toàn.
Không viết guardrail mới.
Kế thừa guardrail cũ.
```

Yêu cầu:

```text
Namespace payments
RBAC least privilege
ResourceQuota + LimitRange
NetworkPolicy cô lập
App riêng qua GitOps
Evidence chứng minh policy hoạt động
```

### `tenants/payments/namespace.yaml`

Tạo namespace:

```text
payments
```

Namespace là biên giới cô lập cơ bản trong Kubernetes.

Tài nguyên của team payments nên nằm trong namespace này.

### `tenants/payments/rbac.yaml`

Tạo:

```text
Role payments-developer
RoleBinding payments-dev
```

Role cho phép thao tác:

```text
pods
pods/log
services
configmaps
deployments
replicasets
```

Không cấp:

```text
secrets
rolebindings
clusterroles
clusterrolebindings
```

Vì sao?

```text
secrets: có thể chứa password/token/cloud key.
rolebindings: user có thể tự nâng quyền.
clusterrolebindings: có thể mở quyền toàn cluster.
```

Test:

```bash
kubectl auth can-i create deployments -n payments --as=payments-dev
kubectl auth can-i create deployments -n demo --as=payments-dev
kubectl auth can-i get secrets -n payments --as=payments-dev
kubectl auth can-i create rolebindings -n payments --as=payments-dev
```

Kỳ vọng:

```text
yes
no
no
no
```

### `tenants/payments/quota-limitrange.yaml`

Gồm 2 resource:

```text
ResourceQuota
LimitRange
```

#### ResourceQuota

ResourceQuota giới hạn tổng tài nguyên trong namespace.

```yaml
hard:
  requests.cpu: "1"
  requests.memory: 1Gi
  limits.cpu: "2"
  limits.memory: 2Gi
  pods: "6"
  services: "3"
```

Nghĩa là trong namespace `payments`:

```text
Tổng requests.cpu không quá 1 core.
Tổng requests.memory không quá 1Gi.
Tổng limits.cpu không quá 2 cores.
Tổng limits.memory không quá 2Gi.
Tổng pods không quá 6.
Tổng services không quá 3.
```

ResourceQuota kiểm tổng namespace, không kiểm từng container.

#### LimitRange

LimitRange đặt default/min/max cho từng container.

```yaml
defaultRequest:
  cpu: 100m
  memory: 128Mi
default:
  cpu: 250m
  memory: 256Mi
min:
  cpu: 50m
  memory: 64Mi
max:
  cpu: 500m
  memory: 512Mi
```

Nếu Pod không khai resources:

```text
LimitRange tự thêm default request/limit.
```

Nếu container xin vượt max:

```text
Admission reject.
```

Khác nhau:

```text
LimitRange kiểm từng container.
ResourceQuota kiểm tổng namespace.
```

### `tenants/payments/networkpolicy.yaml`

Tạo 2 policy:

```text
payments-default-deny-ingress
payments-egress-same-namespace-and-dns
```

Default deny ingress:

```yaml
podSelector: {}
policyTypes:
  - Ingress
```

Nghĩa là:

```text
Không ai được gọi vào Pod payments, trừ khi có policy allow khác.
```

Egress same namespace + DNS:

```text
Pod payments chỉ gọi được Pod cùng namespace và DNS kube-system.
```

Vì sao cần DNS?

```text
Pod cần resolve service name như api.demo.svc.cluster.local.
Nếu chặn DNS hoàn toàn, nhiều app lỗi ngay cả trước khi test network.
```

Lưu ý:

```text
NetworkPolicy chỉ có tác dụng nếu CNI hỗ trợ enforcement.
```

Ví dụ:

```text
Calico
Cilium
```

Nếu dùng CNI không enforce, YAML vẫn apply nhưng traffic không bị chặn.

### `apps/payments/deployment.yaml`

Workload team payments.

Điểm cần pass guardrail:

```yaml
image: ghcr.io/g-03-xbrain-phase-2/w10-api:v0.0.1-a1bf92e
```

Không dùng `:latest`.

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
```

Không chạy root.

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 200m
    memory: 256Mi
```

Có resources.

```yaml
imagePullSecrets:
  - name: ghcr-regcred
```

Dùng nếu GHCR package private.

Tạo secret:

```bash
kubectl create secret docker-registry ghcr-regcred \
  -n payments \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-token>
```

GitHub token cần quyền đọc package:

```text
read:packages
```

### `apps/payments/service.yaml`

Expose Deployment payments trong namespace payments.

Service cho phép các Pod khác gọi:

```text
payments-api.payments.svc.cluster.local
```

---

## 12. Evidence Files

Evidence dùng để chứng minh guardrail hoạt động.

### `evidence/payments-bad-latest-pod.yaml`

Pod dùng:

```yaml
image: nginx:latest
```

Kỳ vọng:

```text
Gatekeeper deny vì dùng latest tag.
```

Test:

```bash
kubectl apply --dry-run=server -f cloud/w10/lab/evidence/payments-bad-latest-pod.yaml
```

Expected message:

```text
container image must not have latest tag
```

### `evidence/payments-no-limits-pod.yaml`

Pod không khai resources.

Kỳ vọng:

```text
LimitRange default resources.
```

Nhưng chú ý:

```text
Nếu Gatekeeper require-limits enforce trên payments, Pod thiếu resources có thể bị Gatekeeper chặn trước khi LimitRange default.
```

Điểm này phụ thuộc thứ tự admission và policy thực tế.

Trong production, nếu muốn chứng minh LimitRange default, cần đảm bảo Gatekeeper require-limits không chặn case này hoặc test ở namespace không bị policy đó áp.

### `evidence/payments-quota-too-large-pod.yaml`

Pod có 3 containers, mỗi container trong giới hạn LimitRange max, nhưng tổng requests vượt ResourceQuota.

Kỳ vọng:

```text
ResourceQuota deny.
```

Test:

```bash
kubectl apply --dry-run=server -f cloud/w10/lab/evidence/payments-quota-too-large-pod.yaml
```

Expected:

```text
exceeded quota
```

---

## 13. Runbooks

Runbook là tài liệu xử lý sự cố.

Nó khác chaos/evidence:

```text
Evidence: chứng minh policy hoạt động.
Runbook: khi lỗi thật xảy ra thì debug và fix thế nào.
```

### `runbooks/secret-rotation-failure.md`

Dùng khi:

```text
AWS secret đã đổi nhưng Kubernetes Secret không đổi.
App không thấy password mới.
```

Debug flow:

```text
AWS Secrets Manager -> SecretStore -> ExternalSecret -> Kubernetes Secret -> Pod/app
```

### `runbooks/image-signature-denied.md`

Dùng khi:

```text
Pod bị admission reject vì image signature.
```

Debug flow:

```text
Image tag/digest -> Cosign signature -> public key -> ClusterImagePolicy -> namespace label
```

### `runbooks/cve-exception-adr.md`

Dùng khi:

```text
Trivy phát hiện CVE HIGH/CRITICAL nhưng team xin exception.
```

Exception tốt phải có:

```text
CVE ID
Severity
Image
Package
Environment
Reason
Risk assessment
Compensating controls
Expiry date
Remediation plan
Approver
```

Không có expiry date thì exception dễ thành allow forever.

---

## 14. Các Lỗi Hay Gặp

### `no matches for kind SecretStore`

Nguyên nhân:

```text
ESO CRD chưa được cài.
```

Fix:

```text
Sync eso app trước.
Sau đó sync eso-config.
```

### `no matches for kind K8sDisallowedTags`

Nguyên nhân:

```text
ConstraintTemplate chưa apply.
```

Fix:

```text
Sync gatekeeper-template trước.
Sau đó sync gatekeeper-constraint.
```

### `no matches for kind ClusterImagePolicy`

Nguyên nhân:

```text
Sigstore Policy Controller chưa cài CRD.
```

Fix:

```text
Sync policy-controller trước.
Sau đó sync policies.
```

### `repository name must be lowercase`

Sai:

```text
ghcr.io/G-03-XBrain-Phase-2/w10-api:...
```

Đúng:

```text
ghcr.io/g-03-xbrain-phase-2/w10-api:...
```

### `manifest unknown` hoặc `not found`

Nguyên nhân:

```text
Image tag không tồn tại trong registry.
```

Fix:

```text
Dùng tag thật đã push.
```

Ví dụ tag từng dùng:

```text
ghcr.io/g-03-xbrain-phase-2/w10-api:v0.0.1-a1bf92e
```

### `unauthorized`

Nguyên nhân:

```text
GHCR package private hoặc cluster thiếu imagePullSecret.
```

Fix:

```bash
kubectl create secret docker-registry ghcr-regcred \
  -n demo \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-token>
```

Nếu payments cũng pull image:

```bash
kubectl create secret docker-registry ghcr-regcred \
  -n payments \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-token>
```

### Gatekeeper chặn monitoring

Nếu policy apply toàn cluster, job/webhook của monitoring có thể bị chặn vì thiếu resources.

Fix:

```text
Scope policy vào namespace app như demo/payments.
Hoặc exclude namespace hệ thống.
```

### ArgoCD `openapi/v2 timeout`

Nguyên nhân thường không phải YAML.

Thường là:

```text
API server lag
cluster quá tải
DNS trong cluster lỗi
ArgoCD cache timeout
repo-server/controller bị chậm
```

Check:

```bash
kubectl get pods -n argocd
kubectl get pods -n kube-system
kubectl top nodes
kubectl top pods -A
```

---

## 15. Kiểm Chứng Toàn Lab

### ArgoCD apps

```bash
kubectl get app -n argocd
```

Kỳ vọng các app chính:

```text
root
common
w10-rbac
w10-gatekeeper-templates
w10-gatekeeper-constraints
eso
eso-config
policy-controller
supply-chain-policies
argo-rollouts
kube-prometheus-stack
api
payments
payments-app
```

### RBAC

```bash
kubectl auth can-i create deployments -n demo --as=alice
kubectl auth can-i get secrets -n demo --as=alice
kubectl auth can-i create deployments -n payments --as=payments-dev
kubectl auth can-i create deployments -n demo --as=payments-dev
kubectl auth can-i get secrets -n payments --as=payments-dev
kubectl auth can-i create rolebindings -n payments --as=payments-dev
```

### Gatekeeper

```bash
kubectl get constrainttemplates
kubectl get constraints
```

Test latest tag:

```bash
kubectl apply --dry-run=server -f cloud/w10/lab/evidence/payments-bad-latest-pod.yaml
```

### ESO

```bash
kubectl get secretstore -n demo
kubectl get externalsecret -n demo
kubectl get secret app-db-secret -n demo
```

Decode:

```bash
kubectl get secret app-db-secret -n demo \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

### Supply chain

Verify Cosign:

```bash
cosign verify \
  --key cloud/w10/lab/signing/cosign.pub \
  ghcr.io/g-03-xbrain-phase-2/w10-api:v0.0.1-a1bf92e
```

Check policy:

```bash
kubectl get clusterimagepolicy
```

### Payments

```bash
kubectl get ns payments
kubectl get role,rolebinding -n payments
kubectl describe resourcequota payments-quota -n payments
kubectl describe limitrange payments-defaults -n payments
kubectl get networkpolicy -n payments
kubectl get deploy,svc,pod -n payments
```

---

## 16. Câu Hỏi Và Trả Lời Ôn Tập

### 1. RBAC khác Admission thế nào?

RBAC kiểm tra subject có quyền làm action hay không. Admission kiểm tra object được tạo/sửa có hợp lệ theo policy hay không.

### 2. Có quyền create Pod thì chắc chắn Pod chạy được không?

Không. RBAC có thể allow nhưng Gatekeeper hoặc Sigstore Policy Controller vẫn deny.

### 3. Role khác ClusterRole?

Role chỉ trong namespace. ClusterRole ở cấp cluster.

### 4. RoleBinding khác ClusterRoleBinding?

RoleBinding cấp quyền trong một namespace. ClusterRoleBinding cấp quyền cluster-wide.

### 5. Vì sao RBAC là cộng quyền?

Kubernetes RBAC chỉ có allow rule, không có deny rule. Nhiều binding thì quyền được cộng lại.

### 6. Vì sao không cấp quyền get secrets cho developer?

Secret có thể chứa password, token, cloud key. Nếu developer hoặc workload bị lộ quyền này, attacker có thể leo thang.

### 7. ConstraintTemplate khác Constraint?

ConstraintTemplate định nghĩa policy logic và kind. Constraint dùng kind đó để áp policy vào resource/namespace cụ thể.

### 8. Vì sao ConstraintTemplate phải apply trước Constraint?

Vì Constraint kind chưa tồn tại nếu Template chưa tạo CRD.

### 9. Gatekeeper `deny` khác `dryrun`?

`deny` chặn request. `dryrun` chỉ ghi violation, không chặn.

### 10. Vì sao không apply policy toàn cluster ngay?

Vì dễ chặn system workload như ArgoCD, monitoring, kube-system. Nên dryrun trước hoặc scope namespace.

### 11. Kubernetes Secret có bảo mật vì base64 không?

Không. Base64 decode được. Bảo mật Secret cần RBAC, encryption at rest, audit, và không commit secret thật.

### 12. SecretStore trả lời câu hỏi gì?

Provider nào, region nào, auth bằng gì.

### 13. ExternalSecret trả lời câu hỏi gì?

Lấy secret nào, map field nào, tạo Kubernetes Secret nào, sync bao lâu một lần.

### 14. `refreshInterval: 30s` nghĩa là gì?

ESO kiểm tra provider khoảng mỗi 30 giây. Vì yêu cầu lab là update dưới 60 giây, 30 giây là hợp lý.

### 15. Vì sao env var không phù hợp no-restart rotation?

Env var được set khi process start. Kubernetes Secret đổi không làm env var trong process đổi.

### 16. Volume secret có tự đổi không?

File trong mounted secret volume có thể được kubelet cập nhật, nhưng app phải đọc lại file hoặc reload.

### 17. Trivy làm gì?

Scan CVE, misconfig, secret hardcode trong image/repo.

### 18. Trivy không làm gì?

Không chứng minh image được ký bởi identity đáng tin.

### 19. Cosign làm gì?

Ký image và verify chữ ký image.

### 20. Vì sao private key không được commit?

Ai có private key có thể ký image giả làm image hợp lệ.

### 21. Vì sao phải push image trước khi ký?

Cosign lưu signature cạnh image trong registry. Cluster chỉ verify được image/signature trong registry.

### 22. Admission verify image mạnh hơn CI verify ở đâu?

CI có thể bị bypass nếu ai deploy tay. Admission nằm ở API server nên mọi Pod tạo vào cluster đều phải qua.

### 23. ResourceQuota khác LimitRange?

ResourceQuota giới hạn tổng tài nguyên namespace. LimitRange đặt default/min/max cho từng container.

### 24. Pod bị ResourceQuota deny có log không?

Không. Pod chưa được tạo/chạy nên không có container log.

### 25. NetworkPolicy ingress có chặn Pod gọi ra ngoài không?

Không. Muốn chặn Pod gọi ra ngoài cần egress policy.

### 26. Vì sao cần DNS egress trong NetworkPolicy?

Vì Pod cần resolve service name. Chặn DNS có thể làm app lỗi ngay cả khi network tới service được phép.

### 27. Vì sao tenant payments không cần viết guardrail mới?

Vì Gatekeeper constraints cũ đã match namespace `payments`. Workload mới tự bị policy cũ kiểm tra.

### 28. Vì sao dùng RoleBinding cho payments-dev?

Để quyền chỉ nằm trong namespace `payments`, giữ cô lập tenant.

### 29. Khi image pull bị unauthorized thì làm gì?

Tạo `imagePullSecret` trong namespace workload và tham chiếu trong Pod/Deployment.

### 30. Khi ArgoCD OutOfSync thì xem gì trước?

Xem diff, events, application conditions, repo path, targetRevision, và resource health.

---

## 17. Checklist Nộp Bài

### Morning

- [ ] Root app tạo được child apps.
- [ ] RBAC có developer/sre/viewer.
- [ ] `auth can-i` chứng minh quyền đúng.
- [ ] Gatekeeper templates sync trước constraints.
- [ ] 4 guardrail chính enforce: no latest, require limits, non-root, no hostNetwork.
- [ ] Custom replica limit hoạt động.

### Afternoon Lab 2.1

- [ ] `eso.yaml` cài ESO operator.
- [ ] `eso-config.yaml` sync SecretStore/ExternalSecret.
- [ ] AWS credentials tạo bằng `kubectl create secret`, không commit.
- [ ] AWS Secrets Manager có secret `w10/lab/demo/app`.
- [ ] Kubernetes Secret `app-db-secret` được tạo.
- [ ] Rotate AWS secret, K8s Secret đổi trong <60s.
- [ ] Repo không lộ secret thật.

### Afternoon Lab 2.2

- [ ] CI có Trivy scan.
- [ ] HIGH/CRITICAL CVE làm CI fail.
- [ ] Cosign key pair được tạo.
- [ ] Private key nằm trong GitHub Secrets.
- [ ] Public key commit vào `signing/cosign.pub`.
- [ ] `ClusterImagePolicy` dùng public key.
- [ ] Unsigned image bị admission reject.
- [ ] Signed image deploy được.

### 24h Take-Home

- [ ] Namespace `payments`.
- [ ] RBAC least privilege cho `payments-dev`.
- [ ] ResourceQuota + LimitRange.
- [ ] NetworkPolicy default deny + DNS/same namespace egress.
- [ ] Payments app deploy qua ArgoCD Application riêng.
- [ ] App hợp lệ pass guardrail.
- [ ] Manifest vi phạm bị chặn.
- [ ] README giải thích vì sao guardrail cũ áp cho team mới.

---

## 18. Câu Tóm Tắt Khi Phỏng Vấn

W10 lab xây một mini platform production-ready bằng GitOps. RBAC giới hạn người dùng theo namespace và vai trò. Gatekeeper enforce admission policy để chặn manifest không an toàn như image latest, thiếu limits, chạy root, dùng hostNetwork. ESO đồng bộ secret từ AWS Secrets Manager về Kubernetes Secret để tránh commit secret thật và hỗ trợ rotation. CI dùng Trivy để fail image có CVE nghiêm trọng, Cosign để ký image, và Sigstore Policy Controller để admission reject image chưa ký. Cuối cùng tenant `payments` chứng minh platform có thể onboard team mới bằng namespace, RBAC, quota, network policy và kế thừa guardrail cũ mà không phải viết lại luật.
