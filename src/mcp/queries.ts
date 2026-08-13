// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Read-only data access for the MCP server. Every function runs SELECTs against
// the Retrosheet mart. The connection pool is created with search_path set to
// the mart schema, so tables are referenced unqualified.
import type { Pool } from "pg";

export interface SqlResult {
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
}

/**
 * Run an arbitrary read-only SELECT/WITH query safely: inside a READ ONLY
 * transaction (writes/DDL error out), with a statement timeout and a row cap.
 */
export async function runReadOnlySql(
  pool: Pool,
  sql: string,
  rowCap: number,
  timeoutMs: number,
): Promise<SqlResult> {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(trimmed)) {
    throw new Error("Only read-only SELECT/WITH queries are allowed.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.trunc(timeoutMs)}`);
    const res = await client.query(trimmed);
    await client.query("ROLLBACK");
    const rows = res.rows.slice(0, rowCap);
    return { rows, rowCount: res.rows.length, truncated: res.rows.length > rowCap };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Table/column listing for the mart, so a model knows what it can query. */
export async function describeSchema(pool: Pool, schema: string): Promise<string> {
  const res = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema],
  );
  const byTable = new Map<string, string[]>();
  for (const r of res.rows as { table_name: string; column_name: string; data_type: string }[]) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name)!.push(`${r.column_name} ${r.data_type}`);
  }
  const lines: string[] = [];
  for (const [table, cols] of byTable) {
    lines.push(`${table}(${cols.join(", ")})`);
  }
  return lines.join("\n");
}

export async function searchPeople(pool: Pool, name: string, limit: number): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT player_id, first_name, last_name, nickname,
            EXTRACT(YEAR FROM birth_date)::int AS birth_year,
            EXTRACT(YEAR FROM play_debut)::int AS debut_year,
            EXTRACT(YEAR FROM play_last_game)::int AS final_year,
            bats, throws, hof
       FROM people
      WHERE last_name ILIKE $1 OR first_name ILIKE $1
         OR (first_name || ' ' || last_name) ILIKE $1
      ORDER BY last_name, first_name
      LIMIT $2`,
    [`%${name}%`, limit],
  );
  return res.rows;
}

export async function getPerson(pool: Pool, playerId: string): Promise<unknown> {
  const res = await pool.query(`SELECT * FROM people WHERE player_id = $1`, [playerId]);
  return res.rows[0] ?? null;
}

export async function getTeam(pool: Pool, teamId: string): Promise<unknown> {
  const res = await pool.query(`SELECT * FROM teams WHERE team_id = $1`, [teamId]);
  return res.rows[0] ?? null;
}

export async function getRoster(pool: Pool, team: string, year: number): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT player_id, last_name, first_name, bats, throws, position
       FROM roster WHERE team = $1 AND year = $2
      ORDER BY last_name, first_name`,
    [team, year],
  );
  return res.rows;
}

export interface FindGamesArgs {
  team?: string;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  site?: string;
  limit: number;
}

export async function findGames(pool: Pool, a: FindGamesArgs): Promise<unknown[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  if (a.team) conds.push(`(home_team = ${p(a.team)} OR visitor_team = ${p(a.team)})`);
  if (a.year !== undefined) conds.push(`EXTRACT(YEAR FROM game_date) = ${p(a.year)}`);
  if (a.dateFrom) conds.push(`game_date >= ${p(a.dateFrom)}`);
  if (a.dateTo) conds.push(`game_date <= ${p(a.dateTo)}`);
  if (a.site) conds.push(`site = ${p(a.site)}`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const res = await pool.query(
    `SELECT game_id, game_date, visitor_team, home_team, site, day_night,
            attendance, winning_pitcher, losing_pitcher, save_pitcher
       FROM game ${where}
      ORDER BY game_date
      LIMIT ${p(a.limit)}`,
    params,
  );
  return res.rows;
}

export async function getGame(pool: Pool, gameId: string): Promise<unknown> {
  const game = await pool.query(`SELECT * FROM game WHERE game_id = $1`, [gameId]);
  if (!game.rows[0]) return null;
  const starters = await pool.query(
    `SELECT side, batting_order, fielding_position, player_id, player_name
       FROM lineup_start WHERE game_id = $1
      ORDER BY side, batting_order`,
    [gameId],
  );
  const subs = await pool.query(
    `SELECT seq, side, batting_order, fielding_position, player_id, player_name
       FROM substitution WHERE game_id = $1 ORDER BY seq`,
    [gameId],
  );
  const earnedRuns = await pool.query(
    `SELECT player_id, earned_runs FROM earned_runs WHERE game_id = $1`,
    [gameId],
  );
  return {
    game: game.rows[0],
    starters: starters.rows,
    substitutions: subs.rows,
    earnedRuns: earnedRuns.rows,
  };
}

/**
 * Season-by-season batting and pitching totals for a player, aggregated from the
 * Phase 4 daily stat lines, with the usual rate stats (AVG/OBP/SLG, ERA/WHIP).
 * Optionally limited to a single season.
 */
export async function playerStats(
  pool: Pool,
  playerId: string,
  year: number | undefined,
): Promise<{ batting: unknown[]; pitching: unknown[] }> {
  const batting = await pool.query(
    `SELECT EXTRACT(YEAR FROM game_date)::int AS year,
            count(*) AS g,
            sum(plate_appearances) AS pa, sum(at_bats) AS ab, sum(runs) AS r,
            sum(hits) AS h, sum(doubles) AS "2b", sum(triples) AS "3b",
            sum(home_runs) AS hr, sum(rbi) AS rbi, sum(walks) AS bb,
            sum(strikeouts) AS so, sum(hit_by_pitch) AS hbp, sum(sac_flies) AS sf,
            sum(stolen_bases) AS sb, sum(caught_stealing) AS cs, sum(total_bases) AS tb,
            round(sum(hits)::numeric / NULLIF(sum(at_bats), 0), 3) AS avg,
            round((sum(hits) + sum(walks) + sum(hit_by_pitch))::numeric
                  / NULLIF(sum(at_bats) + sum(walks) + sum(hit_by_pitch) + sum(sac_flies), 0), 3) AS obp,
            round(sum(total_bases)::numeric / NULLIF(sum(at_bats), 0), 3) AS slg
       FROM batting_daily
      WHERE player_id = $1 AND ($2::int IS NULL OR EXTRACT(YEAR FROM game_date) = $2)
      GROUP BY year ORDER BY year`,
    [playerId, year ?? null],
  );
  const pitching = await pool.query(
    `SELECT EXTRACT(YEAR FROM game_date)::int AS year,
            count(*) AS g, sum(games_started::int) AS gs,
            sum(won::int) AS w, sum(lost::int) AS l, sum(saved::int) AS sv,
            round(sum(outs)::numeric / 3, 1) AS ip, sum(batters_faced) AS bf,
            sum(hits) AS h, sum(home_runs) AS hr, sum(runs) AS r, sum(earned_runs) AS er,
            sum(walks) AS bb, sum(strikeouts) AS so, sum(hit_by_pitch) AS hbp,
            sum(wild_pitches) AS wp, sum(balks) AS bk,
            round(9 * sum(earned_runs)::numeric / NULLIF(sum(outs), 0) * 3, 2) AS era,
            round((sum(walks) + sum(hits))::numeric / NULLIF(sum(outs), 0) * 3, 3) AS whip
       FROM pitching_daily
      WHERE player_id = $1 AND ($2::int IS NULL OR EXTRACT(YEAR FROM game_date) = $2)
      GROUP BY year ORDER BY year`,
    [playerId, year ?? null],
  );
  return { batting: batting.rows, pitching: pitching.rows };
}

/** Per-game daily stat lines (game log) for a player — batting or pitching. */
export async function playerGameLog(
  pool: Pool,
  playerId: string,
  kind: "batting" | "pitching",
  year: number | undefined,
  limit: number,
): Promise<unknown[]> {
  const table = kind === "pitching" ? "pitching_daily" : "batting_daily";
  const res = await pool.query(
    `SELECT d.*, g.visitor_team, g.home_team
       FROM ${table} d JOIN game g ON g.game_id = d.game_id
      WHERE d.player_id = $1 AND ($2::int IS NULL OR EXTRACT(YEAR FROM d.game_date) = $2)
      ORDER BY d.game_date
      LIMIT $3`,
    [playerId, year ?? null, limit],
  );
  return res.rows;
}

export async function playerGames(
  pool: Pool,
  playerId: string,
  year: number | undefined,
  limit: number,
): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT g.game_id, g.game_date, g.visitor_team, g.home_team,
            ls.side, ls.batting_order, ls.fielding_position
       FROM lineup_start ls
       JOIN game g ON g.game_id = ls.game_id
      WHERE ls.player_id = $1
        AND ($2::int IS NULL OR EXTRACT(YEAR FROM g.game_date) = $2)
      ORDER BY g.game_date
      LIMIT $3`,
    [playerId, year ?? null, limit],
  );
  return res.rows;
}
