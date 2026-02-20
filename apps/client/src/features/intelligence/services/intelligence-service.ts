import api from "@/lib/api-client";
import type {
  DashboardStats,
  TimelineEntry,
  OpenQuestion,
  Contradiction,
  TypedPageSummary,
  DomainGraphData,
  PatternDetection,
} from "../types/intelligence.types";

const ENDPOINT = "research-dashboard";

export async function getStats(params: {
  spaceId?: string;
}): Promise<DashboardStats> {
  const req = await api.post<DashboardStats>(`${ENDPOINT}/stats`, params);
  return req.data;
}

export async function getTimeline(params: {
  spaceId?: string;
  limit?: number;
}): Promise<TimelineEntry[]> {
  const req = await api.post<TimelineEntry[]>(`${ENDPOINT}/timeline`, params);
  return req.data;
}

export async function getOpenQuestions(params: {
  spaceId?: string;
  domainTags?: string[];
}): Promise<OpenQuestion[]> {
  const req = await api.post<OpenQuestion[]>(
    `${ENDPOINT}/open-questions`,
    params,
  );
  return req.data;
}

export async function getContradictions(params: {
  spaceId?: string;
}): Promise<Contradiction[]> {
  const req = await api.post<Contradiction[]>(
    `${ENDPOINT}/contradictions`,
    params,
  );
  return req.data;
}

export async function getActiveExperiments(params: {
  spaceId?: string;
}): Promise<TypedPageSummary[]> {
  const req = await api.post<TypedPageSummary[]>(
    `${ENDPOINT}/active-experiments`,
    params,
  );
  return req.data;
}

export async function getHypotheses(params: {
  spaceId?: string;
}): Promise<TypedPageSummary[]> {
  const req = await api.post<TypedPageSummary[]>(
    `${ENDPOINT}/hypotheses`,
    params,
  );
  return req.data;
}

export async function getPatterns(params: {
  spaceId?: string;
  status?: string;
}): Promise<PatternDetection[]> {
  const req = await api.post<PatternDetection[]>(
    `${ENDPOINT}/patterns`,
    params,
  );
  return req.data;
}

export async function acknowledgePattern(params: {
  id: string;
}): Promise<void> {
  await api.post(`${ENDPOINT}/patterns/acknowledge`, params);
}

export async function dismissPattern(params: { id: string }): Promise<void> {
  await api.post(`${ENDPOINT}/patterns/dismiss`, params);
}
