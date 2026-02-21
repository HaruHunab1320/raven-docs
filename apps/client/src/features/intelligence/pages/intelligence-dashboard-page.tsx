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
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePageTabs } from "@/features/page/hooks/use-page-tabs";
import {
  IconRefresh,
  IconPlus,
  IconBulb,
  IconFlask,
  IconQuestionMark,
  IconRobot,
  IconSitemap,
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
import { LaunchSwarmModal } from "../components/launch-swarm-modal";
import { SwarmExecutionsPanel } from "../components/swarm-executions-panel";
import { SpaceDeploymentsPanel, DeployTeamModal } from "@/features/teams";
import {
  useIntelligenceStats,
  INTELLIGENCE_KEYS,
} from "../hooks/use-intelligence-queries";
import { useSwarmSocket } from "../hooks/use-swarm-socket";

export default function IntelligenceDashboardPage() {
  const { spaceId = "" } = useParams();
  const { data: space } = useSpaceQuery(spaceId);
  const { data: stats } = useIntelligenceStats(spaceId);
  const [activeTab, setActiveTab] = useState<string | null>("overview");
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { upsertTab } = usePageTabs();

  useEffect(() => {
    if (spaceId) {
      upsertTab({
        id: `intelligence:${spaceId}`,
        title: "Research Intelligence",
        url: `/spaces/${spaceId}/intelligence`,
        icon: "🔬",
      });
    }
  }, [spaceId, upsertTab]);

  const [hypothesisOpened, { open: openHypothesis, close: closeHypothesis }] =
    useDisclosure(false);
  const [experimentOpened, { open: openExperiment, close: closeExperiment }] =
    useDisclosure(false);
  const [questionOpened, { open: openQuestion, close: closeQuestion }] =
    useDisclosure(false);
  const [swarmOpened, { open: openSwarm, close: closeSwarm }] =
    useDisclosure(false);
  const [deployTeamOpened, { open: openDeployTeam, close: closeDeployTeam }] =
    useDisclosure(false);
  const [swarmExperimentId, setSwarmExperimentId] = useState<
    string | undefined
  >();
  const [swarmExperimentTitle, setSwarmExperimentTitle] = useState<
    string | undefined
  >();

  useSwarmSocket(spaceId);

  const handleLaunchSwarm = (experimentId?: string, title?: string) => {
    setSwarmExperimentId(experimentId);
    setSwarmExperimentTitle(title);
    openSwarm();
  };

  const handleCloseSwarm = () => {
    closeSwarm();
    setSwarmExperimentId(undefined);
    setSwarmExperimentTitle(undefined);
  };

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
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconRobot size={14} />}
                  onClick={() => handleLaunchSwarm()}
                >
                  Launch Agent
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconSitemap size={14} />}
                  onClick={openDeployTeam}
                >
                  Deploy Team
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
            <Tabs.Tab value="agents">Agents</Tabs.Tab>
            <Tabs.Tab value="teams">Teams</Tabs.Tab>
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
              onLaunchSwarm={handleLaunchSwarm}
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

          <Tabs.Panel value="agents" pt="md">
            <SwarmExecutionsPanel spaceId={spaceId} />
          </Tabs.Panel>

          <Tabs.Panel value="teams" pt="md">
            <SpaceDeploymentsPanel spaceId={spaceId} />
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
        onLaunchSwarm={handleLaunchSwarm}
      />
      <CreateOpenQuestionModal
        opened={questionOpened}
        onClose={closeQuestion}
        spaceId={spaceId}
      />
      <LaunchSwarmModal
        opened={swarmOpened}
        onClose={handleCloseSwarm}
        spaceId={spaceId}
        experimentId={swarmExperimentId}
        experimentTitle={swarmExperimentTitle}
      />
      <DeployTeamModal
        opened={deployTeamOpened}
        onClose={closeDeployTeam}
        spaceId={spaceId}
      />
    </Container>
  );
}
