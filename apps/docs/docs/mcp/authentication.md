---
title: MCP Authentication
sidebar_position: 6
---

# MCP Authentication

Secure your MCP connections with API keys.

## API Keys

MCP uses the same API keys as the REST API.

### Creating a Key

1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it (e.g., "Claude Agent")
4. Copy the key immediately

### Using the Key

Include in the Authorization header:

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "http://localhost:3000/api/mcp-standard",
      "headers": {
        "Authorization": "Bearer raven_sk_your_key_here"
      }
    }
  }
}
```

## Permissions

API keys inherit the permissions of the user who created them:

| User Role | MCP Access |
|-----------|------------|
| Admin | All tools, all content |
| Editor | Content tools (CRUD operations) |
| Viewer | Read-only tools |

### Tool Availability by Role

| Category | Admin | Editor | Viewer |
|----------|-------|--------|--------|
| space_list | Yes | Yes | Yes |
| space_create | Yes | Yes | No |
| space_delete | Yes | No | No |
| page_get | Yes | Yes | Yes |
| page_create | Yes | Yes | No |
| page_update | Yes | Yes | No |
| task_create | Yes | Yes | No |

## Security Best Practices

### Environment Variables

Never hardcode API keys:

```typescript
// Good
const apiKey = process.env.RAVEN_API_KEY;

// Bad
const apiKey = 'raven_sk_abc123...';
```

### Separate Keys per Environment

```bash
# Development
RAVEN_API_KEY_DEV=raven_sk_dev_...

# Production
RAVEN_API_KEY_PROD=raven_sk_prod_...
```

### Rotate Keys Regularly

1. Create a new key
2. Update your applications
3. Revoke the old key

### Monitor Usage

Check API usage in **Settings** → **API Keys** → Click on key.

## Error Handling

### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired API key"
  }
}
```

**Solutions:**
- Verify key is correct
- Check for extra whitespace
- Ensure key isn't revoked

### 403 Forbidden

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions for this operation"
  }
}
```

**Solutions:**
- Use a key from a user with higher permissions
- Check workspace membership

## Self-Hosted

For self-hosted instances:

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "https://your-domain.com/api/mcp-standard",
      "headers": {
        "Authorization": "Bearer your_api_key"
      }
    }
  }
}
```

## Related

- [API Authentication](/api/authentication) - REST API auth
- [MCP Quickstart](/mcp/quickstart) - Getting started
