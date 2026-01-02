# Real-time Updates with MCP WebSockets

The MCP (Machine Control Protocol) WebSocket implementation allows for real-time updates in the client application without requiring page refreshes. This documentation explains how to use this feature in your components.

## Architecture Overview

The MCP WebSocket implementation consists of the following components:

1. **MCP Socket Provider**: Establishes and maintains a WebSocket connection to the MCP endpoint. It handles authentication and provides the socket to all components via a Jotai atom.

2. **MCP Event Handlers**: A set of functions that process incoming events based on their resource type and update the application state accordingly (primarily using React Query).

3. **MCP Event Subscription Hook**: A hook that allows components to subscribe to events for specific resources.

## Getting Started

### Step 1: Socket Provider Setup

The `MCPSocketProvider` is already set up in the `UserProvider` component, so any component rendered within your application will have access to the MCP socket.

### Step 2: Using MCP Event Subscriptions in Components

To subscribe to events for a specific resource, use the `useMCPEventSubscription` hook:

```tsx
import { useMCPEventSubscription } from "@/features/websocket/hooks/use-mcp-socket";
import { MCPResourceType } from "@/features/websocket/types/mcp-event.types";

function MyComponent({ resourceId }) {
  // Subscribe to events for a page
  const { isSubscribed } = useMCPEventSubscription(
    MCPResourceType.PAGE,
    resourceId
  );

  // Your component logic here
  return (
    <div>
      {isSubscribed ? "Receiving real-time updates" : "Not subscribed"}
      {/* Component content */}
    </div>
  );
}
```

### Step 3: Handling MCP Events

The global MCP event handler (`useMCPEvents` hook) is already set up to handle common events for all resource types. It will:

- Invalidate appropriate React Query caches when resources are created, updated, or deleted
- Update the page tree when pages are created, updated, moved, or deleted
- Handle comment and attachment updates

If you need custom event handling, you can create your own hook that listens for specific events:

```tsx
import { useAtom } from "jotai";
import { useEffect } from "react";
import { mcpSocketAtom } from "@/features/websocket/atoms/mcp-socket-atom";
import { MCPEvent, MCPResourceType } from "@/features/websocket/types/mcp-event.types";

function useCustomMCPEvents() {
  const [socket] = useAtom(mcpSocketAtom);
  
  useEffect(() => {
    if (!socket) return;
    
    const handleEvent = (event: MCPEvent) => {
      // Custom event handling logic
      if (event.resource === MCPResourceType.PAGE) {
        // Do something with page events
      }
    };
    
    socket.on("mcp:event", handleEvent);
    
    return () => {
      socket.off("mcp:event", handleEvent);
    };
  }, [socket]);
}
```

## Available Resource Types

The following resource types are available for subscription:

- `MCPResourceType.PAGE`: Page events (create, update, delete, move)
- `MCPResourceType.SPACE`: Space events (create, update, delete, permission changes)
- `MCPResourceType.COMMENT`: Comment events (create, update, delete)
- `MCPResourceType.ATTACHMENT`: Attachment events (create, update, delete)
- `MCPResourceType.GROUP`: Group events (create, update, delete, member changes)
- `MCPResourceType.USER`: User events (update)
- `MCPResourceType.WORKSPACE`: Workspace events (update, permission changes)

## Event Types

Events are categorized by the following types:

- `MCPEventType.CREATED`: Resource was created
- `MCPEventType.UPDATED`: Resource was updated
- `MCPEventType.DELETED`: Resource was deleted
- `MCPEventType.MOVED`: Resource was moved (applicable to pages)
- `MCPEventType.PERMISSION_CHANGED`: Resource permissions were changed
- `MCPEventType.PRESENCE`: User presence information (for collaborative editing)

## Example Components

See the `mcp-subscription-example.tsx` file for example components that demonstrate how to use MCP event subscriptions in your components.

## Debugging

When debugging MCP WebSocket issues, check the browser console for connection and event logs. The MCP socket provider logs connection events, and the event handlers log each received event. 