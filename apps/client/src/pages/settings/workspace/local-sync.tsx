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
  Divider,
} from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLocalSyncFile,
  getLocalSyncConflictPreview,
  listLocalSyncConflicts,
  listLocalSyncFiles,
  listLocalSyncSources,
  resolveLocalSyncConflict,
  updateLocalSyncFile,
} from "@/features/local-sync/services/local-sync-service";
import { useEffect, useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";

interface FileTreeNode {
  name: string;
  path?: string;
  children: FileTreeNode[];
}

function buildTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "__root__", children: [] };

  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean);
    let cursor = root;
    let built = "";

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      built = built ? `${built}/${part}` : part;
      const isFile = i === parts.length - 1;

      let next = cursor.children.find((child) => child.name === part);
      if (!next) {
        next = {
          name: part,
          path: isFile ? built : undefined,
          children: [],
        };
        cursor.children.push(next);
        cursor.children.sort((a, b) => {
          if (a.path && !b.path) return 1;
          if (!a.path && b.path) return -1;
          return a.name.localeCompare(b.name);
        });
      }
      cursor = next;
    }
  }

  return root.children;
}

function renderTree(
  nodes: FileTreeNode[],
  selectedPath: string | null,
  onSelect: (path: string) => void,
  depth = 0,
) {
  return nodes.map((node) => (
    <Stack key={`${depth}-${node.name}-${node.path || "dir"}`} gap={4}>
      <Button
        variant={node.path ? "subtle" : "transparent"}
        justify="flex-start"
        size="compact-xs"
        leftSection={<Text size="xs">{node.path ? "F" : "D"}</Text>}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        color={node.path && selectedPath === node.path ? "blue" : "gray"}
        onClick={() => {
          if (node.path) onSelect(node.path);
        }}
      >
        {node.name}
      </Button>
      {node.children.length > 0 &&
        renderTree(node.children, selectedPath, onSelect, depth + 1)}
    </Stack>
  ));
}

export default function LocalSyncSettings() {
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [manualMergedContent, setManualMergedContent] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorBaseHash, setEditorBaseHash] = useState<string | undefined>(undefined);

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
  const activeSource = (sourcesQuery.data || []).find((source) => source.id === activeSourceId);

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

  const filesQuery = useQuery({
    queryKey: ["local-sync-files", activeSourceId],
    queryFn: () => listLocalSyncFiles(activeSourceId as string),
    enabled: !!activeSourceId,
  });

  const fileTree = useMemo(
    () => buildTree((filesQuery.data || []).map((file) => file.relativePath)),
    [filesQuery.data],
  );

  const fileQuery = useQuery({
    queryKey: ["local-sync-file", activeSourceId, selectedFilePath],
    queryFn: () => getLocalSyncFile(activeSourceId as string, selectedFilePath as string),
    enabled: !!activeSourceId && !!selectedFilePath,
  });

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

  useEffect(() => {
    if (fileQuery.data) {
      setEditorContent(fileQuery.data.content);
      setEditorBaseHash(fileQuery.data.lastSyncedHash);
    } else {
      setEditorContent("");
      setEditorBaseHash(undefined);
    }
  }, [fileQuery.data]);

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

  const saveFileMutation = useMutation({
    mutationFn: () =>
      updateLocalSyncFile({
        sourceId: activeSourceId as string,
        relativePath: selectedFilePath as string,
        content: editorContent,
        baseHash: editorBaseHash,
      }),
    onSuccess: (result: any) => {
      if (result?.status === "conflict") {
        notifications.show({
          title: "Save created conflict",
          message: "The file changed meanwhile. Resolve the new conflict.",
          color: "yellow",
        });
      } else {
        notifications.show({
          title: "File saved",
          message: "Remote update queued for local connector pull.",
          color: "green",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["local-sync-files"] });
      queryClient.invalidateQueries({ queryKey: ["local-sync-file"] });
      queryClient.invalidateQueries({ queryKey: ["local-sync-conflicts"] });
    },
    onError: () => {
      notifications.show({
        title: "Save failed",
        message: "Could not save file content.",
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
                  setSelectedFilePath(null);
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
              <Badge color="grape" variant="light">
                Files: {(filesQuery.data || []).length}
              </Badge>
              {activeSource && (
                <Badge color="cyan" variant="light">
                  Mode: {activeSource.mode}
                </Badge>
              )}
            </Group>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack>
            <Text fw={600}>Synced Files</Text>
            <Group grow align="flex-start">
              <Card withBorder p="xs">
                <ScrollArea h={320} w={320}>
                  <Stack gap={2}>
                    {filesQuery.isLoading ? (
                      <Loader size="sm" />
                    ) : fileTree.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No files synced yet.
                      </Text>
                    ) : (
                      renderTree(fileTree, selectedFilePath, setSelectedFilePath)
                    )}
                  </Stack>
                </ScrollArea>
              </Card>
              <Card withBorder p="xs" style={{ flex: 1 }}>
                <Stack>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {selectedFilePath || "Select a file"}
                    </Text>
                    <Button
                      size="xs"
                      loading={saveFileMutation.isPending}
                      disabled={
                        !selectedFilePath ||
                        !activeSourceId ||
                        activeSource?.mode !== "bidirectional"
                      }
                      onClick={() => saveFileMutation.mutate()}
                    >
                      Save to Raven
                    </Button>
                  </Group>
                  <Divider />
                  {fileQuery.isLoading ? (
                    <Loader size="sm" />
                  ) : (
                    <Textarea
                      minRows={12}
                      autosize
                      value={editorContent}
                      onChange={(event) => setEditorContent(event.currentTarget.value)}
                      placeholder="Select a file from the tree."
                      disabled={!selectedFilePath}
                    />
                  )}
                  {activeSource?.mode !== "bidirectional" && (
                    <Text size="xs" c="dimmed">
                      Raven-side editing is enabled only for bidirectional sources.
                    </Text>
                  )}
                </Stack>
              </Card>
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
