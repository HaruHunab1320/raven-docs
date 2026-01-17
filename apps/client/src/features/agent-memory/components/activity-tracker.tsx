import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { validate as isValidUuid } from "uuid";
import { useIdle } from "@/hooks/use-idle";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import { userAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_ACTIVITY_MS = 15 * 1000;

function useDocumentVisibility() {
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return isVisible;
}

export function ActivityTracker() {
  const workspace = useAtomValue(workspaceAtom);
  const user = useAtomValue(userAtom);
  const location = useLocation();
  const params = useParams<{
    spaceId?: string;
    spaceSlug?: string;
    pageSlug?: string;
  }>();

  const { isIdle } = useIdle(IDLE_TIMEOUT_MS, { initialState: false });
  const isVisible = useDocumentVisibility();
  const isActive = !isIdle && isVisible;

  const spaceLookup =
    params.spaceId ||
    params.spaceSlug ||
    new URLSearchParams(location.search).get("spaceId") ||
    "";
  const { data: space } = useSpaceQuery(spaceLookup);
  const { data: page } = usePageQuery({
    pageId: params.pageSlug || "",
  });

  const projectId = new URLSearchParams(location.search).get("projectId") || undefined;
  const spaceId = space?.id || (isValidUuid(spaceLookup) ? spaceLookup : undefined);
  const pageId = page?.id;
  const pageTitle = page?.title;
  const route = `${location.pathname}${location.search}`;

  const trackingEnabled = useMemo(() => {
    if (workspace?.settings?.agent?.enabled === false) {
      return false;
    }
    if (workspace?.settings?.agent?.enableActivityTracking === false) {
      return false;
    }
    if (user?.settings?.preferences?.enableActivityTracking === false) {
      return false;
    }
    return true;
  }, [
    workspace?.settings?.agent?.enabled,
    workspace?.settings?.agent?.enableActivityTracking,
    user?.settings?.preferences?.enableActivityTracking,
  ]);

  const contextKey = `${spaceId ?? "none"}:${pageId ?? "none"}:${projectId ?? "none"}`;
  const sessionRef = useRef<{
    contextKey: string;
    startedAt: number;
    spaceId?: string;
    pageId?: string;
    projectId?: string;
    title?: string;
    route?: string;
  } | null>(null);

  const flushSession = (endedAt: number) => {
    const session = sessionRef.current;
    if (!session || !workspace?.id || !spaceId) {
      sessionRef.current = null;
      return;
    }

    const durationMs = endedAt - session.startedAt;
    sessionRef.current = null;

    if (durationMs < MIN_ACTIVITY_MS) {
      return;
    }

    void agentMemoryService
      .activity({
        workspaceId: workspace.id,
        spaceId: session.spaceId,
        pageId: session.pageId,
        projectId: session.projectId,
        title: session.title,
        route: session.route,
        durationMs,
        startedAt: new Date(session.startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
      })
      .catch(() => undefined);
  };

  const startSession = () => {
    if (!trackingEnabled || !spaceId) {
      return;
    }

    if (!pageId && !projectId) {
      return;
    }

    if (sessionRef.current) {
      return;
    }

    sessionRef.current = {
      contextKey,
      startedAt: Date.now(),
      spaceId,
      pageId,
      projectId,
      title: pageTitle,
      route,
    };
  };

  useEffect(() => {
    if (!trackingEnabled) {
      if (sessionRef.current) {
        flushSession(Date.now());
      }
      return;
    }

    if (sessionRef.current && sessionRef.current.contextKey !== contextKey) {
      flushSession(Date.now());
    }

    if (isActive) {
      startSession();
    } else if (sessionRef.current) {
      flushSession(Date.now());
    }
  }, [
    trackingEnabled,
    isActive,
    contextKey,
    spaceId,
    pageId,
    projectId,
    pageTitle,
    route,
  ]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        flushSession(Date.now());
      }
    };
  }, []);

  return null;
}
