// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { createServer } from "node:http";
import { postgraphile } from "postgraphile";
import { grafserv } from "postgraphile/grafserv/node";
import preset from "./graphile.config.js";
import { loadConfig } from "./config.js";

const cfg = loadConfig();

const pgl = postgraphile(preset);
const serv = pgl.createServ(grafserv);

const server = createServer();
serv.addTo(server).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

server.listen(cfg.port, () => {
  console.log(
    `retrosheet-service listening: GraphiQL http://localhost:${cfg.port}/  (GraphQL POST /graphql)`,
  );
});
