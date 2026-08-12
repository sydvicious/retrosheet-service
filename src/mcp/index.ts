// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// MCP server entry point. MCP_TRANSPORT=stdio (default; local Claude Desktop/
// Code) or http (remote/containerized, over Tailscale). Reuses the same Postgres
// mart; connects with a read-only-friendly pool (search_path set to the schema).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config.js";
import { makePool } from "../db.js";
import { buildServer } from "./server.js";
import { startHttpTransport } from "./http.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const pool = makePool(cfg.databaseUrl, cfg.schema);
  const build = (): ReturnType<typeof buildServer> => buildServer(pool, cfg.schema);

  if (cfg.mcpTransport === "http") {
    await startHttpTransport(build, cfg.mcpPort);
  } else {
    // Note: stdout is the protocol channel for stdio — logs go to stderr.
    const server = build();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("retrosheet MCP (stdio) ready");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
