// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Builds the Retrosheet MCP server: read-only tools over the Postgres mart so
// Claude and other MCP clients can answer baseball questions. A fresh server is
// built per connection (the HTTP transport is stateless); all share one pool.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Pool } from "pg";
import {
  runReadOnlySql, describeSchema, searchPeople, getPerson, getTeam,
  getRoster, findGames, getGame, playerGames, playerStats, playerGameLog,
} from "./queries.js";

const SQL_TIMEOUT_MS = 15_000;
const DEFAULT_ROWS = 200;
const MAX_ROWS = 1000;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function fail(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

export function buildServer(pool: Pool, schema: string): McpServer {
  const server = new McpServer({ name: "retrosheet", version: "0.1.0" });

  server.registerTool(
    "describe_schema",
    {
      title: "Describe schema",
      description:
        "List the Retrosheet mart tables and their columns. Call this first to learn what query_sql can query.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await describeSchema(pool, schema));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "query_sql",
    {
      title: "Run read-only SQL",
      description:
        "Run a single read-only SELECT/WITH query against the Retrosheet mart and return the rows. " +
        "Runs in a READ ONLY transaction with a statement timeout; writes and DDL are rejected. " +
        "Use describe_schema to learn the tables/columns first.",
      inputSchema: {
        sql: z.string().describe("A single SELECT or WITH query."),
        limit: z.number().int().min(1).max(MAX_ROWS).optional()
          .describe(`Max rows to return (default ${DEFAULT_ROWS}, max ${MAX_ROWS}).`),
      },
    },
    async ({ sql, limit }) => {
      try {
        const cap = limit ?? DEFAULT_ROWS;
        const r = await runReadOnlySql(pool, sql, cap, SQL_TIMEOUT_MS);
        return ok({ rowCount: r.rowCount, returned: r.rows.length, truncated: r.truncated, rows: r.rows });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "search_people",
    {
      title: "Search people",
      description: "Find players/managers/umpires by (partial) name. Returns Retrosheet player ids.",
      inputSchema: {
        name: z.string().describe("Full or partial name (matches first, last, or 'first last')."),
        limit: z.number().int().min(1).max(MAX_ROWS).optional(),
      },
    },
    async ({ name, limit }) => {
      try {
        return ok(await searchPeople(pool, name, limit ?? 25));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_person",
    {
      title: "Get person",
      description: "Full biographical record for a Retrosheet player id.",
      inputSchema: { player_id: z.string() },
    },
    async ({ player_id }) => {
      try {
        return ok(await getPerson(pool, player_id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_team",
    {
      title: "Get team",
      description: "Team/franchise record for a Retrosheet team id (e.g. SFN, LAN, BOS).",
      inputSchema: { team_id: z.string() },
    },
    async ({ team_id }) => {
      try {
        return ok(await getTeam(pool, team_id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_roster",
    {
      title: "Get roster",
      description: "Season roster for a team and year.",
      inputSchema: { team: z.string(), year: z.number().int() },
    },
    async ({ team, year }) => {
      try {
        return ok(await getRoster(pool, team, year));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "find_games",
    {
      title: "Find games",
      description: "Find games by team, year, date range, and/or site (park id). Returns game rows.",
      inputSchema: {
        team: z.string().optional().describe("Team id; matches home or visitor."),
        year: z.number().int().optional(),
        date_from: z.string().optional().describe("ISO date lower bound (YYYY-MM-DD)."),
        date_to: z.string().optional().describe("ISO date upper bound (YYYY-MM-DD)."),
        site: z.string().optional().describe("Park id (e.g. SFO03)."),
        limit: z.number().int().min(1).max(MAX_ROWS).optional(),
      },
    },
    async ({ team, year, date_from, date_to, site, limit }) => {
      try {
        return ok(await findGames(pool, {
          team, year, dateFrom: date_from, dateTo: date_to, site, limit: limit ?? 100,
        }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_game",
    {
      title: "Get game",
      description: "Full detail for a game id: metadata, starting lineups, substitutions, earned runs.",
      inputSchema: { game_id: z.string() },
    },
    async ({ game_id }) => {
      try {
        return ok(await getGame(pool, game_id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "player_stats",
    {
      title: "Player stats",
      description:
        "Season-by-season batting AND pitching totals for a player id, from the daily " +
        "stat lines, with rate stats (AVG/OBP/SLG, ERA/WHIP). Optionally limit to one year.",
      inputSchema: {
        player_id: z.string(),
        year: z.number().int().optional().describe("Limit to a single season."),
      },
    },
    async ({ player_id, year }) => {
      try {
        return ok(await playerStats(pool, player_id, year));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "player_game_log",
    {
      title: "Player game log",
      description:
        "Per-game daily stat lines (a game log) for a player id — batting or pitching, " +
        "optionally limited to a year.",
      inputSchema: {
        player_id: z.string(),
        kind: z.enum(["batting", "pitching"]).optional()
          .describe("Which lines to return (default batting)."),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(MAX_ROWS).optional(),
      },
    },
    async ({ player_id, kind, year, limit }) => {
      try {
        return ok(await playerGameLog(pool, player_id, kind ?? "batting", year, limit ?? 200));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "player_games",
    {
      title: "Player games",
      description: "Games a player STARTED (from lineups), optionally limited to a year.",
      inputSchema: {
        player_id: z.string(),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(MAX_ROWS).optional(),
      },
    },
    async ({ player_id, year, limit }) => {
      try {
        return ok(await playerGames(pool, player_id, year, limit ?? 200));
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
