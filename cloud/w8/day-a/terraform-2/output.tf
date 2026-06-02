# output "ec2" {
#   value = {
#     for i, v in aws_instance.hello : format("public_ip%d", i + 1) => v.public_ip
#   }
# }
