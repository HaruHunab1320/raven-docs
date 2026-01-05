import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
  Badge,
} from "@mantine/core";
import { useAtom } from "jotai";
import {
  agentChatContextAtom,
  agentChatDrawerAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { useMutation } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { Project } from "../types";
import { projectService } from "../services/project-service";
import { useTranslation } from "react-i18next";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";

interface PlaybookWizardModalProps {
  opened: boolean;
  onClose: () => void;
  project: Project;
}

export function PlaybookWizardModal({
  opened,
  onClose,
  project,
}: PlaybookWizardModalProps) {
  const { t } = useTranslation();
  const { data: space } = useSpaceQuery(project.spaceId);
  const [brief, setBrief] = useState(project.description || "");
  const [chatSummary, setChatSummary] = useState<string | null>(null);
  const [chatMissingInfo, setChatMissingInfo] = useState<string[]>([]);
  const [chatReadiness, setChatReadiness] = useState<
    "ready" | "not-ready" | null
  >(null);
  const [chatConfidence, setChatConfidence] = useState<
    "low" | "medium" | "high" | null
  >(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [, setAgentChatOpened] = useAtom(agentChatDrawerAtom);
  const [, setAgentChatContext] = useAtom(agentChatContextAtom);
  const sessionStorageKey = useMemo(
    () => `playbookChatSession:${project.id}`,
    [project.id]
  );

  useEffect(() => {
    if (!opened) return;
    const stored = localStorage.getItem(sessionStorageKey);
    if (stored) {
      setChatSessionId(stored);
    }
  }, [opened, sessionStorageKey]);

  const overviewUrl = useMemo(() => {
    if (!space?.slug || !project.homePageId) return null;
    return buildPageUrl(space.slug, project.homePageId, `${project.name} Overview`);
  }, [space?.slug, project.homePageId, project.name]);

  const draftMutation = useMutation({
    mutationFn: (input: { projectId: string; brief: string }) =>
      projectService.generatePlaybookDraft(input.projectId, input.brief),
    onSuccess: () => {
      notifications.show({
        message: t("Playbook drafts generated"),
        color: "green",
      });
      onClose();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        t("Failed to generate playbook drafts");
      notifications.show({ message, color: "red" });
    },
  });

  const chatDraftMutation = useMutation({
    mutationFn: (input: { projectId: string; pageId?: string; sessionId?: string }) =>
      projectService.generatePlaybookDraftFromChat(
        input.projectId,
        input.pageId,
        input.sessionId
      ),
    onSuccess: () => {
      notifications.show({
        message: t("Playbook drafts generated from agent chat"),
        color: "green",
      });
      onClose();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        t("Failed to generate playbook drafts from agent chat");
      notifications.show({ message, color: "red" });
    },
  });

  const chatSummaryMutation = useMutation({
    mutationFn: (input: { projectId: string; pageId?: string; sessionId?: string }) =>
      projectService.summarizePlaybookChat(
        input.projectId,
        input.pageId,
        input.sessionId
      ),
    onSuccess: (data) => {
      setChatSummary(data.summary || null);
      setChatMissingInfo(data.missingInfo || []);
      setChatReadiness(data.readiness || null);
      setChatConfidence(data.confidence || null);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        t("Failed to summarize agent chat");
      notifications.show({ message, color: "red" });
    },
  });

  const handleGenerate = () => {
    if (!brief.trim()) {
      notifications.show({
        message: t("Add a brief to generate playbook drafts."),
        color: "red",
      });
      return;
    }
    draftMutation.mutate({ projectId: project.id, brief });
  };

  const handleGenerateFromChat = () => {
    chatDraftMutation.mutate({
      projectId: project.id,
      pageId: project.homePageId || undefined,
      sessionId: chatSessionId || undefined,
    });
  };

  const handleSummarizeChat = () => {
    chatSummaryMutation.mutate({
      projectId: project.id,
      pageId: project.homePageId || undefined,
      sessionId: chatSessionId || undefined,
    });
  };

  const handleStartChatSession = () => {
    const sessionId = chatSessionId || crypto.randomUUID();
    setChatSessionId(sessionId);
    localStorage.setItem(sessionStorageKey, sessionId);
    setAgentChatContext({
      spaceId: project.spaceId,
      pageId: project.homePageId || undefined,
      sessionId,
      contextLabel: `Playbook chat: ${project.name}`,
    });
    setAgentChatOpened(true);
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={t("Playbook Wizard")}>
      <Stack gap="md">
        <Title order={4}>{t("1) Project brief")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "Write a clear project brief. We will draft the playbook pages from this."
          )}
        </Text>
        <Textarea
          value={brief}
          onChange={(event) => setBrief(event.currentTarget.value)}
          placeholder={t("Describe goals, scope, constraints, and success criteria...")}
          minRows={6}
        />
        <Text size="sm" c="dimmed">
          {t(
            "Optional: use recent agent chat on this project page to draft the playbook automatically."
          )}
        </Text>

        <Title order={5}>{t("2) Chat summary")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "Summarize the agent chat before generating drafts to confirm the context."
          )}
        </Text>
        <Group gap="xs">
          <Button
            variant="light"
            onClick={handleStartChatSession}
            disabled={!project.homePageId}
          >
            {chatSessionId ? t("Open playbook chat") : t("Start playbook chat")}
          </Button>
          <Button
            variant="default"
            loading={chatSummaryMutation.isPending}
            disabled={!project.homePageId}
            onClick={handleSummarizeChat}
          >
            {t("Summarize agent chat")}
          </Button>
          {chatReadiness ? (
            <Badge color={chatReadiness === "ready" ? "green" : "yellow"}>
              {chatReadiness === "ready"
                ? t("Draft ready")
                : t("Need more detail")}
            </Badge>
          ) : null}
          {chatConfidence ? (
            <Badge color="gray">{t(`${chatConfidence} confidence`)}</Badge>
          ) : null}
        </Group>
        {chatSummary ? (
          <Text size="sm">{chatSummary}</Text>
        ) : (
          <Text size="sm" c="dimmed">
            {t("No chat summary yet.")}
          </Text>
        )}
        {chatMissingInfo.length ? (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t("Open questions")}
            </Text>
            {chatMissingInfo.map((item) => (
              <Text key={item} size="sm" c="dimmed">
                - {item}
              </Text>
            ))}
          </Stack>
        ) : null}

        <Title order={5}>{t("3) Review the playbook pages")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "After drafting, review each playbook page and adjust the details."
          )}
        </Text>

        <Group justify="space-between" align="center">
          <Group gap="xs">
            {overviewUrl && (
              <Button
                variant="light"
                component="a"
                href={overviewUrl}
                onClick={onClose}
              >
                {t("Open overview")}
              </Button>
            )}
          </Group>
          <Group gap="xs">
            <Button
              variant="default"
              loading={chatDraftMutation.isPending}
              disabled={!project.homePageId}
              color={
                chatReadiness === "ready"
                  ? "green"
                  : chatReadiness === "not-ready"
                    ? "yellow"
                    : undefined
              }
              onClick={handleGenerateFromChat}
            >
              {t("Generate from agent chat")}
            </Button>
            <Button loading={draftMutation.isPending} onClick={handleGenerate}>
              {t("Generate from brief")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
