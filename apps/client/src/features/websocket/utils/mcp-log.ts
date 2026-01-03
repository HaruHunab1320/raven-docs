const shouldLog = import.meta.env?.VITE_ENABLE_LOGS === "true";

export const mcpLog = (...args: unknown[]) => {
  if (shouldLog) {
    globalThis.console?.log(...args);
  }
};

export const mcpWarn = (...args: unknown[]) => {
  if (shouldLog) {
    globalThis.console?.warn(...args);
  }
};

export const mcpError = (...args: unknown[]) => {
  if (shouldLog) {
    globalThis.console?.error(...args);
  }
};
