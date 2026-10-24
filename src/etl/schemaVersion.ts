// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Single source of truth for the mart's schema and ETL versions.
//
// BUMP THIS whenever sql/schema.sql changes STRUCTURALLY — a new/renamed/retyped
// column, a new/renamed/dropped table, a changed key or constraint. (Pure index
// additions that CREATE ... IF NOT EXISTS can add in place don't strictly need a
// bump, but bumping is always safe.) Do NOT bump for data-only changes.
//
// The loader stamps this number into the `schema_meta` table after applying the
// schema. When the number stamped in the database differs from the number here,
// scripts/update.sh does a full reload (which always builds the tables afresh)
// and the partial --replace load refuses to run, so no load writes rows into
// stale table definitions.
export const SCHEMA_VERSION = 6; // v6: data_gap; v5: game.season_phase, game.league_group; v4: game.source_file; v3: schema_meta.etl_version

// BUMP THIS whenever a change to the parser (src/parse/*) or the loader
// (src/etl/*) would put different rows in the database from the same Retrosheet
// data — a parse fix, a new derived column's logic, a changed aggregation. Do NOT
// bump for refactors that load identical data.
//
// The loader stamps this number into `schema_meta.etl_version` with each full
// load; scripts/update.sh reloads when it differs from the database's, even if
// the schema and the Retrosheet data are unchanged.
export const ETL_VERSION = 4; // v4: game.season_phase and game.league_group derived (gameClass.ts)
// v3: .EVR (Negro Leagues) event files loaded; game.source_file filled
// v2: force-out runners retired, error-negated X advances, radj runners placed, DGR with a fielder digit,
// NDP/NTP, WP/PB flagged on an advance, no RBI on a strikeout, fielding credits
// for K23, repeat handlers and 99(n)
