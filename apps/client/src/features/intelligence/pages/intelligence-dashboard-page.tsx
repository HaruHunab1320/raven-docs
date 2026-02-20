import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  Tabs,
  SimpleGrid,
  ActionIcon,
  Loader,
  Card,
  Badge,
  Menu,
  Button,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconRefresh,
  IconPlus,
  IconBulb,
  IconFlask,
  IconQuestionMark,
} from "@tabler/icons-react";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { HypothesisScoreboard } from "../components/hypothesis-scoreboard";
import { ActiveExperimentsList } from "../components/active-experiments-list";
import { OpenQuestionsQueue } from "../components/open-questions-queue";
import { RecentFindingsTimeline } from "../components/recent-findings-timeline";
import { ContradictionAlerts } from "../components/contradiction-alerts";
import { DomainGraphVisualization } from "../components/domain-graph-visualization";
import { PatternAlertsPanel } from "../components/pattern-alerts-panel";
import { CreateHypothesisModal } from "../components/create-hypothesis-modal";
import { CreateExperimentModal } from "../components/create-experiment-modal";
import { CreateOpenQuestionModal } from "../components/create-open-question-modal";
import {
  useIntelligenceStats,
  INTELLIGENCE_KEYS,
} from "../hooks/use-intelligence-queries";

export default function IntelligenceDashboardPage() {
  const { spaceId = "" } = useParams();
  const { data: space } = useSpaceQuery(spaceId);
  const { data: stats } = useIntelligenceStats(spaceId);
  const [activeTab, setActiveTab] = useState<string | null>("overview");
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const [hypothesisOpened, { open: openHypothesis, close: closeHypothesis }] =
    useDisclosure(false);
  const [experimentOpened, { open: openExperiment, close: closeExperiment }] =
    useDisclosure(false);
  const [questionOpened, { open: openQuestion, close: closeQuestion }] =
    useDisclosure(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.stats(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.timeline(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.openQuestions(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.contradictions(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.hypotheses(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.patterns(spaceId),
      }),
    ]);
    setRefreshing(false);
  };

  return (
    <Container size="xl" my="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={6}>
            <Title order={2}>Research Intelligence</Title>
            <Text size="sm" c="dimmed">
              Hypothesis scoreboard, experiments, open questions, and pattern
              detection.
            </Text>
          </Stack>
          <Group gap="xs">
            {stats && (
              <Badge size="sm" variant="light">
                {stats.totalTypedPages} typed pages
              </Badge>
            )}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button size="xs" leftSection={<IconPlus size={14} />}>
                  New
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconBulb size={14} />}
                  onClick={openHypothesis}
                >
                  New Hypothesis
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconFlask size={14} />}
                  onClick={openExperiment}
                >
                  New Experiment
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconQuestionMark size={14} />}
                  onClick={openQuestion}
                >
                  New Open Question
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={handleRefresh}
              aria-label="Refresh"
            >
              {refreshing ? <Loader size={14} /> : <IconRefresh size={14} />}
            </ActionIcon>
          </Group>
        </Group>

        <HypothesisScoreboard
          spaceId={spaceId}
          onNewHypothesis={openHypothesis}
        />

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="experiments">Experiments</Tabs.Tab>
            <Tabs.Tab value="questions">Open Questions</Tabs.Tab>
            <Tabs.Tab value="graph">Domain Graph</Tabs.Tab>
            <Tabs.Tab value="patterns">Patterns</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <RecentFindingsTimeline spaceId={spaceId} />
              <Stack gap="md">
                <ContradictionAlerts spaceId={spaceId} />
                <PatternAlertsPanel spaceId={spaceId} />
              </Stack>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="experiments" pt="md">
            <ActiveExperimentsList
              spaceId={spaceId}
              onNewExperiment={openExperiment}
            />
          </Tabs.Panel>

          <Tabs.Panel value="questions" pt="md">
            <OpenQuestionsQueue
              spaceId={spaceId}
              onNewQuestion={openQuestion}
            />
          </Tabs.Panel>

          <Tabs.Panel value="graph" pt="md">
            <DomainGraphVisualization
              nodes={[]}
              edges={[]}
              isLoading={false}
            />
            <Text size="xs" c="dimmed" mt="xs">
              Graph visualization will populate as typed pages and
              relationships are created.
            </Text>
          </Tabs.Panel>

          <Tabs.Panel value="patterns" pt="md">
            <PatternAlertsPanel spaceId={spaceId} full />
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <CreateHypothesisModal
        opened={hypothesisOpened}
        onClose={closeHypothesis}
        spaceId={spaceId}
      />
      <CreateExperimentModal
        opened={experimentOpened}
        onClose={closeExperiment}
        spaceId={spaceId}
      />
      <CreateOpenQuestionModal
        opened={questionOpened}
        onClose={closeQuestion}
        spaceId={spaceId}
      />
    </Container>
  );
}
