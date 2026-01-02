import axios from "axios";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// Debug mode
const DEBUG = process.env.MCP_DEBUG === "true";

// Create a log file
const logFile = resolve(process.cwd(), "mcp-api.log");
function logToFile(message: string) {
  if (!DEBUG) return;

  try {
    // Ensure the directory exists
    const logDir = dirname(logFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    writeFileSync(logFile, `${new Date().toISOString()} - ${message}\n`, {
      flag: "a",
    });
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
}

const baseURL = process.env.MCP_SERVER_URL || "http://localhost:3000";
const apiKey = process.env.MCP_API_KEY;

if (!apiKey) {
  throw new Error("MCP_API_KEY environment variable is required");
}

export const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("API Error:", {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error("API Error: No response received", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("API Error:", error.message);
    }
    return Promise.reject(error);
  }
);

// Helper function to make API requests
export async function makeRequest(method: string, data?: unknown) {
  try {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params: data,
      id: Date.now(),
    };

    if (DEBUG) {
      logToFile(`Making request: ${JSON.stringify(jsonRpcRequest, null, 2)}`);
    }

    const response = await api({
      method: "POST",
      url: "/api/mcp",
      data: jsonRpcRequest,
    });

    if (DEBUG) {
      logToFile(`Received response: ${JSON.stringify(response.data, null, 2)}`);
    }

    return response.data.result;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `API request failed: ${error.response?.data?.message || error.message}`;
      logToFile(`Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    throw error;
  }
}
