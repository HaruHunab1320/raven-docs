import SettingsTitle from "@/components/settings/settings-title.tsx";
import WorkspaceNameForm from "@/features/workspace/components/settings/components/workspace-name-form";
import { useTranslation } from "react-i18next";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { Box, Divider } from "@mantine/core";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { AgentSettingsPanel } from "@/features/agent/components/agent-settings-panel";
import { WorkspaceRepoTokensPanel } from "@/features/workspace/components/settings/components/workspace-repo-tokens-panel";
import { WorkspaceChatIntegrationsPanel } from "@/features/workspace/components/settings/components/workspace-chat-integrations-panel";
import { KnowledgeSourcesPanel } from "@/features/knowledge/components/knowledge-sources-panel";

export default function WorkspaceSettings() {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);

  return (
    <>
      <Helmet>
        <title>Workspace Settings - {getAppName()}</title>
      </Helmet>

      <Box id="name">
        <SettingsTitle title={t("General")} />
        <WorkspaceNameForm />
      </Box>

      <Divider my="md" />

      <Box id="agent">
        <AgentSettingsPanel />
      </Box>

      <Divider my="md" />

      <Box id="knowledge">
        <SettingsTitle title={t("Knowledge")} />
        {workspace?.id && (
          <KnowledgeSourcesPanel
            workspaceId={workspace.id}
            scope="workspace"
          />
        )}
      </Box>

      <Divider my="md" />

      <Box id="repo-tokens">
        <SettingsTitle title={t("Repository tokens")} />
        <WorkspaceRepoTokensPanel />
      </Box>

      <Divider my="md" />

      <Box id="chat-integrations">
        <SettingsTitle title={t("Chat integrations")} />
        <WorkspaceChatIntegrationsPanel />
      </Box>
    </>
  );
}
