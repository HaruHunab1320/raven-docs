import api from "@/lib/api-client";

export type TerminalSessionStatus =
  | "pending"
  | "connecting"
  | "active"
  | "login_required"
  | "disconnected"
  | "terminated";

export interface TerminalSession {
  id: string;
  workspaceId: string;
  agentId: string;
  runtimeSessionId: string;
  title: string;
  status: TerminalSessionStatus;
  cols: number;
  rows: number;
  runtimeEndpoint: string | null;
  connectedUserId: string | null;
  lastActivityAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalSessionLog {
  id: string;
  sessionId: string;
  logType: "stdin" | "stdout" | "stderr" | "system";
  content: string;
  createdAt: string;
}

export interface CreateSessionDto {
  agentId: string;
  runtimeSessionId: string;
  workspaceId: string;
  title?: string;
  cols?: number;
  rows?: number;
  runtimeEndpoint?: string;
}

// Get all terminal sessions for the workspace
export async function getTerminalSessions(
  includeTerminated = false
): Promise<TerminalSession[]> {
  const response = await api.get<TerminalSession[]>("/terminal/sessions", {
    params: { includeTerminated: String(includeTerminated) },
  });
  return response.data;
}

// Get a specific terminal session
export async function getTerminalSession(
  sessionId: string
): Promise<TerminalSession> {
  const response = await api.get<TerminalSession>(
    `/terminal/sessions/${sessionId}`
  );
  return response.data;
}

// Get active session for an agent
export async function getAgentSession(
  agentId: string
): Promise<TerminalSession | null> {
  const response = await api.get<TerminalSession | null>(
    `/terminal/agents/${agentId}/session`
  );
  return response.data;
}

// Create a new terminal session
export async function createTerminalSession(
  data: CreateSessionDto
): Promise<TerminalSession> {
  const response = await api.post<TerminalSession>("/terminal/sessions", data);
  return response.data;
}

// Get session logs
export async function getSessionLogs(
  sessionId: string,
  limit = 100,
  offset = 0
): Promise<TerminalSessionLog[]> {
  const response = await api.get<TerminalSessionLog[]>(
    `/terminal/sessions/${sessionId}/logs`,
    { params: { limit: String(limit), offset: String(offset) } }
  );
  return response.data;
}

// Terminate a terminal session
export async function terminateSession(
  sessionId: string
): Promise<TerminalSession> {
  const response = await api.delete<TerminalSession>(
    `/terminal/sessions/${sessionId}`
  );
  return response.data;
}
