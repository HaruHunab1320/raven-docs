import api from "@/lib/api-client";
import type {
  TeamTemplate,
  TeamDeployment,
  DeploymentDetail,
  OrgPattern,
} from "../types/team.types";

const ENDPOINT = "teams";

// ─── Template Operations ────────────────────────────────────────────────────

export async function listTemplates(): Promise<TeamTemplate[]> {
  const req = await api.post<TeamTemplate[]>(`${ENDPOINT}/templates/list`, {});
  return req.data;
}

export async function getTemplate(templateId: string): Promise<TeamTemplate> {
  const req = await api.post<TeamTemplate>(`${ENDPOINT}/templates/get`, {
    templateId,
  });
  return req.data;
}

export async function createTemplate(params: {
  name: string;
  description?: string;
  version?: string;
  orgPattern: OrgPattern;
  metadata?: Record<string, any>;
}): Promise<TeamTemplate> {
  const req = await api.post<TeamTemplate>(
    `${ENDPOINT}/templates/create`,
    params,
  );
  return req.data;
}

export async function updateTemplate(params: {
  templateId: string;
  name?: string;
  description?: string;
  version?: string;
  orgPattern?: OrgPattern;
  metadata?: Record<string, any>;
}): Promise<TeamTemplate> {
  const req = await api.post<TeamTemplate>(
    `${ENDPOINT}/templates/update`,
    params,
  );
  return req.data;
}

export async function duplicateTemplate(
  templateId: string,
): Promise<TeamTemplate> {
  const req = await api.post<TeamTemplate>(
    `${ENDPOINT}/templates/duplicate`,
    { templateId },
  );
  return req.data;
}

export async function deleteTemplate(
  templateId: string,
): Promise<TeamTemplate> {
  const req = await api.post<TeamTemplate>(
    `${ENDPOINT}/templates/delete`,
    { templateId },
  );
  return req.data;
}

// ─── Deployment Operations ──────────────────────────────────────────────────

export async function deployTeam(params: {
  templateId: string;
  spaceId: string;
  projectId?: string;
  teamName?: string;
}): Promise<DeploymentDetail> {
  const req = await api.post<DeploymentDetail>(`${ENDPOINT}/deploy`, params);
  return req.data;
}

export async function listDeployments(params: {
  spaceId?: string;
  status?: string;
  includeTornDown?: boolean;
}): Promise<TeamDeployment[]> {
  const req = await api.post<TeamDeployment[]>(
    `${ENDPOINT}/deployments/list`,
    params,
  );
  return req.data;
}

export async function redeployTeam(params: {
  sourceDeploymentId: string;
  spaceId?: string;
  projectId?: string;
  memoryPolicy?: "none" | "carry_all";
  teamName?: string;
}): Promise<DeploymentDetail> {
  const req = await api.post<DeploymentDetail>(
    `${ENDPOINT}/deployments/redeploy`,
    params,
  );
  return req.data;
}

export async function renameDeployment(params: {
  deploymentId: string;
  teamName: string;
}): Promise<TeamDeployment> {
  const req = await api.post<TeamDeployment>(
    `${ENDPOINT}/deployments/rename`,
    params,
  );
  return req.data;
}

export async function getDeploymentStatus(
  deploymentId: string,
): Promise<DeploymentDetail> {
  const req = await api.post<DeploymentDetail>(
    `${ENDPOINT}/deployments/status`,
    { deploymentId },
  );
  return req.data;
}

export async function triggerTeamRun(
  deploymentId: string,
): Promise<{ triggered: number; jobs: any[] }> {
  const req = await api.post<{ triggered: number; jobs: any[] }>(
    `${ENDPOINT}/deployments/trigger`,
    { deploymentId },
  );
  return req.data;
}

export async function pauseDeployment(
  deploymentId: string,
): Promise<TeamDeployment> {
  const req = await api.post<TeamDeployment>(
    `${ENDPOINT}/deployments/pause`,
    { deploymentId },
  );
  return req.data;
}

export async function resumeDeployment(
  deploymentId: string,
): Promise<TeamDeployment> {
  const req = await api.post<TeamDeployment>(
    `${ENDPOINT}/deployments/resume`,
    { deploymentId },
  );
  return req.data;
}

export async function teardownDeployment(
  deploymentId: string,
): Promise<{ success: boolean; deploymentId: string }> {
  const req = await api.post<{ success: boolean; deploymentId: string }>(
    `${ENDPOINT}/deployments/teardown`,
    { deploymentId },
  );
  return req.data;
}

export async function startWorkflow(
  deploymentId: string,
): Promise<{ started: boolean; deploymentId: string }> {
  const req = await api.post<{ started: boolean; deploymentId: string }>(
    `${ENDPOINT}/deployments/workflow/start`,
    { deploymentId },
  );
  return req.data;
}
