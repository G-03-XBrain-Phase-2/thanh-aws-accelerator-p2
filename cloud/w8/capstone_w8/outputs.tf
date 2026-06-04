output "alb_url" {
  value = "http://${aws_lb.app.dns_name}"
}

output "ec2_public_ip" {
  value = aws_instance.lab.public_ip
}

output "ssh_private_key" {
  value     = tls_private_key.ssh.private_key_pem
  sensitive = true
}