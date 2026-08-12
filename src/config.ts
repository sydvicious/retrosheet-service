// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
export interface Config {
  databaseUrl: string;
  schema: string;
  port: number;
  retrosheetDir: string;
  mcpTransport: "stdio" | "http";
  mcpPort: number;
}

export function loadConfig(): Config {
  return {
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://retrosheet:retrosheet@localhost:5432/retrosheet",
    schema: process.env.PG_SCHEMA ?? "retrosheet",
    port: Number(process.env.PORT ?? 5050),
    retrosheetDir: process.env.RETROSHEET_DIR ?? "./data",
    mcpTransport: process.env.MCP_TRANSPORT === "http" ? "http" : "stdio",
    mcpPort: Number(process.env.MCP_PORT ?? 5051),
  };
}
