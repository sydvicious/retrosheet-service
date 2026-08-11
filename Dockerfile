# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Single image for both the API and the ETL loader (the loader is pure
# TypeScript — no Chadwick, no native toolchain). Compose overrides the command
# for the loader service.

# --- build stage ---------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage -------------------------------------------------------------
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY sql ./sql
EXPOSE 5050
CMD ["node", "dist/index.js"]
