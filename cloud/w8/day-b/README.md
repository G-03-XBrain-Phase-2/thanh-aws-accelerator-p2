# Day B - Docker và Kubernetes Cơ Bản

Thư mục này dùng để học cách tạo ứng dụng Node.js đơn giản, đóng gói bằng Docker, rồi chạy trên Kubernetes bằng Pod, Namespace, ReplicationController và ReplicaSet.

## Các file chính

- `index.js`: HTTP server trả về `Hello kube` trên port `3000`.
- `Dockerfile`: đóng gói app Node.js thành Docker image.
- `hello-kube.yaml`: tạo 3 Pod riêng lẻ với label khác nhau.
- `hello-namespace.yaml`: tạo Pod trong namespace `testing`.
- `hello-rc.yaml`: tạo ReplicationController quản lý nhiều Pod.
- `hello-rs.yaml`: tạo ReplicaSet quản lý nhiều Pod.
- `.gitignore`: bỏ qua binary local, `node_modules`, `.env` và log.

## Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY index.js .
ENTRYPOINT [ "node", "index.js" ]
```

Instruction:

- `FROM`: image nền. Trong bài này là `node:20-alpine`.
- `WORKDIR`: thư mục làm việc bên trong container.
- `COPY`: copy file từ máy local vào image.
- `ENTRYPOINT`: lệnh chạy khi container start.

## Kubernetes Field Chung

### `apiVersion`

Chọn phiên bản API của Kubernetes resource.

- `v1`: dùng cho Pod.
- `apps/v1`: dùng cho ReplicaSet.

### `kind`

Loại resource Kubernetes.

- `Pod`: chạy một hoặc nhiều container.
- `ReplicationController`: đảm bảo số lượng Pod mong muốn, là kiểu controller cũ.
- `ReplicaSet`: đảm bảo số lượng Pod mong muốn, là kiểu controller mới hơn.

### `metadata`

Thông tin định danh resource.

Field thường dùng:

- `name`: tên resource.
- `namespace`: namespace nơi resource được tạo.
- `labels`: cặp key-value dùng để nhóm và chọn resource.

### `spec`

Mô tả trạng thái mong muốn của resource.

Field thường dùng:

- `containers`: danh sách container trong Pod.
- `replicas`: số lượng Pod mong muốn với ReplicationController hoặc ReplicaSet.
- `selector`: điều kiện để controller chọn Pod cần quản lý.
- `template`: mẫu Pod để controller tạo Pod mới.

## Pod - `hello-kube.yaml`

File này tạo 3 Pod riêng lẻ.

Argument/field:

- `metadata.name`: tên Pod, ví dụ `hello-kube-ios`, `hello-kube-pc`, `hello-kube-os`.
- `metadata.labels.app`: label của Pod, ví dụ `ui` hoặc `system`.
- `spec.containers[].image`: Docker image chạy trong container. Trong bài này là `080196/hello-kube`.
- `spec.containers[].name`: tên container. Trong bài này là `hello-kube`.
- `spec.containers[].ports[].containerPort`: port app lắng nghe trong container. Trong bài này là `3000`.
- `spec.containers[].ports[].protocol`: protocol của port. Trong bài này là `TCP`.

Attribute/trạng thái thường xem bằng `kubectl`:

- `status.phase`: trạng thái Pod, ví dụ `Pending`, `Running`, `Succeeded`, `Failed`.
- `status.podIP`: IP nội bộ của Pod.
- `status.containerStatuses`: trạng thái từng container trong Pod.

## Pod Trong Namespace - `hello-namespace.yaml`

File này tạo Pod trong namespace `testing`.

Field quan trọng:

- `metadata.name`: tên Pod.
- `metadata.namespace`: namespace nơi Pod được tạo.
- `spec.containers`: danh sách container chạy trong Pod.

Lưu ý: namespace `testing` phải tồn tại trước khi apply file này. Nếu namespace chưa tồn tại, Kubernetes sẽ báo lỗi.

## ReplicationController - `hello-rc.yaml`

ReplicationController đảm bảo luôn có đúng số lượng Pod mong muốn.

Field quan trọng:

- `spec.replicas`: số Pod mong muốn. Trong bài này là `2`.
- `spec.selector.app`: ReplicationController chọn Pod có label `app=hello-kube`.
- `spec.template.metadata.labels.app`: label gắn cho Pod mới được tạo.
- `spec.template.spec.containers`: container template cho Pod mới.

Attribute/trạng thái thường xem:

- `status.replicas`: tổng số Pod controller đang thấy.
- `status.readyReplicas`: số Pod đã sẵn sàng.
- `status.availableReplicas`: số Pod đang available.

## ReplicaSet - `hello-rs.yaml`

ReplicaSet cũng đảm bảo số lượng Pod mong muốn, nhưng dùng selector theo kiểu mới hơn.

Field quan trọng:

- `apiVersion: apps/v1`: ReplicaSet nằm trong API group `apps`.
- `kind: ReplicaSet`: tạo ReplicaSet.
- `spec.replicas`: số Pod mong muốn. Trong bài này là `2`.
- `spec.selector.matchLabels.app`: ReplicaSet chọn Pod có label `app=hello-kube`.
- `spec.template.metadata.labels.app`: label của Pod do ReplicaSet tạo ra.
- `spec.template.spec.containers[].image`: image container.
- `spec.template.spec.containers[].ports[].containerPort`: port của container.

Attribute/trạng thái thường xem:

- `status.replicas`: tổng số Pod.
- `status.readyReplicas`: số Pod ready.
- `status.availableReplicas`: số Pod available.
- `status.observedGeneration`: version spec mà controller đã xử lý.

## Lệnh thường dùng

```bash
kubectl apply -f hello-kube.yaml
kubectl apply -f hello-namespace.yaml
kubectl apply -f hello-rc.yaml
kubectl apply -f hello-rs.yaml
kubectl get pods
kubectl get rs
kubectl get rc
kubectl describe pod <pod-name>
kubectl delete -f <file.yaml>
```

