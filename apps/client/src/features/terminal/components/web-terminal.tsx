import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  Box,
  Paper,
  Group,
  Badge,
  Button,
  Text,
  Loader,
  Stack,
  Alert,
} from "@mantine/core";
import {
  IconExternalLink,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTerminalSocket } from "../hooks/use-terminal-socket";
import type { TerminalSessionStatus } from "../services/terminal-service";
import "@xterm/xterm/css/xterm.css";

interface WebTerminalProps {
  sessionId: string;
  onClose?: () => void;
  height?: number | string;
  /** Hide the header bar (use when parent already provides context) */
  compact?: boolean;
}

const STATUS_COLORS: Record<TerminalSessionStatus, string> = {
  pending: "yellow",
  connecting: "blue",
  active: "green",
  login_required: "orange",
  disconnected: "gray",
  terminated: "red",
};

const STATUS_LABELS: Record<TerminalSessionStatus, string> = {
  pending: "Pending",
  connecting: "Connecting",
  active: "Connected",
  login_required: "Login Required",
  disconnected: "Disconnected",
  terminated: "Terminated",
};

export function WebTerminal({
  sessionId,
  onClose,
  height = 400,
  compact = false,
}: WebTerminalProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleData = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  const handleStatusChange = useCallback(
    (status: TerminalSessionStatus, loginUrl?: string) => {
      if (status === "login_required" && loginUrl) {
        xtermRef.current?.writeln(
          `\r\n\x1b[33m[System] Login required. Opening login page...\x1b[0m\r\n`
        );
        window.open(loginUrl, "_blank");
      } else if (status === "active") {
        xtermRef.current?.writeln(
          `\r\n\x1b[32m[System] Connected to terminal session.\x1b[0m\r\n`
        );
      } else if (status === "disconnected") {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m[System] Disconnected from runtime.\x1b[0m\r\n`
        );
      }
    },
    []
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    xtermRef.current?.writeln(`\r\n\x1b[31m[Error] ${errorMsg}\x1b[0m\r\n`);
  }, []);

  const handleClear = useCallback(() => {
    // Use clear() not reset() — reset() destroys terminal emulation state
    // (saved cursor positions, modes, etc.) that TUI apps like Claude Code depend on.
    xtermRef.current?.clear();
  }, []);

  const handleConnect = useCallback(() => {
    xtermRef.current?.writeln(
      `\x1b[90m[System] Connected to terminal gateway.\x1b[0m`
    );
  }, []);

  const {
    isConnected,
    isAttached,
    status,
    loginUrl,
    sendInput,
    resize,
    attach,
    detach,
  } = useTerminalSocket({
    sessionId,
    onData: handleData,
    onClear: handleClear,
    onStatusChange: handleStatusChange,
    onError: handleError,
    onConnect: handleConnect,
  });

  // Stable refs for socket callbacks — prevents terminal re-initialization
  const sendInputRef = useRef(sendInput);
  sendInputRef.current = sendInput;
  const resizeRef = useRef(resize);
  resizeRef.current = resize;

  // Initialize xterm (mount-only — refs keep callbacks fresh without re-running)
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        cursorAccent: "#1a1b26",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      sendInputRef.current(data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (terminal.cols && terminal.rows) {
        resizeRef.current(terminal.cols, terminal.rows);
      }
    });
    resizeObserver.observe(terminalRef.current);

    // Write welcome message
    terminal.writeln("\x1b[1;34m=== Raven Docs Agent Terminal ===\x1b[0m");
    terminal.writeln("\x1b[90mConnecting to session...\x1b[0m\r\n");

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-attach when connected
  useEffect(() => {
    if (isConnected && !isAttached) {
      attach();
    }
  }, [isConnected, isAttached, attach]);

  // Send terminal dimensions to PTY after attach completes.
  // The ResizeObserver fires before the socket is attached, so the initial
  // dimensions are never sent. This ensures the PTY knows the correct size,
  // which is critical for TUI apps (Claude Code) that render based on TIOCGWINSZ.
  useEffect(() => {
    if (isAttached && xtermRef.current) {
      const { cols, rows } = xtermRef.current;
      if (cols && rows) {
        resize(cols, rows);
      }
    }
  }, [isAttached, resize]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (isAttached) {
        detach();
      }
    };
  }, [isAttached, detach]);

  return (
    <Paper
      withBorder={!compact}
      radius={compact ? "sm" : "md"}
      style={{ overflow: "hidden", position: "relative" }}
    >
      {/* Terminal header — hidden in compact mode */}
      {!compact && (
        <Group
          justify="space-between"
          px="xs"
          py={4}
          style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}
          bg="dark.7"
        >
          <Group gap="xs">
            {status && (
              <Badge size="xs" color={STATUS_COLORS[status]} variant="light">
                {STATUS_LABELS[status]}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {status === "login_required" && loginUrl && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconExternalLink size={14} />}
                component="a"
                href={loginUrl}
                target="_blank"
              >
                {t("Login")}
              </Button>
            )}
            {onClose && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={onClose}
                p={4}
              >
                <IconX size={16} />
              </Button>
            )}
          </Group>
        </Group>
      )}

      {/* Error alert */}
      {error && (
        <Alert color="red" variant="light" m="xs" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Terminal content */}
      <Box
        ref={terminalRef}
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          backgroundColor: "#1a1b26",
        }}
      />

      {/* Loading overlay */}
      {!isConnected && (
        <Box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(26, 27, 38, 0.8)",
          }}
        >
          <Stack align="center" gap="md">
            <Loader color="blue" size="lg" />
            <Text size="sm" c="dimmed">
              {t("Connecting to terminal...")}
            </Text>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
