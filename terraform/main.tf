# A stand-in for real infrastructure: one resource that runs `echo` when it is created.

terraform {
  required_version = ">= 1.4" # terraform_data is built in from 1.4, so init downloads nothing
}

variable "message" {
  description = "Text to echo. Changing it replaces the resource, so the next apply runs echo again."
  type        = string
  default     = "Hello from Terraform, run by Temporal!"
}

resource "terraform_data" "hello" {
  triggers_replace = [var.message]

  provisioner "local-exec" {
    # The message goes in through the environment instead of being pasted into the
    # command, so quotes in it can't break (or inject into) the shell command.
    command     = "echo \"$MESSAGE\""
    environment = { MESSAGE = var.message }
  }
}

output "message" {
  value = var.message
}
