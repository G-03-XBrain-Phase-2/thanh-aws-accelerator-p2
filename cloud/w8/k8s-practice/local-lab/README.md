# Kubernetes Local Lab With Kustomize

Lab này dùng để học cách tổ chức manifest Kubernetes theo kiểu gần thực tế:

- `base`: khai báo phần dùng chung của app.
- `overlays/dev`: ghi đè cấu hình cho môi trường dev.
- `overlays/prod`: ghi đè cấu hình cho môi trường prod.

Bạn đang chạy local bằng minikube, nhưng cách chia này cũng là nền tảng để đem lên EKS.

## 1. Cấu Trúc Thư Mục

```text
local-lab/
  app/
    server.js
    package.json
    Dockerfile

  k8s/
    base/
      deployment.yaml
      service.yaml
      configmap.yaml
      kustomization.yaml

    overlays/
      dev/
        kustomization.yaml
        configmap-patch.yaml
        deployment-patch.yaml

      prod/
        kustomization.yaml
        configmap-patch.yaml
        deployment-patch.yaml
```

Ý nghĩa:

```text
base
  = bản gốc, trung lập, dùng chung cho mọi môi trường

overlays/dev
  = lấy base rồi sửa vài field cho dev

overlays/prod
  = lấy base rồi sửa vài field cho prod
```

Flow render:

```text
base YAML
  + dev patches
  + dev namePrefix
  + dev namespace
  = YAML cuối cùng cho dev

base YAML
  + prod patches
  + prod namePrefix
  + prod namespace
  = YAML cuối cùng cho prod
```

## 2. Vì Sao Không Viết Riêng Dev Và Prod Từ Đầu?

Không nên copy nguyên bộ YAML thành:

```text
deployment-dev.yaml
deployment-prod.yaml
service-dev.yaml
service-prod.yaml
```

Vì khi app có 20 field chung, bạn sẽ phải sửa nhiều nơi. Dễ lệch cấu hình.

Cách thực tế hơn:

```text
base giữ phần giống nhau
overlay chỉ ghi phần khác nhau
```

Ví dụ:

```text
Giống nhau:
  image
  containerPort
  readinessProbe
  livenessProbe
  envFrom
  service port
  selector

Khác nhau:
  namespace
  resource name prefix
  replicas
  resource requests/limits
  APP_VERSION
  MESSAGE
  rolling update strategy
```

## 3. Resource Names Sau Khi Render

Trong `base`, tên resource vẫn trung lập:

```text
k8s-local-lab
k8s-local-lab-config
```

Trong `overlays/dev/kustomization.yaml` có:

```yaml
namespace: dev
namePrefix: dev-
```

Kết quả dev:

```text
Deployment: dev-k8s-local-lab
Service: dev-k8s-local-lab
ConfigMap: dev-k8s-local-lab-config
Namespace: dev
```

Trong `overlays/prod/kustomization.yaml` có:

```yaml
namespace: prod
namePrefix: prod-
```

Kết quả prod:

```text
Deployment: prod-k8s-local-lab
Service: prod-k8s-local-lab
ConfigMap: prod-k8s-local-lab-config
Namespace: prod
```

Điểm hay: `configMapRef.name` trong Deployment cũng được Kustomize đổi theo prefix, nên app dev sẽ dùng `dev-k8s-local-lab-config`, app prod dùng `prod-k8s-local-lab-config`.

## 4. Base Deployment

File:

```text
k8s/base/deployment.yaml
```

Deployment là controller dùng để quản lý Pod theo desired state.

Flow:

```text
Deployment
  -> ReplicaSet
      -> Pod
          -> Container
```

Các field quan trọng:

```yaml
apiVersion: apps/v1
kind: Deployment
```

Ý nghĩa:

- `apiVersion`: version API Kubernetes dùng cho resource này.
- `kind`: loại resource. Ở đây là `Deployment`.

```yaml
metadata:
  name: k8s-local-lab
  labels:
    app: k8s-local-lab
    component: api
```

Ý nghĩa:

- `metadata.name`: tên resource trong cluster.
- `metadata.labels`: nhãn để lọc, quản lý, gom nhóm resource.
- `app`: tên ứng dụng logic.
- `component`: thành phần của app, ví dụ `api`, `worker`, `web`.

```yaml
spec:
  replicas: 2
```

Ý nghĩa:

- `replicas`: số Pod mong muốn.
- Nếu Pod chết, Deployment/ReplicaSet tạo lại cho đủ số này.

```yaml
selector:
  matchLabels:
    app: k8s-local-lab
    component: api
```

Ý nghĩa:

- `selector.matchLabels`: Deployment dùng selector này để nhận biết Pod nào thuộc về nó.
- Field này phải khớp với `template.metadata.labels`.

```yaml
template:
  metadata:
    labels:
      app: k8s-local-lab
      component: api
```

Ý nghĩa:

- `template`: mẫu Pod mà Deployment sẽ tạo.
- `template.metadata.labels`: label được gắn vào Pod mới.

```yaml
containers:
  - name: app
    image: k8s-local-lab:v1
    imagePullPolicy: Never
```

Ý nghĩa:

- `containers`: danh sách container trong Pod.
- `name`: tên container.
- `image`: Docker image để chạy.
- `imagePullPolicy: Never`: dùng cho minikube local khi image đã được build/load vào minikube. Kubernetes sẽ không pull từ Docker Hub.

Khi lên EKS, thường đổi thành:

```yaml
image: 123456789012.dkr.ecr.us-west-2.amazonaws.com/k8s-local-lab:v1
imagePullPolicy: IfNotPresent
```

```yaml
ports:
  - name: http
    containerPort: 3000
```

Ý nghĩa:

- `containerPort`: port app lắng nghe bên trong container.
- `name: http`: đặt tên port để probe hoặc service tham chiếu dễ hơn.

```yaml
envFrom:
  - configMapRef:
      name: k8s-local-lab-config
```

Ý nghĩa:

- Lấy toàn bộ key trong ConfigMap đưa vào container dưới dạng environment variables.
- Ví dụ `APP_NAME`, `APP_VERSION`, `MESSAGE`.

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: http
```

Ý nghĩa:

- Kubernetes dùng readiness probe để biết Pod đã sẵn sàng nhận traffic chưa.
- Nếu readiness fail, Service không route traffic đến Pod đó.

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
```

Ý nghĩa:

- Kubernetes dùng liveness probe để biết app còn sống không.
- Nếu liveness fail nhiều lần, kubelet restart container.

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"
```

Ý nghĩa:

- `requests`: lượng tài nguyên tối thiểu Pod cần. Scheduler dùng để xếp Pod vào node.
- `limits`: trần tài nguyên container được dùng.
- `100m` CPU nghĩa là 0.1 CPU core.
- `128Mi` nghĩa là 128 mebibytes RAM.

## 5. Base Service

File:

```text
k8s/base/service.yaml
```

Service tạo endpoint ổn định để truy cập Pod.

Flow:

```text
Client
  -> Service
      -> Pod A
      -> Pod B
      -> Pod C
```

Các field quan trọng:

```yaml
kind: Service
metadata:
  name: k8s-local-lab
```

Ý nghĩa:

- Tạo Service tên `k8s-local-lab`.

```yaml
spec:
  type: ClusterIP
```

Ý nghĩa:

- `ClusterIP`: Service chỉ truy cập được bên trong cluster.
- Khi học local, dùng `kubectl port-forward` để truy cập từ máy host.

```yaml
selector:
  app: k8s-local-lab
  component: api
```

Ý nghĩa:

- Service tìm Pod có label khớp selector này.
- Nếu selector sai, Service sẽ không có endpoint.

```yaml
ports:
  - name: http
    port: 80
    targetPort: 3000
```

Ý nghĩa:

- `port`: port của Service.
- `targetPort`: port bên trong container.
- Traffic vào Service port `80` sẽ được chuyển đến Pod port `3000`.

## 6. Base ConfigMap

File:

```text
k8s/base/configmap.yaml
```

ConfigMap dùng để tách config khỏi image.

```yaml
data:
  APP_NAME: "k8s-local-lab"
  APP_VERSION: "v1"
  MESSAGE: "Hello from base"
```

Ý nghĩa:

- App đọc các giá trị này qua `process.env`.
- Đổi config không cần build image mới.
- Nhưng sau khi đổi ConfigMap, Pod thường cần restart để app đọc env mới.

Restart Deployment:

```bash
kubectl rollout restart deployment/<deployment-name> -n <namespace>
```

Ví dụ dev:

```bash
kubectl rollout restart deployment/dev-k8s-local-lab -n dev
```

## 7. Base Kustomization

File:

```text
k8s/base/kustomization.yaml
```

```yaml
resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml

commonLabels:
  managed-by: kustomize
```

Ý nghĩa:

- `resources`: danh sách YAML mà base quản lý.
- `commonLabels`: label tự động gắn vào tất cả resource trong base.

Sau khi render, Deployment/Service/ConfigMap đều có:

```yaml
managed-by: kustomize
```

## 8. Dev Overlay

File:

```text
k8s/overlays/dev/kustomization.yaml
```

```yaml
namespace: dev
namePrefix: dev-

resources:
  - ../../base

patchesStrategicMerge:
  - configmap-patch.yaml
  - deployment-patch.yaml

commonLabels:
  environment: dev
```

Ý nghĩa:

- `namespace: dev`: tất cả resource sẽ được apply vào namespace `dev`.
- `namePrefix: dev-`: thêm prefix `dev-` vào tên resource.
- `resources: ../../base`: lấy YAML từ base.
- `patchesStrategicMerge`: ghi đè một phần YAML từ base.
- `commonLabels`: gắn label `environment=dev` vào resource.

Dev patch:

```yaml
spec:
  replicas: 1
```

Dev chỉ chạy 1 Pod để tiết kiệm tài nguyên.

```yaml
resources:
  requests:
    cpu: "50m"
    memory: "64Mi"
  limits:
    cpu: "200m"
    memory: "128Mi"
```

Dev dùng resource nhỏ hơn prod.

Config dev:

```yaml
data:
  APP_VERSION: "dev"
  MESSAGE: "Hello from dev environment"
```

Kết quả:

```text
base APP_NAME giữ nguyên
base APP_VERSION bị dev ghi đè thành dev
base MESSAGE bị dev ghi đè thành Hello from dev environment
```

## 9. Prod Overlay

File:

```text
k8s/overlays/prod/kustomization.yaml
```

```yaml
namespace: prod
namePrefix: prod-
```

Prod resource sẽ có tên:

```text
prod-k8s-local-lab
prod-k8s-local-lab-config
```

Prod patch:

```yaml
spec:
  replicas: 3
  revisionHistoryLimit: 10
```

Ý nghĩa:

- `replicas: 3`: chạy 3 Pod để có tính sẵn sàng cao hơn.
- `revisionHistoryLimit: 10`: giữ tối đa 10 revision để rollback.

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

Ý nghĩa:

- `maxUnavailable: 0`: trong lúc update, không được để thiếu Pod available so với desired replicas.
- `maxSurge: 1`: được tạo thêm tối đa 1 Pod vượt quá replicas trong lúc update.

Flow prod rolling update:

```text
replicas = 3
maxSurge = 1
maxUnavailable = 0

Trước update:
  old pod 1 ready
  old pod 2 ready
  old pod 3 ready

Trong update:
  tạo thêm new pod 1
  nếu new pod 1 ready -> xóa old pod 1
  tạo new pod 2
  nếu new pod 2 ready -> xóa old pod 2
  tạo new pod 3
  nếu new pod 3 ready -> xóa old pod 3
```

Nếu Pod mới lỗi:

```text
new pod crash
old pods vẫn được giữ
rollout bị kẹt
app không bị thay toàn bộ bằng bản lỗi
```

Đây là điều bạn đã thấy khi gặp `CrashLoopBackOff`.

## 10. Override Hoạt Động Như Thế Nào?

Base Deployment:

```yaml
metadata:
  name: k8s-local-lab
spec:
  replicas: 2
```

Dev patch:

```yaml
metadata:
  name: k8s-local-lab
spec:
  replicas: 1
```

Kustomize merge:

```text
Tìm resource cùng:
  apiVersion: apps/v1
  kind: Deployment
  metadata.name: k8s-local-lab

Sau đó ghi đè spec.replicas từ 2 thành 1
```

Rồi áp dụng prefix:

```text
k8s-local-lab -> dev-k8s-local-lab
```

Flow đầy đủ:

```text
base/deployment.yaml
  name: k8s-local-lab
  replicas: 2

dev/deployment-patch.yaml
  name: k8s-local-lab
  replicas: 1

kustomize render dev
  merge patch
  add namespace dev
  add namePrefix dev-
  add commonLabels environment=dev

final YAML
  name: dev-k8s-local-lab
  namespace: dev
  replicas: 1
```

Prod tương tự:

```text
base replicas: 2
prod patch replicas: 3
final prod name: prod-k8s-local-lab
final namespace: prod
```

## 11. Lệnh Thực Hành

Tạo namespace:

```bash
kubectl create namespace dev
kubectl create namespace prod
```

Render YAML để xem trước, chưa apply:

```bash
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/prod
```

Apply dev:

```bash
kubectl apply -k k8s/overlays/dev
```

Apply prod:

```bash
kubectl apply -k k8s/overlays/prod
```

Xem resource:

```bash
kubectl get all -n dev
kubectl get all -n prod
```

Xem ConfigMap:

```bash
kubectl get configmap -n dev
kubectl get configmap -n prod
```

Test dev:

```bash
kubectl port-forward -n dev svc/dev-k8s-local-lab 8080:80
```

Test prod:

```bash
kubectl port-forward -n prod svc/prod-k8s-local-lab 8081:80
```

Xóa dev:

```bash
kubectl delete -k k8s/overlays/dev
```

Xóa prod:

```bash
kubectl delete -k k8s/overlays/prod
```

## 12. Debug Checklist

Pod không chạy:

```bash
kubectl get pods -n dev
kubectl describe pod <pod-name> -n dev
kubectl logs <pod-name> -n dev
```

Service không vào được:

```bash
kubectl get svc -n dev
kubectl get endpoints -n dev
```

Nếu `endpoints` trống, kiểm tra:

```text
Service selector có khớp Pod labels không?
Pod đã Ready chưa?
Readiness probe có fail không?
```

Rollout kẹt:

```bash
kubectl rollout status deployment/dev-k8s-local-lab -n dev
kubectl get rs -n dev
kubectl describe deployment dev-k8s-local-lab -n dev
```

Rollback:

```bash
kubectl rollout undo deployment/dev-k8s-local-lab -n dev
```

## 13. Mapping Sang EKS Production

Local minikube:

```yaml
image: k8s-local-lab:v1
imagePullPolicy: Never
```

EKS:

```yaml
image: 123456789012.dkr.ecr.us-west-2.amazonaws.com/k8s-local-lab:v1
imagePullPolicy: IfNotPresent
```

Local expose:

```text
kubectl port-forward
```

EKS expose:

```text
Ingress
  -> AWS Load Balancer Controller
  -> ALB
  -> Service
  -> Pod
```

Local config:

```text
ConfigMap
```

Prod secret/config:

```text
ConfigMap
Secret
External Secrets Operator
AWS Secrets Manager
```

Local deploy:

```bash
kubectl apply -k k8s/overlays/dev
```

Thực tế production:

```text
Git push
  -> CI build Docker image
  -> push image to ECR
  -> update image tag
  -> kubectl apply -k / Helm / Argo CD
  -> EKS rollout
```

## 14. Ghi Nhớ

- `base` không nên chứa config quá riêng cho dev/prod.
- `overlay` chỉ chứa phần khác biệt.
- `namePrefix` giúp nhìn resource dễ phân biệt.
- `namespace` giúp cô lập môi trường.
- `commonLabels` giúp lọc resource.
- `selector` của Service phải match label của Pod.
- `selector` của Deployment phải match `template.metadata.labels`.
- Đổi ConfigMap env thì nên restart Deployment.
- Đổi image tag sẽ tạo rollout mới.
- Pod mới lỗi thì rolling update giữ Pod cũ, tránh downtime.
