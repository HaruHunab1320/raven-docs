import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Accordion,
} from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import {
  confirmApproval,
  rejectApproval,
  sendAgentChat,
  updateAgentSettings,
} from "@/features/agent/services/agent-service";
import { queryClient } from "@/main";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import useUserRole from "@/hooks/use-user-role";
import { notifications } from "@mantine/notifications";

interface AgentChatPanelProps {
  workspaceId: string;
  spaceId: string;
  pageId?: string;
  sessionId?: string;
  contextLabel?: string;
  allowChat?: boolean;
  variant?: "card" | "plain";
}

export function AgentChatPanel({
  workspaceId,
  spaceId,
  pageId,
  sessionId,
  contextLabel,
  allowChat = true,
  variant = "card",
}: AgentChatPanelProps) {
  const [message, setMessage] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ token: string; method: string; params?: any }>
  >([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const workspace = useAtomValue(workspaceAtom);
  const { isAdmin } = useUserRole();
  const chatTag = sessionId
    ? `agent-chat-session:${sessionId}`
    : pageId
      ? `agent-chat-page:${pageId}`
      : "agent-chat";
  const queryKey = ["agent-chat", workspaceId, spaceId, chatTag];

  const chatQuery = useQuery({
    queryKey,
    queryFn: () =>
      agentMemoryService.query({
        workspaceId,
        spaceId,
        tags: [chatTag],
        limit: 30,
      }),
    enabled: !!workspaceId && !!spaceId,
  });

  useEffect(() => {
    if (!workspaceId) return;
    const stored = localStorage.getItem(`agentChatAutoApprove:${workspaceId}`);
    setAutoApprove(stored === "true");
  }, [workspaceId]);

  const mutation = useMutation({
    mutationFn: () =>
      sendAgentChat({ spaceId, message, pageId, sessionId, autoApprove }),
    onSuccess: (data) => {
      setMessage("");
      if (data?.approvalItems?.length) {
        setPendingApprovals((prev) => {
          const existing = new Map(prev.map((item) => [item.token, item]));
          for (const item of data.approvalItems || []) {
            existing.set(item.token, item);
          }
          return Array.from(existing.values());
        });
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleApprove = async (token: string) => {
    setApprovalLoading(token);
    try {
      await confirmApproval(token);
      setPendingApprovals((prev) => prev.filter((item) => item.token !== token));
      notifications.show({ message: "Approval applied", color: "green" });
    } catch {
      notifications.show({ message: "Approval failed", color: "red" });
    } finally {
      setApprovalLoading(null);
    }
  };

  const handleReject = async (token: string) => {
    setApprovalLoading(token);
    try {
      await rejectApproval(token);
      setPendingApprovals((prev) => prev.filter((item) => item.token !== token));
      setMessage("Additional context: ");
      textareaRef.current?.focus();
      notifications.show({ message: "Approval rejected", color: "yellow" });
    } catch {
      notifications.show({ message: "Reject failed", color: "red" });
    } finally {
      setApprovalLoading(null);
    }
  };

  const chatDraftLimit =
    workspace?.settings?.agent?.chatDraftLimit ??
    workspace?.settings?.agentSettings?.chatDraftLimit ??
    300;
  const increaseLimitTarget = Math.min(chatDraftLimit + 100, 2000);

  const updateLimitMutation = useMutation({
    mutationFn: () =>
      updateAgentSettings({
        chatDraftLimit: increaseLimitTarget,
      }),
    onSuccess: () => {
      notifications.show({
        message: "Chat draft limit updated",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        message: "Failed to update chat draft limit",
        color: "red",
      });
    },
  });

  const messages = useMemo(() => {
    const items = chatQuery.data || [];
    return items
      .slice()
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      })
      .map((item) => ({
        id: item.id,
        role: item.tags?.includes("assistant") ? "assistant" : "user",
        text:
          typeof item.content === "object" &&
          item.content !== null &&
          "text" in item.content
            ? (item.content as { text?: string }).text || ""
            : typeof item.content === "string"
              ? item.content
              : item.summary || "",
      }));
  }, [chatQuery.data]);

  const parsedMessages = useMemo(() => {
    return messages.map((message) => {
      if (message.role !== "assistant") {
        return { ...message };
      }

      const readinessMatch = message.text.match(
        /Draft readiness:\s*(ready|not-ready)/i
      );
      const confidenceMatch = message.text.match(
        /Confidence:\s*(high|medium|low)/i
      );

      const cleanedText = message.text
        .split("\n")
        .filter(
          (line) =>
            !line.match(/^\s*Draft readiness:/i) &&
            !line.match(/^\s*Confidence:/i)
        )
        .join("\n")
        .trim();

      return {
        ...message,
        text: cleanedText,
        readiness: readinessMatch?.[1]?.toLowerCase() as
          | "ready"
          | "not-ready"
          | undefined,
        confidence: confidenceMatch?.[1]?.toLowerCase() as
          | "low"
          | "medium"
          | "high"
          | undefined,
      };
    });
  }, [messages]);

  const isSessionLimitReached =
    !!sessionId && messages.length >= chatDraftLimit;

  const content = (
    <Stack gap="sm">
      {variant === "card" ? <Title order={4}>Agent Chat</Title> : null}
      <Group justify="space-between" align="center">
        <Switch
          label="Auto-approve tool actions"
          checked={autoApprove}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setAutoApprove(next);
            if (workspaceId) {
              localStorage.setItem(
                `agentChatAutoApprove:${workspaceId}`,
                String(next)
              );
            }
          }}
        />
        <Text size="xs" c="dimmed">
          {autoApprove ? "Auto-approve enabled" : "Approval required"}
        </Text>
      </Group>
      {pendingApprovals.length ? (
        <Stack gap={6}>
          {pendingApprovals.map((approval) => (
            <Group key={approval.token} justify="space-between" align="center">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="sm" c="dimmed">
                  Approval required for {approval.method}
                </Text>
                {approval.params ? (
                  <Accordion variant="contained" radius="sm">
                    <Accordion.Item value={`approval-${approval.token}`}>
                      <Accordion.Control>
                        <Text size="xs" c="dimmed">
                          Show details
                        </Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text size="xs" c="dimmed">
                          {JSON.stringify(approval.params, null, 2)}
                        </Text>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                ) : null}
              </Stack>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => handleReject(approval.token)}
                  loading={approvalLoading === approval.token}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={() => handleApprove(approval.token)}
                  loading={approvalLoading === approval.token}
                >
                  Approve
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      ) : null}
      {isSessionLimitReached ? (
        <Group justify="space-between" align="center">
          <Text size="sm" c="orange">
            This playbook chat session reached the draft limit ({chatDraftLimit}).
          </Text>
          <Button
            size="xs"
            variant="light"
            onClick={() => updateLimitMutation.mutate()}
            disabled={!isAdmin || updateLimitMutation.isPending}
            loading={updateLimitMutation.isPending}
          >
            Increase limit
          </Button>
        </Group>
      ) : null}
      <Stack gap="xs">
        {parsedMessages.length ? (
          parsedMessages.map((item) => (
            <Group
              key={item.id}
              justify={item.role === "user" ? "flex-end" : "flex-start"}
            >
              <Stack gap={4} align={item.role === "user" ? "flex-end" : "flex-start"}>
                <Text
                  size="sm"
                  style={{
                    maxWidth: "70%",
                    padding: "8px 12px",
                    borderRadius: 12,
                    background:
                      item.role === "user"
                        ? "var(--mantine-color-blue-light)"
                        : "var(--mantine-color-gray-light)",
                  }}
                >
                  {item.text}
                </Text>
                {item.role === "assistant" && (item.readiness || item.confidence) ? (
                  <Group gap={6} wrap="wrap">
                    {item.readiness ? (
                      <Badge size="xs" color={item.readiness === "ready" ? "green" : "yellow"}>
                        Draft {item.readiness === "ready" ? "ready" : "not ready"}
                      </Badge>
                    ) : null}
                    {item.confidence ? (
                      <Badge size="xs" color="gray">
                        {item.confidence} confidence
                      </Badge>
                    ) : null}
                  </Group>
                ) : null}
              </Stack>
            </Group>
          ))
      ) : (
        <Text size="sm" c="dimmed">
          No messages yet.
        </Text>
      )}
    </Stack>
    {contextLabel ? (
      <Group>
        <Badge size="sm" variant="light" color="gray">
          {contextLabel}
        </Badge>
      </Group>
    ) : null}
    <Textarea
      ref={textareaRef}
      value={message}
      onChange={(event) => setMessage(event.currentTarget.value)}
        placeholder="Ask the agent..."
        minRows={2}
        disabled={!allowChat}
      />
      <Group justify="flex-end">
        <Button
          onClick={() => mutation.mutate()}
          disabled={!message.trim() || !allowChat}
          loading={mutation.isPending}
        >
          Send
        </Button>
      </Group>
      {!allowChat && (
        <Text size="xs" c="dimmed">
          Agent chat is disabled in workspace settings.
        </Text>
      )}
    </Stack>
  );

  return variant === "plain" ? (
    content
  ) : (
    <Card withBorder radius="md" p="md">
      {content}
    </Card>
  );
}
