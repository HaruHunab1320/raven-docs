import { Card, Group, Stack, Text, Title, Button, Badge, Divider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { listResearchJobs } from "@/features/research/services/research-service";
import { ResearchJob } from "@/features/research/types/research.types";
import { ResearchJobModal } from "@/features/research/components/research-job-modal";
import { useParams, Link } from "react-router-dom";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";

export default function ResearchPage() {
  const { spaceId = "" } = useParams();
  const { data: space } = useSpaceQuery(spaceId);
  const [opened, { open, close }] = useDisclosure(false);

  const jobsQuery = useQuery({
    queryKey: ["research-jobs", spaceId],
    queryFn: () => listResearchJobs({ spaceId }),
    enabled: !!spaceId,
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

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Research</Title>
        <Button size="xs" onClick={open}>
          Start research
        </Button>
      </Group>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Launch deep research jobs for this space. Reports and logs are saved as pages.
          </Text>
          <Divider />
          {jobsQuery.isLoading ? (
            <Text size="sm" c="dimmed">
              Loading research jobs...
            </Text>
          ) : jobsQuery.data?.length ? (
            <Stack gap="sm">
              {jobsQuery.data.map((job) => (
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
            <Text size="sm" c="dimmed">
              No research jobs yet.
            </Text>
          )}
        </Stack>
      </Card>

      {space?.workspaceId ? (
        <ResearchJobModal
          opened={opened}
          onClose={close}
          workspaceId={space.workspaceId}
          spaceId={space.id}
        />
      ) : null}
    </Stack>
  );
}
