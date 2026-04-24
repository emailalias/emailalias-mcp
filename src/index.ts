#!/usr/bin/env node
/**
 * EmailAlias.io MCP server.
 *
 * Exposes the EmailAlias REST API as MCP tools, consumable by Claude Desktop,
 * Cursor, Zed, Cline, and any other MCP-compatible LLM client.
 *
 * Auth: reads the user's API key from EMAILALIAS_API_KEY. Keys are created at
 * https://emailalias.io/dashboard/settings → API Keys (Premium only).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "emailalias";

import { registerTools } from "./tools.js";

function fail(message: string): never {
  // Write to stderr so it surfaces in the MCP client's log panel without
  // contaminating stdout, which is the JSON-RPC channel for stdio transport.
  process.stderr.write(`[emailalias-mcp] ${message}\n`);
  process.exit(1);
}

async function main() {
  const apiKey = process.env.EMAILALIAS_API_KEY;
  if (!apiKey) {
    fail(
      "EMAILALIAS_API_KEY is not set. Add it to the env block of your MCP client " +
        "config (e.g. claude_desktop_config.json). Create a key at " +
        "https://emailalias.io/dashboard/settings → API Keys.",
    );
  }
  if (!apiKey.startsWith("ea_live_")) {
    fail("EMAILALIAS_API_KEY looks malformed — it should start with 'ea_live_'.");
  }

  const baseUrl = process.env.EMAILALIAS_BASE_URL || "https://emailalias.io";
  const client = new Client({ apiKey, baseUrl });

  const server = new McpServer({
    name: "emailalias",
    version: "1.0.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[emailalias-mcp] ready\n");
}

main().catch((err) => {
  fail(`fatal: ${err instanceof Error ? err.message : String(err)}`);
});
