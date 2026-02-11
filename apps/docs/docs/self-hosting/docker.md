---
title: Docker Deployment
sidebar_position: 2
---

# Docker Deployment

Deploy Raven Docs using Docker and Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4 GB RAM minimum

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/raven-docs/raven-docs.git
cd raven-docs
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required
DATABASE_URL=postgresql://raven:password@postgres:5432/ravendocs
REDIS_URL=redis://redis:6379
APP_SECRET=your-secret-key-here-min-32-chars
APP_URL=http://localhost:3000

# Optional
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Run Migrations

```bash
docker compose exec app npm run migrate
```

### 5. Access the App

Open http://localhost:3000

## Docker Compose Configuration

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/raven-docs/raven-docs:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - MEMGRAPH_URL=${MEMGRAPH_URL}
      - APP_SECRET=${APP_SECRET}
      - APP_URL=${APP_URL}
    depends_on:
      - postgres
      - redis
      - memgraph
    restart: unless-stopped

  # PostgreSQL with pgvector extension for semantic search
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: raven
      POSTGRES_PASSWORD: password
      POSTGRES_DB: ravendocs
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --save 900 1 --loglevel warning
    volumes:
      - redis_data:/data
    restart: unless-stopped

  # Memgraph for graph relationships and entity tracking
  memgraph:
    image: memgraph/memgraph:2.11.0
    ports:
      - "7687:7687"
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

:::info PostgreSQL with pgvector
Raven Docs uses the `pgvector/pgvector` Docker image which includes the pgvector extension for vector similarity search. This powers the knowledge search and agent memory features with fast HNSW-indexed semantic queries.
:::

## Production Configuration

### With Traefik (HTTPS)

```yaml
services:
  app:
    image: ghcr.io/raven-docs/raven-docs:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ravendocs.rule=Host(`docs.yourdomain.com`)"
      - "traefik.http.routers.ravendocs.tls.certresolver=letsencrypt"
    environment:
      - APP_URL=https://docs.yourdomain.com
    # ... rest of config

  traefik:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=you@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
```

### External PostgreSQL

```yaml
services:
  app:
    environment:
      - DATABASE_URL=postgresql://user:pass@your-postgres-host:5432/ravendocs
    # Remove postgres service
```

## Backups

### Database

```bash
# Backup
docker compose exec postgres pg_dump -U raven ravendocs > backup.sql

# Restore
docker compose exec -T postgres psql -U raven ravendocs < backup.sql
```

### Automated Backups

```bash
# Add to crontab
0 2 * * * docker compose exec postgres pg_dump -U raven ravendocs | gzip > /backups/raven-$(date +\%Y\%m\%d).sql.gz
```

## Updating

```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Run any new migrations
docker compose exec app npm run migrate
```

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### Logs

```bash
# All services
docker compose logs -f

# Just the app
docker compose logs -f app
```

## Troubleshooting

### Database Connection Failed

Check PostgreSQL is running:
```bash
docker compose ps postgres
docker compose logs postgres
```

### Redis Connection Failed

Check Redis is running:
```bash
docker compose exec redis redis-cli ping
```

### Out of Memory

Increase Docker memory limit or upgrade server.
