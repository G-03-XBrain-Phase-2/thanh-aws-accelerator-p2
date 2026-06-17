# Quota Exhaustion Test

## Mục Tiêu

Kiểm tra `ResourceQuota` trong namespace `platform-prod` có chặn workload mới khi tổng tài nguyên vượt giới hạn hay không.

Bài test này mô phỏng tình huống một workload xin thêm CPU làm namespace vượt quota.

## Bối Cảnh

Namespace đang được bảo vệ bằng:

```text
Namespace: platform-prod
ResourceQuota: platform-prod-quota
LimitRange: platform-prod-limitrange
```

`ResourceQuota` đặt giới hạn tổng tài nguyên cho namespace:

```text
requests.cpu: 2
requests.memory: 4Gi
limits.cpu: 4
limits.memory: 8Gi
pods: 10
```

Hiện namespace đã có workload đang dùng một phần quota. Khi tạo thêm Pod `quota-exhaust-by-cpu`, tổng `requests.cpu` sẽ vượt giới hạn `2 CPU`.

## Giả Thuyết

Nếu một Pod mới làm tổng `requests.cpu` của namespace vượt `ResourceQuota`, Kubernetes sẽ từ chối request ở admission phase.

Pod sẽ không được tạo.

## Phạm Vi Test

Test chỉ chạy trong namespace:

```text
platform-prod
```

Các resource liên quan:

```text
cloud/w10/day-c/platform-bootstrap/quotas/platform-prod-quota.yaml
cloud/w10/day-c/platform-bootstrap/limits/platform-prod-limitrange.yaml
cloud/w10/day-c/platform-bootstrap/workloads/quota-exhaust-by-cpu.yaml
```

Không test trên namespace khác.

Không thay đổi quota thật trong lúc test.

## Điều Kiện Trước Khi Test

Kiểm tra namespace tồn tại:

```bash
kubectl get namespace platform-prod
```

Kiểm tra ResourceQuota:

```bash
kubectl describe resourcequota platform-prod-quota -n platform-prod
```

Kiểm tra Pod hiện có:

```bash
kubectl get pods -n platform-prod
```

## Cách Chạy Test

Chạy server-side dry run:

```bash
kubectl apply --dry-run=server -f cloud/w10/day-c/platform-bootstrap/workloads/quota-exhaust-by-cpu.yaml
```

Dùng `--dry-run=server` để Kubernetes kiểm tra thật qua API Server và admission, nhưng không tạo Pod thật.

## Kết Quả Mong Đợi

Request bị từ chối vì vượt `ResourceQuota`.

Thông báo lỗi nên có nội dung tương tự:

```text
exceeded quota: platform-prod-quota
```

Pod `quota-exhaust-by-cpu` không được tạo.

Kiểm tra:

```bash
kubectl get pod quota-exhaust-by-cpu -n platform-prod
```

Kỳ vọng:

```text
Error from server (NotFound): pods "quota-exhaust-by-cpu" not found
```

## Kết Quả Thực Tế

Điền output thực tế sau khi chạy test:

```text
Error from server (Forbidden): error when creating "cloud/w10/day-c/platform-bootstrap/workloads/quota-exhaust-by-cpu.yaml": pods "quota-exhaust-by-cpu" is forbidden: exceeded quota: platform-prod-quota, requested: requests.cpu=2, used: requests.cpu=1100m, limited: requests.cpu=2
```

## Giải Thích

`quota-exhaust-by-cpu.yaml` có hai container.

Mỗi container xin:

```text
requests.cpu: 1
```

Tổng Pod xin:

```text
1 CPU + 1 CPU = 2 CPU
```

Nếu namespace đã dùng sẵn CPU request, việc thêm Pod này sẽ làm tổng usage vượt quota:

```text
used requests.cpu + requested requests.cpu > hard requests.cpu
```

Kubernetes sẽ deny trước khi Pod được lưu vào etcd.

## Rollback

Vì test dùng `--dry-run=server`, thường không có resource nào được tạo nên không cần rollback.

Nếu lỡ chạy apply thật, xóa Pod test:

```bash
kubectl delete pod quota-exhaust-by-cpu -n platform-prod --ignore-not-found
```

Nếu cần dọn workload nền:

```bash
kubectl delete pod quota-heavy-pod -n platform-prod --ignore-not-found
```

## Tiêu Chí Pass

Test được xem là pass nếu:

- Kubernetes deny Pod vượt quota.
- Lỗi có nhắc đến `platform-prod-quota`.
- Pod `quota-exhaust-by-cpu` không được tạo.
- Các Pod đang chạy trong namespace không bị ảnh hưởng.
- ResourceQuota usage không vượt hard limit.

## Ý Nghĩa Vận Hành

Test này chứng minh platform có guardrail tài nguyên.

Nếu một workload lỗi hoặc một team deploy nhầm cấu hình xin quá nhiều CPU, namespace sẽ bị chặn trước khi ảnh hưởng đến phần còn lại của cluster.
