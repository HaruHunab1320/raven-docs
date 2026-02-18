import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as intelligenceService from "../services/intelligence-service";

export const INTELLIGENCE_KEYS = {
  stats: (spaceId: string) => ["intelligence-stats", spaceId] as const,
  timeline: (spaceId: string) => ["intelligence-timeline", spaceId] as const,
  openQuestions: (spaceId: string) =>
    ["intelligence-open-questions", spaceId] as const,
  contradictions: (spaceId: string) =>
    ["intelligence-contradictions", spaceId] as const,
  experiments: (spaceId: string) =>
    ["intelligence-experiments", spaceId] as const,
  patterns: (spaceId: string) => ["intelligence-patterns", spaceId] as const,
};

export function useIntelligenceStats(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.stats(spaceId),
    queryFn: () => intelligenceService.getStats({ spaceId }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useTimeline(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.timeline(spaceId),
    queryFn: () => intelligenceService.getTimeline({ spaceId, limit: 20 }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useOpenQuestions(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.openQuestions(spaceId),
    queryFn: () => intelligenceService.getOpenQuestions({ spaceId }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useContradictions(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.contradictions(spaceId),
    queryFn: () => intelligenceService.getContradictions({ spaceId }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useActiveExperiments(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
    queryFn: () => intelligenceService.getActiveExperiments({ spaceId }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function usePatternDetections(spaceId: string) {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.patterns(spaceId),
    queryFn: () => intelligenceService.getPatterns({ spaceId }),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useAcknowledgePattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => intelligenceService.acknowledgePattern({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["intelligence-patterns"],
      });
    },
  });
}

export function useDismissPattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => intelligenceService.dismissPattern({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["intelligence-patterns"],
      });
    },
  });
}
