import api from "@/lib/api-client";
import { CreateResearchJobInput, ResearchJob } from "@/features/research/types/research.types";

export async function createResearchJob(
  input: CreateResearchJobInput
): Promise<ResearchJob> {
  const req = await api.post<ResearchJob>("/research/create", input);
  return req.data;
}

export async function listResearchJobs(params: {
  spaceId: string;
}): Promise<ResearchJob[]> {
  const req = await api.post<ResearchJob[]>("/research/list", params);
  return req.data;
}

export async function getResearchJob(params: {
  jobId: string;
}): Promise<ResearchJob | null> {
  const req = await api.post<ResearchJob | null>("/research/info", params);
  return req.data;
}
