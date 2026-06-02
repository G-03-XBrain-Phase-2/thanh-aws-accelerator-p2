# Terraform 2 - S3 Static Website

Thư mục này dùng để học cách tạo S3 bucket, cấu hình static website, gắn bucket policy public read và upload file tĩnh từ thư mục `static-web` lên S3 bằng Terraform.

## Các file chính

- `main.tf`: khai báo provider, tạo S3 bucket, cấu hình website, cấu hình public access, gắn bucket policy và upload object.
- `s3_static_policy.json`: policy cho phép người dùng đọc object trong bucket bằng action `s3:GetObject`.
- `static-web/index.html`: file giao diện được upload lên S3.
- `variable.tf`: khai báo biến `instance_type` để học variable và validation.
- `terraform.tfvars`: file gán giá trị biến mặc định khi chạy Terraform.
- `production.tfvars`: ví dụ file biến cho môi trường production.
- `output.tf`: ví dụ output đang được comment.
- `.gitignore`: bỏ qua Terraform cache, state, tfvars và plan output.

## Terraform Block

### `terraform`

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "4.44.0"
    }
  }
}
```

Argument:

- `required_providers`: khai báo các provider mà project cần dùng.
- `source`: địa chỉ provider trên Terraform Registry. Ở đây là `hashicorp/aws`.
- `version`: phiên bản AWS provider sẽ dùng.

## Provider

### `provider "aws"`

Argument:

- `region`: AWS Region nơi Terraform tạo tài nguyên. Trong bài này là `us-west-2`.

## Resource

### `resource "aws_s3_bucket" "static"`

Resource này tạo S3 bucket.

Argument:

- `bucket`: tên bucket. Tên S3 bucket phải unique trên toàn cầu.
- `force_destroy`: nếu là `true`, Terraform có thể xóa bucket kể cả khi bucket còn object bên trong.

Attribute thường dùng:

- `aws_s3_bucket.static.id`: ID của bucket, thường chính là tên bucket.
- `aws_s3_bucket.static.bucket`: tên bucket.
- `aws_s3_bucket.static.arn`: ARN của bucket.
- `aws_s3_bucket.static.bucket_domain_name`: domain mặc định của S3 bucket.

### `resource "aws_s3_bucket_public_access_block" "static"`

Resource này cấu hình Block Public Access cho bucket.

Argument:

- `bucket`: bucket cần cấu hình, lấy từ `aws_s3_bucket.static.id`.
- `block_public_acls`: nếu là `true`, AWS sẽ chặn public ACL.
- `block_public_policy`: nếu là `true`, AWS sẽ chặn public bucket policy.
- `ignore_public_acls`: nếu là `true`, AWS bỏ qua public ACL.
- `restrict_public_buckets`: nếu là `true`, AWS giới hạn bucket có public policy.

Trong bài này các giá trị đều là `false` để có thể public website bằng bucket policy.

Attribute thường dùng:

- `aws_s3_bucket_public_access_block.static.id`: ID của cấu hình public access block.

### `resource "aws_s3_bucket_website_configuration" "static"`

Resource này cấu hình bucket thành static website.

Argument:

- `bucket`: bucket cần cấu hình website, lấy từ `aws_s3_bucket.static.bucket`.
- `index_document.suffix`: file trang chủ. Trong bài này là `index.html`.
- `error_document.key`: file hiển thị khi lỗi. Trong bài này là `error.html`.

Attribute thường dùng:

- `aws_s3_bucket_website_configuration.static.id`: ID của website configuration.
- `aws_s3_bucket_website_configuration.static.website_endpoint`: endpoint truy cập website.
- `aws_s3_bucket_website_configuration.static.website_domain`: domain website.

### `resource "aws_s3_bucket_policy" "static"`

Resource này gắn bucket policy để cho phép public read object.

Argument:

- `bucket`: bucket cần gắn policy, lấy từ `aws_s3_bucket.static.id`.
- `policy`: nội dung JSON policy. Trong bài này đọc từ `file("s3_static_policy.json")`.
- `depends_on`: ép Terraform tạo `aws_s3_bucket_public_access_block.static` trước khi gắn policy.

Attribute thường dùng:

- `aws_s3_bucket_policy.static.id`: ID của policy resource.

Lưu ý: ARN trong `s3_static_policy.json` phải khớp với tên bucket trong `main.tf`. Ví dụ:

```json
"Resource": ["arn:aws:s3:::terraform-series-bai3-thanh-20260602/*"]
```

### `resource "aws_s3_object" "object"`

Resource này upload các file trong thư mục `static-web` lên S3.

Argument:

- `for_each`: lặp qua danh sách file lấy từ `fileset("${path.module}/static-web", "**/*")`.
- `bucket`: bucket nhận file upload, lấy từ `aws_s3_bucket.static.id`.
- `key`: đường dẫn object trên S3. Ở đây dùng `each.value`, ví dụ `index.html`.
- `source`: đường dẫn file local cần upload.
- `etag`: mã hash MD5 của file. Khi file đổi nội dung, Terraform biết cần upload lại.
- `content_type`: MIME type của file, ví dụ HTML là `text/html`.

Attribute thường dùng:

- `aws_s3_object.object["index.html"].id`: ID của object.
- `aws_s3_object.object["index.html"].key`: key của object trên S3.
- `aws_s3_object.object["index.html"].etag`: hash của object.

## Local Value

### `locals.mime_types`

Local này là map dùng để xác định `content_type` theo đuôi file.

Ví dụ:

- `html`: `text/html`
- `css`: `text/css`
- `js`: `application/javascript`
- `png`: `image/png`
- `jpg`: `image/jpeg`
- `svg`: `image/svg+xml`

## Function

### `fileset(base_dir, pattern)`

Trả về danh sách file khớp với pattern.

Trong bài này:

```hcl
fileset("${path.module}/static-web", "**/*")
```

Nghĩa là lấy tất cả file bên trong thư mục `static-web`.

### `file(path)`

Đọc nội dung file local và trả về string. Trong bài này dùng để đọc `s3_static_policy.json`.

### `filemd5(path)`

Tính MD5 của file. Terraform dùng giá trị này để phát hiện file đã thay đổi.

### `lookup(map, key, default)`

Tìm giá trị trong map. Nếu không tìm thấy key thì trả về giá trị mặc định.

Trong bài này, nếu không tìm thấy MIME type theo đuôi file thì dùng `application/octet-stream`.

## Variable

### `variable "instance_type"`

Biến này đang dùng để học cách khai báo variable, type và validation. Hiện tại `main.tf` của bài S3 chưa dùng biến này cho resource nào.

Argument:

- `description`: mô tả ý nghĩa của biến.
- `type`: kiểu dữ liệu, ở đây là `string`.
- `default`: giá trị mặc định nếu không truyền biến.
- `validation.condition`: điều kiện kiểm tra giá trị hợp lệ.
- `validation.error_message`: thông báo lỗi nếu giá trị không hợp lệ.

Giá trị hợp lệ:

- `t3.micro`
- `t3.small`
- `t3.medium`

## Lệnh thường dùng

```bash
terraform init
terraform plan
terraform apply
terraform destroy
```

Dùng file biến riêng:

```bash
terraform plan -var-file="production.tfvars"
terraform apply -var-file="production.tfvars"
```

