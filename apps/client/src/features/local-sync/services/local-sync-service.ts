import api from "@/lib/api-client";

export interface LocalSyncSource {
  id: string;
  name: string;
  mode: "import_only" | "local_to_cloud" | "bidirectional";
  status: "active" | "paused";
  connectorId: string;
  lastRemoteCursor: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSyncConflict {
  id: string;
  sourceId: string;
  fileId: string;
  relativePath: string;
  baseHash: string;
  localHash: string;
  remoteHash: string;
  localContent: string;
  remoteContent: string;
  status: "open" | "resolved";
  createdAt: string;
}

export interface LocalSyncConflictPreview {
  conflictId: string;
  relativePath: string;
  summary: {
    localLines: number;
    remoteLines: number;
    differentLines: number;
  };
  changes: Array<{
    line: number;
    local: string;
    remote: string;
  }>;
}

export async function listLocalSyncSources(): Promise<LocalSyncSource[]> {
  const req = (await api.post("/local-sync/sources/list", {})) as LocalSyncSource[];
  return req;
}

export async function listLocalSyncConflicts(
  sourceId: string,
): Promise<LocalSyncConflict[]> {
  const req = (await api.post("/local-sync/sources/conflicts", {
    sourceId,
  })) as LocalSyncConflict[];
  return req;
}

export async function getLocalSyncConflictPreview(
  sourceId: string,
  conflictId: string,
): Promise<LocalSyncConflictPreview> {
  const req = (await api.post("/local-sync/sources/conflicts/preview", {
    sourceId,
    conflictId,
  })) as LocalSyncConflictPreview;
  return req;
}

export async function resolveLocalSyncConflict(params: {
  sourceId: string;
  conflictId: string;
  resolution: "keep_local" | "keep_raven" | "manual_merge";
  resolvedContent?: string;
}) {
  const req = await api.post("/local-sync/sources/conflicts/resolve", params);
  return req;
}
