import { AgentMemoryEntry } from "@/features/agent-memory/types";

type ActivityItem = {
  id?: string;
  title?: string;
  durationMs: number;
  count: number;
};

export type ActivityStats = {
  totalDurationMs: number;
  sessionCount: number;
  topPages: ActivityItem[];
  topProjects: ActivityItem[];
};

const DEFAULT_STATS: ActivityStats = {
  totalDurationMs: 0,
  sessionCount: 0,
  topPages: [],
  topProjects: [],
};

function addToMap(
  map: Map<string, ActivityItem>,
  key: string,
  title: string | undefined,
  durationMs: number,
) {
  const existing = map.get(key);
  if (existing) {
    existing.durationMs += durationMs;
    existing.count += 1;
  } else {
    map.set(key, {
      id: key,
      title,
      durationMs,
      count: 1,
    });
  }
}

export function buildActivityStats(
  entries?: AgentMemoryEntry[] | null,
): ActivityStats {
  if (!entries?.length) {
    return DEFAULT_STATS;
  }

  const pageMap = new Map<string, ActivityItem>();
  const projectMap = new Map<string, ActivityItem>();
  let totalDurationMs = 0;
  let sessionCount = 0;

  entries.forEach((entry) => {
    const content = entry.content as
      | {
          durationMs?: number;
          pageId?: string;
          projectId?: string;
          title?: string;
        }
      | undefined;

    const durationMs = Number(content?.durationMs || 0);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }

    totalDurationMs += durationMs;
    sessionCount += 1;

    if (content?.pageId) {
      addToMap(pageMap, content.pageId, content.title, durationMs);
    }

    if (content?.projectId) {
      addToMap(projectMap, content.projectId, content.title, durationMs);
    }
  });

  const sortByDuration = (items: ActivityItem[]) =>
    items.sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

  return {
    totalDurationMs,
    sessionCount,
    topPages: sortByDuration(Array.from(pageMap.values())),
    topProjects: sortByDuration(Array.from(projectMap.values())),
  };
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}
