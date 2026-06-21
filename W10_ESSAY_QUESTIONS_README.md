# W10 Essay Questions - Secure & Operate

README này là bộ câu hỏi tự luận cho toàn bộ phạm vi W10 trong repo. Câu hỏi dùng tiếng Việt, nhưng giữ nguyên các keyword quan trọng bằng tiếng Anh để bạn luyện đúng thuật ngữ khi đi test/phỏng vấn.

Phạm vi bao phủ:

- Kubernetes request flow: Authentication, Authorization/RBAC, Admission, etcd.
- RBAC: Role, ClusterRole, RoleBinding, ClusterRoleBinding, ServiceAccount, impersonation, sensitive permissions.
- Admission: Gatekeeper, OPA, Rego, ConstraintTemplate, Constraint, ValidatingAdmissionPolicy, CEL.
- Security guardrails: required labels, required resources, disallow privileged, allowed registries, disallow latest tag, non-root, hostNetwork, replica limits.
- Secrets: Kubernetes Secret, AWS Secrets Manager, External Secrets Operator, SecretStore, ExternalSecret, static credential, IRSA/EKS Pod Identity, rotation.
- Supply chain: Trivy, CVE exception, Cosign, key-based signing, keyless signing, Kyverno verifyImages, Sigstore Policy Controller, ClusterImagePolicy.
- GitOps/platform: Argo CD app-of-apps, sync wave, CRD ordering, Argo Rollouts, Prometheus, ServiceMonitor, PrometheusRule, Alertmanager.
- Multi-tenancy: namespace, ResourceQuota, LimitRange, NetworkPolicy, tenant onboarding.
- Operations: runbook, incident response, chaos test, cost anomaly, debugging webhooks/controllers.

Gợi ý cách học:

1. Với mỗi câu, trả lời theo flow: khái niệm -> vì sao cần -> manifest/resource liên quan -> lỗi thường gặp -> cách verify.
2. Với câu deep, cố gắng đưa ví dụ production, trade-off, failure mode.
3. Nếu trả lời được bằng một câu quá ngắn, thường là chưa đủ sâu.

---

## A. Must Know - Kubernetes Security Request Flow

### 1. Hãy giải thích flow `Authentication -> Authorization -> Admission -> etcd` khi một request tạo `Pod` đi vào Kubernetes API Server.

### 2. `Authentication` khác `Authorization` như thế nào? Cho ví dụ với user `alice` và action `create deployment`.

### 3. `RBAC` và `Admission Policy` kiểm soát hai lớp rủi ro khác nhau như thế nào?

### 4. Vì sao một user đã được `RBAC allow create pod` vẫn có thể bị `Gatekeeper deny`?

### 5. Hãy giải thích vì sao `Admission` là lớp bảo vệ quan trọng ngay cả khi CI/CD đã validate manifest.

### 6. `etcd` nằm ở đâu trong request flow và vì sao object chỉ được lưu sau khi qua các bước trước đó?

### 7. Trong production, nếu một `ValidatingWebhookConfiguration` bị timeout, request flow sẽ bị ảnh hưởng như thế nào?

### 8. `failurePolicy: Fail` và `failurePolicy: Ignore` khác nhau thế nào trong Admission webhook?

### 9. Khi cluster bị kẹt vì webhook timeout, bạn sẽ debug theo thứ tự nào?

### 10. Vì sao không nên xem mọi lỗi `Forbidden` là lỗi RBAC? Khi nào `Forbidden` có thể đến từ Admission?

---

## B. RBAC, Identity, Least Privilege

### 11. Hãy phân biệt `Role` và `ClusterRole` về scope, use case, và rủi ro khi dùng sai.

### 12. Hãy phân biệt `RoleBinding` và `ClusterRoleBinding`. Khi nào dùng `RoleBinding` để bind một `ClusterRole`?

### 13. Vì sao Kubernetes `RBAC` là cơ chế cộng quyền, không có deny rule?

### 14. Hãy giải thích cấu trúc `Subject -> RoleBinding/ClusterRoleBinding -> Role/ClusterRole -> rules`.

### 15. Trong `rules`, `apiGroups: [""]` nghĩa là gì? Khác gì với `apiGroups: ["apps"]`?

### 16. `resources` và `verbs` trong RBAC rule đại diện cho điều gì? Cho ví dụ với `pods`, `deployments`, `get`, `list`, `create`, `delete`.

### 17. Vì sao quyền `get secrets` là quyền nhạy cảm? Mô tả một kịch bản attacker lợi dụng quyền này.

### 18. Vì sao quyền `create pods` cũng có thể nguy hiểm trong một số namespace?

### 19. Hãy giải thích các quyền nhạy cảm `bind`, `escalate`, `impersonate` và rủi ro privilege escalation.

### 20. `kubectl auth can-i` dùng để test RBAC như thế nào? Nêu ví dụ dùng `--as`.

### 21. `--as=alice` khác gì với `serviceAccountName: alice` trong Pod spec?

### 22. `ServiceAccount` là gì? Khi workload trong Pod gọi Kubernetes API thì identity đầy đủ thường có dạng nào?

### 23. `automountServiceAccountToken: false` giúp giảm rủi ro gì?

### 24. Thiết kế RBAC cho role `developer`, `viewer`, `sre` trong một namespace production như thế nào để giữ `least privilege`?

### 25. Vì sao tenant `payments` nên dùng `RoleBinding` thay vì `ClusterRoleBinding`?

### 26. Nếu developer nói “em cần quyền admin để debug nhanh”, bạn sẽ hỏi/kiểm tra gì trước khi cấp quyền?

### 27. Hãy mô tả cách audit RBAC để tìm user/service account có quyền quá rộng.

### 28. Trong EKS, Kubernetes `ServiceAccount` liên quan gì đến AWS `IAM Role` khi dùng `IRSA` hoặc `EKS Pod Identity`?

### 29. Vì sao production không nên dùng static AWS access key trong Pod nếu có thể dùng `IRSA`?

### 30. Hãy thiết kế một RBAC policy cho `payments-dev` chỉ cho phép deploy workload trong namespace `payments`, không đọc Secret.

---

## C. Gatekeeper, OPA, Rego, Admission Policy

### 31. `Gatekeeper`, `OPA`, và `Rego` khác nhau như thế nào?

### 32. Hãy giải thích vai trò của `ConstraintTemplate` trong Gatekeeper.

### 33. Hãy giải thích vai trò của `Constraint` trong Gatekeeper.

### 34. Vì sao phải apply `ConstraintTemplate` trước `Constraint`?

### 35. Trong `ConstraintTemplate`, `spec.crd.spec.names.kind` có ý nghĩa gì?

### 36. `validation.openAPIV3Schema` trong `ConstraintTemplate` giúp ích gì?

### 37. Rego `input.review.object` chứa gì? Rego `input.parameters` chứa gì?

### 38. Hãy giải thích logic policy `required labels`: làm sao Rego biết object thiếu label nào?

### 39. Hãy giải thích logic policy `required resources`: làm sao kiểm tra container thiếu `requests` hoặc `limits`?

### 40. Hãy giải thích policy `disallow privileged`: cần kiểm tra `containers` và `initContainers` như thế nào?

### 41. Hãy giải thích policy `allowed registries`: policy này giảm rủi ro gì và có hạn chế gì?

### 42. Vì sao policy cấm `image: latest` là guardrail quan trọng trong production?

### 43. Vì sao policy `runAsNonRoot` và `runAsUser` giúp giảm rủi ro container escape/privilege escalation?

### 44. Vì sao policy `disallow hostNetwork` cần thiết? Khi nào có thể phải exception?

### 45. `enforcementAction: dryrun`, `warn`, `deny` khác nhau thế nào? Nên rollout policy theo thứ tự nào trong production?

### 46. Vì sao không nên apply policy `require limits` toàn cluster ngay từ đầu?

### 47. Hãy giải thích strategy scope policy theo `namespace` và `label selector`.

### 48. Khi Gatekeeper báo `no matches for kind K8sRequiredLabels`, nguyên nhân thường là gì?

### 49. Khi manifest bị Gatekeeper deny, bạn sẽ lấy thông tin lỗi từ đâu?

### 50. Hãy thiết kế một quy trình production để đưa policy mới từ audit mode sang enforce mode.

---

## D. Native ValidatingAdmissionPolicy và CEL

### 51. `ValidatingAdmissionPolicy` là gì và khác gì với Gatekeeper?

### 52. `CEL expression` trong `ValidatingAdmissionPolicy` dùng để làm gì?

### 53. `ValidatingAdmissionPolicyBinding` có vai trò gì?

### 54. `failurePolicy: Fail` trong native policy có ý nghĩa gì?

### 55. Khi nào nên dùng `ValidatingAdmissionPolicy`, khi nào nên dùng Gatekeeper hoặc Kyverno?

### 56. Hãy phân tích ưu/nhược điểm của native policy: ít dependency hơn nhưng policy language/hệ sinh thái khác thế nào?

### 57. Nếu muốn enforce `Deployment replicas >= 2` cho namespace `prod`, bạn sẽ thiết kế `ValidatingAdmissionPolicy` và binding như thế nào?

### 58. Vì sao policy native có thể phù hợp cho rule đơn giản, còn Gatekeeper phù hợp hơn cho rule phức tạp/reusable?

---

## E. Kubernetes Secret, AWS Secrets Manager, ESO

### 59. Vì sao Kubernetes Secret base64 không được xem là encryption?

### 60. Một Kubernetes Secret an toàn cần những lớp bảo vệ nào ngoài base64?

### 61. `AWS Secrets Manager` giải quyết vấn đề gì so với commit secret vào Git?

### 62. `External Secrets Operator` làm gì trong flow `AWS Secrets Manager -> Kubernetes Secret -> Pod`?

### 63. Phân biệt `SecretStore` và `ExternalSecret`.

### 64. `refreshInterval: 30s` trong `ExternalSecret` có ý nghĩa gì?

### 65. `target.creationPolicy: Owner` trong `ExternalSecret` có ý nghĩa gì?

### 66. `remoteRef.key` và `remoteRef.property` dùng để map secret AWS JSON vào Kubernetes Secret như thế nào?

### 67. Vì sao local lab dùng static AWS credential, nhưng production EKS nên dùng `IRSA` hoặc `EKS Pod Identity`?

### 68. Hãy giải thích flow `ESO Pod -> ServiceAccount -> IAM Role -> STS temporary credentials -> AWS Secrets Manager`.

### 69. Nếu `ExternalSecret` không tạo được Kubernetes Secret, bạn sẽ debug theo thứ tự nào?

### 70. Nếu `SecretStore` status không Ready, các nguyên nhân thường gặp là gì?

### 71. Vì sao secret qua environment variable không phù hợp với yêu cầu no-restart rotation?

### 72. Secret volume có tự cập nhật không? App cần làm gì để thấy secret mới?

### 73. Trong lab `secret-reader.sh`, vì sao script đọc file secret trong vòng lặp thay vì đọc một lần lúc startup?

### 74. Khi rotate AWS secret từ `pass-v1` sang `pass-v2`, bạn kiểm chứng end-to-end như thế nào?

### 75. Nếu Kubernetes Secret đã đổi nhưng Pod vẫn dùng password cũ, bạn sẽ nghi ngờ những nguyên nhân nào?

### 76. Hãy thiết kế secret rotation flow cho một backend kết nối RDS mà không restart Pod. Những phần nào khó?

### 77. Nêu khác biệt giữa `SecretStore` namespaced và `ClusterSecretStore`. Khi nào dùng mỗi loại?

### 78. Vì sao không nên để developer rộng quyền `get`, `list`, `watch` Secret trong namespace team?

---

## F. Supply Chain Security: Trivy, CVE Exception, Cosign, Kyverno, Sigstore

### 79. `Trivy` scan được những loại rủi ro nào? Nó không chứng minh được điều gì?

### 80. Vì sao CI nên fail khi image có `HIGH` hoặc `CRITICAL` CVE?

### 81. `--ignore-unfixed` trong Trivy có trade-off gì?

### 82. Một `CVE exception` tốt cần có những field nào? Vì sao cần `expiry date`?

### 83. Phân biệt `Trivy scan` và `Cosign sign/verify`.

### 84. Vì sao phải `docker push` image lên registry trước khi `cosign sign`?

### 85. Cosign ký `tag` hay `digest`? Vì sao chuyện `dev` và `unsigned` cùng digest có thể làm test unsigned sai?

### 86. `key-based signing` hoạt động như thế nào? Private key và public key dùng ở đâu?

### 87. Vì sao không được commit `cosign.key` vào Git?

### 88. `keyless signing` với GitHub Actions OIDC hoạt động như thế nào?

### 89. Trong keyless signing, `issuer` và `subject` đại diện cho điều gì?

### 90. Vì sao GitHub Actions workflow cần permission `id-token: write` khi dùng keyless signing?

### 91. Vì sao image reference cho GHCR/ECR nên dùng lowercase?

### 92. `Kyverno verifyImages` policy làm gì ở Admission phase?

### 93. `mutateDigest: true`, `verifyDigest: true`, `required: true` trong Kyverno verifyImages có ý nghĩa gì?

### 94. Vì sao private ECR cần `imageRegistryCredentials` cho Kyverno hoặc policy controller?

### 95. Nếu Kyverno báo `no signatures found`, bạn debug theo thứ tự nào?

### 96. Nếu Kyverno báo `context canceled` khi gọi ECR, bạn nghĩ tới những nguyên nhân nào?

### 97. `Sigstore Policy Controller` và `ClusterImagePolicy` khác gì với Kyverno verifyImages?

### 98. Vì sao Admission verify image mạnh hơn chỉ verify trong CI?

### 99. Hãy mô tả flow supply chain end-to-end: source -> build -> Trivy -> push -> Cosign -> Admission verify -> deploy.

### 100. Nếu cần cho phép exception tạm thời cho một CVE production, bạn sẽ thiết kế quy trình approval như thế nào?

---

## G. GitOps Platform Integration với Argo CD

### 101. `App-of-Apps` pattern trong Argo CD giúp gì cho platform W10?

### 102. Root app `argocd/root.yaml` quản lý child apps như thế nào?

### 103. `repoURL`, `path`, `targetRevision`, `destination.server`, `destination.namespace` trong Argo CD Application có ý nghĩa gì?

### 104. `syncPolicy.automated.prune` và `syncPolicy.automated.selfHeal` có ý nghĩa gì?

### 105. Vì sao `sync-wave` quan trọng khi deploy CRD/controller như ESO, Gatekeeper, Argo Rollouts, Policy Controller?

### 106. Hãy giải thích thứ tự sync hợp lý cho `Namespace`, `Gatekeeper templates`, `Gatekeeper constraints`, `ESO`, `ExternalSecret`, workload app.

### 107. Vì sao sửa manifest local chưa đủ nếu Argo CD đang đọc từ GitHub branch `main`?

### 108. Khi Argo CD app `OutOfSync`, bạn sẽ xem những gì trước?

### 109. Khi Argo CD app `ComparisonError` hoặc `failed to load openapi schema`, bạn phân biệt lỗi YAML với lỗi cluster/API server như thế nào?

### 110. Vì sao `no matches for kind SecretStore` thường là lỗi thứ tự CRD/controller?

### 111. Vì sao `no matches for kind ClusterImagePolicy` thường liên quan tới policy-controller CRD chưa sẵn sàng?

### 112. Khi Helm release name lệch làm Argo CD OutOfSync, bạn sẽ nhận diện và fix như thế nào?

### 113. Vì sao GitOps rollback nên dùng `git revert` thay vì patch live object?

### 114. Khi cần emergency hotfix live object, làm sao đảm bảo Git không kéo cluster về trạng thái lỗi cũ?

---

## H. Progressive Delivery, Monitoring, Alerting

### 115. `Argo Rollouts` khác `Deployment` thông thường ở điểm nào?

### 116. `Canary strategy` trong W10 rollout hoạt động ra sao với các step `setWeight`, `pause`, `analysis`?

### 117. `AnalysisTemplate` dùng Prometheus metric để quyết định pass/fail như thế nào?

### 118. Khi canary error rate cao, Argo Rollouts tự abort/rollback theo cơ chế nào?

### 119. `ServiceMonitor` giúp Prometheus scrape app như thế nào?

### 120. Vì sao Service port cần đặt name đúng như `http` để ServiceMonitor match?

### 121. `PrometheusRule` định nghĩa alert như thế nào?

### 122. Alert success rate < 95% khác gì alert error rate > 5% về cách diễn đạt nhưng tương đương logic ra sao?

### 123. `Alertmanager` route alert qua email cần những thành phần gì?

### 124. Vì sao không nên commit Gmail app password hoặc SMTP password vào Git?

### 125. Nếu Prometheus không thấy target app, bạn debug `Service`, `ServiceMonitor`, label selector, port name như thế nào?

### 126. Nếu AnalysisRun fail do query Prometheus trả rỗng hoặc service DNS không tồn tại, bạn sẽ xử lý ra sao?

### 127. Hãy giải thích vì sao monitoring stack có thể bị Gatekeeper chặn nếu policy scope quá rộng.

---

## I. Multi-Tenancy: Namespace, Quota, LimitRange, NetworkPolicy

### 128. Vì sao onboarding tenant mới nên bắt đầu bằng `Namespace` riêng?

### 129. `ResourceQuota` và `LimitRange` khác nhau như thế nào?

### 130. Khi Pod bị `ResourceQuota` deny, vì sao không có container log?

### 131. Vì sao `LimitRange` có thể default resource cho Pod thiếu requests/limits nhưng vẫn cần policy guardrail?

### 132. `NetworkPolicy default deny` bảo vệ tenant như thế nào?

### 133. `ingress policy` khác `egress policy` như thế nào?

### 134. Vì sao cần allow DNS egress trong namespace có default deny egress?

### 135. Hãy phân tích NetworkPolicy cho tenant `payments`: cho phép gì, chặn gì, và còn thiếu gì nếu đưa production.

### 136. Vì sao existing Gatekeeper guardrails có thể tự áp dụng cho tenant `payments` mà không cần viết policy mới?

### 137. Hãy thiết kế onboarding checklist cho một tenant mới: namespace, RBAC, quota, limitrange, networkpolicy, image policy, monitoring.

### 138. Nếu tenant cần exception chạy nhiều replica hơn policy `limit-replicas`, quy trình exception nên thế nào?

### 139. Làm sao kiểm chứng `payments` app pass guardrails còn manifest xấu bị deny?

### 140. So sánh cách cô lập tenant bằng namespace/RBAC/NetworkPolicy với cô lập bằng cluster riêng.

---

## J. Lab Practice 6 Risks và Hardening

### 141. Rủi ro `RBAC overprivileged` thường xuất hiện như thế nào và fix bằng nguyên tắc gì?

### 142. Rủi ro `privileged pod` nguy hiểm ở điểm nào?

### 143. Rủi ro `unsigned image` liên quan tới supply chain attack như thế nào?

### 144. Rủi ro `missing resources` ảnh hưởng tới scheduling, noisy neighbor, quota ra sao?

### 145. Rủi ro `secret exposure` thường đến từ đâu? Git, env var, log, RBAC, mounted volume?

### 146. Rủi ro `unrestricted registry` có thể dẫn tới image provenance problem như thế nào?

### 147. Hãy mô tả cách bạn cleanup một cluster có cả 6 risk trên mà không làm gián đoạn workload hợp lệ.

### 148. Vì sao fix security không chỉ là sửa YAML, mà còn cần evidence chứng minh policy đã chặn vi phạm?

### 149. Nếu một bad pod bị deny, bạn cần lưu evidence nào để chứng minh guardrail hoạt động?

### 150. Hãy giải thích cách mapping 6 risks trong lab sang production EKS security baseline.

---

## K. Runbook, Incident Response, Chaos, Cost

### 151. Một runbook tốt nên có những phần nào: Symptom, Checks, Likely Causes, Recovery?

### 152. Runbook `Pod CrashLoopBackOff`: bạn sẽ kiểm tra những gì trước tiên?

### 153. Khi Pod CrashLoop vì missing env/secret, cách phân biệt với lỗi image pull hoặc OOMKilled là gì?

### 154. Runbook `Secret Rotation Failure`: các điểm cần check trong AWS Secrets Manager, ESO, Kubernetes Secret, Pod volume là gì?

### 155. Runbook `Image Signature Denied`: cần check image reference, digest, signature, public key, policy, registry credential như thế nào?

### 156. `CVE Exception ADR` nên ghi Context, Decision, Exception Record, Remediation Plan như thế nào?

### 157. `Pod Delete Chaos Test` chứng minh điều gì về Deployment/Rollout/self-healing?

### 158. `Quota Exhaustion Test` chứng minh điều gì về ResourceQuota và platform guardrail?

### 159. Khi chạy chaos test, vì sao cần giả thuyết, phạm vi, điều kiện trước test, expected result, rollback?

### 160. AWS `Cost Anomaly Detection` giải quyết vấn đề vận hành nào trong platform?

### 161. Nếu nhận alert cost anomaly, bạn sẽ triage theo service, tag, account, region như thế nào?

### 162. Hãy liên hệ incident response AWS với Kubernetes compromise: 5 phút đầu tiên bạn làm gì?

### 163. Khi nghi ngờ một Pod bị compromise, bạn sẽ cách ly Pod, namespace, node hay VPC security group theo tiêu chí nào?

### 164. Vì sao runbook cần có command cụ thể nhưng cũng cần phần giải thích để người trực ca hiểu context?

---

## L. Deep Understanding & Design Questions

### 165. Thiết kế một mini platform end-to-end trên EKS dùng GitOps, RBAC, Gatekeeper, ESO, Trivy, Cosign, Monitoring, Argo Rollouts. Hãy mô tả architecture và deployment flow.

### 166. Nếu phải chọn giữa Gatekeeper và Kyverno cho platform admission, bạn sẽ so sánh theo tiêu chí nào?

### 167. Nếu một policy quá strict làm block monitoring/Argo CD/system workloads, bạn sẽ redesign scope policy như thế nào?

### 168. Hãy phân tích trade-off giữa `fail closed` và `fail open` cho Admission webhook trong production.

### 169. Hãy thiết kế image promotion flow từ dev -> staging -> prod có Trivy, Cosign, immutable digest, GitOps.

### 170. Hãy giải thích vì sao tag mutable là rủi ro, và vì sao deploy bằng digest có thể an toàn hơn.

### 171. Nếu attacker có quyền push image vào registry nhưng không có signing identity, Admission verify giúp gì?

### 172. Nếu attacker có quyền ký image nhưng image chứa CVE nghiêm trọng, Trivy và Admission layer phối hợp thế nào?

### 173. Nếu attacker có quyền sửa Git repo main, còn những lớp bảo vệ nào có thể phát hiện/chặn thiệt hại?

### 174. Nếu ESO bị down, app đang chạy và secret cần rotate gấp, bạn sẽ xử lý incident thế nào?

### 175. Nếu AWS Secrets Manager secret bị rotate nhưng DB password thật chưa đổi, chuyện gì xảy ra với app?

### 176. Thiết kế zero-downtime secret rotation cho database credentials cần coordination giữa DB, Secrets Manager, ESO, app như thế nào?

### 177. Nếu Argo CD self-heal liên tục revert hotfix live, bạn sẽ xử lý ra sao để vẫn giữ GitOps discipline?

### 178. Nếu Gatekeeper deny một resource do thiếu limits nhưng LimitRange có default limits, thứ tự admission/defaulting có thể ảnh hưởng thế nào?

### 179. Khi một Pod không được tạo do admission deny, vì sao không nên tìm container logs?

### 180. Nếu một Service không có endpoints, bạn debug selector, labels, readinessProbe, namespace, port như thế nào?

### 181. Nếu PrometheusRule không fire dù app lỗi, bạn kiểm tra metric, label, query, scrape target, time window như thế nào?

### 182. Nếu Alertmanager không gửi email, bạn kiểm tra route, receiver, secret, SMTP, pod logs, config reload như thế nào?

### 183. Nếu Argo Rollouts AnalysisRun fail do Prometheus query, bạn phân biệt app lỗi thật và query/config lỗi như thế nào?

### 184. Nếu policy-controller CrashLoopBackOff, `ClusterImagePolicy` sync fail là nguyên nhân hay hậu quả? Giải thích.

### 185. Nếu ESO API version `v1beta1` vs `v1` mismatch, bạn debug CRD served versions và controller version như thế nào?

### 186. Nếu Argo CD báo app Healthy nhưng user vẫn không truy cập được app, bạn kiểm tra những lớp nào ngoài Argo CD?

### 187. Nếu muốn harden EKS theo AWS Best Practices, ngoài W10 lab cần thêm gì: IRSA, audit logs, encryption, private endpoint, node security, network, backup?

### 188. So sánh `Pod Security Standards`, Gatekeeper, Kyverno, và native Admission Policy. Chúng trùng lặp và bổ sung nhau thế nào?

### 189. Hãy thiết kế policy exception workflow có owner, expiry, approval, audit trail, rollback plan.

### 190. Hãy mô tả câu chuyện phỏng vấn 2 phút: W10 lab đã biến cluster thường thành mini platform production-ready như thế nào?

---

## M. Oral Defense Prompts - Trả Lời Như Phỏng Vấn

### 191. Trong 60 giây, giải thích `RBAC vs Admission`.

### 192. Trong 60 giây, giải thích `SecretStore vs ExternalSecret`.

### 193. Trong 60 giây, giải thích `Trivy vs Cosign`.

### 194. Trong 60 giây, giải thích `RoleBinding vs ClusterRoleBinding`.

### 195. Trong 60 giây, giải thích vì sao `GitOps rollback = git revert`.

### 196. Trong 60 giây, giải thích vì sao `CI verify` không đủ mạnh bằng `Admission verify`.

### 197. Trong 60 giây, giải thích vì sao `NetworkPolicy ingress` không tự chặn egress.

### 198. Trong 60 giây, giải thích vì sao `ResourceQuota deny` không có Pod log.

### 199. Trong 60 giây, giải thích vì sao `sync-wave` cần thiết với CRD/controller.

### 200. Trong 60 giây, kể lại flow W10 end-to-end từ Git push đến workload chạy an toàn trong cluster.

---

## N. Rubric Chấm Tự Luận

Dùng rubric này để tự kiểm tra câu trả lời:

| Mức | Tiêu chí |
|---|---|
| 0 điểm | Trả lời sai khái niệm hoặc nhầm keyword chính. |
| 1 điểm | Nêu được định nghĩa ngắn nhưng thiếu flow, ví dụ, command/resource. |
| 2 điểm | Nêu đúng khái niệm, có ví dụ manifest/resource, nhưng chưa nói failure mode/debug. |
| 3 điểm | Nêu đúng flow end-to-end, có production trade-off, failure mode, cách verify/debug. |

Một câu trả lời tốt thường có:

- Keyword đúng: `RBAC`, `Admission`, `ConstraintTemplate`, `ExternalSecret`, `Cosign`, `ServiceMonitor`, v.v.
- Flow đúng thứ tự.
- Ví dụ resource hoặc command.
- Rủi ro nếu cấu hình sai.
- Cách kiểm chứng bằng `kubectl`, Argo CD, Prometheus, logs, hoặc AWS CLI.

