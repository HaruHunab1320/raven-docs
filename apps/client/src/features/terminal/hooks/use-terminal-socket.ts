import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { TerminalSessionStatus } from "../services/terminal-service";

interface UseTerminalSocketOptions {
  sessionId: string;
  onData?: (data: string) => void;
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

  useEffect(() => {
    // Get the base URL from current origin or environment
    const baseUrl = window.location.origin;
    const wsUrl = baseUrl.replace(/^http/, "ws");

    const socket = io(`${wsUrl}/terminal`, {
      transports: ["websocket"],
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      onConnect?.();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setIsAttached(false);
      onDisconnect?.();
    });

    socket.on("attached", (data: { sessionId: string; status: TerminalSessionStatus; cols: number; rows: number }) => {
      setIsAttached(true);
      setStatus(data.status);
    });

    socket.on("detached", () => {
      setIsAttached(false);
    });

    socket.on("data", (data: string) => {
      onData?.(data);
    });

    socket.on("status", (data: { status: TerminalSessionStatus; loginUrl?: string }) => {
      setStatus(data.status);
      if (data.loginUrl) {
        setLoginUrl(data.loginUrl);
      }
      onStatusChange?.(data.status, data.loginUrl);
    });

    socket.on("error", (data: { message: string }) => {
      onError?.(data.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onConnect, onData, onDisconnect, onError, onStatusChange]);

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
