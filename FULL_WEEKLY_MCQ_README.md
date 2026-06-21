# Full Weekly Multiple Choice Quiz - W8, W9, W10

README này là bộ trắc nghiệm tổng hợp toàn bộ nội dung đang có trong repo:

- W8: Terraform, Docker, Kubernetes cơ bản, Kustomize, capstone EC2 + ALB + Minikube.
- W9: GitOps, CI/CD, Argo CD, observability, Prometheus, Grafana, Loki, Tempo, SLO, canary.
- W10: RBAC, admission policy, Gatekeeper, ESO, Trivy, Cosign, Sigstore/Kyverno, runbook, chaos, tenant platform.

Gợi ý dùng:

1. Làm từng phần theo tuần.
2. Không xem đáp án trước.
3. Với câu sai, quay lại README/lab tương ứng để đọc lại flow.

---

## W8 - Terraform, Docker, Kubernetes, Kustomize

### 1. Terraform dùng `provider "aws"` để làm gì?

A. Cho Terraform biết cách kết nối và tạo resource trên AWS  
B. Chạy container trong Kubernetes  
C. Tạo Docker image local  
D. Forward port từ Service về máy local  

### 2. `data "aws_ami"` trong Terraform có vai trò chính là gì?

A. Tạo AMI mới từ EC2  
B. Tìm AMI phù hợp để dùng cho resource khác  
C. Xóa AMI cũ  
D. Upload file lên S3  

### 3. Trong Terraform, `resource "aws_instance"` đại diện cho gì?

A. Một Kubernetes Pod  
B. Một Docker image  
C. Một EC2 instance được Terraform quản lý  
D. Một GitHub workflow  

### 4. Lệnh nào khởi tạo provider/module cho Terraform project?

A. `terraform start`  
B. `terraform boot`  
C. `terraform render`  
D. `terraform init`  

### 5. `terraform plan` dùng để làm gì?

A. Xem trước thay đổi Terraform sẽ tạo/sửa/xóa  
B. Xóa toàn bộ resource ngay lập tức  
C. Tạo Kubernetes namespace  
D. Build Docker image  

### 6. Trong bài S3 static website, `aws_s3_bucket_website_configuration` dùng để làm gì?

A. Tạo EC2 public IP  
B. Bật S3 thành website hosting  
C. Tạo Docker network  
D. Tạo Kubernetes Service  

### 7. Vì sao S3 bucket name phải cẩn thận khi đặt?

A. Vì chỉ được chứa chữ hoa  
B. Vì phải giống tên EC2  
C. Vì bucket name phải unique toàn cầu  
D. Vì Terraform không hỗ trợ biến cho bucket name  

### 8. `aws_s3_bucket_public_access_block` trong lab S3 liên quan đến điều gì?

A. Chọn AMI mới nhất  
B. Tạo namespace Kubernetes  
C. Đặt replica cho Deployment  
D. Cấu hình public access của bucket  

### 9. Terraform function `fileset()` trong lab S3 dùng để làm gì?

A. Lấy danh sách file theo pattern  
B. Tạo VPC  
C. Decode Kubernetes Secret  
D. Tạo trace span  

### 10. `filemd5()` giúp Terraform phát hiện điều gì?

A. Pod đã restart  
B. File local đã thay đổi nội dung  
C. Alert đang firing  
D. Image đã được ký Cosign  

### 11. Dockerfile instruction `FROM node:20-alpine` nghĩa là gì?

A. Copy source code vào image  
B. Expose port 3000  
C. Dùng image nền Node.js Alpine  
D. Tạo Kubernetes ReplicaSet  

### 12. Dockerfile instruction `WORKDIR /app` dùng để làm gì?

A. Tạo namespace `app`  
B. Tạo S3 folder  
C. Chọn AWS region  
D. Đặt thư mục làm việc bên trong container  

### 13. Kubernetes `apiVersion` cho Pod cơ bản thường là gì?

A. `v1`  
B. `apps/v1`  
C. `batch/v1`  
D. `argoproj.io/v1alpha1`  

### 14. Kubernetes `kind: Pod` đại diện cho gì?

A. Load balancer public  
B. Đơn vị chạy một hoặc nhiều container  
C. Terraform provider  
D. Git commit  

### 15. `metadata.labels` trong Kubernetes thường dùng để làm gì?

A. Mã hóa secret  
B. Tăng CPU cho node  
C. Nhóm, lọc, selector resource  
D. Ký Docker image  

### 16. ReplicationController và ReplicaSet giống nhau ở điểm nào?

A. Đều là GitOps controller  
B. Đều scrape `/metrics`  
C. Đều dùng để ký image  
D. Đều đảm bảo số lượng Pod mong muốn  

### 17. ReplicaSet khác Pod đơn lẻ ở điểm nào?

A. ReplicaSet tạo/quản lý nhiều Pod theo selector và template  
B. ReplicaSet chỉ chạy được một container  
C. ReplicaSet là AWS resource  
D. ReplicaSet chỉ dùng cho logging  

### 18. Nếu Pod khai báo namespace chưa tồn tại, Kubernetes thường sẽ thế nào?

A. Tự tạo namespace trong mọi trường hợp  
B. Báo lỗi vì namespace chưa có  
C. Tự chuyển Pod sang namespace `default`  
D. Tạo Argo CD Application  

### 19. Service `ClusterIP` dùng để làm gì?

A. Tạo public ALB tự động trong mọi cluster  
B. Build Docker image  
C. Tạo endpoint ổn định chỉ truy cập nội bộ cluster  
D. Tạo Terraform state  

### 20. Service selector phải khớp với gì?

A. Tên Git branch  
B. AWS account ID  
C. Cosign public key  
D. Label của Pod cần nhận traffic  

### 21. Trong Kustomize, `base` nên chứa gì?

A. Phần manifest dùng chung, trung lập giữa môi trường  
B. Chỉ secret production thật  
C. File Terraform state  
D. Log của Pod  

### 22. Trong Kustomize, `overlays/dev` thường dùng để làm gì?

A. Xóa toàn bộ base  
B. Ghi đè phần khác biệt cho môi trường dev  
C. Chạy Trivy scan  
D. Tạo GitHub token  

### 23. `namePrefix: dev-` trong Kustomize làm gì?

A. Đổi Docker registry  
B. Mã hóa ConfigMap  
C. Thêm prefix `dev-` vào tên resource render ra  
D. Tạo namespace mặc định của AWS  

### 24. `patchesStrategicMerge` dùng để làm gì?

A. Push image lên registry  
B. Query Prometheus  
C. Verify Cosign signature  
D. Ghi đè một phần resource từ base  

### 25. Deployment selector phải khớp với field nào?

A. `spec.template.metadata.labels`  
B. `metadata.annotations` của namespace  
C. `data` của ConfigMap bất kỳ  
D. Tên Dockerfile  

### 26. Readiness probe trả lời câu hỏi gì?

A. Image đã được scan chưa  
B. Pod đã sẵn sàng nhận traffic chưa  
C. Git branch đã merge chưa  
D. RDS password đã rotate chưa  

### 27. Liveness probe trả lời câu hỏi gì?

A. Pod có đủ label không  
B. Secret có được ký không  
C. App/container còn sống không, có cần restart không  
D. S3 website có public không  

### 28. `resources.requests` dùng chủ yếu để làm gì?

A. Chặn Git commit  
B. Tạo ALB target group  
C. Tạo OpenTelemetry span  
D. Scheduler biết Pod cần tối thiểu bao nhiêu tài nguyên  

### 29. Trong W8 capstone, ALB route traffic đến gì?

A. EC2 instance chạy Minikube qua NodePort  
B. Trực tiếp đến S3 bucket private  
C. Trực tiếp đến GitHub Actions runner  
D. Trực tiếp đến Terraform state  

### 30. User data trong EC2 capstone có vai trò gì?

A. Lưu password production trong Git  
B. Bootstrap máy EC2, cài/chạy app/lab tự động  
C. Tạo Pull Request  
D. Query Loki  

### 31. GitOps xem đâu là source of truth?

A. Pod log  
B. Máy local của developer  
C. Git repository  
D. Grafana dashboard  

### 32. Argo CD làm gì trong GitOps?

A. Chỉ build Docker image  
B. Chỉ gửi email alert  
C. Chỉ tạo AWS account  
D. Đọc Git, so sánh với cluster, sync cluster về desired state  

### 33. GitOps với Argo CD thường là mô hình nào?

A. Pull-based  
B. Manual-only  
C. Browser-based  
D. Email-based  

### 34. CI/CD truyền thống kiểu GitHub Actions chạy `kubectl apply` trực tiếp thường là mô hình nào?

A. Pull-based  
B. Push-based  
C. No-op  
D. Trace-based  

### 35. Trong GitOps, rollback chuẩn nên làm bằng gì?

A. Sửa tay Pod trong cluster rồi quên Git  
B. Xóa namespace production  
C. `git revert` rồi để Argo CD sync  
D. Restart Grafana  

### 36. `selfHeal: true` trong Argo CD có ý nghĩa gì?

A. Tự scan CVE  
B. Tự ký image  
C. Tự tạo AWS secret  
D. Tự sửa drift khi cluster bị thay đổi lệch Git  

### 37. `prune: true` trong Argo CD có ý nghĩa gì?

A. Xóa resource trong cluster nếu Git không còn resource đó  
B. Xóa mọi Secret ngay khi sync  
C. Tăng replica lên 10  
D. Tắt admission webhook  

### 38. `destination.server: https://kubernetes.default.svc` nghĩa là gì?

A. Deploy vào mọi cluster AWS  
B. Deploy vào chính cluster nơi Argo CD đang chạy  
C. Deploy vào Docker Hub  
D. Deploy vào local filesystem  

### 39. App-of-Apps pattern trong Argo CD là gì?

A. Một Pod chứa nhiều container  
B. Một GitHub Action gọi nhiều workflow  
C. Root Application quản lý các Application con  
D. Một Service route nhiều namespace cùng lúc  

### 40. Sync wave giúp Argo CD làm gì?

A. Tăng network bandwidth  
B. Mã hóa secret  
C. Build image nhanh hơn  
D. Apply resource theo thứ tự  

### 41. Thứ tự sync hợp lý thường là gì?

A. Namespace/CRD trước, workload sau, Service/Ingress sau cùng  
B. Ingress trước, namespace sau  
C. Pod trước, CRD sau  
D. Alert trước, app sau trong mọi trường hợp  

### 42. GitHub Actions trong GitOps chuẩn nên ưu tiên làm gì?

A. Chỉnh tay production cluster mỗi giờ  
B. Validate/test/build, còn deploy để Argo CD làm  
C. Xóa Argo CD  
D. Chỉ gửi Slack message  

### 43. `kubectl apply --dry-run=client` dùng để làm gì?

A. Apply resource production  
B. Xóa resource khỏi Git  
C. Kiểm tra manifest phía client mà không apply thật  
D. Sign image trong registry  

### 44. Observability gồm ba loại telemetry chính nào?

A. AMI, EC2, S3  
B. Pod, Node, Namespace  
C. Branch, commit, tag  
D. Metrics, logs, traces  

### 45. Metrics trả lời tốt nhất câu hỏi nào?

A. Bao nhiêu request lỗi, latency bao nhiêu, hệ thống khỏe không  
B. Dòng log exact là gì  
C. Request đi qua span nào  
D. Ai approve PR  

### 46. Logs trả lời tốt nhất câu hỏi nào?

A. Error budget còn bao nhiêu phần trăm  
B. App đã ghi sự kiện/error message gì  
C. Image có signature không  
D. RoleBinding gán cho ai  

### 47. Traces trả lời tốt nhất câu hỏi nào?

A. S3 bucket có public không  
B. Terraform provider version là gì  
C. Một request đi qua đâu và chậm/lỗi ở span nào  
D. Namespace có quota không  

### 48. Prometheus lấy metrics từ app bằng cách nào trong lab?

A. Đọc stdout log bằng Promtail  
B. Đọc trực tiếp Git commit  
C. Gọi Cosign verify  
D. Scrape endpoint `/metrics`  

### 49. ServiceMonitor dùng để làm gì?

A. Nói cho Prometheus Operator biết scrape Service nào, port/path nào  
B. Tạo Kubernetes Secret  
C. Tạo AWS ALB  
D. Rotate password  

### 50. Vì sao Service port cần có `name: http` trong lab observability?

A. Kubernetes bắt buộc mọi Service phải có port tên `http`  
B. ServiceMonitor tham chiếu port theo tên `http`  
C. Loki yêu cầu port tên `http`  
D. Cosign yêu cầu port tên `http`  

### 51. Grafana trong stack observability chủ yếu là gì?

A. Nơi duy nhất lưu tất cả metrics gốc  
B. Docker registry  
C. UI để query/dashboard/alert từ data source  
D. Kubernetes scheduler  

### 52. Loki lưu loại dữ liệu nào?

A. Metrics  
B. Terraform state  
C. Kubernetes RBAC rules  
D. Logs  

### 53. Promtail làm gì?

A. Đọc pod/container logs và gửi sang Loki  
B. Scrape `/metrics`  
C. Verify image signature  
D. Tạo RDS database  

### 54. Tempo lưu loại dữ liệu nào?

A. S3 objects  
B. Traces  
C. IAM policies  
D. Argo CD apps  

### 55. OTel Collector có vai trò gì?

A. Tạo EC2 key pair  
B. Chặn Pod privileged  
C. Nhận, xử lý, chuyển tiếp telemetry  
D. Render Kustomize  

### 56. OTLP HTTP receiver thường dùng port nào trong lab?

A. 22  
B. 80  
C. 30080  
D. 4318  

### 57. SLI là gì?

A. Chỉ số đo được về chất lượng dịch vụ  
B. Cam kết pháp lý với khách hàng  
C. Công cụ lưu log  
D. Controller triển khai canary  

### 58. SLO là gì?

A. Password của Grafana  
B. Mục tiêu chất lượng dịch vụ dựa trên SLI  
C. Kubernetes namespace  
D. Docker tag  

### 59. Error budget là gì?

A. Tổng tiền AWS còn lại  
B. Tổng số Pod trong namespace  
C. Phần lỗi được phép trong một window theo SLO  
D. Số lần image được ký  

### 60. Burn rate là gì?

A. Tốc độ build Docker image  
B. Tốc độ Terraform init  
C. Tốc độ Promtail đọc YAML  
D. Tốc độ tiêu hao error budget  

### 61. Multi-window burn rate alert giúp gì?

A. Alert vừa nhanh vừa giảm nhiễu hơn single short window  
B. Tắt hoàn toàn alert  
C. Thay thế mọi dashboard  
D. Tự rollback Git commit  

### 62. Argo Rollouts dùng để làm gì?

A. Tạo AWS VPC  
B. Progressive delivery như canary/blue-green/analysis/rollback  
C. Lưu logs  
D. Mã hóa Secret  

### 63. AnalysisTemplate trong canary dùng để làm gì?

A. Tạo namespace  
B. Build frontend  
C. Query metric, quyết định rollout pass/fail  
D. Tạo S3 policy  

### 64. Khi bad canary làm error rate cao, trạng thái Rollout/Argo CD có thể là gì?

A. Terraform destroyed  
B. Secret rotated  
C. Grafana deleted  
D. Rollout aborted và app Degraded  

### 65. Vì sao có nhiều ReplicaSet khi dùng Rollout?

A. Mỗi revision/pod template có ReplicaSet riêng để giữ stable/canary/history  
B. Vì ServiceMonitor tạo ReplicaSet  
C. Vì Loki tạo ReplicaSet cho log cũ  
D. Vì Terraform tạo lại YAML  

### 66. Alertmanager làm gì?

A. Build image  
B. Nhận alert từ Prometheus và route đến email/Slack/webhook  
C. Tạo OIDC token  
D. Tạo AWS subnet  

### 67. Route `blackhole` trong Alertmanager config dùng để làm gì?

A. Xóa toàn bộ PrometheusRule  
B. Tăng CPU Grafana  
C. Nuốt/bỏ qua alert không cần gửi email  
D. Mã hóa log  

### 68. `git revert` trong rollback GitOps có ưu điểm gì?

A. Không cần commit nào  
B. Luôn nhanh hơn mọi thao tác cluster  
C. Xóa hết ReplicaSet cũ ngay lập tức  
D. Git history rõ ràng và Argo CD sync về trạng thái đúng  

### 69. Nếu repo private mà Argo CD chưa có credential, lỗi thường gặp là gì?

A. `authentication required` hoặc `Repository not found`  
B. `OOMKilled`  
C. `no signatures found`  
D. `CrashLoopBackOff` do liveness  

### 70. DNS dạng `*.svc.cluster.local` thường truy cập được từ đâu?

A. Browser máy local trực tiếp trong mọi trường hợp  
B. Bên trong Kubernetes cluster  
C. Terraform Registry  
D. GitHub UI  

### 71. Kubernetes request đi qua các lớp chính nào?

A. Docker, Trivy, Grafana, Loki  
B. S3, EC2, ALB, IAM  
C. Authentication, Authorization, Admission, etcd  
D. Git, PR, issue, release  

### 72. Authentication trả lời câu hỏi gì?

A. Bạn được làm gì?  
B. Object này có hợp lệ không?  
C. Pod có bao nhiêu log?  
D. Bạn là ai?  

### 73. Authorization/RBAC trả lời câu hỏi gì?

A. Bạn được làm action nào trên resource nào?  
B. Image có CVE không?  
C. Request latency bao nhiêu?  
D. Secret rotate chưa?  

### 74. Admission policy trả lời câu hỏi gì?

A. User có password gì?  
B. Object được gửi vào API server có được chấp nhận không?  
C. Git commit nào mới nhất?  
D. Prometheus scrape port nào?  

### 75. Role khác ClusterRole thế nào?

A. Role chỉ dùng cho AWS, ClusterRole chỉ dùng cho Docker  
B. Role là Secret, ClusterRole là ConfigMap  
C. Role namespaced, ClusterRole cluster-scoped  
D. Không có khác biệt  

### 76. RoleBinding khác ClusterRoleBinding thế nào?

A. RoleBinding dùng cho Pod, ClusterRoleBinding dùng cho Service  
B. RoleBinding là deny rule  
C. ClusterRoleBinding chỉ dùng cho Prometheus  
D. RoleBinding cấp quyền trong namespace; ClusterRoleBinding cấp cluster-wide  

### 77. Kubernetes RBAC có deny rule không?

A. Không, RBAC là cộng quyền allow  
B. Có, deny luôn ưu tiên allow  
C. Chỉ có deny cho Secret  
D. Chỉ có deny trong namespace prod  

### 78. Vì sao không nên cấp `get secrets` rộng cho developer?

A. Vì Kubernetes không có Secret resource  
B. Secret có thể chứa password/token/cloud key nhạy cảm  
C. Vì `get secrets` làm Pod chậm  
D. Vì `get secrets` bắt buộc cần ALB  

### 79. `kubectl auth can-i` dùng để làm gì?

A. Build Docker image  
B. Query PromQL  
C. Kiểm tra một subject có quyền làm hành động nào không  
D. Tạo Cosign key  

### 80. `--as=alice` trong `kubectl auth can-i` nghĩa là gì?

A. Chạy Pod bằng ServiceAccount alice  
B. Đổi image tag thành alice  
C. Tạo namespace alice  
D. Impersonate user alice để kiểm thử quyền  

### 81. Gatekeeper là gì?

A. Admission controller dựa trên OPA/Rego để enforce policy  
B. Docker registry  
C. Metrics database  
D. Terraform backend  

### 82. ConstraintTemplate làm gì?

A. Tạo Pod production  
B. Định nghĩa kind policy mới, schema và logic Rego  
C. Route alert đến email  
D. Lưu secret gốc  

### 83. Constraint làm gì?

A. Build image  
B. Tạo Git branch  
C. Dùng template để áp policy vào scope/kind/namespace cụ thể  
D. Tạo Grafana datasource  

### 84. Vì sao ConstraintTemplate phải apply trước Constraint?

A. Vì Constraint chứa Dockerfile  
B. Vì Constraint cần S3 bucket public  
C. Vì Constraint là Terraform provider  
D. Constraint kind chưa tồn tại nếu template chưa tạo CRD  

### 85. `enforcementAction: deny` nghĩa là gì?

A. Vi phạm policy thì admission reject request  
B. Chỉ ghi log, không chặn  
C. Tắt policy  
D. Chỉ gửi email  

### 86. `dryrun` trong Gatekeeper khác `deny` thế nào?

A. `dryrun` xóa Pod, `deny` tạo Pod  
B. `dryrun` không chặn, `deny` chặn request vi phạm  
C. `dryrun` chỉ dùng cho Docker  
D. Không khác nhau  

### 87. Policy cấm image `:latest` giúp giảm rủi ro gì?

A. Pod không có log  
B. Prometheus scrape chậm  
C. Deploy artifact không xác định/có thể đổi nội dung theo thời gian  
D. S3 bucket quá lớn  

### 88. Policy require resources thường yêu cầu gì?

A. Container có public IP  
B. Image phải có chữ hoa  
C. Pod phải chạy hostNetwork  
D. Container có requests/limits CPU/memory  

### 89. Policy disallow privileged chặn điều gì?

A. Container chạy privileged hoặc leo quyền nguy hiểm  
B. ServiceMonitor scrape metrics  
C. Git revert  
D. S3 website hosting  

### 90. ValidatingAdmissionPolicy native dùng ngôn ngữ gì để viết expression?

A. Rego bắt buộc  
B. CEL  
C. Python  
D. SQL  

### 91. Kubernetes Secret lưu base64 có nghĩa là gì?

A. Secret không thể đọc được nếu biết base64  
B. Secret tự động rotate  
C. Base64 chỉ là encoding, không phải encryption  
D. Secret luôn an toàn để commit Git  

### 92. AWS Secrets Manager trong W10 dùng để làm gì?

A. Lưu Pod logs  
B. Tạo ServiceMonitor  
C. Tạo ReplicaSet  
D. Giữ secret gốc bên ngoài cluster, có IAM/KMS/versioning/audit  

### 93. External Secrets Operator làm gì?

A. Đồng bộ secret từ provider ngoài như AWS Secrets Manager về Kubernetes Secret  
B. Scan CVE image  
C. Ký image  
D. Tạo ALB target group  

### 94. SecretStore trả lời câu hỏi gì?

A. Lấy field secret nào và tạo target Secret tên gì  
B. Kết nối provider nào, region nào, auth bằng gì  
C. Pod có mấy replica  
D. Alert gửi đến email nào  

### 95. ExternalSecret trả lời câu hỏi gì?

A. AWS account nào tạo VPC  
B. Deployment selector là gì  
C. Lấy secret nào, map property nào, tạo Kubernetes Secret nào, refresh bao lâu  
D. Prometheus retention bao lâu  

### 96. `refreshInterval: 30s` nghĩa là gì?

A. Pod restart mỗi 30 giây  
B. Trivy scan mỗi 30 giây  
C. Argo CD xóa app mỗi 30 giây  
D. ESO kiểm tra provider khoảng mỗi 30 giây  

### 97. Vì sao env var không phù hợp cho no-restart secret rotation?

A. Env var được set khi process start và không tự đổi khi Secret đổi  
B. Env var không tồn tại trong Kubernetes  
C. Env var chỉ dùng cho Terraform  
D. Env var làm mất metrics  

### 98. Secret volume có thể hỗ trợ rotation tốt hơn env var khi nào?

A. Khi app chỉ đọc file một lần lúc startup  
B. Khi app đọc lại file secret hoặc có cơ chế reload/watch  
C. Khi Secret được commit Git  
D. Khi Pod không mount volume  

### 99. Trivy dùng để làm gì?

A. Ký image bằng private key  
B. Route alert  
C. Scan CVE/misconfig/secret trong image/repo  
D. Tạo RoleBinding  

### 100. Cosign dùng để làm gì?

A. Scrape metrics  
B. Tạo Namespace  
C. Render Kustomize  
D. Ký và verify chữ ký image/container artifact  

### 101. Trivy khác Cosign ở điểm nào?

A. Trivy scan lỗ hổng; Cosign chứng minh nguồn gốc/chữ ký artifact  
B. Trivy tạo Service; Cosign tạo Pod  
C. Trivy chỉ dùng cho logs; Cosign chỉ dùng cho traces  
D. Không khác nhau  

### 102. Vì sao phải push image lên registry trước khi Cosign sign/admission verify?

A. Vì Docker local tự động gửi signature đến Kubernetes  
B. Signature gắn với image/digest trong registry để cluster verify được  
C. Vì Trivy không scan image local được  
D. Vì GitHub không cho build local  

### 103. Key-based signing dùng gì?

A. OIDC token duy nhất, không có key  
B. Kubernetes Secret base64 làm signature  
C. Private key để ký, public key để verify  
D. PrometheusRule làm signature  

### 104. Keyless signing dựa vào gì?

A. Private key dài hạn commit vào Git  
B. S3 bucket public  
C. Pod label `signed=true`  
D. OIDC identity/certificate ngắn hạn của CI như GitHub Actions  

### 105. Admission verify image mạnh hơn CI verify ở điểm nào?

A. Admission nằm ở API server, mọi request tạo Pod phải qua, kể cả bypass CI  
B. Admission chỉ chạy khi có Pull Request  
C. Admission chỉ đọc README  
D. Admission chỉ gửi email  

### 106. Kyverno/Policy Controller deny unsigned image thường xảy ra khi nào?

A. Pod có quá nhiều logs  
B. Image không có signature hợp lệ theo policy/attestor  
C. Service thiếu ClusterIP  
D. Terraform chưa init  

### 107. Vì sao private key Cosign không được commit?

A. Vì public key cũng không được commit  
B. Vì Git không chứa được text file  
C. Ai có private key có thể ký image giả là hợp lệ  
D. Vì Kubernetes không đọc được key  

### 108. ECR/GHCR image reference thường yêu cầu điều gì về repository name?

A. Chỉ chữ hoa  
B. Chỉ số  
C. Phải chứa khoảng trắng  
D. Lowercase  

### 109. ResourceQuota dùng để làm gì?

A. Giới hạn tổng tài nguyên/số object trong namespace  
B. Đặt default request/limit cho từng container  
C. Ký image  
D. Tạo trace  

### 110. LimitRange dùng để làm gì?

A. Giới hạn tổng số namespace của cluster  
B. Đặt default/min/max requests/limits cho container trong namespace  
C. Route traffic vào Service  
D. Chạy GitHub Action  

### 111. Pod bị ResourceQuota deny có container log không?

A. Có, luôn có log trong Loki  
B. Có, trong Terraform state  
C. Không, vì Pod chưa được tạo/chạy  
D. Có, trong Cosign output  

### 112. NetworkPolicy default deny ingress có tác dụng gì?

A. Chặn toàn bộ Git commit  
B. Tự rotate secret  
C. Tự tạo ServiceMonitor  
D. Chặn traffic vào Pod nếu không có allow rule phù hợp  

### 113. NetworkPolicy ingress có chặn Pod gọi ra ngoài không?

A. Không, muốn chặn gọi ra cần egress policy  
B. Có, luôn chặn mọi egress  
C. Chỉ chặn DNS  
D. Chỉ chặn Prometheus  

### 114. Vì sao thường cần allow DNS egress trong NetworkPolicy?

A. DNS dùng để ký image  
B. Pod cần resolve service/domain name  
C. DNS dùng để chạy Terraform fmt  
D. DNS thay thế Prometheus  

### 115. Tenant `payments` kế thừa guardrail cũ bằng cách nào?

A. Copy toàn bộ policy vào từng Pod  
B. Tắt Gatekeeper cho namespace mới  
C. Constraint match namespace `payments`, nên workload mới tự bị kiểm tra  
D. Dùng ClusterRoleBinding admin cho mọi user  

### 116. Vì sao dùng RoleBinding cho `payments-dev` thay vì ClusterRoleBinding?

A. Để user có quyền toàn cluster  
B. Để bỏ qua admission  
C. Để đọc mọi Secret  
D. Giữ quyền giới hạn trong namespace payments  

### 117. Runbook dùng để làm gì?

A. Hướng dẫn xử lý sự cố theo symptom, check, cause, recovery  
B. Build image production  
C. Lưu password thật  
D. Thay thế monitoring  

### 118. Chaos test pod delete chứng minh điều gì?

A. Image có chữ ký không  
B. Workload/controller có tự phục hồi khi Pod bị xóa không  
C. Secret có base64 không  
D. Bucket có public không  

### 119. Cost Anomaly Detection liên quan đến mục tiêu nào?

A. Tăng replica Kubernetes  
B. Ký image bằng keyless  
C. Phát hiện chi phí AWS bất thường  
D. Query trace Tempo  

### 120. Khi Argo CD OutOfSync hoặc ComparisonError, nên debug từ đâu trước?

A. Xóa toàn bộ repo local  
B. Đổi mọi policy sang deny  
C. Commit private key Cosign  
D. Cluster/API server/webhook health, app conditions, repo path, targetRevision, diff  

---

## Đáp Án

| Câu | Đáp án | Câu | Đáp án | Câu | Đáp án | Câu | Đáp án |
|---:|:---:|---:|:---:|---:|:---:|---:|:---:|
| 1 | A | 2 | B | 3 | C | 4 | D |
| 5 | A | 6 | B | 7 | C | 8 | D |
| 9 | A | 10 | B | 11 | C | 12 | D |
| 13 | A | 14 | B | 15 | C | 16 | D |
| 17 | A | 18 | B | 19 | C | 20 | D |
| 21 | A | 22 | B | 23 | C | 24 | D |
| 25 | A | 26 | B | 27 | C | 28 | D |
| 29 | A | 30 | B | 31 | C | 32 | D |
| 33 | A | 34 | B | 35 | C | 36 | D |
| 37 | A | 38 | B | 39 | C | 40 | D |
| 41 | A | 42 | B | 43 | C | 44 | D |
| 45 | A | 46 | B | 47 | C | 48 | D |
| 49 | A | 50 | B | 51 | C | 52 | D |
| 53 | A | 54 | B | 55 | C | 56 | D |
| 57 | A | 58 | B | 59 | C | 60 | D |
| 61 | A | 62 | B | 63 | C | 64 | D |
| 65 | A | 66 | B | 67 | C | 68 | D |
| 69 | A | 70 | B | 71 | C | 72 | D |
| 73 | A | 74 | B | 75 | C | 76 | D |
| 77 | A | 78 | B | 79 | C | 80 | D |
| 81 | A | 82 | B | 83 | C | 84 | D |
| 85 | A | 86 | B | 87 | C | 88 | D |
| 89 | A | 90 | B | 91 | C | 92 | D |
| 93 | A | 94 | B | 95 | C | 96 | D |
| 97 | A | 98 | B | 99 | C | 100 | D |
| 101 | A | 102 | B | 103 | C | 104 | D |
| 105 | A | 106 | B | 107 | C | 108 | D |
| 109 | A | 110 | B | 111 | C | 112 | D |
| 113 | A | 114 | B | 115 | C | 116 | D |
| 117 | A | 118 | B | 119 | C | 120 | D |

---

## Checklist Ôn Nhanh Theo Tuần

### W8

- Terraform: provider, data source, resource, variable, output, functions, state.
- AWS: EC2, S3 static website, ALB, target group, security group, user data.
- Docker: Dockerfile, base image, WORKDIR, COPY, ENTRYPOINT.
- Kubernetes: Pod, Namespace, ReplicationController, ReplicaSet, Deployment, Service, ConfigMap, probes, requests/limits.
- Kustomize: base, overlay, patch, namePrefix, namespace, commonLabels.

### W9

- GitOps: Git là source of truth, Argo CD pull-based sync, self-heal, prune, app-of-apps.
- CI/CD: GitHub Actions validate/test/build; Argo CD deploy.
- Observability: metrics/logs/traces; Prometheus/Grafana/Loki/Tempo/OTel Collector.
- Reliability: SLI, SLO, SLA, error budget, burn rate, multi-window alert.
- Progressive delivery: Argo Rollouts, canary, AnalysisTemplate, auto-abort, rollback bằng Git.

### W10

- Security control plane: authentication, authorization/RBAC, admission, etcd.
- RBAC: Role, ClusterRole, RoleBinding, ClusterRoleBinding, ServiceAccount, impersonation.
- Admission: Gatekeeper, ConstraintTemplate, Constraint, Rego, ValidatingAdmissionPolicy/CEL.
- Secrets: AWS Secrets Manager, ESO, SecretStore, ExternalSecret, refreshInterval, env var vs volume.
- Supply chain: Trivy, CVE exception, Cosign key-based/keyless, Kyverno/Sigstore admission verify.
- Platform: ResourceQuota, LimitRange, NetworkPolicy, tenant onboarding, runbook, chaos, cost anomaly.

