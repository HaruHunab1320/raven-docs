---
title: Rate Limits
sidebar_position: 11
---

# Rate Limits

The API enforces rate limits to ensure fair usage and system stability.

## Limits by Plan

| Plan | Requests/minute | Requests/day | Burst |
|------|-----------------|--------------|-------|
| Free | 60 | 1,000 | 10 |
| Pro | 300 | 10,000 | 50 |
| Enterprise | 1,000 | Unlimited | 100 |

### Burst Limits

Burst allows short spikes above the per-minute limit for up to 10 seconds.

## Rate Limit Headers

Every response includes rate limit information:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1706025600
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per minute |
| `X-RateLimit-Remaining` | Requests left in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |

## Exceeding Limits

When you exceed the rate limit:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Please retry after 45 seconds.",
    "details": {
      "limit": 60,
      "reset_at": "2025-01-22T10:30:00Z"
    }
  }
}
```

The response includes:
- HTTP status `429 Too Many Requests`
- `Retry-After` header with seconds to wait

## Best Practices

### Implement Exponential Backoff

```typescript
async function makeRequest(fn: () => Promise<any>) {
  const maxRetries = 5;
  let delay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        await sleep(waitTime);
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Rate limit retry exhausted');
}
```

### Batch Operations

Instead of many individual requests, use batch endpoints:

```typescript
// Bad: 100 separate requests
for (const page of pages) {
  await client.pages.update({ pageId: page.id, ... });
}

// Good: Single batch request (when available)
await client.pages.batchUpdate({
  updates: pages.map(p => ({ pageId: p.id, ... }))
});
```

### Cache Responses

Cache read-heavy data locally:

```typescript
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function getPage(pageId: string) {
  const cached = cache.get(pageId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const page = await client.pages.get({ pageId });
  cache.set(pageId, { data: page, timestamp: Date.now() });
  return page;
}
```

### Monitor Usage

Track your API usage:

```typescript
let requestCount = 0;
const windowStart = Date.now();

client.on('request', () => {
  requestCount++;
  if (requestCount > 50) {
    console.warn('Approaching rate limit');
  }
});

// Reset counter every minute
setInterval(() => {
  requestCount = 0;
}, 60000);
```

## Endpoint-Specific Limits

Some endpoints have additional limits:

| Endpoint | Additional Limit |
|----------|------------------|
| `/search` | 30 requests/minute |
| `/ai/generate` | 10 requests/minute |
| `/export/space` | 5 requests/minute |

## Increasing Limits

Need higher limits?

1. **Upgrade your plan** - Pro and Enterprise have higher limits
2. **Contact sales** - Enterprise customers can negotiate custom limits
3. **Optimize usage** - Review our best practices above

## Monitoring Dashboard

View your API usage in the dashboard:

1. Go to **Settings** → **API Keys**
2. Click on a key
3. View usage statistics and graphs

## Related

- [Errors](/api/errors) - Error handling
- [API Overview](/api/overview) - API introduction
