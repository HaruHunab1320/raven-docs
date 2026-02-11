import api from "@/lib/api-client";

export interface KnowledgeSource {
  id: string;
  name: string;
  type: "url" | "file" | "page";
  sourceUrl?: string;
  fileId?: string;
  pageId?: string;
  scope: "system" | "workspace" | "space";
  workspaceId?: string;
  spaceId?: string;
  status: "pending" | "processing" | "ready" | "error";
  errorMessage?: string;
  lastSyncedAt?: string;
  syncSchedule?: string;
  chunkCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeSourceDto {
  name: string;
  type: "url" | "file" | "page";
  sourceUrl?: string;
  fileId?: string;
  pageId?: string;
  scope: "workspace" | "space";
  workspaceId?: string;
  spaceId?: string;
  syncSchedule?: string;
}

export async function getKnowledgeSources(params: {
  workspaceId: string;
  spaceId?: string;
}): Promise<KnowledgeSource[]> {
  const queryParams = new URLSearchParams({
    workspaceId: params.workspaceId,
  });
  if (params.spaceId) {
    queryParams.set("spaceId", params.spaceId);
  }
  const response = await api.get<KnowledgeSource[]>(
    `/knowledge/sources?${queryParams.toString()}`
  );
  return response.data;
}

export async function createKnowledgeSource(
  data: CreateKnowledgeSourceDto
): Promise<KnowledgeSource> {
  const response = await api.post<KnowledgeSource>("/knowledge/sources", data);
  return response.data;
}

export async function deleteKnowledgeSource(sourceId: string): Promise<void> {
  await api.delete(`/knowledge/sources/${sourceId}`);
}

export async function refreshKnowledgeSource(sourceId: string): Promise<void> {
  await api.post(`/knowledge/sources/${sourceId}/refresh`);
}
