import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

export const envPath = path.resolve(process.cwd(), "..", "..");

export default defineConfig(({ mode }) => {
  const {
    APP_URL,
    FILE_UPLOAD_SIZE_LIMIT,
    DRAWIO_URL,
    CLOUD,
    SUBDOMAIN_HOST,
    COLLAB_URL,
    VITE_ENABLE_LOGS,
  } = loadEnv(mode, envPath, "");

  const enableLogs = VITE_ENABLE_LOGS === "true";
  if (enableLogs) {
    process.stdout.write(`Configuring Vite with APP_URL: ${APP_URL}\n`);
  }

  return {
    define: {
      "process.env": {
        APP_URL,
        FILE_UPLOAD_SIZE_LIMIT,
        DRAWIO_URL,
        CLOUD,
        SUBDOMAIN_HOST,
        COLLAB_URL,
      },
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        "/api": {
          target: APP_URL,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          withCredentials: true,
          cookieDomainRewrite: {
            "*": "",
          },
          headers: {
            Connection: "keep-alive",
          },
          rewrite: (path) => path, // Don't rewrite the path
          configure: (proxy, options) => {
            // Log proxy requests for debugging
            proxy.on("error", (err, req, res) => {
              if (enableLogs) {
                process.stderr.write(`Proxy error: ${String(err)}\n`);
              }
            });
            proxy.on("proxyReq", (proxyReq, req, res) => {
              // Copy authentication headers from original request
              if (req.headers.cookie) {
                proxyReq.setHeader("cookie", req.headers.cookie);
              }
              if (req.headers.authorization) {
                proxyReq.setHeader("authorization", req.headers.authorization);
              }

              if (enableLogs) {
                process.stdout.write(
                  `Proxy request: ${req.method} ${req.url} \u2192 ${options.target}${req.url}\n`
                );
              }
            });
          },
        },
        "/socket.io": {
          target: APP_URL,
          ws: true,
          changeOrigin: true,
          rewriteWsOrigin: true,
        },
        "/collab": {
          target: APP_URL,
          ws: true,
          changeOrigin: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});
