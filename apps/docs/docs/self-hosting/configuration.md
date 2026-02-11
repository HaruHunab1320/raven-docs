---
title: Configuration
sidebar_position: 4
---

# Configuration

Complete reference for Raven Docs configuration options.

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://host:6379` |
| `APP_SECRET` | Secret key for encryption (min 32 chars) | `your-very-long-secret-key-here` |
| `APP_URL` | Public URL of your instance | `https://docs.example.com` |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | - | Database host (alternative to DATABASE_URL) |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | - | Database name |
| `DB_USER` | - | Database user |
| `DB_PASSWORD` | - | Database password |
| `DB_SSL` | `false` | Enable SSL |
| `DB_POOL_SIZE` | `10` | Connection pool size |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | - | Redis host (alternative to REDIS_URL) |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password |
| `REDIS_TLS` | `false` | Enable TLS |

### Memgraph (Graph Database)

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMGRAPH_URL` | - | Memgraph connection string |
| `MEMGRAPH_HOST` | `localhost` | Memgraph host |
| `MEMGRAPH_PORT` | `7687` | Memgraph Bolt port |

Memgraph stores entity relationships and memory graphs. It's used for graph traversals like "what entities are related to X".

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | - | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | - | GitHub OAuth client secret |
| `JWT_EXPIRY` | `7d` | JWT token expiry |
| `SESSION_SECRET` | - | Session encryption key |

### Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `local` | `local`, `s3`, `gcs` |
| `STORAGE_PATH` | `/data/uploads` | Local storage path |
| `S3_BUCKET` | - | S3 bucket name |
| `S3_REGION` | - | S3 region |
| `S3_ACCESS_KEY` | - | S3 access key |
| `S3_SECRET_KEY` | - | S3 secret key |
| `S3_ENDPOINT` | - | S3-compatible endpoint |
| `GCS_BUCKET` | - | Google Cloud Storage bucket |
| `GCS_PROJECT_ID` | - | GCP project ID |

### Email

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | - | SMTP server host |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASSWORD` | - | SMTP password |
| `SMTP_FROM` | - | From email address |
| `SMTP_SECURE` | `true` | Use TLS |

### Features

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SIGNUP` | `true` | Allow new signups |
| `ENABLE_GOOGLE_AUTH` | `false` | Enable Google OAuth |
| `ENABLE_GITHUB_AUTH` | `false` | Enable GitHub OAuth |
| `ENABLE_AI` | `true` | Enable AI features |
| `AI_PROVIDER` | `openai` | AI provider |
| `OPENAI_API_KEY` | - | OpenAI API key |

### Embeddings

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | - | Google Gemini API key for embeddings |
| `EMBEDDING_MODEL` | `text-embedding-004` | Gemini embedding model |
| `EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimensions |

Embeddings power semantic search for both the memory system and knowledge base. The default Gemini model provides high-quality 768-dimensional vectors.

### Performance

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment |
| `PORT` | `3000` | HTTP port |
| `WORKERS` | `auto` | Worker processes |
| `MAX_UPLOAD_SIZE` | `10mb` | Max file upload size |
| `RATE_LIMIT` | `100` | Requests per minute |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `json` | `json` or `pretty` |
| `LOG_FILE` | - | Log file path |

## Example Configurations

### Minimal Production

```bash
DATABASE_URL=postgresql://raven:pass@db:5432/ravendocs
REDIS_URL=redis://redis:6379
APP_SECRET=your-32-char-secret-key-here!!
APP_URL=https://docs.example.com
```

### Full Production

```bash
# Core
DATABASE_URL=postgresql://raven:pass@db:5432/ravendocs
REDIS_URL=redis://:password@redis:6379
APP_SECRET=your-very-long-secret-key-here
APP_URL=https://docs.example.com
NODE_ENV=production

# Auth
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-secret
ENABLE_GOOGLE_AUTH=true

# Storage
STORAGE_PROVIDER=s3
S3_BUCKET=my-ravendocs-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM=noreply@example.com

# AI
ENABLE_AI=true
OPENAI_API_KEY=sk-your-openai-key

# Embeddings (for semantic search)
GEMINI_API_KEY=your-gemini-api-key

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Development

```bash
DATABASE_URL=postgresql://raven:raven@localhost:5432/ravendocs
REDIS_URL=redis://localhost:6379
APP_SECRET=dev-secret-not-for-production
APP_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

## Security Recommendations

1. **Use strong secrets** - Generate with `openssl rand -base64 32`
2. **Enable TLS** - Use HTTPS for APP_URL
3. **Database SSL** - Enable `DB_SSL=true` in production
4. **Rotate secrets** - Change APP_SECRET periodically
5. **Limit access** - Use network policies to restrict database access
