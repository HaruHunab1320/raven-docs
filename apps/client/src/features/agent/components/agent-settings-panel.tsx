import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  NumberInput,
  Select,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  PasswordInput,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconX, IconRefresh } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAgentHandoff,
  getAgentSettings,
  runAgentLoop,
  runAgentSchedule,
  updateAgentSettings,
} from "@/features/agent/services/agent-service";
import { notifications } from "@mantine/notifications";
import { AgentSettings, AgentHostingMode } from "@/features/agent/types/agent.types";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import useUserRole from "@/hooks/use-user-role";
import { getSpaces } from "@/features/space/services/space-service";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import {
  getAgentProviderAvailability,
  getSubscriptionStatus,
  startSubscriptionAuth,
  exchangeSubscriptionCode,
  deleteSubscription,
  updateAgentProviderAuth,
  type SubscriptionProvider,
} from "@/features/user/services/user-service";

const toLabel = (text: string) => text;

export function AgentSettingsPanel() {
  const [currentUser, setCurrentUser] = useAtom(currentUserAtom);
  const workspace = currentUser?.workspace;
  const { isAdmin } = useUserRole();
  const [handoffKey, setHandoffKey] = useState("");
  const [policyDraft, setPolicyDraft] = useState({
    allowAutoApply: "",
    requireApproval: "",
    deny: "",
  });
  const [defaultTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [providerKeyDraft, setProviderKeyDraft] = useState({
    anthropicApiKey: "",
    claudeSubscriptionToken: "",
    openaiApiKey: "",
    openaiSubscriptionToken: "",
    googleApiKey: "",
  });
  const [providerKeyDirty, setProviderKeyDirty] = useState({
    anthropicApiKey: false,
    claudeSubscriptionToken: false,
    openaiApiKey: false,
    openaiSubscriptionToken: false,
    googleApiKey: false,
  });
  const [subscriptionCodeDraft, setSubscriptionCodeDraft] = useState<Record<SubscriptionProvider, string>>({
    "anthropic-subscription": "",
    "openai-codex": "",
  });
  const [subscriptionStateDraft, setSubscriptionStateDraft] = useState<Record<SubscriptionProvider, string>>({
    "anthropic-subscription": "",
    "openai-codex": "",
  });
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["agent-settings"],
    queryFn: () => getAgentSettings(),
    enabled: !!workspace?.id,
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => getSpaces({ page: 1, limit: 200 }),
    enabled: !!workspace?.id,
  });

  const recentRunsQuery = useQuery({
    queryKey: ["agent-loop-runs", workspace?.id],
    queryFn: () =>
      agentMemoryService.query({
        workspaceId: workspace?.id || "",
        sources: ["agent-loop"],
        limit: 5,
      }),
    enabled: !!workspace?.id,
  });
  const providerAvailabilityQuery = useQuery({
    queryKey: ["agent-provider-availability"],
    queryFn: getAgentProviderAvailability,
    enabled: !!workspace?.id,
  });
  const subscriptionStatusQuery = useQuery({
    queryKey: ["subscription-status"],
    queryFn: getSubscriptionStatus,
    enabled: !!workspace?.id,
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<AgentSettings>) => updateAgentSettings(data),
    onSuccess: (data) => {
      notifications.show({
        title: "Updated",
        message: "Agent settings saved",
        color: "green",
      });
      queryClient.setQueryData(["agent-settings"], data);
      if (currentUser?.workspace) {
        setCurrentUser({
          ...currentUser,
          workspace: {
            ...currentUser.workspace,
            settings: {
              ...currentUser.workspace.settings,
              agent: data,
            },
          },
        });
      }
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to update agent settings",
        color: "red",
      });
    },
  });

  const providerAuthMutation = useMutation({
    mutationFn: updateAgentProviderAuth,
    onSuccess: (data) => {
      notifications.show({
        title: "Updated",
        message: "Personal provider credentials saved",
        color: "green",
      });
      queryClient.setQueryData(["agent-provider-availability"], data);
      setProviderKeyDraft({
        anthropicApiKey: "",
        claudeSubscriptionToken: "",
        openaiApiKey: "",
        openaiSubscriptionToken: "",
        googleApiKey: "",
      });
      setProviderKeyDirty({
        anthropicApiKey: false,
        claudeSubscriptionToken: false,
        openaiApiKey: false,
        openaiSubscriptionToken: false,
        googleApiKey: false,
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to save provider credentials",
        color: "red",
      });
    },
  });
  const startSubscriptionMutation = useMutation({
    mutationFn: startSubscriptionAuth,
    onSuccess: (data) => {
      setSubscriptionStateDraft((prev) => ({
        ...prev,
        [data.provider]: data.state,
      }));
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
      notifications.show({
        title: "OAuth started",
        message: `Complete auth in provider page, then paste the code here for ${data.provider}.`,
        color: "blue",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to start subscription OAuth",
        color: "red",
      });
    },
  });
  const exchangeSubscriptionMutation = useMutation({
    mutationFn: exchangeSubscriptionCode,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
      queryClient.invalidateQueries({ queryKey: ["agent-provider-availability"] });
      setSubscriptionCodeDraft((prev) => ({ ...prev, [data.provider]: "" }));
      notifications.show({
        title: "Connected",
        message: `${data.provider} subscription connected`,
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to exchange OAuth code",
        color: "red",
      });
    },
  });
  const deleteSubscriptionMutation = useMutation({
    mutationFn: deleteSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
      queryClient.invalidateQueries({ queryKey: ["agent-provider-availability"] });
      notifications.show({
        title: "Disconnected",
        message: "Subscription credentials removed",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to disconnect subscription",
        color: "red",
      });
    },
  });

  const currentSettings = useMemo(
    () => {
      const defaults: AgentSettings = {
        swarmPermissionLevel: "standard",
        policy: {
          allowAutoApply: [],
          requireApproval: [],
          deny: [],
        },
        enabled: true,
        enableDailySummary: true,
        enableAutoTriage: true,
        enableMemoryAutoIngest: true,
        enableActivityTracking: true,
        enableGoalAutoLink: true,
        enablePlannerLoop: true,
        enableProactiveQuestions: true,
        enableAutonomousLoop: false,
        enableMemoryInsights: true,
        allowAgentChat: true,
        allowTaskWrites: false,
        allowPageWrites: false,
        allowProjectWrites: false,
        allowGoalWrites: false,
        allowResearchWrites: false,
        allowPublicAgentRegistration: false,
        chatDraftLimit: 300,
        autonomySchedule: {
          dailyEnabled: true,
          dailyHour: 7,
          weeklyEnabled: true,
          weeklyDay: 1,
          monthlyEnabled: true,
          monthlyDay: 1,
          timezone: defaultTimezone,
        },
        spaceOverrides: {},
        hostingMode: 'local' as AgentHostingMode,
        runtimeEndpoint: '',
        runtimeAuthType: 'api_key',
        runtimeApiKey: '',
        defaultRegion: '',
        runtimeStatus: undefined,
      };

      if (!settingsQuery.data) {
        return defaults;
      }

      return {
        ...defaults,
        ...settingsQuery.data,
        policy: {
          ...defaults.policy,
          ...settingsQuery.data.policy,
        },
        autonomySchedule: {
          ...defaults.autonomySchedule,
          ...settingsQuery.data.autonomySchedule,
        },
        spaceOverrides: settingsQuery.data.spaceOverrides || {},
      };
    },
    [settingsQuery.data, defaultTimezone]
  );

  useEffect(() => {
    if (!settingsQuery.data) return;
    setCurrentUser((prev) => {
      if (!prev?.workspace) return prev;
      const existing = prev.workspace.settings?.agent;
      if (existing === settingsQuery.data) return prev;
      return {
        ...prev,
        workspace: {
          ...prev.workspace,
          settings: {
            ...prev.workspace.settings,
            agent: settingsQuery.data,
          },
        },
      };
    });
  }, [settingsQuery.data, setCurrentUser]);

  useEffect(() => {
    setPolicyDraft({
      allowAutoApply: (currentSettings.policy?.allowAutoApply || []).join(", "),
      requireApproval: (currentSettings.policy?.requireApproval || []).join(", "),
      deny: (currentSettings.policy?.deny || []).join(", "),
    });
  }, [currentSettings.policy]);

  const handleToggle = (key: keyof AgentSettings) => (event: React.ChangeEvent<HTMLInputElement>) => {
    mutation.mutate({ [key]: event.currentTarget.checked });
  };

  const updateSchedule = (updates: Partial<AgentSettings["autonomySchedule"]>) => {
    mutation.mutate({
      autonomySchedule: {
        ...currentSettings.autonomySchedule,
        ...updates,
      },
    });
  };

  const updatePolicy = () => {
    const parseList = (value: string) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    mutation.mutate({
      policy: {
        allowAutoApply: parseList(policyDraft.allowAutoApply),
        requireApproval: parseList(policyDraft.requireApproval),
        deny: parseList(policyDraft.deny),
      },
    });
  };

  const updateSpaceOverride = (
    spaceId: string,
    updates: Partial<AgentSettings["autonomySchedule"]>
  ) => {
    const existing = currentSettings.spaceOverrides?.[spaceId]?.autonomySchedule || {};
    mutation.mutate({
      spaceOverrides: {
        ...(currentSettings.spaceOverrides || {}),
        [spaceId]: {
          autonomySchedule: {
            ...currentSettings.autonomySchedule,
            ...existing,
            ...updates,
          },
        },
      },
    });
  };

  const handoffMutation = useMutation({
    mutationFn: (name?: string) => createAgentHandoff({ name }),
    onSuccess: (data) => {
      setHandoffKey(data.apiKey);
      notifications.show({
        title: "Agent key created",
        message: "Copy the key now - it will only be shown once.",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to create agent handoff key",
        color: "red",
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => runAgentSchedule(),
    onSuccess: () => {
      notifications.show({
        title: "Scheduled run started",
        message: "Autonomy cycle triggered for enabled spaces.",
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["agent-settings"] });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to trigger autonomy schedule",
        color: "red",
      });
    },
  });

  const runSpaceMutation = useMutation({
    mutationFn: (spaceId: string) => runAgentLoop({ spaceId }),
    onSuccess: () => {
      notifications.show({
        title: "Autonomy cycle started",
        message: "Agent loop kicked off for this space.",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to run agent loop for this space",
        color: "red",
      });
    },
  });

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>Agent Controls</Title>
          <Text size="xs" c="dimmed">
            Workspace-wide
          </Text>
        </Group>
        <Card withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Personal LLM Credentials
              </Text>
              <Button
                size="xs"
                onClick={() =>
                  providerAuthMutation.mutate({
                    anthropicApiKey: providerKeyDirty.anthropicApiKey
                      ? providerKeyDraft.anthropicApiKey
                      : undefined,
                    claudeSubscriptionToken:
                      providerKeyDirty.claudeSubscriptionToken
                        ? providerKeyDraft.claudeSubscriptionToken
                        : undefined,
                    openaiApiKey: providerKeyDirty.openaiApiKey
                      ? providerKeyDraft.openaiApiKey
                      : undefined,
                    openaiSubscriptionToken:
                      providerKeyDirty.openaiSubscriptionToken
                        ? providerKeyDraft.openaiSubscriptionToken
                        : undefined,
                    googleApiKey: providerKeyDirty.googleApiKey
                      ? providerKeyDraft.googleApiKey
                      : undefined,
                  })
                }
                loading={providerAuthMutation.isPending}
                disabled={
                  !providerKeyDirty.anthropicApiKey &&
                  !providerKeyDirty.claudeSubscriptionToken &&
                  !providerKeyDirty.openaiApiKey &&
                  !providerKeyDirty.openaiSubscriptionToken &&
                  !providerKeyDirty.googleApiKey
                }
              >
                Save Keys
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Per-user swarm credentials. You can use API keys or subscription auth
              tokens where supported. Edited fields are saved.
            </Text>
            <Divider label="OAuth Subscriptions" labelPosition="left" />
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Claude Subscription
                </Text>
                <Badge
                  color={
                    subscriptionStatusQuery.data?.providers["anthropic-subscription"]?.connected
                      ? "green"
                      : "gray"
                  }
                  variant="light"
                >
                  {subscriptionStatusQuery.data?.providers["anthropic-subscription"]?.connected
                    ? `Connected (${subscriptionStatusQuery.data.providers["anthropic-subscription"].source})`
                    : "Not connected"}
                </Badge>
              </Group>
              <Group grow>
                <TextInput
                  label="OAuth Code"
                  placeholder="Paste authorization code"
                  value={subscriptionCodeDraft["anthropic-subscription"]}
                  onChange={(event) =>
                    setSubscriptionCodeDraft((prev) => ({
                      ...prev,
                      "anthropic-subscription": event.currentTarget.value,
                    }))
                  }
                />
                <Button
                  mt={26}
                  variant="light"
                  onClick={() =>
                    startSubscriptionMutation.mutate("anthropic-subscription")
                  }
                  loading={startSubscriptionMutation.isPending}
                >
                  Start OAuth
                </Button>
                <Button
                  mt={26}
                  onClick={() =>
                    exchangeSubscriptionMutation.mutate({
                      provider: "anthropic-subscription",
                      code: subscriptionCodeDraft["anthropic-subscription"],
                      state: subscriptionStateDraft["anthropic-subscription"] || undefined,
                    })
                  }
                  loading={exchangeSubscriptionMutation.isPending}
                  disabled={!subscriptionCodeDraft["anthropic-subscription"].trim()}
                >
                  Exchange Code
                </Button>
                <Button
                  mt={26}
                  color="red"
                  variant="subtle"
                  onClick={() =>
                    deleteSubscriptionMutation.mutate("anthropic-subscription")
                  }
                  loading={deleteSubscriptionMutation.isPending}
                >
                  Disconnect
                </Button>
              </Group>
            </Stack>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  OpenAI Codex Subscription
                </Text>
                <Badge
                  color={
                    subscriptionStatusQuery.data?.providers["openai-codex"]?.connected
                      ? "green"
                      : "gray"
                  }
                  variant="light"
                >
                  {subscriptionStatusQuery.data?.providers["openai-codex"]?.connected
                    ? `Connected (${subscriptionStatusQuery.data.providers["openai-codex"].source})`
                    : "Not connected"}
                </Badge>
              </Group>
              <Group grow>
                <TextInput
                  label="OAuth Code"
                  placeholder="Paste authorization code"
                  value={subscriptionCodeDraft["openai-codex"]}
                  onChange={(event) =>
                    setSubscriptionCodeDraft((prev) => ({
                      ...prev,
                      "openai-codex": event.currentTarget.value,
                    }))
                  }
                />
                <Button
                  mt={26}
                  variant="light"
                  onClick={() =>
                    startSubscriptionMutation.mutate("openai-codex")
                  }
                  loading={startSubscriptionMutation.isPending}
                >
                  Start OAuth
                </Button>
                <Button
                  mt={26}
                  onClick={() =>
                    exchangeSubscriptionMutation.mutate({
                      provider: "openai-codex",
                      code: subscriptionCodeDraft["openai-codex"],
                      state: subscriptionStateDraft["openai-codex"] || undefined,
                    })
                  }
                  loading={exchangeSubscriptionMutation.isPending}
                  disabled={!subscriptionCodeDraft["openai-codex"].trim()}
                >
                  Exchange Code
                </Button>
                <Button
                  mt={26}
                  color="red"
                  variant="subtle"
                  onClick={() =>
                    deleteSubscriptionMutation.mutate("openai-codex")
                  }
                  loading={deleteSubscriptionMutation.isPending}
                >
                  Disconnect
                </Button>
              </Group>
            </Stack>
            <Group grow>
              <PasswordInput
                label="Claude (Anthropic)"
                placeholder="sk-ant-..."
                value={providerKeyDraft.anthropicApiKey}
                onChange={(event) => {
                  setProviderKeyDraft((prev) => ({
                    ...prev,
                    anthropicApiKey: event.currentTarget.value,
                  }));
                  setProviderKeyDirty((prev) => ({
                    ...prev,
                    anthropicApiKey: true,
                  }));
                }}
              />
              <Badge
                mt={26}
                color={
                  providerAvailabilityQuery.data?.providers.claude.available
                    ? "green"
                    : "gray"
                }
                variant="light"
              >
                {providerAvailabilityQuery.data?.providers.claude.available
                  ? `Available (${providerAvailabilityQuery.data.providers.claude.source})`
                  : "Unavailable"}
              </Badge>
            </Group>
            <PasswordInput
              label="Claude Subscription Token (optional)"
              placeholder="subscription token"
              value={providerKeyDraft.claudeSubscriptionToken}
              onChange={(event) => {
                setProviderKeyDraft((prev) => ({
                  ...prev,
                  claudeSubscriptionToken: event.currentTarget.value,
                }));
                setProviderKeyDirty((prev) => ({
                  ...prev,
                  claudeSubscriptionToken: true,
                }));
              }}
            />
            <Group grow>
              <PasswordInput
                label="Codex (OpenAI)"
                placeholder="sk-..."
                value={providerKeyDraft.openaiApiKey}
                onChange={(event) => {
                  setProviderKeyDraft((prev) => ({
                    ...prev,
                    openaiApiKey: event.currentTarget.value,
                  }));
                  setProviderKeyDirty((prev) => ({
                    ...prev,
                    openaiApiKey: true,
                  }));
                }}
              />
              <Badge
                mt={26}
                color={
                  providerAvailabilityQuery.data?.providers.codex.available
                    ? "green"
                    : "gray"
                }
                variant="light"
              >
                {providerAvailabilityQuery.data?.providers.codex.available
                  ? `Available (${providerAvailabilityQuery.data.providers.codex.source})`
                  : "Unavailable"}
              </Badge>
            </Group>
            <PasswordInput
              label="OpenAI Subscription Token (optional)"
              placeholder="subscription token"
              value={providerKeyDraft.openaiSubscriptionToken}
              onChange={(event) => {
                setProviderKeyDraft((prev) => ({
                  ...prev,
                  openaiSubscriptionToken: event.currentTarget.value,
                }));
                setProviderKeyDirty((prev) => ({
                  ...prev,
                  openaiSubscriptionToken: true,
                }));
              }}
            />
            <Group grow>
              <PasswordInput
                label="Gemini (Google)"
                placeholder="AIza..."
                value={providerKeyDraft.googleApiKey}
                onChange={(event) => {
                  setProviderKeyDraft((prev) => ({
                    ...prev,
                    googleApiKey: event.currentTarget.value,
                  }));
                  setProviderKeyDirty((prev) => ({
                    ...prev,
                    googleApiKey: true,
                  }));
                }}
              />
              <Badge
                mt={26}
                color={
                  providerAvailabilityQuery.data?.providers.gemini.available
                    ? "green"
                    : "gray"
                }
                variant="light"
              >
                {providerAvailabilityQuery.data?.providers.gemini.available
                  ? `Available (${providerAvailabilityQuery.data.providers.gemini.source})`
                  : "Unavailable"}
              </Badge>
            </Group>
            {!providerAvailabilityQuery.data?.providers.claude.available &&
            !providerAvailabilityQuery.data?.providers.codex.available &&
            !providerAvailabilityQuery.data?.providers.gemini.available ? (
              <Alert color="yellow" variant="light">
                No providers are available yet. Configure a personal key or set a
                global infrastructure key.
              </Alert>
            ) : null}
          </Stack>
        </Card>
        {!isAdmin && (
          <Text size="sm" c="dimmed">
            You need admin permissions to edit agent settings.
          </Text>
        )}
        <Stack gap="xs">
          <Select
            label={toLabel("Swarm permission level")}
            description="Global default for coding-swarm and team CLI agents."
            data={[
              { value: "readonly", label: "Readonly" },
              { value: "standard", label: "Standard" },
              { value: "permissive", label: "Permissive" },
              { value: "yolo", label: "Yolo" },
            ]}
            value={currentSettings.swarmPermissionLevel}
            onChange={(value) =>
              mutation.mutate({
                swarmPermissionLevel:
                  (value as AgentSettings["swarmPermissionLevel"]) || "standard",
              })
            }
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Enable agent")}
            checked={currentSettings.enabled}
            onChange={handleToggle("enabled")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Daily summaries")}
            checked={currentSettings.enableDailySummary}
            onChange={handleToggle("enableDailySummary")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Auto triage context")}
            checked={currentSettings.enableAutoTriage}
            onChange={handleToggle("enableAutoTriage")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Auto-ingest memories")}
            checked={currentSettings.enableMemoryAutoIngest}
            onChange={handleToggle("enableMemoryAutoIngest")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Track active time")}
            checked={currentSettings.enableActivityTracking}
            onChange={handleToggle("enableActivityTracking")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Auto-link tasks to goals")}
            checked={currentSettings.enableGoalAutoLink}
            onChange={handleToggle("enableGoalAutoLink")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Planner loop")}
            checked={currentSettings.enablePlannerLoop}
            onChange={handleToggle("enablePlannerLoop")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Proactive questions")}
            checked={currentSettings.enableProactiveQuestions}
            onChange={handleToggle("enableProactiveQuestions")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Autonomous agent loop")}
            checked={currentSettings.enableAutonomousLoop}
            onChange={handleToggle("enableAutonomousLoop")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Memory insights pipeline")}
            checked={currentSettings.enableMemoryInsights}
            onChange={handleToggle("enableMemoryInsights")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Allow agent chat")}
            checked={currentSettings.allowAgentChat}
            onChange={handleToggle("allowAgentChat")}
            disabled={!isAdmin}
          />
          <NumberInput
            label={toLabel("Chat draft message limit")}
            value={currentSettings.chatDraftLimit}
            min={50}
            max={2000}
            step={25}
            onChange={(value) =>
              mutation.mutate({
                chatDraftLimit:
                  typeof value === "number" ? value : currentSettings.chatDraftLimit,
              })
            }
            disabled={!isAdmin}
            description="Max messages used for playbook drafts from chat."
          />
          <Group mt="xs">
            <Text size="xs" c="dimmed">
              Write permissions (off by default)
            </Text>
          </Group>
          <Switch
            label={toLabel("Allow task writes")}
            checked={currentSettings.allowTaskWrites}
            onChange={handleToggle("allowTaskWrites")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Allow page writes")}
            checked={currentSettings.allowPageWrites}
            onChange={handleToggle("allowPageWrites")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Allow project writes")}
            checked={currentSettings.allowProjectWrites}
            onChange={handleToggle("allowProjectWrites")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Allow goal writes")}
            checked={currentSettings.allowGoalWrites}
            onChange={handleToggle("allowGoalWrites")}
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Allow research writes")}
            checked={currentSettings.allowResearchWrites}
            onChange={handleToggle("allowResearchWrites")}
            disabled={!isAdmin}
          />
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Agent policy rules
          </Text>
          <Text size="xs" c="dimmed">
            Comma-separated MCP methods (ex: task.create, page.create).
          </Text>
          <TextInput
            label="Auto-apply allowlist"
            placeholder="task.update, page.create"
            value={policyDraft.allowAutoApply}
            onChange={(event) =>
              setPolicyDraft((prev) => ({
                ...prev,
                allowAutoApply: event.currentTarget.value,
              }))
            }
            disabled={!isAdmin}
          />
          <TextInput
            label="Require approval"
            placeholder="project.create, task.create"
            value={policyDraft.requireApproval}
            onChange={(event) =>
              setPolicyDraft((prev) => ({
                ...prev,
                requireApproval: event.currentTarget.value,
              }))
            }
            disabled={!isAdmin}
          />
          <TextInput
            label="Deny list"
            placeholder="workspace.delete"
            value={policyDraft.deny}
            onChange={(event) =>
              setPolicyDraft((prev) => ({
                ...prev,
                deny: event.currentTarget.value,
              }))
            }
            disabled={!isAdmin}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              onClick={updatePolicy}
              disabled={!isAdmin}
            >
              Save policy rules
            </Button>
          </Group>
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Autonomy cadence
          </Text>
          <Switch
            label={toLabel("Run daily")}
            checked={currentSettings.autonomySchedule.dailyEnabled}
            onChange={(event) =>
              updateSchedule({ dailyEnabled: event.currentTarget.checked })
            }
            disabled={!isAdmin}
          />
          <NumberInput
            label="Daily hour"
            min={0}
            max={23}
            value={currentSettings.autonomySchedule.dailyHour}
            onChange={(value) =>
              updateSchedule({ dailyHour: Number(value) || 0 })
            }
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Run weekly")}
            checked={currentSettings.autonomySchedule.weeklyEnabled}
            onChange={(event) =>
              updateSchedule({ weeklyEnabled: event.currentTarget.checked })
            }
            disabled={!isAdmin}
          />
          <NumberInput
            label="Weekly day (0=Sun)"
            min={0}
            max={6}
            value={currentSettings.autonomySchedule.weeklyDay}
            onChange={(value) =>
              updateSchedule({ weeklyDay: Number(value) || 0 })
            }
            disabled={!isAdmin}
          />
          <Switch
            label={toLabel("Run monthly")}
            checked={currentSettings.autonomySchedule.monthlyEnabled}
            onChange={(event) =>
              updateSchedule({ monthlyEnabled: event.currentTarget.checked })
            }
            disabled={!isAdmin}
          />
          <NumberInput
            label="Monthly day"
            min={1}
            max={28}
            value={currentSettings.autonomySchedule.monthlyDay}
            onChange={(value) =>
              updateSchedule({ monthlyDay: Number(value) || 1 })
            }
            disabled={!isAdmin}
          />
          <TextInput
            label="Timezone"
            placeholder="America/Los_Angeles"
            value={currentSettings.autonomySchedule.timezone || defaultTimezone}
            onChange={(event) =>
              updateSchedule({ timezone: event.currentTarget.value || "UTC" })
            }
            disabled={!isAdmin}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Last daily run:{" "}
              {currentSettings.autonomySchedule.lastDailyRun || "Never"}
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={() => scheduleMutation.mutate()}
              loading={scheduleMutation.isPending}
              disabled={!isAdmin}
            >
              Run cadence now
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Last weekly run:{" "}
            {currentSettings.autonomySchedule.lastWeeklyRun || "Never"}
          </Text>
          <Text size="xs" c="dimmed">
            Last monthly run:{" "}
            {currentSettings.autonomySchedule.lastMonthlyRun || "Never"}
          </Text>
          <Text size="xs" c="dimmed">
            Schedule runs in the selected timezone. Daily hour is shared across weekly/monthly runs.
          </Text>
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Space overrides
          </Text>
          {spacesQuery.data?.items?.length ? (
            <Stack gap="xs">
              {spacesQuery.data.items.map((space) => {
                const override =
                  currentSettings.spaceOverrides?.[space.id]?.autonomySchedule;
                const effective = {
                  ...currentSettings.autonomySchedule,
                  ...(override || {}),
                };
                const overrideActive = Boolean(override);
                return (
                  <Card key={space.id} withBorder radius="sm" p="sm">
                    <Group justify="space-between" mb="xs">
                      <Text size="sm" fw={600}>
                        {space.name || "Space"}
                      </Text>
                      <Group>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => runSpaceMutation.mutate(space.id)}
                          loading={runSpaceMutation.isPending && runSpaceMutation.variables === space.id}
                          disabled={!isAdmin}
                        >
                          Run this space
                        </Button>
                        <Switch
                          label="Override"
                          checked={Boolean(override)}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              updateSpaceOverride(space.id, {});
                            } else {
                              const nextOverrides = {
                                ...(currentSettings.spaceOverrides || {}),
                              };
                              delete nextOverrides[space.id];
                              mutation.mutate({
                                spaceOverrides: nextOverrides,
                              });
                            }
                          }}
                          disabled={!isAdmin}
                        />
                      </Group>
                    </Group>
                    <Group grow>
                      <NumberInput
                        label="Daily hour"
                        min={0}
                        max={23}
                        value={effective.dailyHour}
                        onChange={(value) =>
                          updateSpaceOverride(space.id, { dailyHour: Number(value) || 0 })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                      <NumberInput
                        label="Weekly day (0=Sun)"
                        min={0}
                        max={6}
                        value={effective.weeklyDay}
                        onChange={(value) =>
                          updateSpaceOverride(space.id, { weeklyDay: Number(value) || 0 })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                    </Group>
                    <Group grow mt="xs">
                      <NumberInput
                        label="Monthly day"
                        min={1}
                        max={28}
                        value={effective.monthlyDay}
                        onChange={(value) =>
                          updateSpaceOverride(space.id, { monthlyDay: Number(value) || 1 })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                      <TextInput
                        label="Timezone"
                        value={effective.timezone || defaultTimezone}
                        onChange={(event) =>
                          updateSpaceOverride(space.id, {
                            timezone: event.currentTarget.value || "UTC",
                          })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                    </Group>
                    <Group mt="xs">
                      <Switch
                        label="Daily"
                        checked={effective.dailyEnabled}
                        onChange={(event) =>
                          updateSpaceOverride(space.id, {
                            dailyEnabled: event.currentTarget.checked,
                          })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                      <Switch
                        label="Weekly"
                        checked={effective.weeklyEnabled}
                        onChange={(event) =>
                          updateSpaceOverride(space.id, {
                            weeklyEnabled: event.currentTarget.checked,
                          })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                      <Switch
                        label="Monthly"
                        checked={effective.monthlyEnabled}
                        onChange={(event) =>
                          updateSpaceOverride(space.id, {
                            monthlyEnabled: event.currentTarget.checked,
                          })
                        }
                        disabled={!isAdmin || !overrideActive}
                      />
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No spaces found.
            </Text>
          )}
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              External agent access
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={() => handoffMutation.mutate("External agent handoff")}
              loading={handoffMutation.isPending}
              disabled={!isAdmin}
            >
              Generate key
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Creates a scoped MCP API key for external agents. Store it securely.
          </Text>
          <Switch
            label={toLabel("Allow public agent registration")}
            description="When enabled, any agent can request access to this workspace without an invite"
            checked={currentSettings.allowPublicAgentRegistration}
            onChange={handleToggle("allowPublicAgentRegistration")}
            disabled={!isAdmin}
            mt="sm"
          />
          {handoffKey ? (
            <Group gap="xs" wrap="nowrap">
              <TextInput
                value={handoffKey}
                readOnly
                size="sm"
                style={{ flex: 1 }}
              />
              <CopyButton value={handoffKey}>
                {({ copied, copy }) => (
                  <Button size="xs" variant="subtle" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">
              No handoff key generated yet.
            </Text>
          )}
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Agent Runtime Hosting
          </Text>
          <Text size="xs" c="dimmed">
            Configure where agent runtimes execute. Local mode runs on your machine,
            Parallax Cloud provides managed infrastructure, or connect a custom cluster.
          </Text>
          <SegmentedControl
            value={currentSettings.hostingMode}
            onChange={(value) => mutation.mutate({ hostingMode: value as AgentHostingMode })}
            disabled={!isAdmin}
            data={[
              { label: 'Local', value: 'local' },
              { label: 'Parallax Cloud', value: 'parallax' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
          {currentSettings.hostingMode !== 'parallax' && (
            <>
              <TextInput
                label="Runtime endpoint"
                placeholder="http://localhost:8765"
                description="URL where the agent runtime is listening"
                value={currentSettings.runtimeEndpoint || ''}
                onChange={(event) =>
                  mutation.mutate({ runtimeEndpoint: event.currentTarget.value })
                }
                disabled={!isAdmin}
              />
              <SegmentedControl
                value={currentSettings.runtimeAuthType || 'api_key'}
                onChange={(value) => mutation.mutate({ runtimeAuthType: value as any })}
                disabled={!isAdmin}
                data={[
                  { label: 'API Key', value: 'api_key' },
                  { label: 'None', value: 'none' },
                ]}
              />
              {currentSettings.runtimeAuthType === 'api_key' && (
                <TextInput
                  label="Runtime API key"
                  placeholder="sk-..."
                  description="API key for authenticating with the runtime"
                  value={currentSettings.runtimeApiKey || ''}
                  onChange={(event) =>
                    mutation.mutate({ runtimeApiKey: event.currentTarget.value })
                  }
                  disabled={!isAdmin}
                  type="password"
                />
              )}
            </>
          )}
          {currentSettings.hostingMode === 'parallax' && (
            <TextInput
              label="Default region"
              placeholder="us-west-2"
              description="Preferred region for Parallax-managed agents"
              value={currentSettings.defaultRegion || ''}
              onChange={(event) =>
                mutation.mutate({ defaultRegion: event.currentTarget.value })
              }
              disabled={!isAdmin}
            />
          )}
          <Card withBorder radius="sm" p="sm" mt="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Runtime Status</Text>
              <Group gap="xs">
                {currentSettings.runtimeStatus?.connected ? (
                  <Badge color="green" leftSection={<IconCheck size={12} />}>
                    Connected
                  </Badge>
                ) : (
                  <Badge color="gray" leftSection={<IconX size={12} />}>
                    Disconnected
                  </Badge>
                )}
                <Tooltip label="Test connection">
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!isAdmin || !currentSettings.runtimeEndpoint}
                    leftSection={<IconRefresh size={14} />}
                  >
                    Test
                  </Button>
                </Tooltip>
              </Group>
            </Group>
            {currentSettings.runtimeStatus && (
              <Stack gap={4} mt="xs">
                {currentSettings.runtimeStatus.lastHeartbeat && (
                  <Text size="xs" c="dimmed">
                    Last heartbeat: {new Date(currentSettings.runtimeStatus.lastHeartbeat).toLocaleString()}
                  </Text>
                )}
                {currentSettings.runtimeStatus.activeAgents !== undefined && (
                  <Text size="xs" c="dimmed">
                    Active agents: {currentSettings.runtimeStatus.activeAgents}
                  </Text>
                )}
                {currentSettings.runtimeStatus.version && (
                  <Text size="xs" c="dimmed">
                    Runtime version: {currentSettings.runtimeStatus.version}
                  </Text>
                )}
                {currentSettings.runtimeStatus.error && (
                  <Text size="xs" c="red">
                    Error: {currentSettings.runtimeStatus.error}
                  </Text>
                )}
              </Stack>
            )}
          </Card>
        </Stack>
        <Divider />
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Recent autonomy runs
          </Text>
          {recentRunsQuery.isLoading ? (
            <Text size="xs" c="dimmed">
              Loading runs...
            </Text>
          ) : recentRunsQuery.data?.length ? (
            <Stack gap="xs">
              {recentRunsQuery.data.map((run) => {
                const content = run.content as Record<string, any> | undefined;
                const actions = Array.isArray(content?.actions) ? content?.actions : [];
                return (
                  <Card key={run.id} withBorder radius="sm" p="sm">
                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Text size="sm" fw={600}>
                          {run.summary || "Autonomy run"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {run.timestamp
                            ? new Date(run.timestamp).toLocaleString()
                            : ""}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Actions: {actions.length}
                      </Text>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No runs recorded yet.
            </Text>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
