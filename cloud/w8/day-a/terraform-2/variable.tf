variable "instance_type" {
  description = "The type of EC2 instance to create"
  type        = string
  default     = "t3.micro"
  validation {
    condition = contains(["t3.micro", "t3.small", "t3.medium"], var.instance_type)
    error_message = "value must be one of: t3.micro, t3.small, t3.medium"
  }
}