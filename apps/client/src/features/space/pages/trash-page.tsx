import { useParams } from "react-router-dom";
import {
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import {
  getTrashPages,
  getPageById,
  restorePage,
  restorePageSingle,
} from "@/features/page/services/page-service";
import { projectService } from "@/features/project/services/project-service";

export function TrashPage() {
  const { t } = useTranslation();
  const { spaceId } = useParams();
  const queryClient = useQueryClient();

  const trashPagesQuery = useQuery({
    queryKey: ["trash-pages", spaceId],
    queryFn: () => getTrashPages(spaceId || ""),
    enabled: !!spaceId,
  });

  const trashProjectsQuery = useQuery({
    queryKey: ["trash-projects", spaceId],
    queryFn: () => projectService.listDeletedProjects(spaceId || ""),
    enabled: !!spaceId,
  });

  const restorePageMutation = useMutation({
    mutationFn: (pageId: string) => restorePage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-pages", spaceId] });
      notifications.show({ message: t("Page restored") });
    },
    onError: () => {
      notifications.show({ message: t("Failed to restore page"), color: "red" });
    },
  });

  const restorePageSingleMutation = useMutation({
    mutationFn: (pageId: string) => restorePageSingle(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-pages", spaceId] });
      notifications.show({ message: t("Page restored") });
    },
    onError: () => {
      notifications.show({ message: t("Failed to restore page"), color: "red" });
    },
  });

  const restoreProjectMutation = useMutation({
    mutationFn: (projectId: string) =>
      projectService.restoreProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-projects", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["trash-pages", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      notifications.show({ message: t("Project restored") });
    },
    onError: () => {
      notifications.show({
        message: t("Failed to restore project"),
        color: "red",
      });
    },
  });

  const formatDate = (value?: string | Date | null) => {
    if (!value) return t("Unknown");
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return t("Unknown");
    return date.toLocaleString();
  };

  if (!spaceId) {
    return (
      <Stack>
        <Title order={2}>{t("Trash")}</Title>
        <Text c="dimmed">{t("Select a space to view its trash.")}</Text>
      </Stack>
    );
  }

  if (trashPagesQuery.isLoading || trashProjectsQuery.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="md" />
      </Group>
    );
  }

  const trashedPages = trashPagesQuery.data?.items ?? [];
  const trashedProjects = trashProjectsQuery.data ?? [];

  const confirmRestore = (
    title: string,
    body: string,
    onConfirm: () => void
  ) => {
    modals.openConfirmModal({
      title,
      children: (
        <Text size="sm" c="dimmed">
          {body}
        </Text>
      ),
      labels: { confirm: t("Restore"), cancel: t("Cancel") },
      confirmProps: { color: "blue" },
      onConfirm,
    });
  };

  const confirmRestoreWithParent = (
    onRestoreParent: () => void,
    onRestoreRoot: () => void
  ) => {
    const modalId = modals.open({
      title: t("Restore page"),
      children: (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(
              "This page's parent is also in trash. Choose how you want to restore it."
            )}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                onRestoreRoot();
                modals.close(modalId);
              }}
            >
              {t("Restore to root")}
            </Button>
            <Button
              onClick={() => {
                onRestoreParent();
                modals.close(modalId);
              }}
            >
              {t("Restore parent")}
            </Button>
          </Group>
        </Stack>
      ),
    });
  };

  const handleRestorePage = async (pageId: string, parentPageId?: string) => {
    if (!parentPageId) {
      confirmRestore(
        t("Restore page"),
        t(
          "This restores the page to its original location if the parent still exists. If the parent was deleted, the page moves to the space root."
        ),
        () => restorePageMutation.mutate(pageId)
      );
      return;
    }

    try {
      const parent = await getPageById({
        pageId: parentPageId,
        includeDeleted: true,
      });
      if (parent?.deletedAt) {
        confirmRestoreWithParent(
          () => restorePageMutation.mutate(parentPageId),
          () => restorePageSingleMutation.mutate(pageId)
        );
        return;
      }
    } catch {
      // Parent not found or cannot be fetched; restore to root.
    }

    confirmRestore(
      t("Restore page"),
      t(
        "This restores the page to its original location if the parent still exists. If the parent was deleted, the page moves to the space root."
      ),
      () => restorePageMutation.mutate(pageId)
    );
  };


  return (
    <Stack gap="xl">
      <Title order={2}>{t("Trash")}</Title>

      <Stack gap="sm">
        <Title order={4}>{t("Projects")}</Title>
        {trashedProjects.length === 0 ? (
          <Text c="dimmed">{t("No deleted projects.")}</Text>
        ) : (
          <Table striped withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Project")}</Table.Th>
                <Table.Th>{t("Deleted")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {trashedProjects.map((project) => (
                <Table.Tr key={project.id}>
                  <Table.Td>{project.name}</Table.Td>
                  <Table.Td>{formatDate(project.deletedAt)}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() =>
                        confirmRestore(
                          t("Restore project"),
                          t(
                            "This will restore the project and its pages. If any parent pages were deleted, the restored pages move to the space root."
                          ),
                          () => restoreProjectMutation.mutate(project.id)
                        )
                      }
                      loading={
                        restoreProjectMutation.isPending ||
                        restorePageSingleMutation.isPending
                      }
                    >
                      {t("Restore")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Stack gap="sm">
        <Title order={4}>{t("Pages")}</Title>
        {trashedPages.length === 0 ? (
          <Text c="dimmed">{t("No deleted pages.")}</Text>
        ) : (
          <Table striped withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Page")}</Table.Th>
                <Table.Th>{t("Deleted")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {trashedPages.map((page) => (
                <Table.Tr key={page.id}>
                  <Table.Td>{page.title || t("Untitled")}</Table.Td>
                  <Table.Td>{formatDate(page.deletedAt)}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleRestorePage(page.id, page.parentPageId)}
                      loading={restorePageMutation.isPending}
                    >
                      {t("Restore")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Stack>
  );
}
