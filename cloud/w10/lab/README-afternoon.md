# W10 Afternoon Lab: Secrets + Supply Chain

Lab này thêm 2 lớp vào platform:

1. External Secrets Operator sync secret từ AWS Secrets Manager về Kubernetes Secret.
2. CI scan image bằng Trivy, ký image bằng Cosign, và admission verify bằng Sigstore Policy Controller.

## 1. ESO Secret Rotation

Tạo AWS secret:

```bash
aws secretsmanager create-secret \
  --name w10/lab/demo/app \
  --secret-string '{"username":"appuser","password":"pass-v1"}' \
  --region ap-southeast-1
```

Tạo credential cho ESO trong namespace `demo`:

```bash
kubectl create secret generic awssm-secret \
  -n demo \
  --from-literal=access-key="$AWS_ACCESS_KEY_ID" \
  --from-literal=secret-access-key="$AWS_SECRET_ACCESS_KEY"
```

GitOps apps liên quan:

```text
argocd/apps/eso.yaml
argocd/apps/eso-config.yaml
eso/secret-store.yaml
eso/external-secret.yaml
```

Kiểm tra:

```bash
kubectl get secretstore,externalsecret -n demo
kubectl get secret app-db-secret -n demo
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

Kỳ vọng: Kubernetes Secret `app-db-secret` đổi sang `pass-v2` trong khoảng 30-60 giây. Nếu app mount secret bằng volume và đọc lại file, pod không cần restart.

## 2. Trivy + Cosign

Workflow chính:

```text
.github/workflows/build-push.yml
```

Flow:

```text
docker build -> Trivy scan HIGH/CRITICAL -> push GHCR -> cosign sign -> update rollout.yaml
```

Tạo Cosign key pair local:

```bash
cosign generate-key-pair
```

Không commit private key. Thêm vào GitHub repository secrets:

```text
COSIGN_PRIVATE_KEY = nội dung file cosign.key
COSIGN_PASSWORD    = password lúc generate key
```

Public key đã được reuse từ Day B:

```text
cloud/w10/lab/signing/cosign.pub
cloud/w10/lab/policies/cluster-image-policy.yaml
```

Private key tương ứng không được commit. Nếu dùng lại key Day B, copy nội dung `w10-cosign.key` vào GitHub Secret `COSIGN_PRIVATE_KEY`.

## 3. Admission Verify

GitOps apps liên quan:

```text
argocd/apps/policy-controller.yaml
argocd/apps/policies.yaml
policies/cluster-image-policy.yaml
```

Sigstore Policy Controller chỉ enforce namespace có label:

```bash
kubectl label namespace demo policy.sigstore.dev/include=true --overwrite
```

Chỉ gắn label này sau khi image hiện tại đã được ký. Nếu gắn trước, pod `api` có thể bị chặn vì image cũ chưa có signature.

Kiểm tra image đã ký:

```bash
cosign verify \
  --key cloud/w10/lab/signing/cosign.pub \
  ghcr.io/g-03-xbrain-phase-2/w10-api:<TAG>
```

## 4. Deliverables

```text
eso/
signing/cosign.pub
policies/cluster-image-policy.yaml
.github/workflows/build-push.yml
argocd/apps/external-secrets-operator.yaml
argocd/apps/eso.yaml
argocd/apps/policy-controller.yaml
argocd/apps/policies.yaml
runbooks/
evidence/
```

## 5. Notes

- Không commit AWS credentials.
- Không commit `cosign.key`.
- Nếu policy verify image làm app bị chặn, bỏ label namespace `demo` trước:

```bash
kubectl label namespace demo policy.sigstore.dev/include-
```
