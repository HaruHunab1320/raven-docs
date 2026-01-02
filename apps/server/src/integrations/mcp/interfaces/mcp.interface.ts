/**
 * JSON-RPC 2.0 Request
 */
export interface MCPRequest {
  /**
   * JSON-RPC version, must be "2.0"
   */
  jsonrpc: string;

  /**
   * The method to be invoked
   * Format: "resource.operation", e.g., "page.create"
   */
  method: string;

  /**
   * Parameters for the method
   */
  params?: any;

  /**
   * Request identifier for correlation
   */
  id: string | number;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface MCPError {
  /**
   * Error code
   *
   * Standard error codes:
   * -32700: Parse error
   * -32600: Invalid request
   * -32601: Method not found
   * -32602: Invalid params
   * -32603: Internal error
   *
   * Custom error codes:
   * -32000 to -32099: Server error
   */
  code: number;

  /**
   * Error message
   */
  message: string;

  /**
   * Additional error data
   */
  data?: any;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface MCPResponse {
  /**
   * JSON-RPC version, must be "2.0"
   */
  jsonrpc: string;

  /**
   * Result of the method invocation
   * This field is present when the method is successful
   */
  result?: any;

  /**
   * Error information
   * This field is present when the method fails
   */
  error?: MCPError;

  /**
   * Request identifier for correlation
   * Must match the id in the request
   */
  id: string | number | null;
}
