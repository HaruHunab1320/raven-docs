import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  Loader,
  ActionIcon,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useOpenQuestions } from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";

interface Props {
  spaceId: string;
  onNewQuestion?: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "red",
  high: "orange",
  medium: "yellow",
  low: "gray",
};

export function OpenQuestionsQueue({ spaceId, onNewQuestion }: Props) {
  const navigate = useNavigate();
  const { data: questions, isLoading } = useOpenQuestions(spaceId);

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Open Questions</Text>
          {onNewQuestion && (
            <ActionIcon variant="subtle" size="sm" onClick={onNewQuestion} aria-label="New Open Question">
              <IconPlus size={14} />
            </ActionIcon>
          )}
        </Group>

        {isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : !questions?.length ? (
          <Text size="sm" c="dimmed">No open questions.</Text>
        ) : (
          <Stack gap="xs">
            {questions.map((q) => (
              <Card
                key={q.id}
                withBorder
                radius="sm"
                p="sm"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/p/${q.id}`)}
              >
                <Group justify="space-between">
                  <Text fw={500} size="sm" style={{ flex: 1 }}>
                    {q.title}
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Badge
                      size="xs"
                      variant="light"
                      color={PRIORITY_COLORS[q.priority] || "gray"}
                    >
                      {q.priority}
                    </Badge>
                    <Badge size="xs" variant="light">{q.status}</Badge>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {formattedDate(new Date(q.updatedAt))}
                    </Text>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
