import { Tabs, Badge } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { TemplateGallery } from "./template-gallery";
import { MyTemplatesList } from "./my-templates-list";
import { ActiveDeploymentsTable } from "./active-deployments-table";
import { DeployTeamModal } from "./deploy-team-modal";
import { TeamBuilderModal } from "./team-builder-modal";
import { useTeamTemplates, useTeamDeployments } from "../hooks/use-team-queries";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import type { TeamTemplate } from "../types/team.types";

export function TeamManagementPanel() {
  const [workspace] = useAtom(workspaceAtom);
  const workspaceId = workspace?.id || "";
  const { data: templates } = useTeamTemplates();
  const { data: deployments } = useTeamDeployments(workspaceId);

  const customCount = (templates || []).filter((t) => !t.isSystem).length;
  const activeCount = (deployments || []).filter(
    (d) => d.status !== "torn_down",
  ).length;

  const [deployOpened, { open: openDeploy, close: closeDeploy }] =
    useDisclosure(false);
  const [builderOpened, { open: openBuilder, close: closeBuilder }] =
    useDisclosure(false);
  const [deployTemplateId, setDeployTemplateId] = useState<string | undefined>();
  const [editTemplate, setEditTemplate] = useState<TeamTemplate | null>(null);

  // Dummy spaceId for workspace-level deployment modal (user picks space in modal later)
  const handleDeploy = (templateId: string) => {
    setDeployTemplateId(templateId);
    openDeploy();
  };

  const handleCloseDeploy = () => {
    closeDeploy();
    setDeployTemplateId(undefined);
  };

  const handleNewTemplate = () => {
    setEditTemplate(null);
    openBuilder();
  };

  const handleEditTemplate = (template: TeamTemplate) => {
    setEditTemplate(template);
    openBuilder();
  };

  const handleCloseBuilder = () => {
    closeBuilder();
    setEditTemplate(null);
  };

  return (
    <>
      <Tabs defaultValue="gallery">
        <Tabs.List>
          <Tabs.Tab value="gallery">Template Gallery</Tabs.Tab>
          <Tabs.Tab
            value="my-templates"
            rightSection={
              customCount > 0 ? (
                <Badge size="xs" variant="filled" circle>
                  {customCount}
                </Badge>
              ) : undefined
            }
          >
            My Templates
          </Tabs.Tab>
          <Tabs.Tab
            value="deployments"
            rightSection={
              activeCount > 0 ? (
                <Badge size="xs" variant="filled" circle>
                  {activeCount}
                </Badge>
              ) : undefined
            }
          >
            Active Deployments
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="gallery" pt="md">
          <TemplateGallery onDeploy={handleDeploy} />
        </Tabs.Panel>

        <Tabs.Panel value="my-templates" pt="md">
          <MyTemplatesList
            onNewTemplate={handleNewTemplate}
            onEditTemplate={handleEditTemplate}
          />
        </Tabs.Panel>

        <Tabs.Panel value="deployments" pt="md">
          <ActiveDeploymentsTable workspaceId={workspaceId} />
        </Tabs.Panel>
      </Tabs>

      <DeployTeamModal
        opened={deployOpened}
        onClose={handleCloseDeploy}
        spaceId=""
        preselectedTemplateId={deployTemplateId}
      />

      <TeamBuilderModal
        opened={builderOpened}
        onClose={handleCloseBuilder}
        template={editTemplate}
      />
    </>
  );
}
