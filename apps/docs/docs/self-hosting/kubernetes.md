---
title: Kubernetes Deployment
sidebar_position: 3
---

# Kubernetes Deployment

Deploy Raven Docs to Kubernetes using Helm.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.0+
- kubectl configured

## Quick Start

### 1. Clone the Repository

The Helm charts are included in the repository:

```bash
git clone https://github.com/HaruHunab1320/raven-docs.git
cd raven-docs
```

### 2. Create Values File

```yaml
# values.yaml
app:
  replicas: 2
  env:
    APP_URL: https://docs.yourdomain.com

postgresql:
  enabled: true
  auth:
    postgresPassword: your-password

redis:
  enabled: true

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: docs.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ravendocs-tls
      hosts:
        - docs.yourdomain.com
```

### 3. Install

```bash
kubectl create namespace ravendocs

helm install raven-docs ./charts/raven-docs \
  --namespace ravendocs \
  --values values.yaml
```

## Configuration

### Full Values Reference

```yaml
# Application
app:
  image:
    repository: ghcr.io/raven-docs/raven-docs
    tag: latest
    pullPolicy: IfNotPresent
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 2Gi
  env:
    APP_URL: https://docs.yourdomain.com
    # Additional environment variables
  secrets:
    APP_SECRET: "" # Will be auto-generated if empty

# PostgreSQL (Bitnami chart)
postgresql:
  enabled: true
  auth:
    postgresPassword: ""
    database: ravendocs
  primary:
    persistence:
      size: 10Gi

# Redis (Bitnami chart)
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: docs.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ravendocs-tls
      hosts:
        - docs.yourdomain.com

# Pod Disruption Budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# Horizontal Pod Autoscaler
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

### External Database

```yaml
postgresql:
  enabled: false

app:
  env:
    DATABASE_URL: postgresql://user:pass@external-db:5432/ravendocs
```

### External Redis

```yaml
redis:
  enabled: false

app:
  env:
    REDIS_URL: redis://external-redis:6379
```

## High Availability

### Multiple Replicas

```yaml
app:
  replicas: 3

podDisruptionBudget:
  enabled: true
  minAvailable: 2
```

### Autoscaling

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

## Monitoring

### Prometheus Metrics

```yaml
serviceMonitor:
  enabled: true
  interval: 30s
```

### Grafana Dashboard

Import dashboard ID: `12345` from Grafana.com (placeholder).

## Backups

### Using Velero

```bash
# Install Velero
velero install --provider aws --bucket my-bucket

# Schedule backup
velero schedule create ravendocs-daily \
  --schedule="0 2 * * *" \
  --include-namespaces ravendocs
```

### PostgreSQL Backup CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pg-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            command:
            - /bin/sh
            - -c
            - pg_dump $DATABASE_URL | gzip > /backups/$(date +%Y%m%d).sql.gz
            volumeMounts:
            - name: backups
              mountPath: /backups
          volumes:
          - name: backups
            persistentVolumeClaim:
              claimName: backup-pvc
```

## Upgrading

```bash
# Pull latest changes
git pull

# Upgrade
helm upgrade raven-docs ./charts/raven-docs \
  --namespace ravendocs \
  --values values.yaml
```

## Troubleshooting

### Pods Not Starting

```bash
kubectl describe pod -n ravendocs -l app=raven-docs
kubectl logs -n ravendocs -l app=raven-docs
```

### Database Connection Issues

```bash
kubectl exec -it -n ravendocs deploy/raven-docs -- \
  psql $DATABASE_URL -c "SELECT 1"
```

### Ingress Not Working

```bash
kubectl describe ingress -n ravendocs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```
