# Terraform 1 - Tạo EC2 Instance

Thư mục này dùng để học cách dùng Terraform tạo một máy chủ EC2 trên AWS.

## Các file chính

- `main.tf`: khai báo AWS provider, tìm Ubuntu AMI bằng data source, rồi tạo EC2 instance.
- `.terraform.lock.hcl`: khóa phiên bản provider sau khi chạy `terraform init`.
- `.gitignore`: bỏ qua cache, state, plan output và các file nhạy cảm.

## Provider

### `provider "aws"`

```hcl
provider "aws" {
  region = "us-west-2"
}
```

Argument:

- `region`: AWS Region nơi Terraform sẽ tạo tài nguyên. Trong bài này là `us-west-2`.

## Data Source

### `data "aws_ami" "ubuntu"`

Data source này dùng để tìm AMI Ubuntu phù hợp, thay vì tự nhập cứng AMI ID.

Argument:

- `most_recent`: nếu là `true`, Terraform lấy AMI mới nhất trong danh sách thỏa điều kiện.
- `filter`: điều kiện lọc AMI.
- `filter.name`: tên trường dùng để lọc. Ở đây là `name`.
- `filter.values`: danh sách mẫu tên AMI được chấp nhận.
- `owners`: AWS account sở hữu AMI. `099720109477` là Canonical, nhà phát hành Ubuntu.

Attribute thường dùng:

- `data.aws_ami.ubuntu.id`: ID của AMI tìm được, dùng để gán vào argument `ami` của EC2.
- `data.aws_ami.ubuntu.name`: tên AMI tìm được.
- `data.aws_ami.ubuntu.creation_date`: ngày tạo AMI.

## Resource

### `resource "aws_instance" "hello"`

Resource này tạo một EC2 instance.

Argument:

- `ami`: AMI ID dùng để khởi tạo máy chủ. Trong bài này lấy từ `data.aws_ami.ubuntu.id`.
- `instance_type`: loại máy EC2, ví dụ `t3.micro`.
- `tags`: metadata gắn vào resource. Tag `Name = "HelloWorld"` giúp nhìn thấy tên instance trên AWS Console.

Attribute thường dùng:

- `aws_instance.hello.id`: ID của EC2 instance.
- `aws_instance.hello.public_ip`: public IP của instance nếu instance có public IP.
- `aws_instance.hello.private_ip`: private IP trong VPC.
- `aws_instance.hello.arn`: ARN của instance.
- `aws_instance.hello.instance_state`: trạng thái instance, ví dụ `running` hoặc `stopped`.

## Lệnh thường dùng

```bash
terraform init
terraform plan
terraform apply
terraform destroy
```

