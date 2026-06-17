# Pod Delete Chaos Test

## Mục Tiêu

Kiểm tra workload chạy bằng `Deployment` có tự hồi phục khi một Pod bị xóa hay không.

Bài test này mô phỏng tình huống một Pod bị mất đột ngột do lỗi node, lỗi runtime, thao tác nhầm, hoặc sự cố hạ tầng.

## Bối Cảnh

Workload dùng trong bài test:

```text
Deployment: resilient-app
Namespace: platform-prod
Replicas: 2
```

File manifest:

```text
cloud/w10/day-c/platform-bootstrap/workloads/resilient-deployment.yaml
```

Vì workload được quản lý bởi `Deployment`, Kubernetes sẽ luôn cố giữ số Pod thực tế bằng số `replicas` mong muốn.

## Giả Thuyết

Nếu xóa một Pod thuộc Deployment `resilient-app`, ReplicaSet controller sẽ tạo một Pod mới để đưa số lượng replica quay lại `2`.

Ứng dụng có thể bị mất một Pod tạm thời, nhưng workload tổng thể vẫn còn ít nhất một Pod khác chạy.

## Phạm Vi Test

Test chỉ chạy trong namespace:

```text
platform-prod
```

Không xóa namespace.

Không xóa Deployment.

Chỉ xóa một Pod thuộc Deployment `resilient-app`.

## Điều Kiện Trước Khi Test

Kiểm tra Deployment tồn tại:

```bash
kubectl get deploy resilient-app -n platform-prod
```

Kiểm tra số Pod hiện tại:

```bash
kubectl get pods -n platform-prod -l app=resilient-app
```

Kỳ vọng có 2 Pod đang chạy hoặc đang được tạo:

```text
READY   1/1
STATUS  Running
```

## Cách Chạy Test

Lấy danh sách Pod:

```bash
kubectl get pods -n platform-prod -l app=resilient-app
```

Chọn một Pod trong danh sách rồi xóa:

```bash
kubectl delete pod <POD_NAME> -n platform-prod
```

Ví dụ:

```bash
kubectl delete pod resilient-app-xxxxx-yyyyy -n platform-prod
```

Quan sát quá trình tự hồi phục:

```bash
kubectl get pods -n platform-prod -l app=resilient-app -w
```

## Kết Quả Mong Đợi

Pod bị xóa chuyển sang trạng thái:

```text
Terminating
```

Sau đó Kubernetes tạo Pod mới.

Cuối cùng Deployment quay lại trạng thái có 2 Pod sẵn sàng:

```bash
kubectl get deploy resilient-app -n platform-prod
```

Kỳ vọng:

```text
READY   2/2
```

## Kết Quả Thực Tế

Điền output thực tế sau khi chạy test:

```text
PASTE_OUTPUT_HERE
```

## Giải Thích

Pod đơn lẻ không tự hồi phục nếu bị xóa.

Deployment thì khác. Deployment tạo ReplicaSet, ReplicaSet quản lý số lượng Pod.

Luồng tự hồi phục:

```text
Pod bị xóa
  |
  v
ReplicaSet thấy số Pod thực tế < replicas mong muốn
  |
  v
ReplicaSet tạo Pod mới
  |
  v
Deployment quay lại trạng thái desired state
```

Đây là nguyên lý quan trọng của Kubernetes:

```text
Controller liên tục kéo trạng thái thực tế về trạng thái mong muốn.
```

## Rollback

Nếu chỉ xóa một Pod thì thường không cần rollback, vì Deployment tự tạo lại Pod.

Nếu muốn dọn toàn bộ workload test:

```bash
kubectl delete deploy resilient-app -n platform-prod --ignore-not-found
```

## Tiêu Chí Pass

Test được xem là pass nếu:

- Xóa một Pod không làm Deployment biến mất.
- Kubernetes tạo Pod mới thay thế.
- Deployment quay lại `READY 2/2`.
- Namespace không vượt ResourceQuota.
- Không cần thao tác thủ công để tạo lại Pod.

## Ý Nghĩa Vận Hành

Test này chứng minh workload được chạy bằng controller có khả năng tự hồi phục cơ bản.

Trong production, không nên chạy ứng dụng quan trọng bằng Pod đơn lẻ. Nên dùng `Deployment`, `StatefulSet`, hoặc controller phù hợp để Kubernetes có thể tự phục hồi khi Pod bị mất.
