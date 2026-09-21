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
// schema. On a later load, if the number stamped in the database differs from the
// number here, the loader forces a full DROP + recreate before loading — so the
// fast hot-refresh path (no --recreate) can't silently load data
// into stale table definitions after a structural change.
export const SCHEMA_VERSION = 3; // v3: schema_meta.etl_version

// BUMP THIS whenever a change to the parser (src/parse/*) or the loader
// (src/etl/*) would put different rows in the database from the same Retrosheet
// data — a parse fix, a new derived column's logic, a changed aggregation. Do NOT
// bump for refactors that load identical data.
//
// The loader stamps this number into `schema_meta.etl_version` with each full
// load; scripts/update.sh reloads when it differs from the database's, even if
// the schema and the Retrosheet data are unchanged.
export const ETL_VERSION = 1; // v1: first stamped version (includes the 4E1 batter-safe fix)
