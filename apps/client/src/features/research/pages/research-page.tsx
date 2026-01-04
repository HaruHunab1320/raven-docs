import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  Button,
  Badge,
  Divider,
  Container,
  SimpleGrid,
  SegmentedControl,
  ActionIcon,
  Loader,
  UnstyledButton,
  ScrollArea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { listResearchJobs } from "@/features/research/services/research-service";
import { ResearchJob } from "@/features/research/types/research.types";
import { ResearchJobModal } from "@/features/research/components/research-job-modal";
import { useParams, Link } from "react-router-dom";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { useState } from "react";
import { formattedDate } from "@/lib/time";
import { IconFileDescription, IconRefresh } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useRecentChangesQuery } from "@/features/page/queries/page-query";
import { IPage } from "@/features/page/types/page.types";

export default function ResearchPage() {
  const { spaceId = "" } = useParams();
  const { data: space } = useSpaceQuery(spaceId);
  const [opened, { open, close }] = useDisclosure(false);
  const [filter, setFilter] = useState("all");
  const [modalTopic, setModalTopic] = useState<string | undefined>(undefined);
  const [modalReportPageId, setModalReportPageId] = useState<string | undefined>(
    undefined
  );

  const jobsQuery = useQuery({
    queryKey: ["research-jobs", spaceId],
    queryFn: () => listResearchJobs({ spaceId }),
    enabled: !!spaceId,
  });
  const recentPagesQuery = useRecentChangesQuery(spaceId);
  const jobs = jobsQuery.data ?? [];
  const totalJobs = jobs.length;
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const activeJobs = runningJobs + queuedJobs;
  const lastUpdated =
    jobsQuery.dataUpdatedAt > 0
      ? formattedDate(new Date(jobsQuery.dataUpdatedAt))
      : null;

  const filteredJobs = jobs.filter((job) => {
    if (filter === "active") {
      return job.status === "running" || job.status === "queued";
    }
    if (filter === "completed") return job.status === "completed";
    if (filter === "failed") return job.status === "failed";
    return true;
  });

  const renderJobLink = (job: ResearchJob, pageId?: string | null, label?: string) => {
    if (!pageId || !space?.slug) return null;
    const url = buildPageUrl(space.slug, pageId, label);
    return (
      <Button component={Link} to={url} variant="light" size="xs">
        {label || "Open"}
      </Button>
    );
  };

  const openDefaultModal = () => {
    setModalTopic(undefined);
    setModalReportPageId(undefined);
    open();
  };

  const openFromPageModal = (page: IPage) => {
    setModalTopic(page.title || "Untitled");
    setModalReportPageId(page.id);
    open();
  };

  const openPagePicker = () => {
    const modalId = modals.open({
      title: "Start research from a page",
      size: "md",
      closeOnEscape: true,
      closeOnClickOutside: true,
      children: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Pick a recent page to attach the research report to it.
          </Text>
          {recentPagesQuery.isLoading ? (
            <Group justify="center">
              <Loader size="sm" />
            </Group>
          ) : recentPagesQuery.isError ? (
            <Text size="sm" c="dimmed">
              Failed to load recent pages.
            </Text>
          ) : recentPagesQuery.data?.items.length ? (
            <ScrollArea h={260}>
              <Stack gap="xs">
                {recentPagesQuery.data.items.map((page) => (
                  <UnstyledButton
                    key={page.id}
                    onClick={() => {
                      modals.close(modalId);
                      openFromPageModal(page);
                    }}
                  >
                    <Group wrap="nowrap" gap="xs">
                      {page.icon ? (
                        <Text>{page.icon}</Text>
                      ) : (
                        <IconFileDescription size={16} />
                      )}
                      <Stack gap={2}>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {page.title || "Untitled"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formattedDate(new Date(page.updatedAt))}
                        </Text>
                      </Stack>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea>
          ) : (
            <Text size="sm" c="dimmed">
              No recent pages found.
            </Text>
          )}
        </Stack>
      ),
    });
  };

  const handleCloseModal = () => {
    close();
    setModalTopic(undefined);
    setModalReportPageId(undefined);
  };

  return (
    <Container size="xl" my="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={6}>
            <Title order={2}>Research</Title>
            <Text size="sm" c="dimmed">
              Launch deep research jobs for this space. Reports and logs are saved as pages.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button size="sm" onClick={openDefaultModal}>
              Start research
            </Button>
            <Button size="sm" variant="light" onClick={openPagePicker}>
              New research from page
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Total jobs
              </Text>
              <Group justify="space-between">
                <Title order={3}>{totalJobs}</Title>
                {failedJobs ? (
                  <Badge size="xs" color="red" variant="light">
                    {failedJobs} failed
                  </Badge>
                ) : null}
              </Group>
            </Stack>
          </Card>
          <Card withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Active now
              </Text>
              <Group justify="space-between">
                <Title order={3}>{activeJobs}</Title>
                {queuedJobs ? (
                  <Badge size="xs" variant="light">
                    {queuedJobs} queued
                  </Badge>
                ) : null}
              </Group>
            </Stack>
          </Card>
          <Card withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Completed
              </Text>
              <Group justify="space-between">
                <Title order={3}>{completedJobs}</Title>
                {runningJobs ? (
                  <Badge size="xs" color="blue" variant="light">
                    {runningJobs} running
                  </Badge>
                ) : null}
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Recent jobs</Text>
              <Group gap="xs">
                {lastUpdated ? (
                  <Text size="xs" c="dimmed">
                    Updated {lastUpdated}
                  </Text>
                ) : null}
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label="Refresh"
                  onClick={() => jobsQuery.refetch()}
                >
                  {jobsQuery.isFetching ? (
                    <Loader size={14} />
                  ) : (
                    <IconRefresh size={14} />
                  )}
                </ActionIcon>
              </Group>
            </Group>
            <Group justify="space-between">
              <SegmentedControl
                value={filter}
                onChange={setFilter}
                data={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "completed", label: "Completed" },
                  { value: "failed", label: "Failed" },
                ]}
              />
              {filteredJobs.length ? (
                <Text size="xs" c="dimmed">
                  {filteredJobs.length} shown
                </Text>
              ) : null}
            </Group>
            <Divider />
            {jobsQuery.isLoading ? (
              <Text size="sm" c="dimmed">
                Loading research jobs...
              </Text>
            ) : filteredJobs.length ? (
              <Stack gap="sm">
                {filteredJobs.map((job) => (
                  <Card key={job.id} withBorder radius="sm" p="sm">
                    <Stack gap={6}>
                      <Group justify="space-between">
                        <Text fw={600} size="sm">
                          {job.topic}
                        </Text>
                        <Badge size="xs" variant="light">
                          {job.status}
                        </Badge>
                      </Group>
                      {job.goal ? (
                        <Text size="xs" c="dimmed">
                          {job.goal}
                        </Text>
                      ) : null}
                      <Group gap="xs">
                        {renderJobLink(job, job.reportPageId, "Open report")}
                        {renderJobLink(job, job.logPageId, "Open log")}
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  {jobs.length
                    ? "No research jobs match this filter."
                    : "No research jobs yet."}
                </Text>
                <Button size="xs" variant="light" onClick={openDefaultModal}>
                  Start your first research
                </Button>
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>

      {space?.workspaceId ? (
        <ResearchJobModal
          opened={opened}
          onClose={handleCloseModal}
          workspaceId={space.workspaceId}
          spaceId={space.id}
          initialTopic={modalTopic}
          reportPageId={modalReportPageId}
        />
      ) : null}
    </Container>
  );
}
