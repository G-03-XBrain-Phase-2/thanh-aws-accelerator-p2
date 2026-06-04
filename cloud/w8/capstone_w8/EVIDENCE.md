# Evidence - K8s on AWS Terraform 1-Click

## 1. ALB URL

Terraform output:

```bash
terraform output alb_url
```

ALB URL:

```text
http://REPLACE_WITH_ALB_DNS_NAME
```

Browser screenshot:

![ALB browser result](evidence/alb-browser.png)

Expected response example:

```json
{
  "message": "Hello from Kubernetes on EC2 minikube",
  "pod": "demo-app-xxxxxxxxxx-yyyyy"
}
```

## 2. App Runs Inside Kubernetes

SSH into EC2:

```bash
terraform output -raw ssh_private_key > ~/.ssh/minikube-alb-lab.pem
chmod 400 ~/.ssh/minikube-alb-lab.pem
ssh -i ~/.ssh/minikube-alb-lab.pem ec2-user@$(terraform output -raw ec2_public_ip)
```

Check minikube:

```bash
minikube status
```

Screenshot:

![Minikube status](evidence/minikube-status.png)

Check Kubernetes resources:

```bash
kubectl get pods -o wide
kubectl get svc
kubectl get endpoints demo-app
```

Screenshot:

![Kubernetes resources](evidence/k8s-resources.png)

## 3. ALB Reaches NodePort

From EC2:

```bash
curl localhost:30080
curl localhost:30080/health
```

Screenshot:

![NodePort curl](evidence/nodeport-curl.png)

## 4. Terraform Providers

Command:

```bash
terraform providers
```

Screenshot:

![Terraform providers](evidence/terraform-providers.png)

Providers used:

```text
hashicorp/aws
hashicorp/tls
```

Provider wiring:

```text
tls_private_key.ssh creates an SSH public/private key pair.
aws_key_pair.lab uses tls_private_key.ssh.public_key_openssh.
aws_instance.lab attaches the generated AWS key pair through key_name.
```

## 5. Destroy Evidence

Destroy command:

```bash
terraform destroy -auto-approve
```

Screenshot after destroy:

![Terraform destroy](evidence/terraform-destroy.png)

