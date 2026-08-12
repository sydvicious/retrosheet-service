-- Copyright (c) 2026 Syd Polk
-- SPDX-License-Identifier: BSD-3-Clause
--
-- Retrosheet mart schema. The database is a regenerable, read-only mart.
--
-- This file is IDEMPOTENT (CREATE ... IF NOT EXISTS, no DROP): applying it never
-- destroys existing objects, so the loader can refresh DATA in place (truncate +
-- reload inside one transaction) without dropping the schema — the running API
-- keeps serving. A full structural rebuild (when these definitions change) is a
-- separate `--recreate` step in the loader that drops the schema first.

CREATE SCHEMA IF NOT EXISTS retrosheet;
SET search_path TO retrosheet;

-- ===========================================================================
-- Phase 1 — reference / roster / schedule (already-CSV Retrosheet data)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS people (
  player_id       text PRIMARY KEY,
  last_name       text,
  first_name      text,
  nickname        text,
  birth_date      date,
  birth_city      text,
  birth_state     text,
  birth_country   text,
  play_debut      date,
  play_last_game  date,
  mgr_debut       date,
  mgr_last_game   date,
  coach_debut     date,
  coach_last_game date,
  ump_debut       date,
  ump_last_game   date,
  death_date      date,
  death_city      text,
  death_state     text,
  death_country   text,
  bats            text,
  throws          text,
  height          text,
  weight          integer,
  cemetery        text,
  ceme_city       text,
  ceme_state      text,
  ceme_country    text,
  ceme_note       text,
  birth_name      text,
  name_chg        text,
  bat_chg         text,
  hof             text
);
CREATE INDEX IF NOT EXISTS people_last_name_idx ON people (last_name);

CREATE TABLE IF NOT EXISTS teams (
  team_id    text PRIMARY KEY,
  league     text,
  city       text,
  nickname   text,
  first_year integer,
  last_year  integer
);

CREATE TABLE IF NOT EXISTS ballparks (
  park_id    text PRIMARY KEY,
  name       text,
  aka        text,
  city       text,
  state      text,
  start_date date,
  end_date   date,
  league     text,
  notes      text
);

CREATE TABLE IF NOT EXISTS coaches (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  text REFERENCES people (player_id),
  year       integer,
  team       text,
  role       text,
  start_date date,
  end_date   date
);
CREATE INDEX IF NOT EXISTS coaches_player_id_idx ON coaches (player_id);

CREATE TABLE IF NOT EXISTS ejections (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id       text,
  ejection_date date,
  dh            text,
  ejectee_id    text,
  ejectee_name  text,
  team          text,
  job           text,
  umpire_id     text,
  umpire_name   text,
  inning        integer,
  reason        text
);
CREATE INDEX IF NOT EXISTS ejections_game_id_idx ON ejections (game_id);
CREATE INDEX IF NOT EXISTS ejections_ejectee_id_idx ON ejections (ejectee_id);

CREATE TABLE IF NOT EXISTS relatives (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id_1   text,
  relation      text,
  player_id_2   text
);
CREATE INDEX IF NOT EXISTS relatives_player_id_1_idx ON relatives (player_id_1);

CREATE TABLE IF NOT EXISTS roster (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year       integer NOT NULL,
  team       text NOT NULL,
  player_id  text NOT NULL,
  last_name  text,
  first_name text,
  bats       text,
  throws     text,
  position   text
);
CREATE INDEX IF NOT EXISTS roster_player_id_idx ON roster (player_id);
CREATE INDEX IF NOT EXISTS roster_year_team_idx ON roster (year, team);

CREATE TABLE IF NOT EXISTS schedule (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_date            date,
  game_number          integer,
  day_of_week          text,
  visitor_team         text,
  visitor_league       text,
  visitor_game_number  integer,
  home_team            text,
  home_league          text,
  home_game_number     integer,
  day_night            text,
  site                 text,
  postponed            text,
  makeup               text
);
CREATE INDEX IF NOT EXISTS schedule_game_date_idx ON schedule (game_date);
CREATE INDEX IF NOT EXISTS schedule_home_team_idx ON schedule (home_team);

-- ===========================================================================
-- Phase 2 — event-file structure (game metadata, lineups, subs, comments,
-- earned runs, adjustments). Parsed clean-room from the Retrosheet event format;
-- the play-by-play `play` table arrives in Phase 3.
-- ===========================================================================

-- One row per game, from the event file's id + info records.
CREATE TABLE IF NOT EXISTS game (
  game_id              text PRIMARY KEY,
  game_date            date,
  game_number          integer,
  game_type            text,
  visitor_team         text,
  home_team            text,
  site                 text,
  start_time           text,
  day_night            text,
  innings              integer,
  tiebreaker           text,
  use_dh               boolean,
  home_team_bats_first boolean,
  pitches              text,
  ump_home             text,
  ump_1b               text,
  ump_2b               text,
  ump_3b               text,
  ump_lf               text,
  ump_rf               text,
  field_cond           text,
  precip               text,
  sky                  text,
  temp                 integer,
  wind_dir             text,
  wind_speed           integer,
  time_of_game         integer,
  attendance           integer,
  winning_pitcher      text,
  losing_pitcher       text,
  save_pitcher         text,
  gwrbi                text,
  how_scored           text,
  official_scorer      text,
  scorer               text,
  translator           text,
  inputter             text,
  input_time           text,
  edit_time            text,
  input_prog_vers      text
);
CREATE INDEX IF NOT EXISTS game_game_date_idx ON game (game_date);
CREATE INDEX IF NOT EXISTS game_home_team_idx ON game (home_team);
CREATE INDEX IF NOT EXISTS game_visitor_team_idx ON game (visitor_team);
CREATE INDEX IF NOT EXISTS game_site_idx ON game (site);

-- Every info key/value verbatim (lossless; the long tail not promoted to game).
CREATE TABLE IF NOT EXISTS game_info (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id text NOT NULL REFERENCES game (game_id),
  key     text NOT NULL,
  value   text
);
CREATE INDEX IF NOT EXISTS game_info_game_id_idx ON game_info (game_id);
CREATE INDEX IF NOT EXISTS game_info_key_idx ON game_info (key);

-- Starting lineups (start records).
CREATE TABLE IF NOT EXISTS lineup_start (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id           text NOT NULL REFERENCES game (game_id),
  player_id         text,
  player_name       text,
  side              smallint,   -- 0 = visiting, 1 = home
  batting_order     smallint,   -- 0-9 (0 = pitcher in a DH lineup)
  fielding_position smallint    -- 1-9 field, 10 DH, 11 PH, 12 PR
);
CREATE INDEX IF NOT EXISTS lineup_start_game_id_idx ON lineup_start (game_id);
CREATE INDEX IF NOT EXISTS lineup_start_player_id_idx ON lineup_start (player_id);

-- Substitutions (sub records), in game order via seq.
CREATE TABLE IF NOT EXISTS substitution (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id           text NOT NULL REFERENCES game (game_id),
  seq               integer,
  player_id         text,
  player_name       text,
  side              smallint,
  batting_order     smallint,
  fielding_position smallint
);
CREATE INDEX IF NOT EXISTS substitution_game_id_idx ON substitution (game_id);
CREATE INDEX IF NOT EXISTS substitution_player_id_idx ON substitution (player_id);

-- Free-text / structured comments (com records), in game order via seq.
CREATE TABLE IF NOT EXISTS comment (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id text NOT NULL REFERENCES game (game_id),
  seq     integer,
  text    text
);
CREATE INDEX IF NOT EXISTS comment_game_id_idx ON comment (game_id);

-- Earned runs charged to each pitcher (data,er records).
CREATE TABLE IF NOT EXISTS earned_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id     text NOT NULL REFERENCES game (game_id),
  player_id   text,
  earned_runs integer
);
CREATE INDEX IF NOT EXISTS earned_runs_game_id_idx ON earned_runs (game_id);
CREATE INDEX IF NOT EXISTS earned_runs_player_id_idx ON earned_runs (player_id);

-- Adjustment records (badj/padj/ladj/radj/presadj), kept raw with game order.
CREATE TABLE IF NOT EXISTS game_adjustment (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id  text NOT NULL REFERENCES game (game_id),
  seq      integer,
  adj_type text,
  field1   text,
  field2   text
);
CREATE INDEX IF NOT EXISTS game_adjustment_game_id_idx ON game_adjustment (game_id);

-- ===========================================================================
-- Additional query / sort indexes. This is a read-heavy, regenerable mart, so
-- we index generously: every indexed column also becomes a GraphQL
-- condition/orderBy field (PostGraphile exposes those on indexed columns only).
-- The dataset is small, so indexes are cheap.
-- ===========================================================================

-- people
CREATE INDEX IF NOT EXISTS people_first_name_idx     ON people (first_name);
CREATE INDEX IF NOT EXISTS people_birth_date_idx     ON people (birth_date);
CREATE INDEX IF NOT EXISTS people_death_date_idx     ON people (death_date);
CREATE INDEX IF NOT EXISTS people_birth_country_idx  ON people (birth_country);
CREATE INDEX IF NOT EXISTS people_birth_state_idx    ON people (birth_state);
CREATE INDEX IF NOT EXISTS people_bats_idx           ON people (bats);
CREATE INDEX IF NOT EXISTS people_throws_idx         ON people (throws);
CREATE INDEX IF NOT EXISTS people_hof_idx            ON people (hof);
CREATE INDEX IF NOT EXISTS people_play_debut_idx     ON people (play_debut);
CREATE INDEX IF NOT EXISTS people_play_last_game_idx ON people (play_last_game);

-- teams
CREATE INDEX IF NOT EXISTS teams_league_idx   ON teams (league);
CREATE INDEX IF NOT EXISTS teams_city_idx     ON teams (city);
CREATE INDEX IF NOT EXISTS teams_nickname_idx ON teams (nickname);

-- ballparks
CREATE INDEX IF NOT EXISTS ballparks_name_idx   ON ballparks (name);
CREATE INDEX IF NOT EXISTS ballparks_city_idx   ON ballparks (city);
CREATE INDEX IF NOT EXISTS ballparks_state_idx  ON ballparks (state);
CREATE INDEX IF NOT EXISTS ballparks_league_idx ON ballparks (league);

-- coaches
CREATE INDEX IF NOT EXISTS coaches_year_idx ON coaches (year);
CREATE INDEX IF NOT EXISTS coaches_team_idx ON coaches (team);

-- ejections
CREATE INDEX IF NOT EXISTS ejections_date_idx      ON ejections (ejection_date);
CREATE INDEX IF NOT EXISTS ejections_umpire_id_idx ON ejections (umpire_id);
CREATE INDEX IF NOT EXISTS ejections_team_idx      ON ejections (team);

-- relatives
CREATE INDEX IF NOT EXISTS relatives_player_id_2_idx ON relatives (player_id_2);
CREATE INDEX IF NOT EXISTS relatives_relation_idx    ON relatives (relation);

-- roster
CREATE INDEX IF NOT EXISTS roster_team_idx      ON roster (team);
CREATE INDEX IF NOT EXISTS roster_position_idx  ON roster (position);
CREATE INDEX IF NOT EXISTS roster_last_name_idx ON roster (last_name);

-- schedule
CREATE INDEX IF NOT EXISTS schedule_visitor_team_idx ON schedule (visitor_team);
CREATE INDEX IF NOT EXISTS schedule_site_idx         ON schedule (site);
CREATE INDEX IF NOT EXISTS schedule_day_night_idx    ON schedule (day_night);

-- game (metadata query/sort targets)
CREATE INDEX IF NOT EXISTS game_game_type_idx       ON game (game_type);
CREATE INDEX IF NOT EXISTS game_day_night_idx       ON game (day_night);
CREATE INDEX IF NOT EXISTS game_game_number_idx     ON game (game_number);
CREATE INDEX IF NOT EXISTS game_attendance_idx      ON game (attendance);
CREATE INDEX IF NOT EXISTS game_winning_pitcher_idx ON game (winning_pitcher);
CREATE INDEX IF NOT EXISTS game_losing_pitcher_idx  ON game (losing_pitcher);
CREATE INDEX IF NOT EXISTS game_save_pitcher_idx    ON game (save_pitcher);
CREATE INDEX IF NOT EXISTS game_ump_home_idx        ON game (ump_home);
CREATE INDEX IF NOT EXISTS game_ump_1b_idx          ON game (ump_1b);
CREATE INDEX IF NOT EXISTS game_ump_2b_idx          ON game (ump_2b);
CREATE INDEX IF NOT EXISTS game_ump_3b_idx          ON game (ump_3b);

-- game_info: find games by info key/value
CREATE INDEX IF NOT EXISTS game_info_key_value_idx ON game_info (key, value);

-- lineup_start / substitution (position, order, name lookups)
CREATE INDEX IF NOT EXISTS lineup_start_fielding_position_idx ON lineup_start (fielding_position);
CREATE INDEX IF NOT EXISTS lineup_start_batting_order_idx     ON lineup_start (batting_order);
CREATE INDEX IF NOT EXISTS lineup_start_player_name_idx       ON lineup_start (player_name);
CREATE INDEX IF NOT EXISTS substitution_fielding_position_idx ON substitution (fielding_position);
CREATE INDEX IF NOT EXISTS substitution_player_name_idx       ON substitution (player_name);

-- game_adjustment
CREATE INDEX IF NOT EXISTS game_adjustment_adj_type_idx ON game_adjustment (adj_type);
