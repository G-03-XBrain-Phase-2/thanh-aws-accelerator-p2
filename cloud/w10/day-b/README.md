# W10 Day B - Secrets Rotation và Supply Chain Security

Day B nối tiếp trực tiếp Day A. Day A học cách Kubernetes kiểm soát:

```text
Ai được làm gì?                    -> RBAC
Object có được phép tồn tại không? -> Admission Policy
```

Day B dùng các nền tảng đó để giải quyết hai nhóm rủi ro thực tế hơn:

1. **Secrets Rotation:** không hardcode secret, không commit secret, đồng bộ secret từ AWS Secrets Manager về Kubernetes bằng External Secrets Operator.
2. **Supply Chain Security:** image phải được scan, ký, và có thể bị Admission chặn nếu không đáng tin.

Tinh thần chính:

```text
Secret gốc không nằm trong Git.
Image không chỉ cần build được, mà còn phải được scan và ký.
Cluster không tin lời hứa của developer; cluster tự verify ở admission.
```

---

## 1. Cấu Trúc Thư Mục

```text
cloud/w10/day-b/
├── README.md
├── app/
│   ├── Dockerfile
│   └── secret-reader.sh
├── ci-trivy/
│   ├── ci-image-scan.yml
│   └── cve-exception-template.md
├── eso/
│   └── aws-real/
│       ├── namespace.yaml
│       ├── secretstore-static.yaml
│       ├── externalsecret.yaml
│       └── secret-reader-deployment.yaml
└── signing/
    ├── key-based/
    │   ├── kyverno-verify-keybased.yaml
    │   ├── w10-cosign.key
    │   └── w10-cosign.pub
    └── keyless/
        ├── github-actions-keyless-sign.yml
        └── kyverno-verify-keyless.yaml
```

Ngoài ra có workflow thật tại repo root:

```text
.github/workflows/
├── ci-image-scan.yml
└── keyless-sign.yml
```

> Cảnh báo quan trọng: `w10-cosign.key` là private key. Không nên commit file này. Public key `w10-cosign.pub` có thể commit.

---

## 2. Bức Tranh Tổng Thể Day B

### Secrets Rotation

```text
AWS Secrets Manager
  |
  | ESO đọc theo refreshInterval
  v
Kubernetes Secret
  |
  | mount dạng volume
  v
Pod filesystem
  |
  | app đọc lại file định kỳ
  v
App thấy secret mới mà Pod không restart
```

### Supply Chain Security

```text
Source code
  |
  v
Docker build
  |
  v
Trivy scan
  |
  v
Push image lên registry
  |
  v
Cosign sign
  |
  v
Admission verify image signature
  |
  +-- hợp lệ     -> allow
  `-- không hợp lệ -> deny
```

---

## 3. Kubernetes Secret Không Phải Mã Hóa Kỳ Diệu

Kubernetes Secret thường lưu giá trị trong field `data` bằng Base64.

Ví dụ:

```yaml
data:
  password: cGFzc3dvcmQ=
```

Base64 chỉ là encoding:

```text
cGFzc3dvcmQ= -> password
```

Nó không phải encryption.

Nếu user có quyền:

```bash
kubectl get secret app-db-secret -n w10-day-b -o yaml
```

thì Base64 không ngăn họ đọc secret.

Muốn bảo vệ Secret cần nhiều lớp:

- RBAC không cho đọc Secret bừa bãi.
- Encryption at rest cho etcd.
- Không mount secret vào Pod không cần.
- Không dùng ServiceAccount `default` với quyền mạnh.
- Audit quyền đọc/sửa Secret.
- Không commit Secret manifest chứa dữ liệu thật.

---

## 4. AWS Secrets Manager Và Kubernetes Secret

### AWS Secrets Manager

Vai trò:

```text
Nơi giữ secret gốc.
```

Hỗ trợ:

- IAM permission.
- KMS encryption.
- Versioning.
- Rotation.
- CloudTrail audit.

Secret dùng trong lab:

```text
w10/day-b/prod/app
```

Giá trị:

```json
{
  "username": "appuser",
  "password": "pass-v1"
}
```

Tạo:

```bash
aws secretsmanager create-secret \
  --name w10/day-b/prod/app \
  --secret-string '{"username":"appuser","password":"pass-v1"}' \
  --region ap-southeast-1
```

Đọc:

```bash
aws secretsmanager get-secret-value \
  --secret-id w10/day-b/prod/app \
  --region ap-southeast-1 \
  --query SecretString \
  --output text
```

Rotate thủ công:

```bash
aws secretsmanager put-secret-value \
  --secret-id w10/day-b/prod/app \
  --secret-string '{"username":"appuser","password":"pass-v2"}' \
  --region ap-southeast-1
```

### Kubernetes Secret

Vai trò:

```text
Bản copy trong cluster để Pod dùng.
```

Trong lab, Kubernetes Secret được ESO tạo tên:

```text
app-db-secret
```

Chứa hai key:

```text
DB_USERNAME
DB_PASSWORD
```

Nguồn gốc của hai key này là JSON field từ AWS:

```text
username -> DB_USERNAME
password -> DB_PASSWORD
```

---

## 5. External Secrets Operator

External Secrets Operator, gọi tắt là ESO, là controller chạy trong Kubernetes.

Nó làm việc này:

```text
Đọc secret từ external provider
và tạo/cập nhật Kubernetes Secret.
```

Provider có thể là:

- AWS Secrets Manager.
- AWS Parameter Store.
- GCP Secret Manager.
- Azure Key Vault.
- HashiCorp Vault.

Trong lab này dùng AWS Secrets Manager.

---

## 6. SecretStore Và ExternalSecret

### SecretStore

Trả lời:

```text
Kết nối đến provider nào?
Region nào?
Auth bằng gì?
```

Trong lab:

```text
Provider: AWS Secrets Manager
Region: ap-southeast-1
Auth: static AWS key nằm trong Kubernetes Secret awssm-secret
```

### ExternalSecret

Trả lời:

```text
Lấy secret nào?
Map field nào?
Tạo Kubernetes Secret tên gì?
Refresh bao lâu một lần?
```

Trong lab:

```text
AWS secret: w10/day-b/prod/app
username -> DB_USERNAME
password -> DB_PASSWORD
target Kubernetes Secret: app-db-secret
refreshInterval: 30s
```

Luồng:

```text
SecretStore
  |
  | cách kết nối AWS
  v
ExternalSecret
  |
  | lấy secret nào, map field nào
  v
Kubernetes Secret
```

---

## 7. `eso/aws-real/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: w10-day-b
  labels:
    purpose: secrets-supply-chain-lab
    environment: prod
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `apiVersion: v1` | Namespace thuộc core Kubernetes API |
| `kind: Namespace` | Tạo namespace |
| `metadata.name` | Tên namespace là `w10-day-b` |
| `labels.purpose` | Ghi chú namespace dùng cho lab Secrets + Supply Chain |
| `labels.environment` | Mô phỏng production |

Namespace giúp cô lập tài nguyên Day B.

Apply:

```bash
kubectl apply -f cloud/w10/day-b/eso/aws-real/namespace.yaml
```

---

## 8. Static AWS Credential Cho Local Lab

Vì lab chạy trên `docker-desktop`, không phải EKS, ta không có IRSA thật.

Do đó local lab dùng static AWS credential trong Kubernetes Secret:

```bash
kubectl create secret generic awssm-secret \
  -n w10-day-b \
  --from-literal=access-key="$AWS_ACCESS_KEY_ID" \
  --from-literal=secret-access-key="$AWS_SECRET_ACCESS_KEY"
```

Kiểm tra:

```bash
kubectl get secret awssm-secret -n w10-day-b
```

Không nên in nội dung Secret ra terminal nếu không cần.

### Vì sao production không nên dùng static key?

Static key:

- Sống lâu.
- Dễ bị copy.
- Phải tự rotate.
- Nếu lộ, attacker có thể gọi AWS API ngoài cluster.

Production EKS nên dùng:

```text
IRSA hoặc EKS Pod Identity
```

Luồng production:

```text
ESO Pod
  |
  | ServiceAccount
  v
IAM Role
  |
  | temporary credentials qua STS
  v
AWS Secrets Manager
```

---

## 9. `eso/aws-real/secretstore-static.yaml`

```yaml
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: w10-day-b
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-southeast-1
      auth:
        secretRef:
          accessKeyIDSecretRef:
            name: awssm-secret
            key: access-key
          secretAccessKeySecretRef:
            name: awssm-secret
            key: secret-access-key
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `apiVersion: external-secrets.io/v1` | Resource thuộc ESO |
| `kind: SecretStore` | Cấu hình kết nối provider |
| `metadata.name` | Tên store để ExternalSecret tham chiếu |
| `metadata.namespace` | Store chỉ dùng trong namespace `w10-day-b` |
| `spec.provider.aws` | Provider là AWS |
| `service: SecretsManager` | Dùng AWS Secrets Manager |
| `region: ap-southeast-1` | Region chứa AWS secret |
| `auth.secretRef` | Lấy credential từ Kubernetes Secret |
| `accessKeyIDSecretRef` | Field chứa AWS access key ID |
| `secretAccessKeySecretRef` | Field chứa AWS secret access key |

Apply:

```bash
kubectl apply -f cloud/w10/day-b/eso/aws-real/secretstore-static.yaml
```

Kiểm tra:

```bash
kubectl get secretstore -n w10-day-b
kubectl describe secretstore aws-secrets-manager -n w10-day-b
```

---

## 10. `eso/aws-real/externalsecret.yaml`

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: app-db-secret
  namespace: w10-day-b
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: app-db-secret
    creationPolicy: Owner
  data:
    - secretKey: DB_USERNAME
      remoteRef:
        key: w10/day-b/prod/app
        property: username
    - secretKey: DB_PASSWORD
      remoteRef:
        key: w10/day-b/prod/app
        property: password
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `kind: ExternalSecret` | Quy định đồng bộ secret từ provider |
| `metadata.name` | Tên ExternalSecret object |
| `refreshInterval: 30s` | ESO kiểm tra provider khoảng mỗi 30 giây |
| `secretStoreRef.name` | Dùng SecretStore `aws-secrets-manager` |
| `secretStoreRef.kind` | Store là namespaced `SecretStore` |
| `target.name` | Kubernetes Secret được tạo tên `app-db-secret` |
| `creationPolicy: Owner` | ExternalSecret sở hữu target Secret |
| `data[].secretKey` | Key trong Kubernetes Secret |
| `remoteRef.key` | Tên secret trong AWS Secrets Manager |
| `remoteRef.property` | Field trong JSON secret AWS |

Apply:

```bash
kubectl apply -f cloud/w10/day-b/eso/aws-real/externalsecret.yaml
```

Kiểm tra:

```bash
kubectl get externalsecret -n w10-day-b
kubectl describe externalsecret app-db-secret -n w10-day-b
kubectl get secret app-db-secret -n w10-day-b
```

Decode để học:

```bash
kubectl get secret app-db-secret -n w10-day-b \
  -o jsonpath='{.data.DB_USERNAME}' | base64 -d; echo
```

```bash
kubectl get secret app-db-secret -n w10-day-b \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

Kỳ vọng:

```text
appuser
pass-v1
```

---

## 11. Env Var Và Volume Trong Secret Rotation

### Secret qua env var

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-db-secret
        key: DB_PASSWORD
```

Khi container start:

```text
Kubernetes đọc Secret
-> inject vào env
-> process chạy
```

Khi Kubernetes Secret đổi:

```text
Env var trong process không tự đổi.
```

Vì vậy env var không phù hợp cho yêu cầu no-restart rotation nếu app không có cơ chế reload riêng.

### Secret qua volume

```yaml
volumes:
  - name: app-db-secret
    secret:
      secretName: app-db-secret
```

Kubernetes mount secret thành file:

```text
/etc/app-secrets/DB_USERNAME
/etc/app-secrets/DB_PASSWORD
```

Khi Kubernetes Secret đổi, kubelet có thể cập nhật file trong volume.

Nhưng app vẫn phải:

- Đọc lại file mỗi lần cần.
- Hoặc watch file.
- Hoặc có reload mechanism.

Nếu app chỉ đọc file lúc startup rồi cache trong memory, vẫn dùng secret cũ.

---

## 12. `app/secret-reader.sh`

```sh
#!/bin/sh
set -eu

while true; do
  echo "---- $(date) ----"
  echo "DB_USERNAME=$(cat /etc/app-secrets/DB_USERNAME 2>/dev/null || true)"
  echo "DB_PASSWORD=$(cat /etc/app-secrets/DB_PASSWORD 2>/dev/null || true)"
  sleep 10
done
```

Giải thích:

| Dòng | Ý nghĩa |
|---|---|
| `#!/bin/sh` | Dùng shell POSIX |
| `set -eu` | Lỗi thì dừng, biến chưa set thì lỗi |
| `while true` | Vòng lặp vô hạn |
| `date` | In thời điểm đọc secret |
| `cat /etc/app-secrets/...` | Đọc file secret từ volume |
| `2>/dev/null || true` | Không crash nếu file chưa tồn tại |
| `sleep 10` | Mỗi 10 giây đọc lại |

Điểm mấu chốt:

```text
Script đọc file bên trong vòng lặp.
```

Nếu đọc một lần trước vòng lặp, nó sẽ cache giá trị cũ.

---

## 13. `eso/aws-real/secret-reader-deployment.yaml`

Deployment này chạy BusyBox và đọc Secret volume.

Phần quan trọng:

```yaml
volumeMounts:
  - mountPath: /etc/app-secrets
    name: app-db-secret
    readOnly: true
volumes:
  - name: app-db-secret
    secret:
      secretName: app-db-secret
```

Luồng:

```text
Kubernetes Secret app-db-secret
  |
  v
Volume app-db-secret
  |
  v
Container path /etc/app-secrets
  |
  v
File DB_USERNAME và DB_PASSWORD
```

Apply:

```bash
kubectl apply -f cloud/w10/day-b/eso/aws-real/secret-reader-deployment.yaml
```

Xem log:

```bash
kubectl logs -n w10-day-b deploy/secret-reader -f
```

Kỳ vọng ban đầu:

```text
DB_USERNAME=appuser
DB_PASSWORD=pass-v1
```

---

## 14. Test Rotation Không Restart

Kiểm tra Pod trước:

```bash
kubectl get pods -n w10-day-b
```

Ghi nhớ cột `RESTARTS`.

Rotate AWS secret:

```bash
aws secretsmanager put-secret-value \
  --secret-id w10/day-b/prod/app \
  --secret-string '{"username":"appuser","password":"pass-v2"}' \
  --region ap-southeast-1
```

Đợi ESO sync, kiểm tra Kubernetes Secret:

```bash
kubectl get secret app-db-secret -n w10-day-b \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

Kỳ vọng:

```text
pass-v2
```

Quan sát log Pod:

```text
DB_PASSWORD=pass-v1
...
DB_PASSWORD=pass-v2
```

Kiểm tra Pod không restart:

```bash
kubectl get pods -n w10-day-b
```

Nếu `RESTARTS` vẫn `0`, lab chứng minh:

```text
Secret rotate
-> Kubernetes Secret đổi
-> volume file đổi
-> app đọc lại file
-> Pod không restart
```

---

## 15. Dockerfile Cho App Scan

File:

```text
app/Dockerfile
```

```dockerfile
FROM busybox:1.36

COPY secret-reader.sh /usr/local/bin/secret-reader.sh
RUN chmod +x /usr/local/bin/secret-reader.sh

ENTRYPOINT ["/usr/local/bin/secret-reader.sh"]
```

Giải thích:

| Dòng | Ý nghĩa |
|---|---|
| `FROM busybox:1.36` | Dùng base image nhỏ |
| `COPY` | Đưa script vào image |
| `RUN chmod +x` | Cho phép script chạy được |
| `ENTRYPOINT` | Chạy script khi container start |

Build local:

```bash
docker build -t local/w10-day-b-secret-reader:dev cloud/w10/day-b/app
```

Run local:

```bash
docker run --rm local/w10-day-b-secret-reader:dev
```

Khi chạy local không mount secret, output có thể là:

```text
DB_USERNAME=
DB_PASSWORD=
```

Điều đó bình thường. Nó chỉ chứng minh container chạy được.

---

## 16. Trivy Image Scan

Trivy kiểm tra:

- CVE trong OS packages.
- CVE trong application libraries.
- Secret hardcode.
- Misconfiguration, tùy scanner.

Trivy không kiểm tra:

```text
Image có được ký bởi identity đáng tin không.
```

Đó là việc của Cosign.

Scan local:

```bash
trivy image \
  --format table \
  --vuln-type os,library \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --exit-code 1 \
  local/w10-day-b-secret-reader:test-ci
```

Ý nghĩa:

| Option | Ý nghĩa |
|---|---|
| `--format table` | In kết quả dạng bảng |
| `--vuln-type os,library` | Scan OS package và library |
| `--severity HIGH,CRITICAL` | Chỉ xét HIGH/CRITICAL |
| `--ignore-unfixed` | Bỏ qua CVE chưa có bản vá |
| `--exit-code 1` | Có finding thì trả exit code 1 |

Nếu không có bảng kết quả, thường là không có finding phù hợp filter.

Kiểm tra exit code:

```bash
echo $?
```

```text
0 -> pass
1 -> fail
```

---

## 17. `ci-trivy/ci-image-scan.yml`

```yaml
name: W10 Day B - Trivy Image Scan

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main

jobs:
  image-scan:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Build image
        run: |
          docker build -t local/w10-day-b-secret-reader:${{ github.sha }} cloud/w10/day-b/app

      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: local/w10-day-b-secret-reader:${{ github.sha }}
          format: table
          vuln-type: os,library
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: "1"
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `name` | Tên workflow |
| `on.pull_request` | Chạy khi có PR vào main |
| `on.push` | Chạy khi push vào main |
| `runs-on` | Runner Ubuntu |
| `permissions.contents: read` | Đọc repo |
| `permissions.packages: read` | Đọc package nếu cần |
| `actions/checkout@v4` | Checkout source |
| `docker build` | Build image để scan |
| `${{ github.sha }}` | Tag image theo commit SHA |
| `trivy-action` | Action scan image |
| `exit-code: "1"` | Fail workflow khi có HIGH/CRITICAL |

File trong `cloud/w10/day-b/ci-trivy/` là artifact học tập.

File chạy thật nằm ở:

```text
.github/workflows/ci-image-scan.yml
```

---

## 18. CVE Exception

File:

```text
ci-trivy/cve-exception-template.md
```

Một exception tốt cần:

- CVE ID.
- Severity.
- Image.
- Package.
- Environment.
- Requested by.
- Approved by.
- Expiry date.
- Reason.
- Risk Assessment.
- Remediation Plan.
- Review Cadence.

Không có expiry date thì exception dễ trở thành “cho phép mãi mãi”.

Trivy fail mặc định nghĩa là:

```text
Không merge/deploy.
```

Exception chỉ nên dùng khi:

- Có lý do rõ.
- Có người approve.
- Có thời hạn.
- Có kế hoạch xử lý.

---

## 19. Cosign Key-Based Signing

Key-based signing dùng:

```text
Private key -> ký image
Public key  -> verify image
```

Files:

```text
signing/key-based/w10-cosign.key
signing/key-based/w10-cosign.pub
```

Tạo key:

```bash
cosign generate-key-pair \
  --output-key-prefix cloud/w10/day-b/signing/key-based/w10-cosign
```

Ký image ECR:

```bash
cosign sign --yes \
  --key cloud/w10/day-b/signing/key-based/w10-cosign.key \
  609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:dev
```

Verify local:

```bash
cosign verify \
  --key cloud/w10/day-b/signing/key-based/w10-cosign.pub \
  609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:dev
```

Nếu verify local pass, chữ ký hợp lệ với public key.

---

## 20. Vì Sao Phải Push Image Trước Khi Ký?

Trivy có thể scan image local:

```text
docker build local
-> trivy scan local image
```

Nhưng Cosign signing/admission verify cần image trong registry:

```text
docker build
  |
  v
docker push registry/image:tag
  |
  v
cosign sign registry/image:tag
  |
  v
signature được lưu cạnh image trong registry
  |
  v
Kyverno vào registry để verify
```

Nếu image chỉ nằm local trên máy bạn:

```text
Kyverno trong cluster không thấy image đó.
GitHub Actions runner khác cũng không thấy.
Registry không có nơi lưu signature ổn định.
```

Vì vậy:

```text
Scan có thể local.
Sign/verify admission nên dùng registry image.
```

---

## 21. ECR Image Reference

Image ECR:

```text
609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:dev
```

Tách ra:

```text
Registry:
609356923174.dkr.ecr.ap-southeast-1.amazonaws.com

Repository:
w10-day-b-secret-reader

Tag:
dev
```

Cosign biết phải nói chuyện với ECR nhờ registry host trong image reference.

Docker local login:

```bash
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin 609356923174.dkr.ecr.ap-southeast-1.amazonaws.com
```

Local Docker login chỉ giúp máy local. Kyverno trong cluster cần registry credential riêng nếu ECR private.

---

## 22. Kyverno Verify Key-Based

File:

```text
signing/key-based/kyverno-verify-keybased.yaml
```

Policy:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-signed-images-keybased
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: verify-cosign-keybased-signature
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:*"
          imageRegistryCredentials:
            secrets:
              - ecr-regcred
          mutateDigest: true
          required: true
          verifyDigest: true
          attestors:
            - count: 1
              entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      ...
                      -----END PUBLIC KEY-----
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `ClusterPolicy` | Policy áp dụng cấp cluster |
| `validationFailureAction: Enforce` | Vi phạm thì deny |
| `background: false` | Không chạy background scan cho verifyImages |
| `match.resources.kinds: Pod` | Match Pod admission request |
| `verifyImages` | Rule verify chữ ký image |
| `imageReferences` | Chỉ kiểm tra image ECR repo này |
| `imageRegistryCredentials` | Credential để Kyverno đọc private ECR |
| `mutateDigest: true` | Mutate tag thành digest để cố định artifact |
| `required: true` | Bắt buộc có signature |
| `verifyDigest: true` | Verify theo digest |
| `attestors.count: 1` | Cần ít nhất một attestor hợp lệ |
| `keys.publicKeys` | Public key dùng verify Cosign signature |

Tạo ECR credential cho Kyverno:

```bash
kubectl create secret docker-registry ecr-regcred \
  -n kyverno \
  --docker-server=609356923174.dkr.ecr.ap-southeast-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password="$(aws ecr get-login-password --region ap-southeast-1)"
```

---

## 23. Vấn Đề Đã Gặp Với Kyverno Và ECR

### Lỗi timeout webhook

Lỗi:

```text
failed calling webhook "mutate.kyverno.svc-fail"
context deadline exceeded
```

Ý nghĩa:

```text
API Server gọi Kyverno webhook
nhưng Kyverno service không trả lời.
```

Nguyên nhân thường gặp:

- Kyverno chưa cài đầy đủ.
- Namespace `kyverno` không có Pod/Service.
- Webhook còn sót từ lần cài hỏng.

### Lỗi ECR context canceled

Lỗi:

```text
Get "https://...dkr.ecr.../v2/": context canceled
```

Ý nghĩa:

```text
Kyverno cố vào ECR nhưng không kết nối/auth được.
```

Nguyên nhân:

- Cluster không ra được internet/ECR endpoint.
- Thiếu registry credential.
- ECR private nhưng Kyverno không có secret login.

### Lỗi no signatures found

Lỗi:

```text
no signatures found
```

Ý nghĩa:

```text
Kyverno vào được registry nhưng không tìm thấy signature theo cơ chế nó dùng.
```

Trong lab này, local Cosign verify đã pass:

```text
cosign verify --key w10-cosign.pub ECR_IMAGE:dev
```

Nhưng Kyverno vẫn có thể không thấy signature nếu:

- Signature được lưu bằng OCI referrers nhưng Kyverno/version hiện tại tìm legacy signature tag.
- Ký nhầm digest/tag.
- Push lại tag sau khi ký.
- `dev` và `unsigned` cùng digest nên test unsigned không sạch.

Nguyên tắc debug:

```text
1. cosign verify local phải pass trước.
2. cosign tree xem signature nằm ở đâu.
3. Kyverno policy phải dùng đúng public key.
4. Kyverno phải có registry credential nếu registry private.
```

---

## 24. Tag, Digest Và Vì Sao Unsigned Có Thể Không Thật Sự Unsigned

ECR có thể cho nhiều tag trỏ cùng một digest:

```text
dev      -> sha256:597...
unsigned -> sha256:597...
```

Cosign ký digest, không ký riêng từng tag.

Nếu `dev` và `unsigned` cùng digest, ký `dev` có thể làm `unsigned` cũng verify pass, vì artifact thật giống nhau.

Muốn test unsigned đúng:

```text
Tạo một image khác digest
push tag unsigned2
không ký unsigned2
```

Ví dụ:

```bash
docker pull busybox:1.36
docker tag busybox:1.36 \
  609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:unsigned2
docker push \
  609356923174.dkr.ecr.ap-southeast-1.amazonaws.com/w10-day-b-secret-reader:unsigned2
```

---

## 25. Keyless Signing Với GitHub Actions OIDC

Keyless không dùng private key dài hạn.

Luồng:

```text
GitHub Actions job
  |
  | id-token: write
  v
GitHub OIDC token
  |
  v
Fulcio cấp certificate ngắn hạn
  |
  v
Cosign ký image
  |
  v
Signature gắn với GitHub workflow identity
```

Keyless verify kiểm tra:

```text
issuer  -> ai cấp identity
subject -> repo/branch/workflow nào ký
```

Issuer GitHub:

```text
https://token.actions.githubusercontent.com
```

Subject dạng:

```text
repo:<OWNER>/<REPO>:ref:refs/heads/main
```

---

## 26. `signing/keyless/github-actions-keyless-sign.yml`

Workflow học tập:

```yaml
name: W10 Day B - Keyless Cosign Sign

on:
  push:
    branches:
      - main

jobs:
  build-sign:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write
      id-token: write

    env:
      IMAGE: ghcr.io/g-03-xbrain-phase-2/thanh-aws-accelerator-p2/w10-day-b-secret-reader:${{ github.sha }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build image
        run: |
          docker build -t "$IMAGE" cloud/w10/day-b/app

      - name: Push image
        run: |
          docker push "$IMAGE"

      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Keyless sign image
        run: |
          cosign sign --yes "$IMAGE"
```

Giải thích:

| Field | Ý nghĩa |
|---|---|
| `id-token: write` | Cho workflow lấy GitHub OIDC token |
| `packages: write` | Cho workflow push image lên GHCR |
| `IMAGE` | Image GHCR được build/push/sign |
| `docker/login-action` | Login GHCR bằng `GITHUB_TOKEN` |
| `docker push` | Đưa image lên registry để Cosign ký |
| `cosign sign --yes` | Ký keyless bằng GitHub OIDC identity |

### Vì sao IMAGE phải lowercase?

Docker/GHCR yêu cầu repository name lowercase.

Repo GitHub có thể là:

```text
G-03-XBrain-Phase-2/thanh-aws-accelerator-p2
```

Nhưng image phải dùng:

```text
ghcr.io/g-03-xbrain-phase-2/thanh-aws-accelerator-p2/...
```

Nếu dùng chữ hoa sẽ lỗi:

```text
repository name must be lowercase
```

---

## 27. Vì Sao Keyless Workflow Cần Push?

Vì Cosign ký image trong registry.

Không push:

```text
Image chỉ nằm trong Docker local của GitHub runner.
Registry không có image.
Không có nơi ổn định để lưu signature.
Kyverno không thể verify image local của runner.
```

Flow đúng:

```text
docker build
-> docker push
-> cosign sign
-> signature nằm cạnh image trong registry
```

Trivy scan thì có thể local. Cosign/admission verify thì nên dùng registry.

---

## 28. `signing/keyless/kyverno-verify-keyless.yaml`

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-signed-images-keyless
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: verify-github-actions-keyless-signature
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "ghcr.io/G-03-XBrain-Phase-2/thanh-aws-accelerator-p2/w10-day-b-secret-reader:*"
          mutateDigest: true
          required: true
          verifyDigest: true
          attestors:
            - count: 1
              entries:
                - keyless:
                    issuer: https://token.actions.githubusercontent.com
                    subject: repo:G-03-XBrain-Phase-2/thanh-aws-accelerator-p2:ref:refs/heads/main
```

Lưu ý: `imageReferences` hiện đang có chữ hoa trong path GHCR. Với registry image thực tế đã sửa lowercase, policy cũng nên dùng lowercase:

```text
ghcr.io/g-03-xbrain-phase-2/thanh-aws-accelerator-p2/w10-day-b-secret-reader:*
```

Nhưng `subject` có thể cần đúng format mà GitHub certificate phát hành. Khi verify keyless fail, đọc output Cosign để biết exact subject.

---

## 29. Day B Và Day A Liên Quan Nhau

Day A:

```text
Admission chặn Pod thiếu label/resources
Admission chặn privileged container
Admission chặn registry không cho phép
```

Day B:

```text
Admission chặn image không có chữ ký hợp lệ
```

Cùng một nguyên lý:

```text
Không dựa vào lời hứa.
Cluster tự kiểm tra ở cổng Admission.
```

---

## 30. Checklist Hoàn Thành

- [ ] AWS secret `w10/day-b/prod/app` tồn tại.
- [ ] ESO đã cài và có CRD `ExternalSecret`, `SecretStore`.
- [ ] `SecretStore` kết nối được AWS Secrets Manager.
- [ ] `ExternalSecret` tạo `app-db-secret`.
- [ ] `DB_USERNAME` decode ra `appuser`.
- [ ] `DB_PASSWORD` decode ra `pass-v1`.
- [ ] Pod đọc secret qua volume.
- [ ] Rotate AWS secret sang `pass-v2`.
- [ ] Kubernetes Secret đổi.
- [ ] Pod log đổi sang `pass-v2` mà không restart.
- [ ] Docker image build local thành công.
- [ ] Trivy local scan pass/fail đúng theo exit code.
- [ ] GitHub Actions Trivy workflow tồn tại ở `.github/workflows`.
- [ ] CVE exception template có expiry date.
- [ ] Cosign key-based local verify pass.
- [ ] Kyverno key-based policy được áp dụng.
- [ ] Hiểu vấn đề ECR private registry credential.
- [ ] Hiểu vấn đề OCI referrers vs legacy signature.
- [ ] Keyless GitHub Actions workflow build/push/sign được image GHCR.

---

## 31. Câu Trả Lời Ngắn Khi Bị Hỏi

### ESO làm gì?

```text
ESO đồng bộ secret từ external provider như AWS Secrets Manager về Kubernetes Secret.
```

### SecretStore khác ExternalSecret?

```text
SecretStore mô tả cách kết nối provider.
ExternalSecret mô tả lấy secret nào và tạo Kubernetes Secret nào.
```

### Vì sao env var không phù hợp no-restart rotation?

```text
Env var được set lúc process start và không tự đổi khi Kubernetes Secret đổi.
```

### Trivy khác Cosign?

```text
Trivy scan CVE/misconfig/secret.
Cosign ký và verify nguồn gốc image.
```

### Vì sao Admission verify mạnh hơn CI verify?

```text
CI có thể bị bypass. Admission nằm ở API Server nên mọi request tạo Pod đều phải qua.
```

### Vì sao phải push image trước khi ký?

```text
Cosign lưu signature cạnh image trong registry, và admission verify cũng đọc image/signature từ registry.
```

### Key-based khác keyless?

```text
Key-based dùng private/public key dài hạn.
Keyless dùng OIDC identity của CI và certificate ngắn hạn.
```
