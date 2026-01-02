#!/bin/bash

# Script to run all MCP-related tests

echo "Running MCP System Unit Tests..."
echo "================================"

# Run unit tests for MCP components
echo -e "\n1. Testing MCP Controller..."
npm test -- src/integrations/mcp/mcp.controller.spec.ts

echo -e "\n2. Testing API Key Controller..."
npm test -- src/integrations/mcp/controllers/api-key.controller.spec.ts

echo -e "\n3. Testing MCP Service..."
npm test -- src/integrations/mcp/mcp.service.spec.ts

echo -e "\n4. Testing Page Handler..."
npm test -- src/integrations/mcp/handlers/page.handler.spec.ts

# Run integration tests
echo -e "\n5. Running MCP E2E Tests..."
npm run test:e2e -- test/mcp.e2e-spec.ts

echo -e "\nMCP Test Suite Complete!"
echo "========================"

# Generate coverage report for MCP files
echo -e "\nGenerating Coverage Report..."
npm test -- --coverage --collectCoverageFrom="src/integrations/mcp/**/*.ts" --collectCoverageFrom="!src/integrations/mcp/**/*.spec.ts"