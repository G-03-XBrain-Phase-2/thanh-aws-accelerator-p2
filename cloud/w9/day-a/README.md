# W9 Day A - GitOps & CI/CD với GitHub Actions, ArgoCD và Kubernetes

Thư mục này dùng để học và thực hành luồng GitOps cơ bản:

```text
Developer sửa YAML
        ↓
git commit + push lên GitHub
        ↓
GitHub Actions kiểm tra manifest trên Pull Request
        ↓
Merge vào main
        ↓
ArgoCD đọc GitHub repo
        ↓
ArgoCD sync manifest vào Kubernetes cluster
        ↓
Ứng dụng chạy trong namespace gitops-demo
```

Điểm quan trọng nhất của bài này:

```text
GitHub là nơi lưu trạng thái mong muốn.
ArgoCD là công cụ đưa Kubernetes về đúng trạng thái trong Git.
```

## Cấu Trúc Thư Mục

```text
cloud/w9/day-a/
├── README.md
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
├── gitops/
│   ├── root-app.yaml
│   └── apps/
│       └── demo-app.yaml
└── .github/
    └── workflows/
        ├── plan-on-pr.yaml
        └── apply-on-merge.yaml
```

Vai trò từng phần:

| Đường dẫn | Vai trò |
|---|---|
| `k8s/` | Chứa Kubernetes manifest thật của ứng dụng |
| `k8s/kustomization.yaml` | Gom nhiều file YAML thành một bundle để apply/sync |
| `gitops/root-app.yaml` | ArgoCD Application cha, dùng pattern app-of-apps |
| `gitops/apps/demo-app.yaml` | ArgoCD Application con, deploy app thật |
| `.github/workflows/plan-on-pr.yaml` | Workflow kiểm tra manifest khi tạo Pull Request |
| `.github/workflows/apply-on-merge.yaml` | Workflow minh họa apply sau khi merge vào `main` |

Lưu ý: GitHub Actions chỉ chạy thật nếu workflow nằm ở root repo:

```text
.github/workflows/*.yaml
```

Nếu workflow nằm trong:

```text
cloud/w9/day-a/.github/workflows/
```

thì nó chỉ là file học tập, GitHub sẽ không tự chạy.

## 1. CI/CD Là Gì?

CI/CD là quy trình tự động hóa việc kiểm tra, build và triển khai phần mềm.

CI là Continuous Integration:

```text
Developer push code
        ↓
Chạy test
        ↓
Chạy lint
        ↓
Build image
        ↓
Validate manifest
```

CD là Continuous Delivery hoặc Continuous Deployment:

```text
Code đã được kiểm tra
        ↓
Triển khai lên môi trường dev/staging/prod
```

Trong bài này, GitHub Actions đóng vai trò CI:

```text
GitHub Actions kiểm tra Kubernetes manifest trước khi merge.
```

## 2. GitOps Là Gì?

GitOps là cách vận hành hạ tầng và ứng dụng trong đó Git là source of truth.

Source of truth nghĩa là trạng thái mong muốn của hệ thống nằm trong Git.

Ví dụ trong Git có:

```yaml
replicas: 3
image: nginx:1.27
```

Thì cluster cũng phải chạy:

```text
3 pod dùng image nginx:1.27
```

Nếu ai đó sửa tay cluster:

```bash
kubectl scale deployment demo-app -n gitops-demo --replicas=1
```

ArgoCD sẽ phát hiện cluster lệch với Git. Nếu bật `selfHeal: true`, ArgoCD tự sửa lại về 3 replicas.

## 3. CI/CD Truyền Thống vs GitOps

CI/CD truyền thống thường là push-based:

```text
GitHub Actions
        ↓
kubectl apply
        ↓
Kubernetes
```

GitOps là pull-based:

```text
GitHub repo
        ↑
ArgoCD tự pull manifest từ Git
        ↓
Kubernetes
```

So sánh:

| Tiêu chí | CI/CD truyền thống | GitOps với ArgoCD |
|---|---|---|
| Ai deploy? | Pipeline deploy trực tiếp | ArgoCD deploy |
| Cách deploy | Push vào cluster | Pull từ Git |
| Source of truth | Có thể là pipeline hoặc cluster | Git |
| Quyền cluster | CI runner cần kubeconfig | ArgoCD nằm trong cluster |
| Rollback | Re-run pipeline hoặc `kubectl rollout undo` | `git revert` |
| Audit | Nằm ở pipeline logs và Git | Rõ trong Git history |
| Drift detection | Không mạnh | Mạnh, thấy `OutOfSync` |

Luồng khuyến nghị:

```text
GitHub Actions: validate, test, build
ArgoCD: deploy thật vào Kubernetes
```

## 4. Kubernetes Manifest Trong Bài

### `namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gitops-demo
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

Giải thích field:

| Field | Ý nghĩa |
|---|---|
| `apiVersion: v1` | Dùng core API của Kubernetes |
| `kind: Namespace` | Tạo namespace |
| `metadata.name` | Tên namespace là `gitops-demo` |
| `annotations.argocd.argoproj.io/sync-wave` | Thứ tự sync của ArgoCD |

`sync-wave: "0"` nghĩa là namespace được tạo trước Deployment và Service.

### `deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
  namespace: gitops-demo
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: demo-app
  template:
    metadata:
      labels:
        app: demo-app
    spec:
      containers:
        - name: demo-app
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Giải thích field:

| Field | Ý nghĩa |
|---|---|
| `apiVersion: apps/v1` | API group cho Deployment |
| `kind: Deployment` | Resource quản lý rollout và ReplicaSet |
| `metadata.name` | Tên Deployment |
| `metadata.namespace` | Deployment được tạo trong namespace `gitops-demo` |
| `sync-wave: "2"` | Tạo sau namespace |
| `spec.replicas` | Số pod mong muốn |
| `spec.selector.matchLabels` | Deployment chọn pod có label `app=demo-app` |
| `spec.template.metadata.labels` | Label gắn cho pod được tạo ra |
| `spec.template.spec.containers` | Danh sách container trong pod |
| `image: nginx:1.27` | Container image sẽ chạy |
| `containerPort: 80` | Port app listen bên trong container |

Điểm phải nhớ:

```text
selector.matchLabels phải khớp với template.metadata.labels.
```

Nếu không khớp, Deployment sẽ không quản lý đúng pod.

### `service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo-app
  namespace: gitops-demo
  annotations:
    argocd.argoproj.io/sync-wave: "3"
spec:
  type: ClusterIP
  selector:
    app: demo-app
  ports:
    - port: 80
      targetPort: 80
```

Giải thích field:

| Field | Ý nghĩa |
|---|---|
| `kind: Service` | Tạo stable endpoint cho pod |
| `metadata.name` | Tên Service |
| `metadata.namespace` | Service nằm trong namespace `gitops-demo` |
| `sync-wave: "3"` | Tạo sau Deployment |
| `spec.type: ClusterIP` | Chỉ truy cập nội bộ trong cluster |
| `spec.selector.app` | Service route traffic tới pod có label `app=demo-app` |
| `port` | Port của Service |
| `targetPort` | Port của container/pod |

Test Service bằng port-forward:

```bash
kubectl port-forward -n gitops-demo svc/demo-app 8080:80
curl http://localhost:8080
```

### `kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - deployment.yaml
  - service.yaml
```

Ý nghĩa:

```text
Kustomize gom namespace.yaml, deployment.yaml, service.yaml thành một bộ manifest.
```

Render manifest:

```bash
kubectl kustomize cloud/w9/day-a/k8s
```

Dry-run:

```bash
kubectl apply --dry-run=client --validate=false -k cloud/w9/day-a/k8s
```

Apply thật:

```bash
kubectl apply -k cloud/w9/day-a/k8s
```

## 5. ArgoCD Làm Gì?

ArgoCD là GitOps controller chạy trong Kubernetes cluster.

Nó làm 4 việc chính:

```text
1. Đọc manifest từ Git repo
2. So sánh manifest trong Git với resource thật trong cluster
3. Báo trạng thái Synced hoặc OutOfSync
4. Sync cluster về đúng trạng thái trong Git
```

Trạng thái thường gặp:

| Status | Ý nghĩa |
|---|---|
| `Synced` | Cluster đang giống Git |
| `OutOfSync` | Cluster đang khác Git |
| `Healthy` | Resource đang chạy tốt |
| `Degraded` | Resource có lỗi |
| `Unknown` | ArgoCD chưa xác định được trạng thái, thường do repo/path/permission lỗi |

## 6. App-of-Apps

App-of-apps là pattern trong ArgoCD.

Thay vì apply từng ArgoCD Application bằng tay, ta tạo một Application cha:

```text
root-app
   ↓ quản lý
demo-app
   ↓ deploy
Namespace, Deployment, Service
```

Trong bài này:

```text
gitops/root-app.yaml
```

là app cha.

```text
gitops/apps/demo-app.yaml
```

là app con.

Lợi ích:

```text
1. Chỉ cần bootstrap root-app một lần
2. Sau này thêm app mới chỉ cần thêm file vào gitops/apps
3. Quản lý nhiều ứng dụng bằng Git
4. Phù hợp cho nhiều môi trường dev/staging/prod
```

## 7. `root-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/G-03-XBrain-Phase-2/thanh-aws-accelerator-p2.git
    targetRevision: main
    path: cloud/w9/day-a/gitops/apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Giải thích field:

| Field | Ý nghĩa |
|---|---|
| `apiVersion` | API version của ArgoCD Application CRD |
| `kind: Application` | Tạo một ArgoCD Application |
| `metadata.name` | Tên app cha là `root-app` |
| `metadata.namespace` | Application resource nằm trong namespace `argocd` |
| `spec.project` | ArgoCD Project, bài này dùng `default` |
| `spec.source.repoURL` | Git repo ArgoCD sẽ đọc |
| `spec.source.targetRevision` | Branch, tag hoặc commit cần đọc |
| `spec.source.path` | Thư mục trong repo chứa manifest |
| `spec.destination.server` | Cluster đích |
| `spec.destination.namespace` | Namespace đích |
| `syncPolicy.automated` | Bật tự động sync |
| `prune: true` | Xóa resource khỏi cluster nếu resource bị xóa khỏi Git |
| `selfHeal: true` | Tự sửa nếu cluster bị sửa tay lệch Git |

Ý nghĩa của `source` trong root app:

```text
Repo: G-03-XBrain-Phase-2/thanh-aws-accelerator-p2
Branch: main
Path: cloud/w9/day-a/gitops/apps
```

Tức là root app đọc thư mục:

```text
cloud/w9/day-a/gitops/apps
```

và tạo các Application con trong đó.

Ý nghĩa của `destination` trong root app:

```yaml
destination:
  server: https://kubernetes.default.svc
  namespace: argocd
```

`https://kubernetes.default.svc` nghĩa là cluster hiện tại, nơi ArgoCD đang chạy.

`namespace: argocd` nghĩa là Application con được tạo trong namespace `argocd`.

## 8. `demo-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: demo-app
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  project: default
  source:
    repoURL: https://github.com/G-03-XBrain-Phase-2/thanh-aws-accelerator-p2.git
    targetRevision: main
    path: cloud/w9/day-a/k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: gitops-demo
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Giải thích khác với root app:

| Field | Ý nghĩa |
|---|---|
| `metadata.name: demo-app` | App con quản lý workload thật |
| `source.path: cloud/w9/day-a/k8s` | Trỏ tới manifest Kubernetes |
| `destination.namespace: gitops-demo` | Deploy workload vào namespace `gitops-demo` |
| `sync-wave: "1"` | Nếu có nhiều Application con, app này sync theo thứ tự wave 1 |

Luồng của `demo-app`:

```text
demo-app
   ↓ đọc Git
cloud/w9/day-a/k8s
   ↓ render Kustomize
Namespace + Deployment + Service
   ↓ apply vào cluster
namespace gitops-demo
```

## 9. ArgoCD Biết Cluster Nào Để Sửa Nhờ Đâu?

Nhờ field:

```yaml
destination:
  server: https://kubernetes.default.svc
```

Ý nghĩa:

```text
Deploy vào chính Kubernetes cluster nơi ArgoCD đang chạy.
```

Nếu ArgoCD chạy trong minikube, nó deploy vào minikube.

Nếu ArgoCD chạy trong EKS, nó deploy vào EKS đó.

Nếu muốn deploy sang cluster khác, phải add cluster đó vào ArgoCD:

```bash
argocd cluster add <context-name>
```

Sau đó `destination.server` sẽ là API server của cluster được add.

## 10. Sync Waves

Sync waves giúp ArgoCD apply resource theo thứ tự.

Trong bài này:

| Resource | Sync wave | Lý do |
|---|---:|---|
| Namespace | `0` | Phải có namespace trước |
| ArgoCD demo app | `1` | App con được tạo sau root |
| Deployment | `2` | Workload chạy sau namespace |
| Service | `3` | Service route tới pod sau khi Deployment có pod |

Annotation:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "2"
```

Quy tắc dễ nhớ:

```text
Namespace, CRD trước.
ConfigMap, Secret tiếp theo.
Deployment, StatefulSet sau đó.
Service, Ingress cuối cùng.
```

## 11. GitHub Actions: Plan-on-PR

Workflow plan-on-PR chạy khi có Pull Request vào `main`.

```yaml
on:
  pull_request:
    branches:
      - main
```

Ý nghĩa:

```text
Khi tạo Pull Request vào main, GitHub Actions validate manifest.
```

Các bước:

```yaml
steps:
  - name: Checkout source
    uses: actions/checkout@v4

  - name: Render Kustomize
    run: |
      kubectl kustomize cloud/w9/day-a/k8s

  - name: Validate Kubernetes manifests
    run: |
      kubectl apply --dry-run=client -k cloud/w9/day-a/k8s
```

Giải thích:

| Step | Ý nghĩa |
|---|---|
| `actions/checkout@v4` | Checkout code trong repo về runner |
| `kubectl kustomize` | Render Kustomize, kiểm tra file build được |
| `kubectl apply --dry-run=client` | Kiểm tra manifest mà không apply thật |

Plan-on-PR không deploy.

Nó chỉ trả lời câu hỏi:

```text
Manifest này có build được không?
Nếu merge thì sẽ có thể apply được không?
```

## 12. GitHub Actions: Apply-on-Merge

Workflow apply-on-merge chạy khi có push vào `main`.

```yaml
on:
  push:
    branches:
      - main
```

Nội dung minh họa:

```yaml
- name: Apply Kubernetes manifests
  run: |
    kubectl apply -k cloud/w9/day-a/k8s
```

Lưu ý quan trọng:

```text
Workflow này chỉ apply thật nếu GitHub Actions runner có kubeconfig và quyền truy cập cluster.
```

Trong GitOps chuẩn, không nên để GitHub Actions deploy trực tiếp vào production nếu đã dùng ArgoCD.

Flow tốt hơn:

```text
Pull Request
   ↓
GitHub Actions validate
   ↓
Merge main
   ↓
ArgoCD sync
   ↓
Kubernetes update
```

Vì vậy trong bài này, `apply-on-merge.yaml` chủ yếu để hiểu CI/CD truyền thống. Còn thực tế GitOps nên để ArgoCD apply.

## 13. Test Thật Kubernetes

Kiểm tra cluster:

```bash
kubectl config current-context
kubectl cluster-info
kubectl get nodes
```

Apply trực tiếp manifest:

```bash
kubectl apply -k cloud/w9/day-a/k8s
```

Xem resource:

```bash
kubectl get ns
kubectl get all -n gitops-demo
```

Test app:

```bash
kubectl port-forward -n gitops-demo svc/demo-app 8080:80
curl http://localhost:8080
```

Xóa app nếu test thủ công:

```bash
kubectl delete -k cloud/w9/day-a/k8s
```

Nếu đang để ArgoCD quản lý app, không nên xóa tay lâu dài, vì ArgoCD có thể sync lại.

## 14. Test Thật ArgoCD

Apply root app:

```bash
kubectl apply -f cloud/w9/day-a/gitops/root-app.yaml
```

Xem Application:

```bash
kubectl get applications -n argocd
```

Kỳ vọng:

```text
NAME       SYNC STATUS   HEALTH STATUS
root-app   Synced        Healthy
demo-app   Synced        Healthy
```

Nếu chỉ thấy `root-app`, kiểm tra:

```bash
kubectl describe application root-app -n argocd
```

Nếu thấy lỗi:

```text
authentication required: Repository not found
```

nghĩa là:

```text
Repo private, repo URL sai, hoặc ArgoCD chưa có quyền đọc repo.
```

Refresh thủ công:

```bash
kubectl annotate application root-app -n argocd argocd.argoproj.io/refresh=hard --overwrite
kubectl annotate application demo-app -n argocd argocd.argoproj.io/refresh=hard --overwrite
```

Xem app thật:

```bash
kubectl get all -n gitops-demo
```

## 15. Test GitOps Flow

Sửa số replicas trong:

```text
cloud/w9/day-a/k8s/deployment.yaml
```

Ví dụ:

```yaml
replicas: 4
```

Commit và push:

```bash
git add cloud/w9/day-a/k8s/deployment.yaml
git commit -m "Scale demo app to 4 replicas"
git push origin main
```

Theo dõi ArgoCD:

```bash
kubectl get applications -n argocd
kubectl get pods -n gitops-demo
```

Kỳ vọng:

```text
Pod tăng lên 4.
ArgoCD trạng thái Synced.
```

Đây là luồng GitOps thật:

```text
Git đổi
   ↓
ArgoCD thấy Git đổi
   ↓
ArgoCD sync cluster
   ↓
Cluster đổi
```

## 16. Test Self-Heal

Trong Git đang có:

```yaml
replicas: 3
```

Sửa tay cluster:

```bash
kubectl scale deployment demo-app -n gitops-demo --replicas=1
kubectl get pods -n gitops-demo
```

Chờ một lúc rồi kiểm tra lại:

```bash
kubectl get pods -n gitops-demo
```

Nếu `selfHeal: true`, ArgoCD sẽ kéo lại số pod theo Git.

Ý nghĩa:

```text
Cluster không được tự ý khác Git.
Git là source of truth.
```

## 17. Rollback

### Rollback chuẩn GitOps: `git revert`

Tìm commit lỗi:

```bash
git log --oneline
```

Revert:

```bash
git revert <commit-id>
git push origin main
```

ArgoCD sẽ thấy Git quay về trạng thái cũ và sync cluster.

Đây là cách nên dùng trong GitOps.

### Rollback khẩn cấp: `kubectl rollout undo`

```bash
kubectl rollout undo deployment/demo-app -n gitops-demo
```

Cách này nhanh nhưng có vấn đề:

```text
Cluster đã rollback, nhưng Git vẫn đang giữ version lỗi.
ArgoCD có thể sync lại version lỗi từ Git.
```

Vì vậy nếu dùng `kubectl rollout undo`, sau đó vẫn phải sửa Git bằng `git revert`.

So sánh:

| Cách rollback | Ưu điểm | Nhược điểm | Khi dùng |
|---|---|---|---|
| `git revert` | Đúng GitOps, có audit trail | Chậm hơn một chút | Mặc định nên dùng |
| `kubectl rollout undo` | Nhanh khi sự cố gấp | Dễ lệch Git và cluster | Chỉ dùng khẩn cấp |

## 18. ArgoCD vs Flux

ArgoCD và Flux đều là GitOps tool cho Kubernetes.

| Tiêu chí | ArgoCD | Flux |
|---|---|---|
| Cách nhìn trạng thái | UI rất trực quan | CLI/CRD-first |
| Dễ demo | Dễ hơn | Cần hiểu nhiều CRD hơn |
| App-of-apps | Rất phổ biến | Dùng Kustomization để tổ chức tương tự |
| Image automation | Có thể làm, nhưng không phải điểm mạnh nhất | Rất mạnh |
| Helm support | Tốt | Rất tốt |
| Người mới học | Dễ hiểu hơn | Hơi sâu hơn |

Nên học ArgoCD trước vì:

```text
1. Có UI dễ quan sát
2. Trạng thái Synced/OutOfSync rõ ràng
3. App-of-apps dễ demo
4. Phù hợp bài học GitOps nhập môn
```

## 19. Những Lỗi Thường Gặp

### `Repository not found`

Lỗi:

```text
authentication required: Repository not found
```

Nguyên nhân:

```text
Repo private.
Sai repoURL.
Repo chưa tồn tại.
ArgoCD chưa có credential.
```

Cách xử lý:

```text
1. Kiểm tra URL mở được trên browser không.
2. Nếu lab đơn giản, để repo public.
3. Nếu repo private, add credential vào ArgoCD.
```

### Không thấy `demo-app`

Nguyên nhân thường gặp:

```text
1. root-app chưa sync được.
2. demo-app.yaml chưa commit + push lên main.
3. root-app trỏ sai path.
4. repoURL hoặc targetRevision sai.
```

Debug:

```bash
kubectl describe application root-app -n argocd
```

### GitHub Actions không chạy

Nguyên nhân:

```text
Workflow không nằm ở root .github/workflows.
Chưa push workflow lên GitHub.
Trigger chưa xảy ra.
```

Đúng:

```text
.github/workflows/plan-on-pr.yaml
```

Sai nếu muốn GitHub tự chạy:

```text
cloud/w9/day-a/.github/workflows/plan-on-pr.yaml
```

### `kubectl apply --dry-run=client` vẫn đòi cluster

Lỗi:

```text
failed to download openapi
```

Do `kubectl` cố lấy OpenAPI schema từ cluster để validate.

Nếu chỉ test local:

```bash
kubectl apply --dry-run=client --validate=false -k cloud/w9/day-a/k8s
```

hoặc:

```bash
kubectl kustomize cloud/w9/day-a/k8s
```

## 20. Checklist Ôn Tập

Cần nhớ:

```text
GitOps = Git là source of truth.
ArgoCD đọc Git và sync vào Kubernetes.
GitHub Actions nên validate/test/build, không nhất thiết deploy thật.
root-app quản lý Application con.
demo-app quản lý Kubernetes workload thật.
sync-wave điều khiển thứ tự sync.
selfHeal sửa drift khi cluster bị chỉnh tay.
prune xóa resource khỏi cluster nếu Git không còn resource đó.
Rollback chuẩn GitOps là git revert.
```

Câu trả lời ngắn khi được hỏi ArgoCD làm gì:

```text
ArgoCD theo dõi Git repo, so sánh manifest trong Git với resource trong Kubernetes, rồi sync cluster về đúng trạng thái mong muốn trong Git.
```

Câu trả lời ngắn khi được hỏi GitHub Actions và ArgoCD khác nhau thế nào:

```text
GitHub Actions kiểm tra/build/test. ArgoCD deploy thật theo GitOps.
```

Câu trả lời ngắn khi được hỏi vì sao ArgoCD biết deploy vào cluster nào:

```text
Nhờ field destination.server. Với https://kubernetes.default.svc, ArgoCD deploy vào chính cluster nơi nó đang chạy.
```
