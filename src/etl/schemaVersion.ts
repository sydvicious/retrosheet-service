// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Single source of truth for the mart's structural schema version.
//
// BUMP THIS whenever sql/schema.sql changes STRUCTURALLY — a new/renamed/retyped
// column, a new/renamed/dropped table, a changed key or constraint. (Pure index
// additions that CREATE ... IF NOT EXISTS can add in place don't strictly need a
// bump, but bumping is always safe.) Do NOT bump for data-only changes.
//
// The loader stamps this number into the `schema_meta` table after applying the
// schema. On a later load, if the number stamped in the database differs from the
// number here, the loader forces a full DROP + recreate before loading — so the
// fast hot-refresh path (update-data.sh, no --recreate) can't silently load data
// into stale table definitions after a structural change.
export const SCHEMA_VERSION = 1;
