import { Component, ErrorInfo, ReactNode } from "react";
import { notifications } from "@mantine/notifications";
import api from "@/lib/api-client";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const MAX_ERRORS = 3;
const ERROR_WINDOW_MS = 5000;

export class BugReportErrorBoundary extends Component<Props, State> {
  private recentErrors: number[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.reportError(error, errorInfo);

    const now = Date.now();
    this.recentErrors.push(now);
    this.recentErrors = this.recentErrors.filter(
      (t) => now - t < ERROR_WINDOW_MS,
    );

    if (this.recentErrors.length >= MAX_ERRORS) {
      // Too many errors in quick succession — navigate home to break the loop
      notifications.show({
        title: "Repeated error",
        message: "Redirecting to home page.",
        color: "red",
        autoClose: 3000,
      });
      setTimeout(() => {
        window.location.href = "/home";
      }, 500);
      return;
    }

    notifications.show({
      title: "Something went wrong",
      message:
        error.message || "An unexpected error occurred. It has been reported.",
      color: "red",
      autoClose: 5000,
    });

    // Reset the boundary so children re-render
    setTimeout(() => {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }, 0);
  }

  async reportError(error: Error, errorInfo: ErrorInfo) {
    try {
      await api.post("/bug-reports/auto", {
        source: "auto:client",
        errorMessage: error.message,
        errorStack: error.stack,
        context: {
          url: window.location.href,
          componentStack: errorInfo.componentStack,
          userAgent: navigator.userAgent,
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

      logger.log("Error automatically reported");
    } catch (e) {
      logger.error("Failed to report error", e);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Return children immediately — the setTimeout in componentDidCatch
      // will clear hasError on the next tick, re-rendering normally.
      // This avoids a flash of blank content.
      return this.props.children;
    }

    return this.props.children;
  }
}

export default BugReportErrorBoundary;
