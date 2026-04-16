# AWS App Runner Deployment Guide

This guide describes how to deploy the FullStackAi monorepo to AWS App Runner.

## Prerequisites

- AWS CLI configured with administrator access.
- Terraform installed.
- Docker installed.

## Infrastructure Overview

The provided Terraform configuration in `infra/` sets up:
- **RDS (Postgres 16):** With support for `pgvector` for semantic caching.
- **ElastiCache (Redis):** For high-performance rate limiting and TPM management.
- **App Runner:** A managed container service to run the `api-server`.
- **ECR:** A private repository to store the Docker image.
- **VPC Connector:** Allows App Runner to securely access RDS and Redis within a VPC.

## Deployment Steps

### 1. Initialize Infrastructure

Before running Terraform, you must create a `terraform.tfvars` file or provide variables:

```hcl
db_password = "your-secure-db-password"
aws_region  = "us-east-1"
```

Then run:

```bash
cd infra
terraform init
terraform apply
```

This will output the **ECR Repository URL** and other resource information.

### 2. Build and Push the Docker Image

Build the monorepo using the provided `Dockerfile` and push it to ECR:

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <YOUR_AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build the image
docker build -t fullstack-ai .

# Tag and push
docker tag fullstack-ai:latest <YOUR_ECR_REPO_URL>:latest
docker push <YOUR_ECR_REPO_URL>:latest
```

### 3. Finalize App Runner Configuration

After pushing the image, App Runner will automatically deploy if `auto_deployments_enabled` is true.

Ensure you've set the following Environment Variables in the App Runner console (or via Terraform):
- `DATABASE_URL`: The full RDS connection string.
- `REDIS_URL`: The Redis connection string.
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Your OpenAI key.
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY`: Your Anthropic key.
- `AI_INTEGRATIONS_GEMINI_API_KEY`: Your Google GenAI key.

### 4. Database Migrations

Once the service is running, you can run migrations by executing a one-time job or by using a script:

```bash
# You can run this locally if you have access to the DB (e.g., via a bastion or VPC VPN)
DATABASE_URL="<YOUR_PROD_DB_URL>" pnpm --filter @workspace/db run migrate
```

## Security Best Practices

- **Secrets:** Use AWS Secrets Manager for all API keys instead of plain environment variables.
- **WAF:** Consider adding an AWS WAF (Web Application Firewall) in front of the App Runner endpoint.
- **CORS:** Update the `CORS_ORIGIN` in `app.ts` to match your production domain.
- **VPC:** Ensure RDS and Redis are not publicly accessible.
