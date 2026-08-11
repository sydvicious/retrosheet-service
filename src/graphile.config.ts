// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { loadConfig } from "./config.js";

const cfg = loadConfig();

// PostGraphile v5 preset. The Amber preset is the standard PostGraphile
// behavior (Relay-ish connections, filtering, ordering). We reflect a single
// schema — the regenerable Retrosheet mart.
const preset = {
  extends: [PostGraphileAmberPreset],
  pgServices: [
    makePgService({
      connectionString: cfg.databaseUrl,
      schemas: [cfg.schema],
    }),
  ],
  grafserv: {
    port: cfg.port,
    graphqlPath: "/graphql",
    graphiql: true,
    graphiqlPath: "/",
  },
  grafast: {
    explain: process.env.NODE_ENV !== "production",
  },
};

export default preset;
