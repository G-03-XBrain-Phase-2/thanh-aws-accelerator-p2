# W10 — Tin nhắn cho HV Cloud/DevOps

> Gửi cuối T6 W9 (12/06/2026) hoặc sáng T2 W10 (15/06).

Chào cả nhà,

W10 bắt đầu **T2 ngày 15/06**, theme **Secure & Operate** — sau W8 (foundation) + W9 (delivery), tuần này hardening: chặn vi phạm **ở cluster level**, không dựa "developer hứa". Kết thúc W10 = HV có **mini platform end-to-end** sẵn sàng cho capstone W11-W12.

**🎙️ Live mentor tuần này:** mentor Minh T4 15h-17h (online) — **AWS Security end-to-end + K8s Hardening**. Phần lớn foundation (IAM, VPC/WAF, KMS, CloudTrail, GuardDuty, Organizations/SCP) đã học ở Phase 1 → Minh recap nhanh để connect dots, focus chính vào 3 mảng MỚI: Container/K8s Security, DevSecOps/Supply Chain, Incident Response.

---

## W10 — Secure & Operate: RBAC + Secrets + Platform Integration

| Ngày | Hoạt động |
|---|---|
| **T2 15/06** | Self-study **D1 RBAC + Admission Policy (OPA/Gatekeeper)** — RBAC role/rolebinding/clusterrole, service account, `kubectl auth can-i`, OPA Rego, Gatekeeper constraint template vs constraint, ValidatingAdmissionPolicy native (K8s 1.30+), audit mode vs enforce |
| **T3 16/06** | Self-study **D2 Secrets Rotation + Supply Chain Security** — AWS Secrets Manager + External Secrets Operator (ESO), Trivy image scan trong CI, Cosign signing (keyless OIDC + key-based), admission webhook verify signature, exception policy CVE |
| **T4 17/06** | Sáng: Self-study **D3 Platform Integration + Runbook + Cost Guard** — tích hợp toàn stack W8→W10, ResourceQuota + LimitRange, chaos test, runbook template, AWS Cost Anomaly Detection<br>**🎙️ 15h–17h: LIVE AWS Security + K8s Hardening với mentor Minh (online)** — xem scope chi tiết bên dưới<br>**📝 17h–18h: Online Test 1** (60p, scope D1 + D2 + nội dung live) |
| **T5 18/06** | **Onsite Đà Nẵng với mentor Kiệt + Vương** — bắt đầu **Lab "6-risk cluster cleanup + cluster-level enforcement"** full day |
| **T6 19/06** | Onsite — hoàn thiện Lab → show-and-tell pod 5 người 13h30–15h → **📝 15h–16h: Online Test 2** (60p, scope D3 + Lab) |

**Mục tiêu cuối W10:** Cluster có 3 role rõ ràng (`developer` / `sre` / `viewer`), 4 Gatekeeper constraint enforce, ESO rotate secret < 60s no-restart, admission reject unsigned image. **"Mini platform working end-to-end"** — GitOps + observability + canary + security deploy lên fresh cluster trong < 2h từ repo.

→ Sẵn sàng vào pod cross-team W11-W12 với role "build hạ tầng + emit telemetry đúng yêu cầu AI Engine".

---

## 🎙️ Live T4 17/06 với mentor Minh — Scope chi tiết (15h–17h, online)

**Tinh thần:** không re-teach lại Phase 1. Recap nhanh để **connect dots** giữa AWS-layer security (đã học) và K8s-layer hardening (W10 lab). Dồn thời lượng vào 3 mảng mới.

| Block | Thời lượng | Nội dung | Ghi chú |
|---|---|---|---|
| **1. Recap foundation** | 15:00–15:25 (25p) | Shared Responsibility · IAM users/roles/policies · VPC/SG/NACL/WAF/Shield · KMS + S3/EBS encryption · CloudTrail/CloudWatch/Config · GuardDuty/Security Hub/Macie/Inspector · AWS Organizations/SCP/Control Tower/Identity Center | Đã học W1/W2/W5/W6 → Minh chỉ refresh + map vào W10 context. **Mang câu hỏi nếu quên.** |
| **2. Container & K8s Security** ⭐ | 15:25–16:00 (35p) | ECR image scan · IRSA (IAM Roles for Service Accounts) · Pod Security Standards (restricted/baseline) · `runAsNonRoot` + `readOnlyRootFilesystem` · NetworkPolicy · EKS audit log → CloudWatch | Khớp với **D1 RBAC** + lab T5 (F-02/F-04) |
| **3. DevSecOps & CI/CD Security** ⭐ | 16:00–16:30 (30p) | Trivy CI scan policy (fail-on HIGH/CRITICAL) · Cosign/Sigstore keyless OIDC + key-based · Admission verify signature · Secrets scanning trong CI · SLSA supply chain levels · Exception ADR có thời hạn | Khớp với **D2 Secrets + Supply Chain** + lab T5 (F-03/F-05/F-06) |
| **4. Incident Response on AWS** ⭐ | 16:30–16:55 (25p) | IR playbook 6-step (Detect → Triage → Contain → Eradicate → Recover → Post-mortem) · EC2 isolation pattern (SG swap + EBS snapshot) · EventBridge → Lambda auto-isolate · Detective root-cause · Tie vào "khi cluster K8s bị compromise: làm gì 5 phút đầu?" | **MỚI hoàn toàn.** Liên hệ runbook D3 |
| **5. QnA + chuyển Test 1** | 16:55–17:00 (5p) | | |

**Pre-read trước live:**
- D1 RBAC + D2 Secrets/Supply Chain (đã có trong learning path)
- Nếu quên Phase 1: xem lại W6 Wed (Security Best Practices) + W2 Wed (Security Fundamentals)

**Mang sẵn câu hỏi về:**
- IRSA vs static AWS credentials trong pod — khi nào pick cái nào
- Verify signature ở CI vs registry vs admission — đặt ở đâu là đúng nhất
- IR playbook: 1 pod compromised → cách ly pod hay cách ly node hay cách ly cả namespace?

> **Out of scope live** (đã cover Phase 1 hoặc quá nâng cao): AWS Audit Manager · Memory forensics / disk imaging chuyên sâu · Detective deep-dive (đã touch W6). Có hỏi Minh sẽ giải thích, nhưng không có slide riêng.

---

## Tài liệu tham khảo

### RBAC + Admission Policy

Tài liệu chính thống:
- **Kubernetes RBAC Docs** — https://kubernetes.io/docs/reference/access-authn-authz/rbac
- **OPA (Open Policy Agent) Docs** — https://www.openpolicyagent.org/docs (Rego intro)
- **Gatekeeper Docs** — https://open-policy-agent.github.io/gatekeeper (constraint template vs constraint)
- **ValidatingAdmissionPolicy** (native K8s 1.30+) — https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy
- **Kyverno Docs** (alternative to Gatekeeper) — https://kyverno.io/docs

### Secrets Rotation + Supply Chain Security

Tài liệu chính thống:
- **AWS Secrets Manager** — https://docs.aws.amazon.com/secretsmanager
- **External Secrets Operator (ESO)** — https://external-secrets.io/latest (CRD + `refreshInterval`)
- **Sealed Secrets** (alternative) — https://github.com/bitnami-labs/sealed-secrets
- **Trivy Docs** — https://aquasecurity.github.io/trivy (image scan trong CI)
- **Cosign / Sigstore** — https://docs.sigstore.dev/cosign/overview (keyless OIDC + key-based signing)
- **Kyverno Verify Images** — https://kyverno.io/policies/?policytypes=verifyImages (admission verify signature)
- **SLSA Framework** — https://slsa.dev (supply chain levels)

### Platform Integration + Cost Guard

Tài liệu chính thống:
- **K8s ResourceQuota** — https://kubernetes.io/docs/concepts/policy/resource-quotas
- **K8s LimitRange** — https://kubernetes.io/docs/concepts/policy/limit-range
- **AWS Cost Anomaly Detection** — https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html
- **K8s Chaos Engineering** (Litmus, Chaos Mesh) — https://litmuschaos.io / https://chaos-mesh.org
- **Runbook template** (Google SRE Workbook) — https://sre.google/workbook/example-postmortem

### Live T4 — AWS Security + Container/DevSecOps/IR

Recap foundation (đã học Phase 1, đọc lại khi quên):
- **AWS Shared Responsibility Model** — https://aws.amazon.com/compliance/shared-responsibility-model
- **AWS Well-Architected — Security Pillar** — https://docs.aws.amazon.com/wellarchitected/latest/security-pillar
- **IAM Best Practices** — https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- **AWS Organizations + SCPs** — https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html

Container & K8s Security (mới):
- **EKS Best Practices Guide — Security** — https://aws.github.io/aws-eks-best-practices/security/docs
- **ECR Image Scanning** — https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html
- **IRSA (IAM Roles for Service Accounts)** — https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html
- **K8s Pod Security Standards** — https://kubernetes.io/docs/concepts/security/pod-security-standards
- **K8s NetworkPolicy** — https://kubernetes.io/docs/concepts/services-networking/network-policies

DevSecOps & Supply Chain (mới):
- **OWASP CI/CD Top 10** — https://owasp.org/www-project-top-10-ci-cd-security-risks
- **SLSA Supply Chain Levels** — https://slsa.dev/spec/v1.0/levels
- (Trivy + Cosign đã list ở mục Secrets/Supply Chain trên)

Incident Response on AWS (mới):
- **AWS Security Incident Response Guide** — https://docs.aws.amazon.com/whitepapers/latest/aws-security-incident-response-guide/welcome.html
- **AWS IR Playbooks (GitHub)** — https://github.com/aws-samples/aws-incident-response-playbooks
- **Amazon Detective** — https://docs.aws.amazon.com/detective/latest/userguide/what-is-detective.html
- **EventBridge → Lambda auto-remediation pattern** — https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/automate-security-responses-using-aws-lambda-and-eventbridge.html

---

## Repo cá nhân (W10)

```
cloud/
  w10/
    day-a/      # RBAC + OPA — rbac/ + policies/
    day-b/      # Secrets + Supply Chain — eso/ + signing/ + ci-trivy/
    day-c/      # Platform Integration — platform-bootstrap/ + runbooks/
    lab/        # 6-risk cleanup + enforcement
    reflection.md
```

Commit message: `[W10-D1] <topic ngắn>`. Push hằng ngày T2–T4.

---

## Cần hỗ trợ

- Câu hỏi material → `#phase2-cloud-daily`
- Vướng technical → `#phase2-cloud-help` (kèm screenshot + log)
- Urgent → DM mentor Kiệt hoặc Vương

— Mentor team