variable "email_identity" {
  type        = string
  description = "Verified FROM address or domain for SES (sandbox until production access)."
}

resource "aws_sesv2_email_identity" "this" {
  email_identity = var.email_identity
}

output "email_identity" {
  value = aws_sesv2_email_identity.this.email_identity
}
