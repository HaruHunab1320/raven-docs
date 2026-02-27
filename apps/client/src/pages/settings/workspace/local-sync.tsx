import {
  Container,
  Stack,
  Text,
  Card,
  Group,
  Badge,
  Select,
  Button,
  Code,
  ScrollArea,
  Loader,
  Textarea,
} from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLocalSyncConflictPreview,
  listLocalSyncConflicts,
  listLocalSyncSources,
  resolveLocalSyncConflict,
} from "@/features/local-sync/services/local-sync-service";
import { useEffect, useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";

export default function LocalSyncSettings() {
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [manualMergedContent, setManualMergedContent] = useState("");

  const sourcesQuery = useQuery({
    queryKey: ["local-sync-sources"],
    queryFn: listLocalSyncSources,
  });

  const sourceOptions = useMemo(
    () =>
      (sourcesQuery.data || []).map((source) => ({
        value: source.id,
        label: `${source.name} (${source.mode})`,
      })),
    [sourcesQuery.data],
  );

  const activeSourceId = selectedSourceId || sourceOptions[0]?.value || null;

  const conflictsQuery = useQuery({
    queryKey: ["local-sync-conflicts", activeSourceId],
    queryFn: () => listLocalSyncConflicts(activeSourceId as string),
    enabled: !!activeSourceId,
  });

  const conflictOptions = useMemo(
    () =>
      (conflictsQuery.data || []).map((conflict) => ({
        value: conflict.id,
        label: conflict.relativePath,
      })),
    [conflictsQuery.data],
  );

  const activeConflictId = selectedConflictId || conflictOptions[0]?.value || null;

  const previewQuery = useQuery({
    queryKey: ["local-sync-conflict-preview", activeSourceId, activeConflictId],
    queryFn: () =>
      getLocalSyncConflictPreview(
        activeSourceId as string,
        activeConflictId as string,
      ),
    enabled: !!activeSourceId && !!activeConflictId,
  });

  useEffect(() => {
    if (previewQuery.data) {
      const merged = previewQuery.data.changes
        .map((change) => `<<<<<<< LOCAL\n${change.local}\n=======\n${change.remote}\n>>>>>>> RAVEN`)
        .join("\n");
      setManualMergedContent(merged);
    } else {
      setManualMergedContent("");
    }
  }, [previewQuery.data]);

  const resolveMutation = useMutation({
    mutationFn: (params: {
      resolution: "keep_local" | "keep_raven" | "manual_merge";
      resolvedContent?: string;
    }) =>
      resolveLocalSyncConflict({
        sourceId: activeSourceId as string,
        conflictId: activeConflictId as string,
        resolution: params.resolution,
        resolvedContent: params.resolvedContent,
      }),
    onSuccess: () => {
      notifications.show({
        title: "Conflict resolved",
        message: "Local sync conflict was resolved successfully.",
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["local-sync-conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["local-sync-conflict-preview"] });
    },
    onError: () => {
      notifications.show({
        title: "Resolve failed",
        message: "Could not resolve conflict.",
        color: "red",
      });
    },
  });

  return (
    <Container fluid>
      <Stack gap="xl">
        <div>
          <SettingsTitle title="Local Sync" />
          <Text c="dimmed" size="sm" mt="xs">
            Inspect local connector sources, open conflicts, preview diffs, and resolve divergence.
          </Text>
        </div>

        <Card withBorder>
          <Stack>
            <Group grow>
              <Select
                label="Source"
                placeholder="Select a source"
                data={sourceOptions}
                value={activeSourceId}
                onChange={(value) => {
                  setSelectedSourceId(value);
                  setSelectedConflictId(null);
                }}
              />
              <Select
                label="Conflict"
                placeholder="Select a conflict"
                data={conflictOptions}
                value={activeConflictId}
                onChange={setSelectedConflictId}
                disabled={!activeSourceId}
              />
            </Group>

            <Group>
              <Badge color="blue" variant="light">
                Sources: {(sourcesQuery.data || []).length}
              </Badge>
              <Badge color="yellow" variant="light">
                Open conflicts: {(conflictsQuery.data || []).length}
              </Badge>
            </Group>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>Conflict Preview</Text>
              {!!activeConflictId && (
                <Group>
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    loading={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({ resolution: "keep_local" })
                    }
                  >
                    Keep Local
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    loading={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({ resolution: "keep_raven" })
                    }
                  >
                    Keep Raven
                  </Button>
                </Group>
              )}
            </Group>

            {previewQuery.isLoading ? (
              <Loader size="sm" />
            ) : !previewQuery.data ? (
              <Text c="dimmed" size="sm">
                No conflict selected.
              </Text>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  {previewQuery.data.relativePath}
                </Text>
                <Text size="sm" c="dimmed">
                  Differences: {previewQuery.data.summary.differentLines} lines
                </Text>
                <ScrollArea h={320}>
                  <Stack gap="xs">
                    {previewQuery.data.changes.slice(0, 100).map((change) => (
                      <Card key={`${change.line}-${change.local}-${change.remote}`} withBorder p="xs">
                        <Text size="xs" c="dimmed">Line {change.line}</Text>
                        <Code block>{`LOCAL: ${change.local}`}</Code>
                        <Code block mt="xs">{`RAVEN: ${change.remote}`}</Code>
                      </Card>
                    ))}
                  </Stack>
                </ScrollArea>
              </>
            )}
          </Stack>
        </Card>

        <Card withBorder>
          <Stack>
            <Text fw={600}>Manual Merge</Text>
            <Text size="sm" c="dimmed">
              Edit merged content and submit as manual resolution.
            </Text>
            <Textarea
              minRows={10}
              autosize
              value={manualMergedContent}
              onChange={(event) => setManualMergedContent(event.currentTarget.value)}
              placeholder="Merged content"
              disabled={!activeConflictId}
            />
            <Group justify="flex-end">
              <Button
                size="sm"
                loading={resolveMutation.isPending}
                disabled={!activeConflictId || !manualMergedContent.trim()}
                onClick={() =>
                  resolveMutation.mutate({
                    resolution: "manual_merge",
                    resolvedContent: manualMergedContent,
                  })
                }
              >
                Submit Manual Merge
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
