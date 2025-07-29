# Kubernetes Deployment Configuration

This directory contains Kubernetes manifests for deploying the Brave Search MCP server to Google Kubernetes Engine (GKE).

## Configuration

### Required Secrets

The following secrets need to be configured in your GitHub repository:

- `GKE_CLUSTER`: Name of your GKE cluster
- `GKE_ZONE`: GCP zone where your cluster is located
- `GCP_PROJECT_ID`: Your GCP project ID
- `WIF_PROVIDER`: Workload Identity Federation provider
- `BRAVE_API_KEY`: Your Brave Search API key
- `ALLOWED_ORIGINS`: Allowed origins for CORS
- `INGRESS_HOST`: The domain name for your ingress (e.g., `mcp.example.com`)

### Ingress Configuration

The ingress configuration uses a placeholder `INGRESS_HOST` that gets replaced during deployment with the value from GitHub secrets. This allows the configuration to remain generic and reusable across different environments.

## Deployment

Deployment is automated through GitHub Actions when changes are pushed to the main branch. The workflow will:

1. Replace the `INGRESS_HOST` placeholder with the actual domain
2. Apply all Kubernetes manifests using Kustomize
3. Verify the deployment status

## Local Testing

To test the configuration locally:

```bash
# Replace INGRESS_HOST with your domain
sed -i "s/INGRESS_HOST/your-domain.com/g" ingress.yaml

# Apply the configuration
kubectl apply -k .
```