import { Component, ErrorInfo, ReactNode } from "react";
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Paper,
  Code,
  Collapse,
} from "@mantine/core";
import { IconBug, IconRefresh, IconHome, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
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
  isReporting: boolean;
  reported: boolean;
  showDetails: boolean;
}

export class BugReportErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isReporting: false,
      reported: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.reportError(error, errorInfo);
  }

  async reportError(error: Error, errorInfo: ErrorInfo) {
    this.setState({ isReporting: true });

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

      this.setState({ reported: true });
      logger.log("Error automatically reported");
    } catch (e) {
      logger.error("Failed to report error", e);
    } finally {
      this.setState({ isReporting: false });
    }
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/home";
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Container size="sm" py="xl">
          <Paper p="xl" radius="md" withBorder>
            <Stack gap="lg" align="center">
              <IconBug size={64} color="var(--mantine-color-red-6)" />

              <Title order={2} ta="center">
                Something went wrong
              </Title>

              <Text c="dimmed" ta="center" maw={400}>
                An unexpected error occurred. Our team has been notified and is
                working to fix the issue.
              </Text>

              {this.state.reported && (
                <Text size="sm" c="green" ta="center">
                  This error has been automatically reported.
                </Text>
              )}

              {this.state.isReporting && (
                <Text size="sm" c="dimmed" ta="center">
                  Reporting error...
                </Text>
              )}

              <Group>
                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={this.handleRefresh}
                  variant="filled"
                >
                  Refresh Page
                </Button>
                <Button
                  leftSection={<IconHome size={16} />}
                  onClick={this.handleGoHome}
                  variant="light"
                >
                  Go Home
                </Button>
              </Group>

              <Button
                variant="subtle"
                size="xs"
                onClick={this.toggleDetails}
                rightSection={
                  this.state.showDetails ? (
                    <IconChevronUp size={14} />
                  ) : (
                    <IconChevronDown size={14} />
                  )
                }
              >
                {this.state.showDetails ? "Hide" : "Show"} Error Details
              </Button>

              <Collapse in={this.state.showDetails}>
                <Paper p="md" bg="dark.8" radius="sm" w="100%">
                  <Stack gap="sm">
                    <Text size="sm" fw={600} c="red">
                      {this.state.error?.name}: {this.state.error?.message}
                    </Text>
                    {this.state.error?.stack && (
                      <Code block style={{ fontSize: "10px", maxHeight: 200, overflow: "auto" }}>
                        {this.state.error.stack}
                      </Code>
                    )}
                  </Stack>
                </Paper>
              </Collapse>
            </Stack>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default BugReportErrorBoundary;
