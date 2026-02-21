import api from "@/lib/api-client";

const ENDPOINT = "coding-swarm";

export interface SwarmExecution {
  id: string;
  status: string;
  agentType: string;
  agentId?: string;
  taskDescription: string;
  outputSummary?: string;
  exitCode?: number;
  results?: Record<string, any>;
  filesChanged?: string[];
  experimentId?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ExecuteSwarmParams {
  repoUrl?: string;
  taskDescription: string;
  experimentId?: string;
  spaceId?: string;
  agentType?: string;
  baseBranch?: string;
  branchName?: string;
  taskContext?: Record<string, any>;
}

export interface ExecuteSwarmResult {
  executionId: string;
  status: string;
}

export interface SwarmListResult {
  executions: SwarmExecution[];
  total: number;
}

export interface SwarmLogsResult {
  logs: Array<{ content: string }>;
  message?: string;
}

export async function executeSwarm(
  params: ExecuteSwarmParams,
): Promise<ExecuteSwarmResult> {
  const req = await api.post<ExecuteSwarmResult>(`${ENDPOINT}/execute`, params);
  return req.data;
}

export async function getSwarmStatus(
  executionId: string,
): Promise<SwarmExecution> {
  const req = await api.post<SwarmExecution>(`${ENDPOINT}/status`, {
    executionId,
  });
  return req.data;
}

export async function listSwarmExecutions(params: {
  status?: string;
  experimentId?: string;
  limit?: number;
}): Promise<SwarmListResult> {
  const req = await api.post<SwarmListResult>(`${ENDPOINT}/list`, params);
  return req.data;
}

export async function stopSwarmExecution(
  executionId: string,
): Promise<{ success: boolean; executionId: string; status: string }> {
  const req = await api.post<{
    success: boolean;
    executionId: string;
    status: string;
  }>(`${ENDPOINT}/stop`, { executionId });
  return req.data;
}

export async function getSwarmLogs(
  executionId: string,
  limit?: number,
): Promise<SwarmLogsResult> {
  const req = await api.post<SwarmLogsResult>(`${ENDPOINT}/logs`, {
    executionId,
    limit,
  });
  return req.data;
}
