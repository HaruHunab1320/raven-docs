import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Table,
  Badge,
  Group,
  Stack,
  Select,
  Button,
  Modal,
  Paper,
  Code,
  Loader,
  ActionIcon,
  Pagination,
  Timeline,
  ScrollArea,
  Divider,
  Center,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listBugReports,
  getBugReport,
  updateBugReport,
  BugReport,
  BugReportListResponse,
} from "../services/bug-report-service";
import { formattedDate } from "@/lib/time";
import {
  IconBug,
  IconRefresh,
  IconEye,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

const SEVERITY_COLORS: Record<string, string> = {
  low: "blue",
  medium: "yellow",
  high: "orange",
  critical: "red",
};

const STATUS_COLORS: Record<string, string> = {
  open: "gray",
  triaged: "blue",
  in_progress: "yellow",
  resolved: "green",
  closed: "dark",
};

const SOURCE_LABELS: Record<string, string> = {
  "auto:server": "Server",
  "auto:client": "Client",
  "auto:agent": "Agent",
  "user:command": "User",
};

export default function BugReportsPage() {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{
    source?: string;
    severity?: string;
    status?: string;
  }>({});

  const listQuery = useQuery({
    queryKey: ["bug-reports", page, filters],
    queryFn: () =>
      listBugReports({
        page,
        limit: 20,
        source: filters.source || undefined,
        severity: filters.severity || undefined,
        status: filters.status || undefined,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["bug-report", selectedBugId],
    queryFn: () => getBugReport(selectedBugId!),
    enabled: !!selectedBugId,
  });

  const updateMutation = useMutation({
    mutationFn: updateBugReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug-reports"] });
      queryClient.invalidateQueries({ queryKey: ["bug-report", selectedBugId] });
      notifications.show({
        title: "Bug report updated",
        message: "The bug report status has been updated.",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update bug report",
        color: "red",
      });
    },
  });

  const handleViewBug = (bugId: string) => {
    setSelectedBugId(bugId);
    open();
  };

  const handleStatusChange = (bugId: string, newStatus: string) => {
    updateMutation.mutate({ bugReportId: bugId, status: newStatus });
  };

  const data: BugReportListResponse = listQuery.data || {
    items: [],
    meta: { limit: 20, page: 1, hasNextPage: false, hasPrevPage: false },
  };

  const renderUserJourney = (userJourney: any) => {
    if (!userJourney?.recentActions?.length) {
      return <Text c="dimmed" size="sm">No user journey data available</Text>;
    }

    return (
      <Timeline bulletSize={24} lineWidth={2}>
        {userJourney.recentActions.slice(0, 10).map((action: any, index: number) => (
          <Timeline.Item
            key={action.id || index}
            title={action.source || "Action"}
          >
            <Text c="dimmed" size="sm">
              {action.summary}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {formattedDate(new Date(action.timestamp))}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    );
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group>
            <IconBug size={32} />
            <Title order={2}>Bug Reports</Title>
          </Group>
          <ActionIcon
            variant="subtle"
            onClick={() => listQuery.refetch()}
            loading={listQuery.isLoading}
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Group>

        <Group>
          <Select
            placeholder="Source"
            clearable
            data={[
              { value: "auto:server", label: "Server" },
              { value: "auto:client", label: "Client" },
              { value: "auto:agent", label: "Agent" },
              { value: "user:command", label: "User" },
            ]}
            value={filters.source || null}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, source: value || undefined }))
            }
          />
          <Select
            placeholder="Severity"
            clearable
            data={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
            value={filters.severity || null}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, severity: value || undefined }))
            }
          />
          <Select
            placeholder="Status"
            clearable
            data={[
              { value: "open", label: "Open" },
              { value: "triaged", label: "Triaged" },
              { value: "in_progress", label: "In Progress" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ]}
            value={filters.status || null}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, status: value || undefined }))
            }
          />
        </Group>

        {listQuery.isLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : listQuery.isError ? (
          <Paper p="xl" withBorder>
            <Stack align="center" gap="md">
              <IconBug size={48} color="var(--mantine-color-red-5)" />
              <Text c="red">Failed to load bug reports</Text>
              <Text size="sm" c="dimmed">
                {(listQuery.error as any)?.message || "Unknown error"}
              </Text>
              <Button onClick={() => listQuery.refetch()} variant="light">
                Retry
              </Button>
            </Stack>
          </Paper>
        ) : data.items.length === 0 ? (
          <Paper p="xl" withBorder>
            <Stack align="center" gap="md">
              <IconBug size={48} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed">No bug reports found</Text>
            </Stack>
          </Paper>
        ) : (
          <>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Occurrences</Table.Th>
                  <Table.Th>Occurred</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((bug) => (
                  <Table.Tr key={bug.id}>
                    <Table.Td maw={300}>
                      <Text truncate size="sm">
                        {bug.title}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm">
                        {SOURCE_LABELS[bug.source] || bug.source}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={SEVERITY_COLORS[bug.severity]} size="sm">
                        {bug.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={STATUS_COLORS[bug.status]} size="sm">
                        {bug.status.replace("_", " ")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{bug.occurrenceCount}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formattedDate(new Date(bug.occurredAt))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="subtle"
                          onClick={() => handleViewBug(bug.id)}
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                        {bug.status === "open" && (
                          <ActionIcon
                            variant="subtle"
                            color="green"
                            onClick={() => handleStatusChange(bug.id, "resolved")}
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                        )}
                        {bug.status !== "closed" && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleStatusChange(bug.id, "closed")}
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            {(data.meta.hasNextPage || data.meta.hasPrevPage) && (
              <Group justify="center">
                <Pagination
                  total={Math.ceil(data.items.length / data.meta.limit) + (data.meta.hasNextPage ? 1 : 0)}
                  value={page}
                  onChange={setPage}
                />
              </Group>
            )}
          </>
        )}
      </Stack>

      <Modal
        opened={opened}
        onClose={() => {
          close();
          setSelectedBugId(null);
        }}
        title="Bug Report Details"
        size="lg"
      >
        {detailQuery.isLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : detailQuery.data ? (
          <Stack gap="md">
            <Group>
              <Badge color={SEVERITY_COLORS[detailQuery.data.severity]}>
                {detailQuery.data.severity}
              </Badge>
              <Badge color={STATUS_COLORS[detailQuery.data.status]}>
                {detailQuery.data.status.replace("_", " ")}
              </Badge>
              <Badge variant="light">
                {SOURCE_LABELS[detailQuery.data.source] || detailQuery.data.source}
              </Badge>
            </Group>

            <Title order={4}>{detailQuery.data.title}</Title>

            {detailQuery.data.description && (
              <Text>{detailQuery.data.description}</Text>
            )}

            {detailQuery.data.errorMessage && (
              <Paper p="md" bg="dark.8" radius="sm">
                <Text size="sm" fw={600} c="red" mb="xs">
                  Error Message
                </Text>
                <Code block>{detailQuery.data.errorMessage}</Code>
              </Paper>
            )}

            {detailQuery.data.errorStack && (
              <Paper p="md" bg="dark.8" radius="sm">
                <Text size="sm" fw={600} c="dimmed" mb="xs">
                  Stack Trace
                </Text>
                <ScrollArea h={150}>
                  <Code block style={{ fontSize: "10px" }}>
                    {detailQuery.data.errorStack}
                  </Code>
                </ScrollArea>
              </Paper>
            )}

            {detailQuery.data.context && (
              <Paper p="md" bg="dark.8" radius="sm">
                <Text size="sm" fw={600} c="dimmed" mb="xs">
                  Context
                </Text>
                <Code block style={{ fontSize: "11px" }}>
                  {JSON.stringify(detailQuery.data.context, null, 2)}
                </Code>
              </Paper>
            )}

            {detailQuery.data.userJourney && (
              <>
                <Divider label="User Journey" labelPosition="left" />
                {renderUserJourney(detailQuery.data.userJourney)}
              </>
            )}

            <Divider />

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Reporter: {detailQuery.data.reporter?.name || "System"}
              </Text>
              <Text size="sm" c="dimmed">
                Occurred: {formattedDate(new Date(detailQuery.data.occurredAt))}
              </Text>
            </Group>

            <Group>
              <Select
                label="Update Status"
                value={detailQuery.data.status}
                data={[
                  { value: "open", label: "Open" },
                  { value: "triaged", label: "Triaged" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "resolved", label: "Resolved" },
                  { value: "closed", label: "Closed" },
                ]}
                onChange={(value) => {
                  if (value && selectedBugId) {
                    handleStatusChange(selectedBugId, value);
                  }
                }}
              />
            </Group>
          </Stack>
        ) : (
          <Text c="dimmed">Failed to load bug report details</Text>
        )}
      </Modal>
    </Container>
  );
}
