import api from "@/lib/api-client";
import {
  AgentChatContextResponse,
  AgentChatResponse,
  AgentSettings,
} from "@/features/agent/types/agent.types";

export async function getAgentSettings(): Promise<AgentSettings> {
  const req = await api.post<AgentSettings>("/workspace/agent-settings");
  return req.data;
}

export async function updateAgentSettings(
  data: Partial<AgentSettings>
): Promise<AgentSettings> {
  const req = await api.post<AgentSettings>("/workspace/agent-settings/update", data);
  return req.data;
}

export async function sendAgentChat(params: {
  spaceId: string;
  message: string;
  pageId?: string;
  projectId?: string;
  sessionId?: string;
  autoApprove?: boolean;
  internal?: boolean;
}): Promise<AgentChatResponse> {
  const req = await api.post<AgentChatResponse>("/agent/chat", params);
  return req.data;
}

export async function getAgentChatContext(params: {
  spaceId: string;
  message?: string;
  pageId?: string;
  projectId?: string;
  sessionId?: string;
}): Promise<AgentChatContextResponse> {
  const req = await api.post<AgentChatContextResponse>(
    "/agent/chat-context",
    params
  );
  return req.data;
}

export async function runAgentPlan(params: {
  spaceId: string;
  horizon?: "daily" | "short" | "mid" | "long";
}): Promise<{ plan?: string | null }> {
  const req = await api.post("/agent/plan", params);
  return req.data;
}

export async function runAgentPlanCascade(params: { spaceId: string }) {
  const req = await api.post("/agent/plan/cascade", params);
  return req.data;
}

export async function approveAgentPlan(params: {
  spaceId: string;
  planId: string;
}) {
  const req = await api.post("/agent/plan/approve", params);
  return req.data;
}

export async function rejectAgentPlan(params: {
  spaceId: string;
  planId: string;
  reason?: string;
}) {
  const req = await api.post("/agent/plan/reject", params);
  return req.data;
}

export async function runAgentLoop(params: {
  spaceId: string;
}): Promise<{ summary: string; actions: Array<{ method: string; status: string }> }> {
  const req = await api.post("/agent/loop/run", params);
  return req.data;
}

export async function runAgentSchedule(): Promise<{ ran: number }> {
  const req = await api.post("/agent/loop/schedule-run");
  return req.data;
}

export async function getAgentSuggestions(params: {
  spaceId: string;
  limit?: number;
}): Promise<{
  items: Array<{
    taskId: string;
    title?: string;
    projectName?: string;
    reason?: string;
  }>;
}> {
  const req = await api.post("/agent/suggestions", params);
  return req.data;
}

export async function createAgentHandoff(params: {
  name?: string;
}): Promise<{ apiKey: string; name: string }> {
  const req = await api.post("/agent/handoff", params);
  return req.data;
}

export async function consumeWeeklyReviewPrompts(params: {
  spaceId: string;
  weekKey?: string;
}): Promise<
  Array<{
    id: string;
    question: string;
    weekKey: string;
    createdAt: string;
    source?: string | null;
  }>
> {
  const req = await api.post("/agent/review-prompts/consume", params);
  return req.data;
}

export async function listReviewPrompts(params: {
  spaceId: string;
  weekKey?: string;
}): Promise<
  Array<{
    id: string;
    question: string;
    weekKey: string;
    createdAt: string;
    source?: string | null;
  }>
> {
  const req = await api.post("/agent/review-prompts/list", params);
  return req.data;
}

export async function listApprovals(): Promise<
  Array<{ token: string; method: string; params: Record<string, any>; expiresAt: string }>
> {
  const req = await api.post("/approvals/list");
  return req.data;
}

export async function confirmApproval(approvalToken: string) {
  const req = await api.post("/approvals/confirm", { approvalToken });
  return req.data;
}

export async function rejectApproval(approvalToken: string) {
  const req = await api.post("/approvals/reject", { approvalToken });
  return req.data;
}
