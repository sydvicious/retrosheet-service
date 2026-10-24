#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Restart the services from the current checkout without touching the data.
# Rebuilds the api and mcp images from the working tree, then brings up db, api
# and mcp; Compose recreates only the containers whose image or configuration
# changed. The loader never runs, so the pgdata volume is kept as it is. (This is
# update.sh without the data refresh and the database check.)
#
# Run from the repo directory. Pass --no-build to skip the image rebuild and
# just bring the services up on the images already present.
#
# Works on Linux and macOS. On macOS the Docker engine is either the Colima VM
# (scripts/setup-macos.sh) or Docker Desktop, and neither is always up; when the
# engine is unreachable the script starts whichever is installed and waits for
# it. (An existing Colima VM keeps its settings; the CPU, memory and disk flags
# only apply to a VM being created.)
set -euo pipefail

BUILD=1
case "${1:-}" in
  --no-build) BUILD=0 ;;
  "") ;;
  *) echo "usage: $0 [--no-build]" >&2; exit 2 ;;
esac

wait_for_engine() {
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "Docker engine did not come up within two minutes." >&2
  exit 1
}

if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ] && command -v colima >/dev/null 2>&1; then
    echo "==> Starting the Colima VM …"
    colima start --cpu 4 --memory 4 --disk 60
    wait_for_engine
  elif [ "$(uname -s)" = "Darwin" ] && [ -d /Applications/Docker.app ]; then
    echo "==> Starting Docker Desktop …"
    open -a Docker
    wait_for_engine
  else
    echo "Docker engine not reachable; start it and re-run." >&2
    exit 1
  fi
fi

if [ "$BUILD" -eq 1 ]; then
  echo "==> Rebuilding images …"
  docker compose build api mcp
fi

echo "==> Bringing up the services …"
docker compose up -d db api mcp
docker compose ps
