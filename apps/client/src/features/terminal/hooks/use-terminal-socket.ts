import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { TerminalSessionStatus } from "../services/terminal-service";

interface UseTerminalSocketOptions {
  sessionId: string;
  onData?: (data: string) => void;
  onClear?: () => void;
  onStatusChange?: (status: TerminalSessionStatus, loginUrl?: string) => void;
  onError?: (error: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface TerminalSocketReturn {
  isConnected: boolean;
  isAttached: boolean;
  status: TerminalSessionStatus | null;
  loginUrl: string | null;
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  attach: () => void;
  detach: () => void;
}

export function useTerminalSocket({
  sessionId,
  onData,
  onClear,
  onStatusChange,
  onError,
  onConnect,
  onDisconnect,
}: UseTerminalSocketOptions): TerminalSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAttached, setIsAttached] = useState(false);
  const [status, setStatus] = useState<TerminalSessionStatus | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  // Store callbacks in refs so the socket effect never re-runs due to callback identity changes.
  // This is the critical fix: the socket should be created once per sessionId, period.
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    const baseUrl = window.location.origin;
    const wsUrl = baseUrl.replace(/^http/, "ws");

    const socket = io(`${wsUrl}/terminal`, {
      transports: ["websocket"],
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      onConnectRef.current?.();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setIsAttached(false);
      onDisconnectRef.current?.();
    });

    socket.on("attached", (data: { sessionId: string; status: TerminalSessionStatus; cols: number; rows: number }) => {
      setIsAttached(true);
      setStatus(data.status);
    });

    socket.on("detached", () => {
      setIsAttached(false);
    });

    socket.on("data", (data: string) => {
      onDataRef.current?.(data);
    });

    // Server sends "clear" before replaying historical logs on re-attach.
    // This prevents duplicate content from accumulating.
    socket.on("clear", () => {
      onClearRef.current?.();
    });

    socket.on("status", (data: { status: TerminalSessionStatus; loginUrl?: string }) => {
      setStatus(data.status);
      if (data.loginUrl) {
        setLoginUrl(data.loginUrl);
      }
      onStatusChangeRef.current?.(data.status, data.loginUrl);
    });

    socket.on("error", (data: { message: string }) => {
      onErrorRef.current?.(data.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // Only recreate the socket if the sessionId changes.
    // Callbacks are accessed via refs and never cause reconnection.
  }, [sessionId]);

  const attach = useCallback(() => {
    if (socketRef.current && isConnected && !isAttached) {
      socketRef.current.emit("attach", { sessionId });
    }
  }, [sessionId, isConnected, isAttached]);

  const detach = useCallback(() => {
    if (socketRef.current && isAttached) {
      socketRef.current.emit("detach");
      setIsAttached(false);
    }
  }, [isAttached]);

  const sendInput = useCallback((data: string) => {
    if (socketRef.current && isAttached) {
      socketRef.current.emit("input", data);
    }
  }, [isAttached]);

  const resize = useCallback((cols: number, rows: number) => {
    if (socketRef.current && isAttached) {
      socketRef.current.emit("resize", { cols, rows });
    }
  }, [isAttached]);

  return {
    isConnected,
    isAttached,
    status,
    loginUrl,
    sendInput,
    resize,
    attach,
    detach,
  };
}
