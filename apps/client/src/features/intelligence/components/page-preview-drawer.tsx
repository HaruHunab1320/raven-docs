import {
  Drawer,
  Box,
  Group,
  Stack,
  Text,
  Title,
  ActionIcon,
  Tooltip,
  Loader,
  Center,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconChevronRight, IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { HypothesisPagePanel } from "./hypothesis-page-panel";
import { ExperimentPagePanel } from "./experiment-page-panel";
import PageEditor from "@/features/editor/page-editor";

interface PagePreviewDrawerProps {
  pageId: string | null;
  spaceId: string;
  opened: boolean;
  onClose: () => void;
}

export function PagePreviewDrawer({
  pageId,
  spaceId,
  opened,
  onClose,
}: PagePreviewDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { data: page, isLoading } = usePageQuery({
    pageId: pageId || "",
  });

  const handleOpenFullPage = () => {
    if (!pageId) return;
    onClose();
    navigate(`/p/${page?.slugId || pageId}`);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Box
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Group gap="xs">
            <Tooltip label={t("Close")}>
              <ActionIcon variant="subtle" onClick={onClose} aria-label="Close">
                <IconChevronRight size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Open full page")}>
              <ActionIcon
                variant="subtle"
                onClick={handleOpenFullPage}
                aria-label="Open full page"
              >
                <IconExternalLink size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      }
      styles={{
        header: {
          margin: 0,
          padding: "1rem",
          borderBottom: `1px solid ${colorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[3]}`,
          backgroundColor:
            colorScheme === "dark" ? theme.colors.dark[7] : theme.white,
        },
        title: {
          display: "contents",
          width: "100%",
          margin: 0,
          padding: 0,
        },
        body: {
          padding: 0,
          backgroundColor:
            colorScheme === "dark" ? theme.colors.dark[8] : theme.colors.gray[0],
        },
      }}
      closeButtonProps={{ display: "none" }}
    >
      {isLoading || !page ? (
        <Center h={200}>
          <Loader size="sm" />
        </Center>
      ) : (
        <Box p="md">
          <Stack gap="lg">
            <Group gap="xs">
              {page.icon && <Text size="xl">{page.icon}</Text>}
              <Title order={3}>{page.title || t("Untitled")}</Title>
            </Group>

            {page.pageType === "hypothesis" && (
              <HypothesisPagePanel pageId={page.id} />
            )}
            {page.pageType === "experiment" && (
              <ExperimentPagePanel pageId={page.id} spaceId={spaceId} />
            )}

            <Box>
              <PageEditor
                pageId={page.id}
                editable
                content={page.content}
              />
            </Box>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
}
