import api from "@/lib/api-client";

export interface BugReport {
  id: string;
  workspaceId: string | null;
  spaceId: string | null;
  reporterId: string | null;
  source: "auto:server" | "auto:client" | "auto:agent" | "user:command";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "triaged" | "in_progress" | "resolved" | "closed";
  title: string;
  description: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  errorCode: string | null;
  userJourney: any;
  context: any;
  metadata: any;
  occurrenceCount: number;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reporter?: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface BugReportListResponse {
  items: BugReport[];
  meta: {
    limit: number;
    page: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface CreateBugReportInput {
  title: string;
  description?: string;
  source: string;
  severity?: string;
  spaceId?: string;
  context?: Record<string, any>;
}

export interface ListBugReportsInput {
  source?: string;
  severity?: string;
  status?: string;
  workspaceId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface UpdateBugReportInput {
  bugReportId: string;
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
}

// Server wraps responses in { data, success, status }
interface ApiResponse<T> {
  data: T;
  success: boolean;
  status: number;
}

export async function createBugReport(
  input: CreateBugReportInput
): Promise<BugReport> {
  const response = (await api.post("/bug-reports/create", input)) as ApiResponse<BugReport>;
  return response.data;
}

export async function listBugReports(
  input: ListBugReportsInput = {}
): Promise<BugReportListResponse> {
  const response = (await api.post("/bug-reports/list", input)) as ApiResponse<BugReportListResponse>;
  return response.data;
}

export async function getBugReport(bugReportId: string): Promise<BugReport> {
  const response = (await api.post("/bug-reports/get", { bugReportId })) as ApiResponse<BugReport>;
  return response.data;
}

export async function updateBugReport(
  input: UpdateBugReportInput
): Promise<BugReport> {
  const response = (await api.post("/bug-reports/update", input)) as ApiResponse<BugReport>;
  return response.data;
}

export async function deleteBugReport(bugReportId: string): Promise<void> {
  await api.post("/bug-reports/delete", { bugReportId });
}
