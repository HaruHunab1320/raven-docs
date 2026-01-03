import React, { useState, useEffect } from "react";
import { Badge, Card, Group, Stack, Text, Button } from "@mantine/core";
import { useAtom } from "jotai";
import { mcpSocketAtom } from "../atoms/mcp-socket-atom";
import {
  MCPEvent,
  MCPEventType,
  MCPResourceType,
  MCPOperationType,
} from "../types/mcp-event.types";
import { mcpError, mcpLog } from "../utils/mcp-log";
import {
  IconRefresh,
  IconWifi,
  IconWifiOff,
  IconSend,
} from "@tabler/icons-react";

/**
 * Component to display MCP WebSocket connection status and last received event
 * Very useful for debugging WebSocket connections
 */
export const MCPEventIndicator: React.FC = () => {
  const [socket] = useAtom(mcpSocketAtom);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<MCPEvent | null>(null);
  const [eventCount, setEventCount] = useState<number>(0);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);

  // Track connection state
  useEffect(() => {
    if (!socket) return;

    mcpLog("MCPEventIndicator: Setting up listeners");

    const handleConnect = () => {
      mcpLog("MCPEventIndicator: Socket connected");
      setConnected(true);
    };

    const handleDisconnect = () => {
      mcpLog("MCPEventIndicator: Socket disconnected");
      setConnected(false);
    };

    const handleEvent = (event: MCPEvent) => {
      mcpLog("MCPEventIndicator: Event received", event);
      setLastEvent(event);
      setEventCount((prev) => prev + 1);

      // Flash effect
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 500);
    };

    const handleSubscribed = (data: {
      resourceType: MCPResourceType;
      resourceId: string;
    }) => {
      mcpLog("MCPEventIndicator: Subscription added", data);
      const subKey = `${data.resourceType}:${data.resourceId}`;
      setSubscriptions((prev) => [...prev, subKey]);
    };

    // Socket event listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("mcp:event", handleEvent);
    socket.on("mcp:subscribed", handleSubscribed);

    // Initial connection state
    setConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("mcp:event", handleEvent);
      socket.off("mcp:subscribed", handleSubscribed);
    };
  }, [socket]);

  const formatEvent = (event: MCPEvent | null) => {
    if (!event) return "No events received";
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    return `${event.type}.${event.resource} - ${timestamp}`;
  };

  const handleSubscribeToWorkspace = () => {
    if (!socket || !connected) return;

    // You would get these IDs from your app state in a real implementation
    const workspaceId = prompt("Enter workspace ID to subscribe to:", "");
    if (!workspaceId) return;

    socket.emit("mcp:subscribe", {
      resourceType: MCPResourceType.WORKSPACE,
      resourceId: workspaceId,
    });
  };

  const sendTestEvent = () => {
    if (!socket || !connected) {
      alert("Socket not connected. Cannot send test event.");
      return;
    }

    try {
      mcpLog(
        "Sending test event directly to server to debug real-time updates"
      );

      // Create a test event
      const testEvent: MCPEvent = {
        type: MCPEventType.UPDATED,
        resource: MCPResourceType.WORKSPACE,
        operation: MCPOperationType.UPDATE,
        resourceId: "test-resource-id",
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        workspaceId: "test-workspace-id",
        data: {
          message: "This is a test event from client",
          timestamp: Date.now(),
        },
      };

      // Send direct event to socket server
      socket.emit("mcp:test-event", testEvent);

      // Flash to indicate event was sent
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 500);

      mcpLog("Test event sent:", testEvent);
    } catch (error) {
      mcpError("Error sending test event:", error);
      alert("Failed to send test event: " + (error as Error).message);
    }
  };

  return (
    <Card
      withBorder
      p="xs"
      style={{
        position: "fixed",
        bottom: 10,
        right: 10,
        zIndex: 1000,
        maxWidth: 300,
        backgroundColor: isFlashing ? "rgba(0, 255, 0, 0.1)" : undefined,
        transition: "background-color 0.2s ease-in-out",
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            {connected ? (
              <IconWifi size={16} color="green" />
            ) : (
              <IconWifiOff size={16} color="red" />
            )}
            <Text size="sm" fw={500}>
              MCP WebSocket
            </Text>
          </Group>
          <Badge color={connected ? "green" : "red"} size="sm">
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </Group>

        <Text size="xs" color="dimmed">
          Events: {eventCount}
        </Text>

        {lastEvent && (
          <Group gap="xs" wrap="nowrap">
            <IconRefresh size={14} />
            <Text size="xs" truncate>
              {formatEvent(lastEvent)}
            </Text>
          </Group>
        )}

        {subscriptions.length > 0 && (
          <Stack gap={0}>
            <Text size="xs" fw={500}>
              Subscriptions:
            </Text>
            {subscriptions.map((sub, i) => (
              <Text key={i} size="xs" color="dimmed">
                {sub}
              </Text>
            ))}
          </Stack>
        )}

        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            onClick={handleSubscribeToWorkspace}
            disabled={!connected}
          >
            Subscribe
          </Button>

          <Button
            size="xs"
            variant="filled"
            color="red"
            leftSection={<IconSend size={14} />}
            onClick={sendTestEvent}
            disabled={!connected}
          >
            Test Event
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
