---
title: Authentication
sidebar_position: 2
---

# Authentication

The Raven Docs API uses API keys for authentication.

## Creating an API Key

1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "CI/CD Integration")
4. Copy the key immediately (it won't be shown again)

:::caution
API keys have full access to your workspace. Treat them like passwords.
:::

## Using API Keys

Include your API key in the `Authorization` header:

```bash
curl https://api.ravendocs.com/v1/workspaces \
  -H "Authorization: Bearer raven_sk_abc123..."
```

### TypeScript SDK

```typescript
import { RavenDocs } from '@raven-docs/sdk';

const client = new RavenDocs({
  apiKey: process.env.RAVEN_API_KEY,
});
```

### Environment Variables

Store your API key in environment variables:

```bash
# .env
RAVEN_API_KEY=raven_sk_abc123...
```

Never commit API keys to version control.

## API Key Permissions

API keys inherit permissions from the user who created them:

| User Role | API Key Access |
|-----------|----------------|
| Admin | Full workspace access |
| Editor | Create/edit content only |
| Viewer | Read-only access |

### Scoped Keys (Coming Soon)

Limit API keys to specific operations:

```json
{
  "name": "Read-only Integration",
  "scopes": ["pages:read", "tasks:read"]
}
```

## MCP Authentication

The MCP server uses the same API keys:

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "https://api.ravendocs.com/mcp-standard",
      "headers": {
        "Authorization": "Bearer raven_sk_abc123..."
      }
    }
  }
}
```

See [MCP Authentication](/mcp/authentication) for details.

## OAuth (Enterprise)

Enterprise customers can use OAuth 2.0:

### Authorization Flow

1. Redirect to authorization endpoint
2. User approves access
3. Exchange code for tokens
4. Use access token for API calls

```typescript
// OAuth configuration
const oauth = {
  authorizationUrl: 'https://ravendocs.com/oauth/authorize',
  tokenUrl: 'https://ravendocs.com/oauth/token',
  clientId: 'your-client-id',
  scopes: ['read', 'write'],
};
```

Contact sales@ravendocs.com for OAuth setup.

## Security Best Practices

### Do

- Store keys in environment variables
- Use different keys for different environments
- Rotate keys periodically
- Use scoped keys when available
- Monitor API usage for anomalies

### Don't

- Commit keys to git
- Share keys between team members
- Use production keys in development
- Expose keys in client-side code
- Log full API keys

## Revoking Keys

To revoke an API key:

1. Go to **Settings** → **API Keys**
2. Find the key to revoke
3. Click **Revoke**
4. Confirm deletion

Revoked keys immediately stop working.

## Troubleshooting

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
- Verify the key is correct
- Check for extra whitespace
- Ensure the key hasn't been revoked
- Confirm the user still has access

### 403 Forbidden

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

**Solutions:**
- Use a key from a user with appropriate permissions
- Check if the resource exists and is accessible
- Verify workspace membership

## Related

- [API Overview](/api/overview) - API introduction
- [Errors](/api/errors) - Error handling
- [MCP Authentication](/mcp/authentication) - MCP-specific auth
