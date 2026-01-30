---
title: Errors
sidebar_position: 10
---

# Error Handling

The API uses standard HTTP status codes and returns detailed error information.

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {
      "field": "title",
      "reason": "required"
    }
  }
}
```

## HTTP Status Codes

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Invalid or missing API key |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Resource already exists |
| `422` | Unprocessable Entity - Validation error |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Something went wrong |

## Error Codes

### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | API key is invalid or expired |
| `FORBIDDEN` | 403 | User lacks permission for this action |
| `TOKEN_EXPIRED` | 401 | OAuth token has expired |

### Validation Errors

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 422 | Request body failed validation |
| `INVALID_PARAMETER` | 400 | Query parameter is invalid |
| `MISSING_REQUIRED` | 400 | Required field is missing |

### Resource Errors

| Code | HTTP | Description |
|------|------|-------------|
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `ALREADY_EXISTS` | 409 | Resource with same identifier exists |
| `DELETED` | 410 | Resource has been deleted |

### Rate Limiting

| Code | HTTP | Description |
|------|------|-------------|
| `RATE_LIMITED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 429 | Daily quota exceeded |

### Server Errors

| Code | HTTP | Description |
|------|------|-------------|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## Handling Errors

### TypeScript SDK

```typescript
import { RavenDocs, RavenDocsError } from '@raven-docs/sdk';

const client = new RavenDocs({ apiKey: '...' });

try {
  const page = await client.pages.get({ pageId: 'invalid' });
} catch (error) {
  if (error instanceof RavenDocsError) {
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Status:', error.status);

    if (error.code === 'NOT_FOUND') {
      // Handle missing page
    } else if (error.code === 'FORBIDDEN') {
      // Handle permission error
    }
  }
}
```

### REST API

```bash
response=$(curl -s -w "\n%{http_code}" \
  http://localhost:3000/api/pages/invalid \
  -H "Authorization: Bearer $API_KEY")

status=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$status" != "200" ]; then
  echo "Error: $(echo $body | jq -r '.error.message')"
fi
```

## Retry Strategy

For transient errors, implement exponential backoff:

```typescript
async function fetchWithRetry(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 || error.status >= 500) {
        // Retry with exponential backoff
        const delay = Math.pow(2, i) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Retry Headers

Rate limit responses include helpful headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Requests left in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait before retrying |

## Debugging

### Enable Verbose Logging

```typescript
const client = new RavenDocs({
  apiKey: '...',
  debug: true, // Logs all requests and responses
});
```

### Request IDs

Every response includes a request ID for support:

```
X-Request-Id: req_abc123xyz
```

Include this when contacting support.

## Related

- [API Overview](/api/overview) - API introduction
- [Rate Limits](/api/rate-limits) - Usage limits
