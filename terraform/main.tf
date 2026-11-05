# The stack this project manages: one private S3 bucket.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "aws_account_id" {
  description = "The only AWS account this stack may change. Set it in terraform.tfvars, which git ignores, so the ID stays out of this public repo."
  type        = string
}

variable "aws_region" {
  description = "Region to create the bucket in."
  type        = string
  default     = "us-east-1"
}

provider "aws" {
  # Credentials come from the Worker's environment, never from this repository.
  region = var.aws_region

  # Refuse to run with credentials for any other account, for example if the Worker
  # was started without the right credentials and fell back to a default profile.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = "temporal-terraform-poc"
    }
  }
}

resource "aws_s3_bucket" "poc" {
  # Bucket names are global across AWS, so Terraform appends a unique suffix.
  bucket_prefix = "temporal-terraform-poc-"
}

# New buckets block public access by default. This makes that explicit.
resource "aws_s3_bucket_public_access_block" "poc" {
  bucket = aws_s3_bucket.poc.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket_name" {
  value = aws_s3_bucket.poc.bucket
}
