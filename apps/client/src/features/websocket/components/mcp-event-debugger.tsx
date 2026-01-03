import React, { useState, useEffect } from "react";
import {
  Badge,
  Box,
  Card,
  Group,
  Stack,
  Text,
  Code,
  Title,
  Accordion,
  ScrollArea,
  Button,
} from "@mantine/core";
import { useAtom } from "jotai";
import { mcpSocketAtom } from "../atoms/mcp-socket-atom";
import { MCPEvent } from "../types/mcp-event.types";
import { IconEye, IconX, IconRefresh } from "@tabler/icons-react";
import { mcpLog } from "../utils/mcp-log";

/**
 * Component to debug MCP events
 * This component displays all incoming MCP events in real-time and can be added to any page
 * for debugging and testing MCP WebSocket connections
 */
export function MCPEventDebugger() {
  const [socket] = useAtom(mcpSocketAtom);
  const [events, setEvents] = useState<MCPEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Set initial connection state
    setConnected(socket.connected);

    // Connection event handlers
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    // Event handler for MCP events
    const handleEvent = (event: MCPEvent) => {
      mcpLog("[MCP-DEBUG] Event received:", event);
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50 events
    };

    // Register event listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("mcp:event", handleEvent);

    // Cleanup function
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("mcp:event", handleEvent);
    };
  }, [socket]);

  // Format timestamp to human-readable time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Function to get color based on event type
  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "created":
        return "green";
      case "updated":
        return "blue";
      case "deleted":
        return "red";
      case "moved":
        return "orange";
      case "permission_changed":
        return "purple";
      case "presence":
        return "cyan";
      default:
        return "gray";
    }
  };

  // Clear all events
  const clearEvents = () => setEvents([]);

  if (!expanded) {
    return (
      <Button
        size="xs"
        variant="light"
        color="gray"
        style={{ position: "fixed", bottom: 10, right: 10, zIndex: 1000 }}
        onClick={() => setExpanded(true)}
        leftSection={<IconEye size={14} />}
      >
        Show MCP Events
      </Button>
    );
  }

  return (
    <Card
      withBorder
      shadow="sm"
      style={{
        position: "fixed",
        bottom: 10,
        right: 10,
        zIndex: 1000,
        maxWidth: 500,
        maxHeight: "80vh",
        opacity: 0.95,
      }}
    >
      <Card.Section withBorder p="xs">
        <Group justify="space-between">
          <Group>
            <Title order={5}>MCP Event Debugger</Title>
            <Badge color={connected ? "green" : "red"} size="sm">
              {connected ? "Connected" : "Disconnected"}
            </Badge>
          </Group>
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={clearEvents}
              title="Clear events"
            >
              <IconRefresh size={14} />
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => setExpanded(false)}
              title="Minimize"
            >
              <IconX size={14} />
            </Button>
          </Group>
        </Group>
      </Card.Section>

      <ScrollArea h={400} offsetScrollbars>
        {events.length === 0 ? (
          <Box p="md">
            <Text color="dimmed" size="sm" ta="center">
              No events received yet. Actions that trigger MCP events will
              appear here.
            </Text>
          </Box>
        ) : (
          <Accordion>
            {events.map((event, index) => (
              <Accordion.Item key={index} value={`event-${index}`}>
                <Accordion.Control>
                  <Group>
                    <Badge color={getEventColor(event.type)} size="sm">
                      {event.type}
                    </Badge>
                    <Text size="sm" fw={500}>
                      {event.resource}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatTime(event.timestamp)}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Group>
                      <Text size="xs" fw={500}>
                        Operation:
                      </Text>
                      <Badge size="xs" variant="outline">
                        {event.operation}
                      </Badge>
                    </Group>
                    <Box>
                      <Text size="xs" fw={500}>
                        Resource ID:
                      </Text>
                      <Code block>{event.resourceId}</Code>
                    </Box>
                    {event.spaceId && (
                      <Box>
                        <Text size="xs" fw={500}>
                          Space ID:
                        </Text>
                        <Code block>{event.spaceId}</Code>
                      </Box>
                    )}
                    <Box>
                      <Text size="xs" fw={500}>
                        Workspace ID:
                      </Text>
                      <Code block>{event.workspaceId}</Code>
                    </Box>
                    <Box>
                      <Text size="xs" fw={500}>
                        User ID:
                      </Text>
                      <Code block>{event.userId}</Code>
                    </Box>
                    {event.data && (
                      <Box>
                        <Text size="xs" fw={500}>
                          Data:
                        </Text>
                        <Code block>{JSON.stringify(event.data, null, 2)}</Code>
                      </Box>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </ScrollArea>
    </Card>
  );
}
