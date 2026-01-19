const enableLogs = import.meta.env?.VITE_ENABLE_LOGS === "true";
const isDev = import.meta.env?.DEV === true;

const log = (...args: unknown[]) => {
  if (enableLogs) {
    globalThis.console?.log(...args);
  }
};

const warn = (...args: unknown[]) => {
  if (enableLogs) {
    globalThis.console?.warn(...args);
  }
};

const error = (...args: unknown[]) => {
  if (enableLogs || isDev) {
    globalThis.console?.error(...args);
  }
};

const debug = (...args: unknown[]) => {
  if (enableLogs) {
    globalThis.console?.debug(...args);
  }
};

export const logger = {
  log,
  warn,
  error,
  debug,
};
