import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { getOrCreateJournalPage } from "@/features/gtd/utils/journal";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { getPageById, updatePage } from "@/features/page/services/page-service";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";

function formatEntryHeading(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatEntryDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildEntryDoc(content: string) {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: formatEntryHeading() }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: content }],
      },
    ],
  };
}

function appendEntryToDoc(rawContent: unknown, entry: string) {
  let doc: any;
  if (rawContent) {
    if (typeof rawContent === "string") {
      try {
        doc = JSON.parse(rawContent);
      } catch {
        doc = buildEntryDoc(rawContent);
      }
    } else if (typeof rawContent === "object") {
      doc = rawContent;
    }
  }

  if (!doc) {
    doc = { type: "doc", content: [] };
  }

  if (!Array.isArray(doc.content)) {
    doc.content = [];
  }

  const entryDoc = buildEntryDoc(entry);
  doc.content = [...doc.content, ...entryDoc.content];
  return JSON.stringify(doc);
}

export function JournalPage() {
  const { t } = useTranslation();
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { data: space } = useSpaceQuery(spaceId || "");
  const [workspace] = useAtom(workspaceAtom);
  const [entry, setEntry] = useState("");

  const journalQuery = useQuery({
    queryKey: ["journal-page", spaceId],
    queryFn: async () => {
      if (!spaceId) return null;
      const page = await getOrCreateJournalPage({ spaceId, date: new Date() });
      return page;
    },
    enabled: !!spaceId,
  });

  const journalUrl = useMemo(() => {
    if (!space?.slug || !journalQuery.data) return "";
    return buildPageUrl(
      space.slug,
      journalQuery.data.slugId,
      journalQuery.data.title || "Journal",
    );
  }, [journalQuery.data, space?.slug]);

  const saveEntryMutation = useMutation({
    mutationFn: async () => {
      if (!journalQuery.data || !entry.trim()) {
        throw new Error("Missing journal entry");
      }
      const entryDateKey = formatEntryDateKey();
      const page = await getPageById({ pageId: journalQuery.data.id });
      const updatedContent = appendEntryToDoc(page.content || null, entry.trim());
      await updatePage({ pageId: page.id, content: updatedContent, spaceId });

      if (workspace?.id) {
        await agentMemoryService.ingest({
          workspaceId: workspace.id,
          spaceId,
          source: "journal-entry",
          summary:
            entry.trim().length > 80
              ? `${entry.trim().slice(0, 77)}...`
              : entry.trim(),
          content: {
            text: entry.trim(),
            pageId: page.id,
            pageTitle: page.title,
          },
          tags: ["journal", `journal:${entryDateKey}`],
        });
      }
    },
    onSuccess: () => {
      notifications.show({
        title: t("Saved"),
        message: t("Journal entry captured"),
        color: "green",
      });
      setEntry("");
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to save journal entry"),
        color: "red",
      });
    },
  });

  if (!spaceId) {
    return (
      <Container size="md" py="xl">
        <Text>{t("Missing space ID")}</Text>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={2}>
              {journalQuery.data?.title || t("Journal")}
            </Title>
            <Text size="sm" c="dimmed">
              {t("Capture reflections and ideas as they happen.")}
            </Text>
          </Stack>
          {journalUrl ? (
            <Button component={Link} to={journalUrl} variant="light">
              {t("Open today's journal")}
            </Button>
          ) : (
            <Button variant="light" onClick={() => journalQuery.refetch()}>
              {t("Create today's journal")}
            </Button>
          )}
        </Group>

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Textarea
              minRows={4}
              value={entry}
              onChange={(event) => setEntry(event.currentTarget.value)}
              placeholder={t("What's on your mind today?")}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {t("Entries are appended to today's Journal page")}
              </Text>
              <Group>
                <Button
                  variant="subtle"
                  onClick={() => setEntry("")}
                  disabled={!entry.trim()}
                >
                  {t("Clear")}
                </Button>
                <Button
                  onClick={() => saveEntryMutation.mutate()}
                  loading={saveEntryMutation.isPending}
                  disabled={!entry.trim() || !journalQuery.data}
                >
                  {t("Save entry")}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>
        {journalQuery.data && journalUrl ? (
          <Button variant="subtle" onClick={() => navigate(journalUrl)}>
            {t("Continue writing in editor")}
          </Button>
        ) : null}
      </Stack>
    </Container>
  );
}
