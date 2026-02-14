import { useCallback } from "react";
import api from "@/lib/api-client";
import { logger } from "@/lib/logger";

export interface ErrorReportContext {
  url?: string;
  componentStack?: string;
  userAgent?: string;
  workspaceId?: string;
  spaceId?: string;
}

export function useErrorReporter() {
  const reportError = useCallback(
    async (error: Error, context?: ErrorReportContext) => {
      try {
        await api.post("/bug-reports/auto", {
          source: "auto:client",
          errorMessage: error.message,
          errorStack: error.stack,
          context: {
            url: context?.url || window.location.href,
            componentStack: context?.componentStack,
            userAgent: context?.userAgent || navigator.userAgent,
            workspaceId: context?.workspaceId,
            spaceId: context?.spaceId,
          },
          metadata: {
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            timestamp: new Date().toISOString(),
          },
          occurredAt: new Date().toISOString(),
        });
        logger.log("Error reported successfully");
      } catch (e) {
        logger.error("Failed to report error", e);
      }
    },
    []
  );

  const reportManualBug = useCallback(
    async (title: string, description: string, severity?: string) => {
      try {
        const response = await api.post("/bug-reports/create", {
          title,
          description,
          source: "user:command",
          severity: severity || "medium",
          context: {
            url: window.location.href,
            userAgent: navigator.userAgent,
          },
        });
        logger.log("Bug report created:", response);
        return response;
      } catch (e) {
        logger.error("Failed to create bug report", e);
        throw e;
      }
    },
    []
  );

  return { reportError, reportManualBug };
}
