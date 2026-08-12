// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Streamable-HTTP transport for the MCP server (remote use, e.g. over Tailscale).
// Stateless: a fresh server + transport per POST /mcp request.
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function startHttpTransport(
  buildServer: () => McpServer,
  port: number,
): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/mcp", async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        });
      }
    }
  });

  // Stateless server: no GET stream / DELETE session.
  const notAllowed = (_req: express.Request, res: express.Response): void => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.error(`retrosheet MCP (streamable HTTP) listening on :${port}/mcp`);
      resolve();
    });
  });
}
