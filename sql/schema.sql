-- Copyright (c) 2026 Syd Polk
-- SPDX-License-Identifier: BSD-3-Clause
--
-- Retrosheet mart schema. The database is a regenerable, read-only mart: this
-- file is applied wholesale by the loader (DROP + CREATE), then data is bulk
-- loaded. "Update to a new Retrosheet release" = refresh source data + reload.
--
-- Phase 1 covers the already-CSV Retrosheet data (reference tables, rosters,
-- schedules). Game / play-by-play tables arrive in later phases.

DROP SCHEMA IF EXISTS retrosheet CASCADE;
CREATE SCHEMA retrosheet;
SET search_path TO retrosheet;

-- People / biographical (reference/biofile.csv).
CREATE TABLE people (
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
CREATE INDEX people_last_name_idx ON people (last_name);

-- Franchises / teams (reference/teams.csv).
CREATE TABLE teams (
  team_id    text PRIMARY KEY,
  league     text,
  city       text,
  nickname   text,
  first_year integer,
  last_year  integer
);

-- Ballparks (reference/ballparks.csv).
CREATE TABLE ballparks (
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

-- Coaching stints (reference/coaches.csv).
CREATE TABLE coaches (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  text REFERENCES people (player_id),
  year       integer,
  team       text,
  role       text,
  start_date date,
  end_date   date
);
CREATE INDEX coaches_player_id_idx ON coaches (player_id);

-- Ejections (reference/ejections.csv).
CREATE TABLE ejections (
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
CREATE INDEX ejections_game_id_idx ON ejections (game_id);
CREATE INDEX ejections_ejectee_id_idx ON ejections (ejectee_id);

-- Family relationships between people (reference/relatives.csv).
CREATE TABLE relatives (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id_1   text,
  relation      text,
  player_id_2   text
);
CREATE INDEX relatives_player_id_1_idx ON relatives (player_id_1);

-- Season rosters (seasons/<year>/*.ROS). Year comes from the season folder.
CREATE TABLE roster (
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
CREATE INDEX roster_player_id_idx ON roster (player_id);
CREATE INDEX roster_year_team_idx ON roster (year, team);

-- Season schedules (seasons/<year>/<year>schedule.csv).
CREATE TABLE schedule (
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
CREATE INDEX schedule_game_date_idx ON schedule (game_date);
CREATE INDEX schedule_home_team_idx ON schedule (home_team);
