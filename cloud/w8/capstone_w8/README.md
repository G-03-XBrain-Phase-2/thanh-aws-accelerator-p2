# K8s on AWS - Terraform 1-Click

Repo này dựng một lab Kubernetes nhỏ trên AWS bằng Terraform:

- Terraform tạo hạ tầng AWS: VPC, public subnets, Internet Gateway, route table, security groups, EC2, ALB, target group, listener.
- EC2 chạy minikube bằng Docker driver.
- App Node.js chạy trong Kubernetes Pod, không chạy trực tiếp trên EC2.
- Kubernetes Service dùng NodePort `30080`.
- ALB nhận HTTP từ Internet và forward vào EC2 port `30080`.
- Terraform dùng 2 providers: `aws` và `tls`.

## Kiến Trúc

```text
Internet
  |
  v
Application Load Balancer :80
  |
  v
Target Group :30080
  |
  v
EC2 public subnet :30080
  |
  v
minikube Docker driver
  |
  v
Kubernetes Service NodePort 30080
  |
  v
Pod demo-app :3000
```

Luồng request:

```text
Browser
  -> ALB DNS port 80
  -> Target Group
  -> EC2 instance port 30080
  -> minikube port mapping 30080
  -> Kubernetes Service demo-app
  -> Pod container port 3000
```

## Cấu Trúc Thư Mục

```text
capstone_w8/
  providers.tf
  variables.tf
  main.tf
  outputs.tf
  userdata.sh.tftpl
  README.md
  EVIDENCE.md

  app/
    server.js
    package.json
    Dockerfile

  k8s/
    deployment.yaml
    service.yaml

  evidence/
    .gitkeep
```

Ý nghĩa:

- `providers.tf`: khai báo Terraform providers.
- `variables.tf`: khai báo biến cấu hình.
- `main.tf`: toàn bộ hạ tầng AWS và TLS key.
- `outputs.tf`: in ALB URL, EC2 public IP, SSH private key.
- `userdata.sh.tftpl`: script cloud-init chạy lúc EC2 boot.
- `app/`: source code app Node.js.
- `k8s/`: Kubernetes manifest.
- `EVIDENCE.md`: file ghi bằng chứng nộp bài.

## Cách Chạy

Yêu cầu local:

- Terraform đã cài.
- AWS credentials đã cấu hình, ví dụ qua `aws configure` hoặc environment variables.
- Account AWS có quyền tạo VPC, EC2, ALB, Security Group, Key Pair.

Chạy:

```bash
terraform init
terraform apply -auto-approve
```

Lấy URL:

```bash
terraform output alb_url
```

Mở URL trên browser. Có thể cần đợi vài phút vì EC2 phải cài Docker, minikube, kubectl, build image và deploy app.

Destroy:

```bash
terraform destroy -auto-approve
```

## Providers

File: `providers.tf`

```hcl
terraform {
  required_version = ">= 1.5.0"
}
```

`required_version` chỉ định Terraform CLI cần version từ `1.5.0` trở lên.

```hcl
required_providers {
  aws = {
    source  = "hashicorp/aws"
    version = "~> 5.0"
  }
  tls = {
    source  = "hashicorp/tls"
    version = "~> 4.0"
  }
}
```

Ý nghĩa:

- `hashicorp/aws`: provider gọi AWS API để tạo VPC, EC2, ALB, Security Group.
- `hashicorp/tls`: provider local dùng để sinh SSH private key/public key.
- `~> 5.0`: cho phép AWS provider version `5.x`.
- `~> 4.0`: cho phép TLS provider version `4.x`.

```hcl
provider "aws" {
  region = var.aws_region
}
```

AWS provider dùng region lấy từ biến `aws_region`.

## Variables

File: `variables.tf`

```hcl
variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}
```

Region AWS mặc định là Singapore.

```hcl
variable "project_name" {
  type    = string
  default = "minikube-alb-lab"
}
```

Tên project dùng để đặt tên resource.

```hcl
variable "instance_type" {
  type    = string
  default = "c7i-flex.large"
}
```

Loại EC2 instance. Cần instance đủ RAM để chạy Docker + minikube. `t3.micro` không đủ vì chỉ có khoảng 1 GiB RAM. Log lỗi thường thấy:

```text
System only has 916MiB available
required 1800MiB
```

```hcl
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
```

CIDR của VPC mới.

```hcl
variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.1.0/24", "10.20.2.0/24"]
}
```

Danh sách CIDR cho 2 public subnets. ALB cần ít nhất 2 subnet ở 2 Availability Zones khác nhau.

## Data Sources

File: `main.tf`

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}
```

Lấy danh sách Availability Zones khả dụng trong region hiện tại.

Dùng ở subnet:

```hcl
availability_zone = data.aws_availability_zones.available.names[count.index]
```

Mục đích: subnet 1 nằm AZ thứ nhất, subnet 2 nằm AZ thứ hai. Nếu không set AZ, AWS có thể tạo 2 subnet cùng AZ và ALB sẽ lỗi:

```text
A load balancer cannot be attached to multiple subnets in the same Availability Zone
```

```hcl
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}
```

Lấy AMI Amazon Linux 2023 mới nhất.

Ý nghĩa:

- `most_recent = true`: lấy AMI mới nhất match filter.
- `owners = ["amazon"]`: chỉ lấy AMI chính chủ Amazon.
- `filter name = "name"`: lọc theo tên AMI.
- `values = ["al2023-ami-*-x86_64"]`: lấy AMI Amazon Linux 2023 kiến trúc x86_64.

## Network

### VPC

```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}
```

Ý nghĩa:

- `cidr_block`: dải IP private của VPC.
- `enable_dns_hostnames`: cho phép resource trong VPC có DNS hostname.
- `enable_dns_support`: bật DNS resolution trong VPC.
- `tags`: đặt tên resource để dễ nhìn trong AWS Console.

### Internet Gateway

```hcl
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

Internet Gateway cho phép subnet public đi ra/vào Internet nếu route table có route `0.0.0.0/0`.

### Public Subnets

```hcl
resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}
```

Ý nghĩa:

- `count`: tạo nhiều subnet dựa trên số phần tử trong `public_subnet_cidrs`.
- `vpc_id`: subnet thuộc VPC mới tạo.
- `cidr_block`: CIDR riêng cho từng subnet.
- `availability_zone`: đảm bảo mỗi subnet ở AZ khác nhau.
- `map_public_ip_on_launch = true`: EC2 launch trong subnet này tự nhận public IP.

### Route Table

```hcl
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
}
```

Route table chứa rules định tuyến.

```hcl
resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}
```

Ý nghĩa:

- `destination_cidr_block = "0.0.0.0/0"`: mọi traffic đi Internet.
- `gateway_id`: route traffic qua Internet Gateway.

```hcl
resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

Gắn route table public vào từng public subnet.

## TLS Provider Và SSH Key

```hcl
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}
```

TLS provider sinh SSH key pair ở phía Terraform:

- `private_key_pem`: private key dùng để SSH.
- `public_key_openssh`: public key dùng để đưa lên AWS.

```hcl
resource "aws_key_pair" "lab" {
  key_name   = "${var.project_name}-key"
  public_key = tls_private_key.ssh.public_key_openssh
}
```

AWS provider tạo EC2 Key Pair bằng public key từ TLS provider.

Đây là phần "wire provider":

```text
tls_private_key.ssh.public_key_openssh
  -> aws_key_pair.lab.public_key
  -> aws_instance.lab.key_name
```

Private key không upload lên AWS. AWS chỉ giữ public key. Muốn SSH thì lấy private key từ Terraform output:

```bash
terraform output -raw ssh_private_key > ~/.ssh/minikube-alb-lab.pem
chmod 400 ~/.ssh/minikube-alb-lab.pem
ssh -i ~/.ssh/minikube-alb-lab.pem ec2-user@$(terraform output -raw ec2_public_ip)
```

## Security Groups

### ALB Security Group

```hcl
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow HTTP from Internet"
  vpc_id      = aws_vpc.main.id
}
```

ALB SG gắn vào Application Load Balancer.

Ingress:

```hcl
ingress {
  from_port   = 80
  to_port     = 80
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

Cho phép Internet truy cập HTTP port 80.

Egress:

```hcl
egress {
  from_port   = 0
  to_port     = 0
  protocol    = "-1"
  cidr_blocks = ["0.0.0.0/0"]
}
```

Cho phép ALB gọi ra ngoài, bao gồm gọi EC2 target.

### EC2 Security Group

```hcl
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Allow traffic from ALB to minikube NodePort"
  vpc_id      = aws_vpc.main.id
}
```

Rule NodePort:

```hcl
ingress {
  description     = "NodePort from ALB"
  from_port       = 30080
  to_port         = 30080
  protocol        = "tcp"
  security_groups = [aws_security_group.alb.id]
}
```

Ý nghĩa:

- Chỉ ALB security group được gọi vào EC2 port `30080`.
- Không mở `30080` trực tiếp cho toàn Internet.

Rule SSH:

```hcl
ingress {
  description = "SSH debug"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

Cho phép SSH debug. Trong thực tế nên đổi `0.0.0.0/0` thành public IP của mình:

```hcl
cidr_blocks = ["YOUR_PUBLIC_IP/32"]
```

## EC2

```hcl
resource "aws_instance" "lab" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  key_name                    = aws_key_pair.lab.key_name
  associate_public_ip_address = true
  user_data_replace_on_change = true
}
```

Ý nghĩa:

- `ami`: dùng Amazon Linux 2023 AMI mới nhất.
- `instance_type`: loại máy, cần đủ RAM cho minikube.
- `subnet_id`: đặt EC2 vào public subnet đầu tiên.
- `vpc_security_group_ids`: gắn EC2 security group.
- `key_name`: gắn AWS key pair được tạo từ TLS provider.
- `associate_public_ip_address`: EC2 có public IP để SSH/debug.
- `user_data_replace_on_change`: nếu `user_data` đổi, Terraform replace EC2 để cloud-init chạy lại.

`user_data`:

```hcl
user_data = templatefile("${path.module}/userdata.sh.tftpl", {
  server_js       = file("${path.module}/app/server.js")
  package_json    = file("${path.module}/app/package.json")
  dockerfile      = file("${path.module}/app/Dockerfile")
  deployment_yaml = file("${path.module}/k8s/deployment.yaml")
  service_yaml    = file("${path.module}/k8s/service.yaml")
})
```

Ý nghĩa:

- `templatefile`: render file `userdata.sh.tftpl`.
- `file(...)`: đọc source code và YAML từ repo local.
- Terraform nhúng nội dung app và manifest vào cloud-init script.
- EC2 boot lên sẽ tự ghi các file này ra `/opt/demo`.

`depends_on`:

```hcl
depends_on = [aws_route_table_association.public]
```

Đảm bảo public route table association xong trước khi EC2 bootstrap. EC2 cần Internet để download Docker image, kubectl, minikube.

## ALB

```hcl
resource "aws_lb" "app" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}
```

Ý nghĩa:

- `load_balancer_type = "application"`: tạo Application Load Balancer layer 7 HTTP.
- `internal = false`: ALB public, truy cập được từ Internet.
- `security_groups`: gắn ALB SG mở port 80.
- `subnets`: ALB nằm trong 2 public subnets.

## Target Group

```hcl
resource "aws_alb_target_group" "app" {
  name        = "${var.project_name}-tg"
  port        = 30080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"
}
```

Ý nghĩa:

- `port = 30080`: ALB forward traffic tới EC2 port `30080`.
- `protocol = "HTTP"`: traffic HTTP.
- `target_type = "instance"`: target là EC2 instance ID, không phải IP.

Health check:

```hcl
health_check {
  enabled             = true
  path                = "/health"
  matcher             = "200"
  interval            = 30
  timeout             = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3
  port                = "30080"
  protocol            = "HTTP"
}
```

ALB kiểm tra:

```text
http://EC2_PRIVATE_IP:30080/health
```

Nếu app trả HTTP `200`, target healthy.

## Target Group Attachment

```hcl
resource "aws_alb_target_group_attachment" "app" {
  target_group_arn = aws_alb_target_group.app.arn
  target_id        = aws_instance.lab.id
  port             = 30080
}
```

Gắn EC2 instance vào target group. ALB sẽ forward request vào EC2 port `30080`.

## Listener

```hcl
resource "aws_alb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"
}
```

Listener nhận request HTTP port 80.

Default action:

```hcl
default_action {
  type             = "forward"
  target_group_arn = aws_alb_target_group.app.arn
}
```

Mọi request vào ALB port 80 sẽ forward tới target group.

## Cloud-Init / User Data

File: `userdata.sh.tftpl`

EC2 user data được cloud-init chạy ở lần boot đầu tiên. Script này làm toàn bộ bootstrap.

```bash
#!/bin/bash
set -euxo pipefail
```

Ý nghĩa:

- `-e`: lệnh lỗi thì script dừng.
- `-u`: dùng biến chưa khai báo thì lỗi.
- `-x`: in lệnh đang chạy ra log.
- `pipefail`: pipeline lỗi thì script lỗi.

Log xem ở EC2:

```bash
sudo tail -f /var/log/cloud-init-output.log
```

Cài package:

```bash
dnf update -y
dnf install -y docker conntrack
systemctl enable --now docker
usermod -aG docker ec2-user
```

Ý nghĩa:

- `docker`: cần cho minikube Docker driver và build image.
- `conntrack`: dependency Kubernetes networking.
- `systemctl enable --now docker`: bật Docker ngay và tự bật khi boot.
- `usermod -aG docker ec2-user`: cho `ec2-user` dùng Docker.

Cài kubectl:

```bash
curl -Lo /usr/local/bin/kubectl https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl
chmod +x /usr/local/bin/kubectl
```

Cài minikube:

```bash
curl -Lo /usr/local/bin/minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
chmod +x /usr/local/bin/minikube
```

Tạo thư mục app:

```bash
mkdir -p /opt/demo/app /opt/demo/k8s
```

Ghi file từ Terraform template:

```bash
cat > /opt/demo/app/server.js <<'EOF'
${server_js}
EOF
```

Các biến như `${server_js}`, `${deployment_yaml}` do Terraform render từ `templatefile`.

Đổi owner:

```bash
chown -R ec2-user:ec2-user /opt/demo
```

Chạy phần minikube bằng `ec2-user`:

```bash
sudo -iu ec2-user bash <<'EOF'
set -euxo pipefail
...
EOF
```

Lý do: minikube Docker driver không nên chạy bằng root. Nếu chạy root, kubeconfig có thể trỏ vào `/.kube` và gây lỗi certificate.

Start minikube:

```bash
minikube start --driver=docker --ports=30080:30080 --memory=1800mb --cpus=2
```

Ý nghĩa:

- `--driver=docker`: minikube chạy bằng Docker container.
- `--ports=30080:30080`: map port `30080` từ EC2 host vào minikube node.
- `--memory=1800mb`: cấp RAM cho minikube.
- `--cpus=2`: cấp CPU cho minikube.

Build image:

```bash
docker build -t demo-app:v1 /opt/demo/app
```

Load image vào minikube:

```bash
minikube image load demo-app:v1
```

Vì image chỉ build local trên EC2, không push Docker Hub/ECR. Lệnh này nạp image vào container runtime của minikube.

Apply manifest:

```bash
kubectl apply -f /opt/demo/k8s/
kubectl rollout status deployment/demo-app --timeout=180s
```

Đợi Deployment rollout thành công. Nếu quá 180 giây mà Pod chưa Ready, cloud-init sẽ fail.

## App

File: `app/server.js`

App là HTTP server Node.js nhỏ:

- Port mặc định: `3000`.
- Route `/health`: trả `{ "status": "ok" }`.
- Route `/`: trả JSON gồm message và hostname của Pod.

`os.hostname()` giúp chứng minh app chạy trong container/Pod vì hostname thường là tên Pod.

File: `app/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
COPY server.js .
EXPOSE 3000
CMD ["npm", "start"]
```

Ý nghĩa:

- `FROM node:20-alpine`: image Node.js nhẹ.
- `WORKDIR /app`: thư mục làm việc trong container.
- `COPY`: copy source vào image.
- `EXPOSE 3000`: khai báo app listen port 3000.
- `CMD`: chạy app khi container start.

## Kubernetes Deployment

File: `k8s/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
```

Deployment quản lý Pod của app.

```yaml
spec:
  replicas: 1
```

Chạy 1 Pod để tiết kiệm tài nguyên cho minikube.

```yaml
selector:
  matchLabels:
    app: demo-app
```

Deployment quản lý Pod có label `app=demo-app`.

```yaml
template:
  metadata:
    labels:
      app: demo-app
```

Pod được tạo ra cũng có label `app=demo-app`.

```yaml
containers:
  - name: demo-app
    image: demo-app:v1
    imagePullPolicy: Never
```

Ý nghĩa:

- `image`: image build local trên EC2.
- `imagePullPolicy: Never`: Kubernetes không pull image từ registry. Image phải có sẵn trong minikube nhờ `minikube image load`.

```yaml
ports:
  - containerPort: 3000
```

Container listen port 3000.

Readiness probe:

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
```

Kubernetes chỉ route traffic tới Pod khi `/health` OK.

Liveness probe:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
```

Nếu app chết hoặc `/health` fail lâu, kubelet restart container.

## Kubernetes Service

File: `k8s/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: demo-app
```

Service tạo endpoint ổn định cho Pod.

```yaml
spec:
  type: NodePort
```

NodePort expose service ra port trên node Kubernetes.

```yaml
selector:
  app: demo-app
```

Service chọn Pod có label `app=demo-app`. Selector này phải match label trong Deployment.

```yaml
ports:
  - port: 80
    targetPort: 3000
    nodePort: 30080
```

Ý nghĩa:

- `port: 80`: port của Service bên trong cluster.
- `targetPort: 3000`: port container app.
- `nodePort: 30080`: port expose trên minikube node.

Flow:

```text
EC2:30080
  -> minikube node:30080
  -> Service demo-app:80
  -> Pod demo-app:3000
```

## Outputs

File: `outputs.tf`

```hcl
output "alb_url" {
  value = "http://${aws_lb.app.dns_name}"
}
```

In URL để mở app.

```hcl
output "ec2_public_ip" {
  value = aws_instance.lab.public_ip
}
```

In public IP để SSH debug.

```hcl
output "ssh_private_key" {
  value     = tls_private_key.ssh.private_key_pem
  sensitive = true
}
```

In private key ở dạng sensitive. Dùng `terraform output -raw ssh_private_key` để ghi ra file `.pem`.

## Debug

SSH vào EC2:

```bash
terraform output -raw ssh_private_key > ~/.ssh/minikube-alb-lab.pem
chmod 400 ~/.ssh/minikube-alb-lab.pem
ssh -i ~/.ssh/minikube-alb-lab.pem ec2-user@$(terraform output -raw ec2_public_ip)
```

Xem cloud-init log:

```bash
sudo tail -n 200 /var/log/cloud-init-output.log
```

Kiểm tra minikube:

```bash
minikube status
```

Kiểm tra Kubernetes:

```bash
kubectl get pods -o wide
kubectl get svc
kubectl get endpoints demo-app
kubectl describe pod -l app=demo-app
kubectl logs -l app=demo-app
```

Kiểm tra app từ EC2:

```bash
curl localhost:30080
curl localhost:30080/health
```

Nếu `curl localhost:30080` OK nhưng ALB lỗi, kiểm tra Target Group health trong AWS Console.

Nếu `minikube status` báo profile không tồn tại, nghĩa là cloud-init fail trước hoặc trong `minikube start`.

Nếu log báo thiếu RAM:

```text
System only has 916MiB available
required 1800MiB
```

Đổi instance type lớn hơn, ví dụ `c7i-flex.large`, `t3.small`, `t3.medium` tùy account/region hỗ trợ.

## Các Lỗi Đã Gặp Và Cách Hiểu

### Provider TLS version lỗi

Lỗi:

```text
no available releases match the given constraints ~> 5.0
```

Nguyên nhân: `hashicorp/tls` không có version `5.x`.

Sửa:

```hcl
version = "~> 4.0"
```

### ALB subnets cùng AZ

Lỗi:

```text
A load balancer cannot be attached to multiple subnets in the same Availability Zone
```

Nguyên nhân: 2 public subnet nằm cùng AZ.

Sửa:

```hcl
availability_zone = data.aws_availability_zones.available.names[count.index]
```

### Security group InvalidGroupId.Malformed

Lỗi:

```text
Invalid id: "0" expecting "sg-..."
```

Nguyên nhân: dùng `security_groups = ["0.0.0.0/0"]` thay vì `cidr_blocks`.

Sửa:

```hcl
cidr_blocks = ["0.0.0.0/0"]
```

### ALB 502 Bad Gateway

Nguyên nhân thường gặp:

- minikube chưa start thành công.
- Pod chưa Ready.
- Service không có endpoint.
- EC2 port `30080` chưa trả response.

Debug:

```bash
curl localhost:30080
kubectl get pods
kubectl get endpoints demo-app
sudo tail -n 200 /var/log/cloud-init-output.log
```

## Vì Sao Không Dùng Kubernetes Provider

Có thể dùng Terraform Kubernetes provider để tạo Deployment/Service, nhưng bài này cluster minikube được tạo bên trong EC2 trong lúc `terraform apply`.

Nếu Terraform local muốn dùng Kubernetes provider, cần:

- expose Kubernetes API server từ EC2 ra ngoài,
- lấy kubeconfig/certificate từ EC2 về local,
- xử lý thứ tự chờ minikube start xong,
- cấu hình provider bằng thông tin runtime.

Cách đó phức tạp và dễ fail trong bài 1-click.

Repo này chọn:

```text
Terraform aws provider: tạo hạ tầng AWS
Terraform tls provider: sinh SSH key
cloud-init/user_data: bootstrap minikube và kubectl apply manifest ngay trong EC2
```

## Câu Giải Thích Khi Bảo Vệ

```text
Tôi dùng Terraform để dựng toàn bộ hạ tầng gồm VPC mới, 2 public subnet ở 2 AZ, Internet Gateway, route table, security groups, EC2 và Application Load Balancer.

EC2 chạy Amazon Linux 2023. Khi boot, cloud-init thực thi user_data để cài Docker, kubectl, minikube, ghi source code và Kubernetes manifest từ Terraform template, build Docker image local, load image vào minikube, rồi deploy app bằng kubectl.

App chạy trong Kubernetes Pod, không chạy trực tiếp trên EC2. Service dùng NodePort 30080. Minikube Docker driver map port 30080 ra EC2 host. ALB forward HTTP traffic vào EC2 port 30080, từ đó request đi vào Service và Pod.

Tôi dùng 2 Terraform providers: aws và tls. TLS provider sinh SSH key pair, public key được truyền vào aws_key_pair của AWS provider, rồi EC2 sử dụng key pair đó qua key_name. Đây là cách wire provider khác vào cấu hình Terraform.
```

## Checklist Nộp Bài

- `terraform apply -auto-approve` chạy được từ repo sạch.
- `terraform output alb_url` mở được trên browser.
- Response có message và pod hostname.
- `kubectl get pods` cho thấy Pod `demo-app` đang Running.
- `kubectl get svc` cho thấy Service `demo-app` là NodePort `30080`.
- `terraform providers` hiển thị `hashicorp/aws` và `hashicorp/tls`.
- Có ảnh bằng chứng trong `EVIDENCE.md`.
- `terraform destroy -auto-approve` dọn sạch resource.
