#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Ready a macOS host to run retrosheet-service via Docker (Colima, no Docker
# Desktop). Installs Homebrew if missing (which also installs the Xcode Command
# Line Tools, providing git), ensures git, installs the Docker prerequisites,
# wires the Docker CLI plugins, and starts the Colima VM. Idempotent.
#
# After this, from the repo directory:
#   ./scripts/fetch-data.sh
#   docker compose up -d db
#   docker compose run --rm loader
#   docker compose up -d api mcp
set -euo pipefail

# --- Homebrew (install if missing) --------------------------------------------
# The Homebrew installer also installs the Xcode Command Line Tools, which
# provide git. You may be prompted for your password.
if ! command -v brew >/dev/null 2>&1; then
  echo "==> Homebrew not found — installing it (you may be prompted for your password) …"
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Load brew into this shell (Apple Silicon: /opt/homebrew, Intel: /usr/local).
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew install did not complete. See https://brew.sh then re-run." >&2
  exit 1
fi

# --- git (from the Xcode CLT installed above, or via Homebrew) ----------------
if ! command -v git >/dev/null 2>&1; then
  echo "==> Installing git …"
  brew install git
else
  echo "==> git already installed ($(command -v git))."
fi

echo "==> Installing Docker packages (colima, docker, docker-buildx, docker-compose) …"
brew install colima docker docker-buildx docker-compose

echo "==> Wiring the Docker CLI plugins …"
mkdir -p ~/.docker/cli-plugins
ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" ~/.docker/cli-plugins/docker-compose
ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx

if colima status >/dev/null 2>&1; then
  echo "==> Colima VM already running."
else
  echo "==> Starting the Colima VM (4 CPU / 4 GB / 60 GB) …"
  colima start --cpu 4 --memory 4 --disk 60
fi

echo
echo "==> Verifying:"
if docker info >/dev/null 2>&1; then
  echo "    docker engine: OK"
else
  echo "    docker engine: NOT reachable" >&2
  exit 1
fi
docker compose version
docker buildx version

echo
echo "Host is ready. Next:"
if [ -f docker-compose.yml ]; then
  echo "  ./scripts/fetch-data.sh"
  echo "  docker compose up -d db && docker compose run --rm loader"
  echo "  docker compose up -d api mcp"
else
  echo "  git clone https://github.com/sydvicious/retrosheet-service.git"
  echo "  cd retrosheet-service"
  echo "  ./scripts/fetch-data.sh"
  echo "  docker compose up -d db && docker compose run --rm loader"
  echo "  docker compose up -d api mcp"
fi
echo
echo "To keep Colima running across reboots (for an always-on server):"
echo "  brew services start colima"
