# W10 Day A - Kubernetes RBAC và Admission Policy

Day A tập trung vào hai lớp kiểm soát bảo mật quan trọng của Kubernetes:

1. **RBAC (Role-Based Access Control):** danh tính nào được phép thực hiện hành động gì trên tài nguyên nào.
2. **Admission Policy:** tài nguyên được gửi lên Kubernetes có đáp ứng quy định bảo mật và vận hành của cluster hay không.

Mục tiêu cuối ngày:

- Phân biệt Authentication, Authorization và Admission.
- Hiểu `Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`.
- Dùng `ServiceAccount` làm danh tính cho workload.
- Kiểm tra quyền bằng `kubectl auth can-i` và `--as`.
- Hiểu mối quan hệ giữa Gatekeeper, OPA và Rego.
- Phân biệt `ConstraintTemplate` và `Constraint`.
- Áp dụng bốn policy cho Pod.
- Hiểu `dryrun`, `warn`, `deny` và Gatekeeper audit.
- Dùng `ValidatingAdmissionPolicy` native với CEL.

---

## 1. Luồng Xử Lý Một Kubernetes Request

Khi chạy:

```bash
kubectl create -f pod.yaml
```

request đi qua luồng:

```text
kubectl
  |
  | HTTPS request + credential
  v
Kubernetes API Server
  |
  | 1. Authentication
  |    Xác minh người gửi là ai
  v
Authorization
  |
  | 2. RBAC
  |    Danh tính có quyền thực hiện hành động không
  v
Mutating Admission
  |
  | 3. Có thể sửa object trước khi lưu
  v
Schema Validation
  |
  | 4. Kiểm tra cấu trúc và kiểu dữ liệu
  v
Validating Admission
  |
  | 5. Gatekeeper / ValidatingAdmissionPolicy
  |    kiểm tra object có đạt policy không
  v
etcd
  |
  | 6. Lưu desired state
  v
Controller thực hiện desired state
```

### 1.1 Authentication - Bạn là ai?

Authentication xác định danh tính gửi request.

Danh tính có thể là:

- User từ kubeconfig.
- Client certificate.
- Bearer token.
- ServiceAccount.
- IAM identity khi dùng Amazon EKS.

Authentication thành công chỉ chứng minh danh tính hợp lệ, chưa chứng minh danh tính có quyền.

### 1.2 Authorization - Bạn được làm gì?

Authorization trả lời:

```text
Subject S có được thực hiện verb V
trên resource R trong namespace N không?
```

Ví dụ:

```text
developer-sa có được create pods trong namespace w10-rbac không?
```

RBAC xử lý bước này.

### 1.3 Admission - Object có được chấp nhận không?

Admission kiểm tra nội dung object sau khi Authorization cho phép.

Ví dụ:

- Pod có đủ label không?
- Container có CPU/memory requests và limits không?
- Container có chạy `privileged: true` không?
- Image có thuộc registry được phê duyệt không?
- Deployment có ít nhất hai replicas không?

Điểm quan trọng:

```text
RBAC cho phép tạo Pod
không có nghĩa
Admission sẽ chấp nhận mọi Pod.
```

---

## 2. Cấu Trúc Thư Mục

```text
cloud/w10/day-a/
├── README.md
├── rbac/
│   └── prod/
│       ├── namespace.yaml
│       ├── serviceaccounts.yaml
│       ├── roles/
│       │   ├── developer.yaml
│       │   └── viewer.yaml
│       ├── rolebindings/
│       │   ├── developer.yaml
│       │   └── viewer.yaml
│       └── workloads/
│           └── test-pod.yaml
└── policies/
    ├── templates/
    │   ├── required-labels.yaml
    │   ├── required-resources.yaml
    │   ├── disallow-privileged.yaml
    │   └── allowed-registries.yaml
    ├── constraints/
    │   └── prod/
    │       ├── required-labels.yaml
    │       ├── required-resources.yaml
    │       ├── disallow-privileged.yaml
    │       └── allowed-registries.yaml
    └── native/
        └── prod/
            └── minimum-replicas.yaml
```

Ý nghĩa:

| Đường dẫn | Vai trò |
|---|---|
| `rbac/prod/` | RBAC và workload dùng trong môi trường mô phỏng production |
| `roles/` | Định nghĩa tập quyền |
| `rolebindings/` | Gán tập quyền cho ServiceAccount |
| `workloads/` | Workload dùng để kiểm thử RBAC và Admission |
| `policies/templates/` | Logic Gatekeeper/Rego dùng chung |
| `policies/constraints/prod/` | Cấu hình áp dụng Gatekeeper policy cho production |
| `policies/native/prod/` | Native Kubernetes admission policy cho production |

`prod` hiện là cách tổ chức cấu hình. Namespace lab vẫn có tên `w10-rbac`.

---

## 3. Cấu Trúc Chung Của Kubernetes Manifest

Phần lớn Kubernetes resource có cấu trúc:

```yaml
apiVersion: <API group và version>
kind: <loại resource>
metadata:
  name: <tên object>
  namespace: <namespace nếu resource có namespace>
spec:
  <desired state>
```

### `apiVersion`

Cho biết API group và phiên bản mà Kubernetes dùng để hiểu resource.

Ví dụ:

```yaml
apiVersion: v1
```

Core API group, thường chứa:

- Namespace
- Pod
- Service
- ConfigMap
- Secret
- ServiceAccount

```yaml
apiVersion: rbac.authorization.k8s.io/v1
```

RBAC API group, chứa:

- Role
- ClusterRole
- RoleBinding
- ClusterRoleBinding

### `kind`

Loại object cần tạo, ví dụ:

```yaml
kind: Role
```

### `metadata`

Thông tin nhận dạng và phân loại object:

- `name`: tên duy nhất trong scope.
- `namespace`: namespace chứa object.
- `labels`: metadata dạng key-value dùng để tìm kiếm và match policy.
- `annotations`: metadata mở rộng, không dùng làm selector thông thường.

### `spec`

Desired state: trạng thái người dùng muốn Kubernetes duy trì.

Một số resource như `Role` dùng `rules` thay vì đặt mọi thứ trong `spec`.

---

## 4. RBAC: Role, Binding Và Subject

RBAC có hai nhóm resource.

### Nhóm định nghĩa quyền

```text
Role
ClusterRole
```

### Nhóm gán quyền

```text
RoleBinding
ClusterRoleBinding
```

Luồng:

```text
Subject
  |
  | được nhắc tới trong subjects
  v
RoleBinding / ClusterRoleBinding
  |
  | roleRef trỏ tới
  v
Role / ClusterRole
  |
  | chứa rules
  v
Quyền thực tế
```

Subject có thể là:

- `User`
- `Group`
- `ServiceAccount`

### Ma trận phạm vi

| Resource định nghĩa quyền | Binding | Phạm vi thực tế |
|---|---|---|
| `Role` | `RoleBinding` | Một namespace |
| `ClusterRole` | `RoleBinding` | Một namespace |
| `ClusterRole` | `ClusterRoleBinding` | Toàn cluster |
| `Role` | `ClusterRoleBinding` | Không hợp lệ |

### RBAC cộng quyền

Kubernetes RBAC không có rule `deny` thông thường.

```text
Quyền thực tế = quyền Role A + quyền Role B + quyền Role C
```

Nếu Role A cho phép `get secrets` còn Role B không đề cập đến Secret, user vẫn được đọc Secret.

Muốn thu hồi quyền phải:

- Xóa/sửa RoleBinding.
- Xóa subject khỏi binding.
- Xóa rule khỏi Role/ClusterRole đang cấp quyền.

---

## 5. `rbac/prod/namespace.yaml`

Nội dung:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: w10-rbac
  labels:
    purpose: rbac-lab
```

### Giải thích từng field

| Field | Ý nghĩa |
|---|---|
| `apiVersion: v1` | Namespace thuộc core Kubernetes API |
| `kind: Namespace` | Tạo một namespace |
| `metadata.name` | Tên namespace là `w10-rbac` |
| `metadata.labels` | Tập label gắn vào namespace |
| `purpose: rbac-lab` | Label dùng để native admission policy chọn namespace |

Namespace là cluster-scoped resource nên không có:

```yaml
metadata:
  namespace: ...
```

### Luồng sử dụng label

```text
Namespace w10-rbac
  |
  | có label purpose=rbac-lab
  v
ValidatingAdmissionPolicyBinding
  |
  | namespaceSelector match label
  v
Native policy áp dụng cho resource trong namespace
```

---

## 6. `rbac/prod/serviceaccounts.yaml`

File tạo hai ServiceAccount:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: developer-sa
  namespace: w10-rbac

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: viewer-sa
  namespace: w10-rbac
```

### Dấu `---`

Phân cách nhiều YAML document trong cùng một file.

File này chứa hai Kubernetes resource độc lập.

### Identity đầy đủ

```text
system:serviceaccount:<namespace>:<service-account-name>
```

Hai identity:

```text
system:serviceaccount:w10-rbac:developer-sa
system:serviceaccount:w10-rbac:viewer-sa
```

### ServiceAccount làm gì?

ServiceAccount tạo danh tính cho workload.

Nó chưa tự có quyền:

```text
ServiceAccount
  |
  | chưa có Binding
  v
Không có quyền bổ sung
```

Quyền xuất hiện sau khi RoleBinding nối ServiceAccount với Role:

```text
developer-sa
  |
  v
developer-binding
  |
  v
Role developer
```

Nếu Pod không khai báo `serviceAccountName`, Pod dùng ServiceAccount `default` của namespace.

---

## 7. `rbac/prod/roles/developer.yaml`

Role developer:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: w10-rbac
rules:
  - apiGroups: [""]
    resources:
      - pods
      - services
      - configmaps
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
      - delete

  - apiGroups: ["apps"]
    resources:
      - deployments
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
      - delete
```

### `apiVersion`

```yaml
apiVersion: rbac.authorization.k8s.io/v1
```

API group chuyên cho RBAC.

### `kind: Role`

Role định nghĩa quyền có phạm vi namespace.

### `metadata.namespace`

```yaml
namespace: w10-rbac
```

Role này chỉ có thể cấp quyền trong `w10-rbac`.

### `rules`

Danh sách các rule được cấp. Mỗi phần tử `-` là một rule.

### `apiGroups: [""]`

Chuỗi rỗng là core API group.

Rule đầu áp dụng cho:

```text
pods
services
configmaps
```

### `apiGroups: ["apps"]`

Rule thứ hai áp dụng cho `deployments` trong API group `apps`.

### `resources`

Loại Kubernetes resource mà rule áp dụng.

Tên resource trong RBAC thường viết:

- Chữ thường.
- Dạng số nhiều.

Ví dụ:

```text
pods
configmaps
secrets
deployments
```

### `verbs`

| Verb | Ý nghĩa |
|---|---|
| `get` | Đọc một object cụ thể |
| `list` | Lấy danh sách object |
| `watch` | Theo dõi thay đổi |
| `create` | Tạo object |
| `update` | Thay toàn bộ object |
| `patch` | Cập nhật một phần |
| `delete` | Xóa object |

Developer không được cấp:

- `secrets`
- `roles`
- `rolebindings`
- `serviceaccounts`

Đây là least privilege.

---

## 8. `rbac/prod/roles/viewer.yaml`

Viewer có cùng nhóm resource nhưng chỉ có:

```yaml
verbs:
  - get
  - list
  - watch
```

Viewer không thể:

- Tạo.
- Sửa.
- Patch.
- Xóa.

So sánh:

| Role | Đọc | Tạo | Sửa | Xóa |
|---|---:|---:|---:|---:|
| developer | Có | Có | Có | Có |
| viewer | Có | Không | Không | Không |

---

## 9. `rbac/prod/rolebindings/developer.yaml`

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developer-binding
  namespace: w10-rbac
subjects:
  - kind: ServiceAccount
    name: developer-sa
    namespace: w10-rbac
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: developer
```

### `kind: RoleBinding`

RoleBinding gán quyền trong namespace chứa binding.

### `metadata.name`

Tên object binding là `developer-binding`.

### `metadata.namespace`

Quyền được gán trong `w10-rbac`.

### `subjects`

Danh sách identity nhận quyền.

```yaml
kind: ServiceAccount
```

Subject là ServiceAccount.

```yaml
name: developer-sa
namespace: w10-rbac
```

Chọn chính xác ServiceAccount `developer-sa` trong `w10-rbac`.

### `roleRef`

Tham chiếu tập quyền cần cấp.

```yaml
apiGroup: rbac.authorization.k8s.io
```

Role được tham chiếu thuộc RBAC API group.

```yaml
kind: Role
name: developer
```

Binding tham chiếu Role `developer`.

Luồng:

```text
developer-sa
  |
  | subjects
  v
developer-binding
  |
  | roleRef
  v
Role developer
  |
  v
Quyền developer trong w10-rbac
```

---

## 10. `rbac/prod/rolebindings/viewer.yaml`

File viewer binding hoạt động tương tự:

```text
viewer-sa
  |
  v
view-binding
  |
  v
Role viewer
```

Kết quả:

- `viewer-sa` đọc được Pod, Service, ConfigMap và Deployment.
- `viewer-sa` không tạo hoặc sửa các resource đó.

---

## 11. `rbac/prod/workloads/test-pod.yaml`

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: rbac-test
  namespace: w10-rbac
  labels:
    app: rbac-test
    owner: thanh
    environment: dev
spec:
  serviceAccountName: developer-sa
  automountServiceAccountToken: false
  containers:
    - name: nginx
      image: nginx:1.26-alpine
      ports:
        - containerPort: 80
          name: http
      resources:
        requests:
          cpu: 50m
          memory: 32Mi
        limits:
          cpu: 100m
          memory: 64Mi
```

### `metadata.name`

Tên Pod là `rbac-test`.

### `metadata.namespace`

Pod được tạo trong `w10-rbac`.

### `metadata.labels`

```yaml
app: rbac-test
owner: thanh
environment: dev
```

- `app`: nhận dạng ứng dụng.
- `owner`: team/người chịu trách nhiệm.
- `environment`: môi trường chạy.

Hai label `owner` và `environment` đáp ứng required-labels policy.

### `serviceAccountName`

```yaml
serviceAccountName: developer-sa
```

Sau khi Pod chạy, workload dùng identity `developer-sa`.

Trường này không quyết định người đang chạy `kubectl` là ai.

### `automountServiceAccountToken`

```yaml
automountServiceAccountToken: false
```

Không tự động mount Kubernetes API token vào container.

Nên dùng khi ứng dụng không cần gọi Kubernetes API.

### `containers`

Danh sách container trong Pod.

### `image`

```yaml
image: nginx:1.26-alpine
```

Image dùng để tạo container.

### `ports`

```yaml
containerPort: 80
name: http
```

Mô tả container lắng nghe cổng 80. Trường này không tự expose Pod ra ngoài cluster.

### `resources.requests`

```yaml
requests:
  cpu: 50m
  memory: 32Mi
```

Scheduler dùng requests khi quyết định node nào đủ tài nguyên để chạy Pod.

`50m` CPU nghĩa là 50 millicores, tương đương 0,05 CPU core.

### `resources.limits`

```yaml
limits:
  cpu: 100m
  memory: 64Mi
```

Mức tài nguyên tối đa container được phép dùng.

---

## 12. `--as` Khác `serviceAccountName`

### `--as`

```bash
kubectl create -f test-pod.yaml \
  --as=system:serviceaccount:w10-rbac:developer-sa
```

`--as` impersonate identity gửi request.

Nó trả lời:

```text
Ai đang yêu cầu API Server tạo Pod?
```

### `serviceAccountName`

```yaml
serviceAccountName: developer-sa
```

Nó trả lời:

```text
Pod dùng identity nào sau khi chạy?
```

Luồng đầy đủ:

```text
kubectl --as=developer-sa
  |
  | developer-sa gửi request create Pod
  v
Authorization kiểm tra developer-sa
  |
  v
Admission kiểm tra nội dung Pod
  |
  v
Pod được tạo
  |
  | spec.serviceAccountName
  v
Pod chạy dưới identity developer-sa
```

Không dùng `--as`, kubectl dùng user trong kubeconfig hiện tại.

---

## 13. Kiểm Thử RBAC

### Apply RBAC

```bash
kubectl apply -f cloud/w10/day-a/rbac/prod/namespace.yaml
kubectl apply -R -f cloud/w10/day-a/rbac/prod
```

`-R` nghĩa là recursive: đọc cả các thư mục con.

### Kiểm tra object

```bash
kubectl get sa,role,rolebinding -n w10-rbac
```

### Developer được tạo Pod

```bash
kubectl auth can-i create pods \
  --as=system:serviceaccount:w10-rbac:developer-sa \
  -n w10-rbac
```

Kỳ vọng:

```text
yes
```

### Developer không đọc Secret

```bash
kubectl auth can-i get secrets \
  --as=system:serviceaccount:w10-rbac:developer-sa \
  -n w10-rbac
```

Kỳ vọng:

```text
no
```

### Viewer đọc được Pod

```bash
kubectl auth can-i get pods \
  --as=system:serviceaccount:w10-rbac:viewer-sa \
  -n w10-rbac
```

Kỳ vọng:

```text
yes
```

### Viewer không tạo Pod

```bash
kubectl auth can-i create pods \
  --as=system:serviceaccount:w10-rbac:viewer-sa \
  -n w10-rbac
```

Kỳ vọng:

```text
no
```

### Developer không có quyền tại namespace khác

```bash
kubectl auth can-i create pods \
  --as=system:serviceaccount:w10-rbac:developer-sa \
  -n default
```

Kỳ vọng:

```text
no
```

`kubectl auth can-i` chỉ hỏi Authorization. Kết quả `yes` không chứng minh Pod sẽ vượt Admission.

---

## 14. Gatekeeper, OPA Và Rego

### Gatekeeper

Gatekeeper là Kubernetes admission controller/webhook.

Nó:

- Nhận admission request từ API Server.
- Tìm Constraint phù hợp.
- Chạy logic trong ConstraintTemplate.
- Trả về allow, warn hoặc deny.
- Audit object đang tồn tại.

### OPA

OPA (Open Policy Agent) là policy engine tổng quát.

### Rego

Rego là ngôn ngữ policy của OPA.

Quan hệ:

```text
Kubernetes API Server
  |
  | AdmissionReview
  v
Gatekeeper
  |
  | đọc Constraint
  v
ConstraintTemplate
  |
  | chạy Rego bằng OPA
  v
Violation hoặc không violation
  |
  v
Admission response
```

Không cần gọi Gatekeeper hoặc OPA bằng lệnh riêng khi tạo Pod. API Server tự gọi webhook.

---

## 15. ConstraintTemplate Và Constraint

### ConstraintTemplate

Template định nghĩa:

- Tên loại Constraint mới.
- Schema parameter.
- Logic phát hiện vi phạm.

Nó trả lời:

```text
Kiểm tra như thế nào?
```

### Constraint

Constraint định nghĩa:

- Áp policy cho resource nào.
- Áp tại namespace nào.
- Truyền parameter nào.
- Vi phạm thì `dryrun`, `warn` hay `deny`.

Nó trả lời:

```text
Áp logic đó ở đâu và xử lý kết quả thế nào?
```

Gatekeeper nối hai resource bằng `kind`:

```yaml
# Trong Template
names:
  kind: K8sRequiredLabels
```

```yaml
# Trong Constraint
kind: K8sRequiredLabels
```

---

## 16. Cấu Trúc Chung Của ConstraintTemplate

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: <tên-template>
spec:
  crd:
    spec:
      names:
        kind: <loại-constraint-mới>
      validation:
        openAPIV3Schema:
          <schema-parameters>
  targets:
    - target: admission.k8s.gatekeeper.sh
      code:
        - engine: Rego
          source:
            version: "v1"
            rego: |
              <logic>
```

### `metadata.name`

Tên Kubernetes object của template. Tên dùng dạng chữ thường.

### `spec.crd`

Gatekeeper tạo một CRD mới cho loại Constraint.

### `names.kind`

Tên kind mà Constraint sẽ dùng.

### `validation.openAPIV3Schema`

Schema của `spec.parameters` trong Constraint.

Schema giúp Kubernetes/Gatekeeper kiểm tra:

- Parameter nào được phép.
- Kiểu dữ liệu là string, array hay object.

### `targets`

Chỉ định hệ thống mà policy áp dụng.

```yaml
target: admission.k8s.gatekeeper.sh
```

Policy dùng cho Kubernetes admission.

### `engine: Rego`

Logic được viết bằng Rego.

### `version: "v1"`

Dùng cú pháp Rego v1.

---

## 17. Rego Input

Hai vùng dữ liệu quan trọng:

### Object đang được kiểm tra

```rego
input.review.object
```

Ví dụ:

```rego
input.review.object.metadata.labels
input.review.object.spec.containers
```

### Parameter từ Constraint

```rego
input.parameters
```

Ví dụ:

```rego
input.parameters.labels
input.parameters.registries
```

Luồng parameter:

```text
Constraint
spec.parameters.labels
  |
  v
Gatekeeper tạo Rego input
  |
  v
input.parameters.labels
```

---

## 18. Required Labels Template

File:

```text
policies/templates/required-labels.yaml
```

### Metadata

```yaml
metadata:
  name: k8srequiredlabels
```

Tên Template object.

### Constraint kind

```yaml
names:
  kind: K8sRequiredLabels
```

Sau khi apply template, Constraint dùng:

```yaml
kind: K8sRequiredLabels
```

### Parameter schema

```yaml
properties:
  labels:
    type: array
    items:
      type: string
```

`parameters.labels` phải là mảng chuỗi:

```yaml
parameters:
  labels:
    - owner
    - environment
```

### Package

```rego
package k8srequiredlabels
```

Namespace logic của Rego module.

### Violation rule

```rego
violation contains {
  "msg": msg,
  "details": {"missing_labels": missing}
} if {
  ...
}
```

Nếu các điều kiện trong `if` đúng, rule thêm một violation.

### Tập label hiện có

```rego
provided := {
  label |
  input.review.object.metadata.labels[label]
}
```

Ý nghĩa:

```text
Duyệt từng key label có trên object
và tạo tập hợp provided.
```

### Tập label bắt buộc

```rego
required := {
  label |
  label := input.parameters.labels[_]
}
```

`[_]` nghĩa là duyệt mọi phần tử trong mảng.

### Tìm label thiếu

```rego
missing := required - provided
```

Phép trừ tập hợp:

```text
required = {owner, environment}
provided = {app, owner}
missing  = {environment}
```

### Điều kiện vi phạm

```rego
count(missing) > 0
```

Nếu còn ít nhất một label thiếu, tạo violation.

### Message

```rego
msg := sprintf("missing required labels: %v", [missing])
```

Tạo thông báo trả về cho client.

---

## 19. Required Labels Constraint

File:

```text
policies/constraints/prod/required-labels.yaml
```

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: pods-must-have-required-labels
spec:
  enforcementAction: deny
  match:
    namespaces:
      - w10-rbac
    kinds:
      - apiGroups: [""]
        kinds:
          - Pod
  parameters:
    labels:
      - owner
      - environment
```

### `apiVersion`

API group của Gatekeeper Constraint.

### `kind`

Phải khớp `names.kind` trong Template.

### `metadata.name`

Tên quy định cụ thể.

### `enforcementAction`

```yaml
enforcementAction: deny
```

Object vi phạm bị từ chối tại Admission.

### `match.namespaces`

Chỉ áp policy trong `w10-rbac`.

### `match.kinds`

Chỉ match core API `Pod`.

### `parameters.labels`

Truyền `owner` và `environment` vào:

```rego
input.parameters.labels
```

---

## 20. Required Resources Template Và Constraint

Files:

```text
policies/templates/required-resources.yaml
policies/constraints/prod/required-resources.yaml
```

Policy yêu cầu mọi container có:

- CPU request.
- Memory request.
- CPU limit.
- Memory limit.

### Duyệt container

```rego
container := input.review.object.spec.containers[_]
```

Mỗi lần rule đánh giá một container.

### Kiểm tra request

```rego
missing_request(container) if {
  not container.resources.requests.cpu
}
```

Rule đúng nếu CPU request không tồn tại.

```rego
missing_request(container) if {
  not container.resources.requests.memory
}
```

Rule đúng nếu memory request không tồn tại.

Hai rule cùng tên hoạt động theo logic OR:

```text
thiếu CPU request
HOẶC
thiếu memory request
=> missing_request đúng
```

### Kiểm tra limit

Tương tự với:

```rego
container.resources.limits.cpu
container.resources.limits.memory
```

### Constraint

Constraint không có `parameters`, vì logic yêu cầu CPU và memory được viết cố định trong Template.

Nó chỉ cấu hình:

- `deny`.
- Namespace `w10-rbac`.
- Kind `Pod`.

---

## 21. Disallow Privileged Template Và Constraint

Files:

```text
policies/templates/disallow-privileged.yaml
policies/constraints/prod/disallow-privileged.yaml
```

### Điều kiện container chính

```rego
container := input.review.object.spec.containers[_]
container.securityContext.privileged == true
```

Nếu container có:

```yaml
securityContext:
  privileged: true
```

policy tạo violation.

### Điều kiện init container

```rego
container := input.review.object.spec.initContainers[_]
```

Policy cũng kiểm tra `initContainers`. Nếu chỉ kiểm tra container chính, attacker có thể đặt quyền nguy hiểm trong init container.

### Message

```rego
sprintf(
  "container %q must not run as privileged",
  [container.name]
)
```

`%q` chèn tên container dạng quoted string vào message.

### Constraint

Áp dụng policy cho Pod trong `w10-rbac` với `deny`.

---

## 22. Allowed Registries Template Và Constraint

Files:

```text
policies/templates/allowed-registries.yaml
policies/constraints/prod/allowed-registries.yaml
```

### Parameter schema

```yaml
registries:
  type: array
  items:
    type: string
```

Constraint truyền danh sách prefix được phép:

```yaml
registries:
  - nginx
  - company.example.com/
```

### Duyệt container

```rego
container := input.review.object.spec.containers[_]
```

### Kiểm tra registry

```rego
not registry_allowed(container.image)
```

Nếu không có registry nào cho phép image, tạo violation.

### Helper rule

```rego
registry_allowed(image) if {
  registry := input.parameters.registries[_]
  startswith(image, registry)
}
```

Luồng:

```text
container.image
  |
  v
Duyệt từng registry được phép
  |
  v
startswith(image, registry)
  |
  +-- true  -> được policy này chấp nhận
  `-- false -> thử registry tiếp theo
               nếu không registry nào đúng -> violation
```

### Hạn chế

Đây là logic đơn giản cho lab.

Nếu cho prefix:

```text
nginx
```

thì chuỗi `nginx-malicious` cũng có thể bắt đầu bằng `nginx`.

Production nên:

- Dùng Gatekeeper Policy Library.
- Parse registry/repository chặt chẽ.
- Có test case.
- Kết hợp scan và signature verification.

Policy này không xác minh chữ ký image.

---

## 23. Enforcement Và Audit

### `dryrun`

```text
Phát hiện violation
Nhưng không chặn request
```

Phù hợp giai đoạn quan sát.

### `warn`

```text
Cho phép request
Và trả cảnh báo cho client
```

### `deny`

```text
Từ chối request vi phạm
```

### Gatekeeper audit

Admission chỉ kiểm tra request create/update.

Audit định kỳ kiểm tra resource đã tồn tại:

```text
Pod cũ tồn tại
  |
  | policy được cài sau
  v
Admission không tự chạy lại cho Pod cũ
  |
  v
Gatekeeper audit quét cluster
  |
  v
Ghi nhận violation
```

Audit không tự động sửa hoặc xóa workload.

### Quy trình production

```text
Chọn/viết policy
  |
  v
dryrun
  |
  v
Quan sát violations
  |
  v
Kiểm tra false positive
  |
  v
Sửa workload / thu hẹp match
  |
  v
Thêm exception có phạm vi và thời hạn
  |
  v
warn hoặc deny
  |
  v
Theo dõi deployment và rollback
```

---

## 24. Apply Gatekeeper Policy

### Kiểm tra Gatekeeper

```bash
kubectl get pods -n gatekeeper-system
kubectl get crd | grep gatekeeper
```

### Apply Template trước

```bash
kubectl apply -f cloud/w10/day-a/policies/templates/
```

Template tạo các loại Constraint:

```text
K8sRequiredLabels
K8sRequiredResources
K8sDisallowPrivileged
K8sAllowedRegistries
```

### Kiểm tra Template

```bash
kubectl get constrainttemplates
```

### Apply Constraint sau

```bash
kubectl apply -f cloud/w10/day-a/policies/constraints/prod/
```

Nếu apply Constraint trước Template:

```text
Kubernetes chưa biết kind K8sRequiredLabels là gì
=> no matches for kind
```

---

## 25. Client Dry-Run Và Server Dry-Run

### Client dry-run

```bash
kubectl apply --dry-run=client -f file.yaml
```

Chủ yếu xử lý phía kubectl.

Không chứng minh:

- RBAC cho phép.
- Gatekeeper chấp nhận.
- Native admission chấp nhận.

### Server dry-run

```bash
kubectl create --dry-run=server -f file.yaml
```

Request đi tới API Server:

```text
Authentication
-> Authorization
-> Admission
-> không lưu vào etcd
```

Server dry-run phù hợp để kiểm thử policy.

---

## 26. Native `ValidatingAdmissionPolicy`

File:

```text
policies/native/prod/minimum-replicas.yaml
```

File chứa hai resource:

1. `ValidatingAdmissionPolicy`
2. `ValidatingAdmissionPolicyBinding`

So sánh:

| Gatekeeper | Native Kubernetes |
|---|---|
| `ConstraintTemplate` | `ValidatingAdmissionPolicy` |
| `Constraint` | `ValidatingAdmissionPolicyBinding` |
| Rego | CEL |
| `enforcementAction` | `validationActions` |

---

## 27. Giải Thích `ValidatingAdmissionPolicy`

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: deployments-minimum-replicas
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
      - apiGroups:
          - apps
        apiVersions:
          - v1
        operations:
          - CREATE
          - UPDATE
        resources:
          - deployments
  validations:
    - expression: "has(object.spec.replicas) && object.spec.replicas >= 2"
      message: "Deployment must have at least 2 replicas"
```

### `apiVersion`

Native admission policy thuộc API group:

```text
admissionregistration.k8s.io
```

### `metadata.name`

Tên policy là `deployments-minimum-replicas`.

### `failurePolicy: Fail`

Nếu Kubernetes không thể đánh giá policy:

```text
Fail -> từ chối request
```

Đây là fail-closed, ưu tiên bảo mật.

Ngược lại, `Ignore` có thể cho request đi qua khi policy gặp lỗi.

### `matchConstraints.resourceRules`

Xác định request nào policy quan tâm.

### `apiGroups: apps`

Chỉ resource thuộc API group `apps`.

### `apiVersions: v1`

Chỉ API version `v1`.

### `operations`

```text
CREATE -> kiểm tra khi tạo
UPDATE -> kiểm tra khi cập nhật
```

### `resources: deployments`

Chỉ kiểm tra Deployment, không trực tiếp kiểm tra Pod.

### CEL expression

```cel
has(object.spec.replicas) && object.spec.replicas >= 2
```

Phân tích:

```text
object
-> Deployment đang được kiểm tra

object.spec.replicas
-> số replicas trong Deployment

has(...)
-> field replicas có tồn tại không

&&
-> cả hai điều kiện phải đúng

>= 2
-> replicas tối thiểu là 2
```

### `message`

Thông báo trả về nếu expression là false.

---

## 28. Giải Thích `ValidatingAdmissionPolicyBinding`

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: deployments-minimum-replicas-binding
spec:
  policyName: deployments-minimum-replicas
  validationActions:
    - Deny
  matchResources:
    namespaceSelector:
      matchLabels:
        purpose: rbac-lab
```

### `policyName`

Trỏ tới policy:

```text
deployments-minimum-replicas
```

### `validationActions`

```yaml
validationActions:
  - Deny
```

Vi phạm thì từ chối.

Native policy có thể dùng:

- `Deny`
- `Warn`
- `Audit`

`Audit` ở đây gắn thông tin vào audit event của request, không giống Gatekeeper periodic audit quét object cũ.

### `matchResources.namespaceSelector`

Chọn namespace theo label.

```yaml
matchLabels:
  purpose: rbac-lab
```

Namespace `w10-rbac` có label này nên binding áp dụng.

Luồng:

```text
Deployment CREATE/UPDATE
  |
  v
Policy match apps/v1 deployments
  |
  v
Binding kiểm tra namespace có purpose=rbac-lab
  |
  v
CEL kiểm tra replicas >= 2
  |
  +-- đúng  -> cho qua policy này
  `-- sai   -> Deny
```

---

## 29. Test Native Policy

Apply:

```bash
kubectl apply \
  -f cloud/w10/day-a/policies/native/prod/minimum-replicas.yaml
```

Kiểm tra:

```bash
kubectl get validatingadmissionpolicies
kubectl get validatingadmissionpolicybindings
```

### Deployment không hợp lệ

```bash
kubectl create deployment native-bad \
  --image=nginx:1.26-alpine \
  --replicas=1 \
  -n w10-rbac \
  --dry-run=server
```

Kỳ vọng:

```text
Deployment must have at least 2 replicas
```

### Deployment hợp lệ với native policy

```bash
kubectl create deployment native-good \
  --image=nginx:1.26-alpine \
  --replicas=2 \
  -n w10-rbac \
  --dry-run=server
```

Vượt qua native minimum-replicas policy.

Tuy nhiên Deployment controller còn tạo Pod. Pod được tạo phải tiếp tục vượt qua bốn Gatekeeper policy.

---

## 30. Ma Trận Policy

| Tình huống | RBAC | Gatekeeper | Native policy | Kết quả |
|---|---|---|---|---|
| Viewer tạo Pod | Deny | Không chạy | Không liên quan | Bị từ chối ở Authorization |
| Developer tạo Pod thiếu label | Allow | Deny | Không liên quan | Bị Gatekeeper từ chối |
| Developer tạo privileged Pod | Allow | Deny | Không liên quan | Bị Gatekeeper từ chối |
| Developer tạo Pod hợp lệ | Allow | Allow | Không liên quan | Pod được lưu |
| Admin tạo Deployment 1 replica | Allow | Pod chưa được tạo | Deny | Deployment bị từ chối |
| Admin tạo Deployment 2 replicas | Allow | Kiểm tra Pod sau đó | Allow | Deployment có thể được tạo |

---

## 31. Quyền Nhạy Cảm Và Leo Thang

### `get secrets`

Secret có thể chứa:

- Database password.
- API token.
- TLS private key.
- Registry credential.

Base64 chỉ là encoding, không phải encryption.

### `create pods`

Có thể nguy hiểm vì người dùng có thể thử:

- Mount Secret vào Pod.
- Dùng ServiceAccount đặc quyền.
- Chạy privileged.
- Mount host filesystem.
- Tạo quá nhiều Pod.

Admission policy và ResourceQuota giảm các rủi ro này.

### `bind`

Cho phép gắn Role/ClusterRole mạnh cho subject.

### `escalate`

Cho phép tạo hoặc sửa Role có quyền vượt quá quyền hiện tại.

### `impersonate`

Cho phép gửi request dưới danh tính khác.

---

## 32. Troubleshooting

### ServiceAccount không tồn tại

Lỗi:

```text
serviceaccount "developer-sa" not found
```

Nguyên nhân: tạo Pod trước ServiceAccount hoặc namespace.

Thứ tự:

```text
Namespace
-> ServiceAccount + Role
-> RoleBinding
-> Pod
```

### `no matches for kind ConstraintTemplate`

Nguyên nhân:

- Gatekeeper chưa cài.
- Sai kube context.
- Gatekeeper CRD chưa sẵn sàng.

### `no matches for kind K8sRequiredLabels`

Nguyên nhân:

- Required-labels Template chưa apply.
- Constraint CRD chưa được tạo.

### File đỏ trong VS Code

`U` nghĩa là untracked: file chưa được Git theo dõi.

VS Code có thể không có schema cho Gatekeeper CRD và gợi ý sai như yêu cầu `terms`.

Không thêm field chỉ để xóa màu đỏ. Dùng:

```bash
kubectl apply --dry-run=server -f <file>
```

### Phân biệt lỗi `Forbidden`

Đọc message:

```text
User/ServiceAccount cannot create...
-> Authorization/RBAC từ chối

denied by Gatekeeper hoặc policy message
-> Admission từ chối
```

---

## 33. Thứ Tự Triển Khai

```text
1. Namespace
2. ServiceAccounts
3. Roles
4. RoleBindings
5. Test RBAC bằng can-i và --as
6. Cài/kiểm tra Gatekeeper
7. Apply ConstraintTemplates
8. Đợi Constraint CRDs
9. Apply Constraints
10. Test Pod vi phạm và Pod hợp lệ
11. Apply native ValidatingAdmissionPolicy + Binding
12. Test Deployment 1 replica và 2 replicas
```

Lệnh:

```bash
kubectl apply -f cloud/w10/day-a/rbac/prod/namespace.yaml
kubectl apply -R -f cloud/w10/day-a/rbac/prod

kubectl apply -f cloud/w10/day-a/policies/templates/
kubectl apply -f cloud/w10/day-a/policies/constraints/prod/
kubectl apply -f cloud/w10/day-a/policies/native/prod/
```

---

## 34. Checklist Hoàn Thành Day A

- [ ] Giải thích được Authentication, Authorization và Admission.
- [ ] Giải thích được Role khác Binding như thế nào.
- [ ] Developer tạo được Pod trong `w10-rbac`.
- [ ] Viewer chỉ đọc được resource.
- [ ] Developer không đọc được Secret.
- [ ] Developer không có quyền tại namespace khác.
- [ ] Pod thiếu label bị Gatekeeper từ chối.
- [ ] Pod thiếu requests/limits bị Gatekeeper từ chối.
- [ ] Privileged Pod bị Gatekeeper từ chối.
- [ ] Image ngoài registry cho phép bị Gatekeeper từ chối.
- [ ] Pod hợp lệ vượt qua bốn Gatekeeper policy.
- [ ] Deployment một replica bị native policy từ chối.
- [ ] Deployment hai replicas vượt native policy.
- [ ] Giải thích được `dryrun`, `warn`, `deny` và audit.

---

## 35. Tóm Tắt

```text
Authentication
-> Bạn là ai?

Authorization / RBAC
-> Bạn được làm gì?

Admission
-> Object của bạn có đạt policy không?
```

```text
Role / ClusterRole
-> Định nghĩa quyền.

RoleBinding / ClusterRoleBinding
-> Gán quyền cho subject.
```

```text
ConstraintTemplate
-> Định nghĩa loại policy, parameter schema và logic Rego.

Constraint
-> Chọn object, namespace, parameter và enforcement action.
```

```text
Gatekeeper
-> Admission controller dùng OPA/Rego.

ValidatingAdmissionPolicy
-> Native Kubernetes admission dùng CEL.
```

Tinh thần chính của Day A:

> Không dựa vào việc developer tự hứa sẽ làm đúng. Cluster phải tự thực thi các quy tắc bảo mật.
