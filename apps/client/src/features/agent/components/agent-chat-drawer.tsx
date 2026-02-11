import { Drawer, Group, Text, Title } from "@mantine/core";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  agentChatContextAtom,
  agentChatDrawerAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { useParams } from "react-router-dom";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { AgentChatPanel } from "@/features/agent/components/agent-chat-panel";

export function AgentChatDrawer() {
  const [opened, setOpened] = useAtom(agentChatDrawerAtom);
  const chatContext = useAtomValue(agentChatContextAtom);
  const setChatContext = useSetAtom(agentChatContextAtom);
  const workspace = useAtomValue(workspaceAtom);
  const params = useParams<{
    spaceId?: string;
    spaceSlug?: string;
    pageSlug?: string;
  }>();

  const spaceLookupId =
    chatContext?.spaceId || params.spaceId || params.spaceSlug || "";
  const { data: space } = useSpaceQuery(spaceLookupId);
  const { data: page } = usePageQuery({
    pageId: chatContext?.pageId || params.pageSlug || "",
  });

  const allowChat = workspace?.settings?.agent?.allowAgentChat !== false;
  const contextLabel =
    chatContext?.contextLabel ||
    (page?.title
      ? `Page: ${page.title}`
      : space?.name
        ? `Space: ${space.name}`
        : "Agent Chat");
  const chatContextId = chatContext?.pageId || page?.id;
  const chatSessionId = chatContext?.sessionId;
  const chatProjectId = chatContext?.projectId;

  return (
    <Drawer
      opened={opened}
      onClose={() => {
        setOpened(false);
        setChatContext(null);
      }}
      position="right"
      title={
        <Group justify="space-between" w="100%">
          <Title order={4}>Agent Chat</Title>
          <Text size="xs" c="dimmed">
            {contextLabel}
          </Text>
        </Group>
      }
      size={420}
      padding="md"
      closeOnClickOutside
      closeOnEscape
      lockScroll={false}
      styles={{
        content: {
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {workspace?.id && space?.id ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgentChatPanel
            workspaceId={workspace.id}
            spaceId={space.id}
            pageId={chatContextId}
            projectId={chatProjectId}
            sessionId={chatSessionId}
            contextLabel={contextLabel}
            allowChat={allowChat}
            variant="plain"
          />
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          Select a space to start chatting.
        </Text>
      )}
    </Drawer>
  );
}
