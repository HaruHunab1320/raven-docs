import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import {
  IconEdit,
  IconPaperclip,
  IconPlayerStop,
  IconRefresh,
  IconSend,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { TextStreamChatTransport, generateId } from "ai";
import classes from "./agent-chat-panel.module.css";
import {
  getAgentChatContext,
} from "@/features/agent/services/agent-service";
import { AgentChatContextResponse } from "@/features/agent/types/agent.types";

marked.use({
  gfm: true,
  breaks: true,
  async: false,
});

interface AgentChatPanelProps {
  workspaceId: string;
  spaceId: string;
  pageId?: string;
  projectId?: string;
  sessionId?: string;
  contextLabel?: string;
  allowChat?: boolean;
  variant?: "card" | "plain";
}

export function AgentChatPanel({
  workspaceId,
  spaceId,
  pageId,
  projectId,
  sessionId,
  contextLabel,
  allowChat = true,
  variant = "card",
}: AgentChatPanelProps) {
  const [message, setMessage] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(30);
  const [contextSummary, setContextSummary] =
    useState<AgentChatContextResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoApproveRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    autoApproveRef.current = autoApprove;
  }, [autoApprove]);

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
        limit: historyLimit,
      }),
    enabled: !!workspaceId && !!spaceId,
  });
  const contextQuery = useQuery({
    queryKey: ["agent-chat-context", workspaceId, spaceId, pageId, projectId, sessionId],
    queryFn: () =>
      getAgentChatContext({
        spaceId,
        pageId,
        projectId,
        sessionId,
      }),
    enabled: !!workspaceId && !!spaceId,
  });
  const contextMutation = useMutation({
    mutationFn: (messageText: string) =>
      getAgentChatContext({
        spaceId,
        pageId,
        projectId,
        sessionId,
        message: messageText,
      }),
    onSuccess: (data) => {
      setContextSummary(data);
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const stored = localStorage.getItem(`agentChatAutoApprove:${workspaceId}`);
    setAutoApprove(stored === "true");
  }, [workspaceId]);

  const clearHistoryMutation = useMutation({
    mutationFn: () =>
      agentMemoryService.delete({
        workspaceId,
        spaceId,
        tags: [chatTag],
      }),
    onSuccess: () => {
      setMessages([]);
      queryClient.invalidateQueries({ queryKey });
    },
  });
  const clearAllMutation = useMutation({
    mutationFn: () =>
      agentMemoryService.delete({
        workspaceId,
      }),
    onSuccess: () => {
      setMessages([]);
      setHistoryLimit(30);
      queryClient.invalidateQueries();
    },
  });

  const chatIdFallback = useRef(generateId());
  const chatId = useMemo(() => {
    if (workspaceId && spaceId) {
      return [
        "agent-chat",
        workspaceId,
        spaceId,
        sessionId || pageId || "global",
      ].join(":");
    }
    return chatIdFallback.current;
  }, [workspaceId, spaceId, sessionId, pageId]);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/agent/chat-ui",
        body: () => ({
          spaceId,
          pageId,
          projectId,
          sessionId,
          autoApprove: autoApproveRef.current,
        }),
      }),
    [spaceId, pageId, projectId, sessionId],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error: chatError,
    stop,
    regenerate,
  } = useChat({
    id: chatId,
    transport,
    experimental_throttle: 50,
  });

  const seedMessages = useMemo(() => {
    const items = chatQuery.data || [];
    return items
      .slice()
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      })
      .map((item) => {
        const text =
          typeof item.content === "object" &&
          item.content !== null &&
          "text" in item.content
            ? (item.content as { text?: string }).text || ""
            : typeof item.content === "string"
              ? item.content
              : item.summary || "";
        return {
          id: item.id || generateId(),
          role: item.tags?.includes("assistant") ? "assistant" : "user",
          parts: [{ type: "text", text }],
        } as UIMessage;
      });
  }, [chatQuery.data]);

  useEffect(() => {
    if (!seedMessages.length) return;
    setMessages((current) => {
      const existing = new Map(current.map((item) => [item.id, item]));
      const merged = seedMessages.map((item) => existing.get(item.id) || item);
      const mergedIds = new Set(merged.map((item) => item.id));
      current.forEach((item) => {
        if (!mergedIds.has(item.id)) {
          merged.push(item);
        }
      });
      return merged;
    });
  }, [seedMessages, setMessages]);

  const renderedMessages = useMemo(() => {
    const getText = (msg: UIMessage) =>
      msg.parts
        .map((part) => {
          if (part.type === "text" || part.type === "reasoning") {
            return part.text || "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();

    const stripMetaLines = (text: string) =>
      text
        .split("\n")
        .filter(
          (line) =>
            !line.match(/^\s*Draft readiness:/i) &&
            !line.match(/^\s*Confidence:/i),
        )
        .join("\n")
        .trim();

    return messages.map((msg) => {
      const rawText = getText(msg);
      return {
        id: msg.id,
        role: msg.role,
        text: msg.role === "assistant" ? stripMetaLines(rawText) : rawText,
        parts: msg.parts,
      };
    });
  }, [messages]);

  const isBusy = status === "streaming" || status === "submitted";
  const canRegenerate =
    renderedMessages.length > 0 && (status === "ready" || status === "error");
  const hasMoreHistory =
    (chatQuery.data?.length || 0) >= historyLimit && historyLimit < 200;
  const activeContext = contextSummary || contextQuery.data;
  const contextChips = useMemo(() => {
    if (activeContext?.sources?.length) {
      return activeContext.sources.filter(
        (source) => source.count > 0 && source.key !== "chat",
      );
    }
    return [];
  }, [activeContext]);
  const canSend =
    (!!message.trim() || attachedFiles.length > 0) &&
    allowChat &&
    !!spaceId &&
    !isBusy;

  const handleSend = async () => {
    if (!canSend) return;
    if (editingMessageId) {
      setMessages((current) =>
        current.map((msg) => {
          if (msg.id !== editingMessageId) return msg;
          return {
            ...msg,
            parts: [{ type: "text", text: message.trim() }],
          };
        }),
      );
      setEditingMessageId(null);
      setMessage("");
      return;
    }
    const nextMessage = message.trim();
    setMessage("");
    const files = attachedFiles.length
      ? attachedFiles.map((file) => ({
          type: "file" as const,
          mediaType: file.type,
          url: URL.createObjectURL(file),
        }))
      : undefined;
    setAttachedFiles([]);
    if (nextMessage) {
      contextMutation.mutate(nextMessage);
    }
    await sendMessage(
      { text: nextMessage, files },
      {
        body: {
          workspaceId,
          spaceId,
          pageId,
          projectId,
          sessionId,
          autoApprove: autoApproveRef.current,
        },
      },
    );
  };

  useEffect(() => {
    if (!bottomRef.current) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, [messages.length, status]);

  const renderMessageBody = (item: (typeof renderedMessages)[number]) => {
    const textContent = item.text || "";
    const fileParts =
      item.parts?.filter((part) => part.type === "file") || [];

    return (
      <Stack gap="xs">
        {textContent ? (
          item.role === "assistant" ? (
            <TypographyStylesProvider className={classes.markdown}>
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(textContent) as string),
                }}
              />
            </TypographyStylesProvider>
          ) : (
            <Text size="sm">{textContent}</Text>
          )
        ) : null}
        {fileParts.length ? (
          <Group gap="xs" wrap="wrap">
            {fileParts.map((part, index) => {
              const filePart = part as {
                url?: string;
                filename?: string;
                mediaType?: string;
              };
              if (
                filePart.mediaType?.startsWith("image/") &&
                filePart.url
              ) {
                return (
                  <img
                    key={`${item.id}-file-${index}`}
                    src={filePart.url}
                    alt={filePart.filename || "attachment"}
                    className={classes.messageImage}
                  />
                );
              }
              if (filePart.url) {
                return (
                  <a
                    key={`${item.id}-file-${index}`}
                    className={classes.messageAttachmentLink}
                    href={filePart.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {filePart.filename || "Attachment"}
                  </a>
                );
              }
              return (
                <Text
                  key={`${item.id}-file-${index}`}
                  size="xs"
                  className={classes.messageAttachment}
                >
                  {filePart.filename || "Attachment"}
                </Text>
              );
            })}
          </Group>
        ) : null}
      </Stack>
    );
  };

  const content = (
    <Box className={classes.chatContainer}>
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
                  String(next),
                );
              }
            }}
          />
        </Group>
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={14} />}
              disabled={!canRegenerate}
              onClick={() => regenerate()}
            >
              Regenerate
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconPlayerStop size={14} />}
              disabled={!isBusy}
              onClick={() => stop()}
            >
              Stop
            </Button>
          </Group>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => clearHistoryMutation.mutate()}
            disabled={!workspaceId || !spaceId}
            loading={clearHistoryMutation.isPending}
          >
            Clear chat history
          </Button>
        </Group>
      </Stack>
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          Context used:
        </Text>
        {contextChips.length ? (
          contextChips.map((chip, index) => (
            <Badge key={chip.key || `chip-${index}`} size="xs" variant="light">
              {chip.label} {chip.count}
            </Badge>
          ))
        ) : (
          <Text size="xs" c="dimmed">
            No context yet.
          </Text>
        )}
        <Popover width={360} position="bottom-start" shadow="md" withinPortal>
          <Popover.Target>
            <Button size="xs" variant="subtle">
              Details
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <ScrollArea h={280} offsetScrollbars>
              <Stack gap="xs" className={classes.contextDropdown}>
                {contextChips.length ? (
                  contextChips.map((source, sourceIndex) => (
                    <Stack key={source.key || `source-${sourceIndex}`} gap={4}>
                      <Group justify="space-between" align="center">
                        <Text size="xs" fw={600}>
                          {source.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {source.count}
                        </Text>
                      </Group>
                      <Stack gap={4}>
                        {source.items.map((item, itemIndex) => (
                          <TypographyStylesProvider
                            key={item.id || `item-${sourceIndex}-${itemIndex}`}
                            className={`${classes.markdown} ${classes.contextItemText}`}
                          >
                            <div
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(
                                  marked.parse(item.summary || "memory") as string,
                                ),
                              }}
                            />
                          </TypographyStylesProvider>
                        ))}
                      </Stack>
                    </Stack>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    No context available yet.
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Box className={classes.chatShell}>
        <div
          className={classes.chatList}
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          {hasMoreHistory ? (
            <Group justify="center">
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setHistoryLimit((value) => value + 30)}
              >
                Load earlier messages
              </Button>
            </Group>
          ) : null}
          {renderedMessages.length ? (
            renderedMessages.map((item, index) => {
              const isLast = index === renderedMessages.length - 1;
              return (
                <div
                  key={item.id}
                  className={`${classes.message} ${
                    item.role === "assistant"
                      ? classes.assistantMessage
                      : classes.userMessage
                  }`}
                >
                  <div className={classes.messageHeader}>
                    <Group gap="xs">
                      {item.role === "user" ? (
                        <Text size="xs" c="dimmed">
                          You
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Raven
                        </Text>
                      )}
                      {isLast && status === "streaming" && item.role === "assistant" ? (
                        <Text size="xs" c="dimmed">
                          Streaming...
                        </Text>
                      ) : null}
                    </Group>
                    <Group gap="xs">
                      {item.role === "user" ? (
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => {
                            setEditingMessageId(item.id);
                            setMessage(item.text || "");
                            textareaRef.current?.focus();
                          }}
                          aria-label="Edit message"
                        >
                          <IconEdit size={12} />
                        </ActionIcon>
                      ) : null}
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() =>
                          setMessages((current) =>
                            current.filter((msg) => msg.id !== item.id),
                          )
                        }
                        aria-label="Delete message"
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </div>
                  {renderMessageBody(item)}
                </div>
              );
            })
          ) : (
            <Text size="sm" c="dimmed">
              No messages yet.
            </Text>
          )}
          {isBusy ? (
            <div className={`${classes.message} ${classes.assistantMessage} ${classes.typingMessage}`}>
              <Group gap="xs" align="center">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  {status === "submitted" ? "Raven is thinking..." : "Raven is responding..."}
                </Text>
              </Group>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
        {contextLabel ? (
          <Group className={classes.toolbarRow}>
            <Badge size="sm" variant="light" color="gray">
              {contextLabel}
            </Badge>
          </Group>
        ) : null}
        {chatError ? (
          <Group className={classes.toolbarRow} justify="space-between">
            <Text size="xs" c="red">
              Something went wrong. Please try again.
            </Text>
            <Button size="xs" variant="light" onClick={() => regenerate()}>
              Retry
            </Button>
          </Group>
        ) : null}
        {!allowChat && (
          <Group className={classes.toolbarRow}>
            <Text size="xs" c="dimmed">
              Agent chat is disabled in workspace settings.
            </Text>
          </Group>
        )}
        {attachedFiles.length ? (
          <Group className={classes.attachmentsRow} gap="xs">
            {attachedFiles.map((file, index) => (
              <Group key={`${file.name}-${index}`} gap={6}>
                <Text size="xs" className={classes.attachmentPill}>
                  {file.name}
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() =>
                    setAttachedFiles((current) =>
                      current.filter((_, fileIndex) => fileIndex !== index),
                    )
                  }
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            ))}
          </Group>
        ) : null}
        {editingMessageId ? (
          <Group className={classes.editingRow} gap="xs">
            <Text size="xs" c="dimmed">
              Editing message
            </Text>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                setEditingMessageId(null);
                setMessage("");
              }}
            >
              Cancel
            </Button>
          </Group>
        ) : null}
        <div className={classes.inputRow}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const nextFiles = Array.from(event.currentTarget.files || []);
              setAttachedFiles(nextFiles);
            }}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => fileInputRef.current?.click()}
            disabled={!allowChat || isBusy}
            aria-label="Attach files"
          >
            <IconPaperclip size={18} />
          </ActionIcon>
          <Textarea
            ref={textareaRef}
            className={classes.inputField}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask the agent..."
            minRows={2}
            disabled={!allowChat || isBusy}
          />
          <ActionIcon
            variant="filled"
            color="blue"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Send message"
          >
            <IconSend size={18} />
          </ActionIcon>
        </div>
        <Stack gap="xs" className={classes.debugToggle}>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => setShowDebug((value) => !value)}
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </Button>
          <Collapse in={showDebug}>
            <Stack gap="xs" className={classes.debugPanel}>
              <Text size="xs" c="dimmed">
                Debug tools
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    setMessages([]);
                    setHistoryLimit(30);
                  }}
                >
                  Reset chat context
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  loading={clearAllMutation.isPending}
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Delete all memories for this workspace? This cannot be undone.",
                    );
                    if (confirmed) {
                      clearAllMutation.mutate();
                    }
                  }}
                >
                  Delete all memories
                </Button>
              </Group>
            </Stack>
          </Collapse>
        </Stack>
      </Box>
    </Box>
  );

  return variant === "plain" ? (
    content
  ) : (
    <Card withBorder radius="md" p="md">
      {content}
    </Card>
  );
}
