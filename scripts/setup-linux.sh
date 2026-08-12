#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Ready a Linux host to run retrosheet-service via Docker. Installs git and the
# Docker Engine + Compose/Buildx plugins (via Docker's official get.docker.com
# script), enables the service, and adds the current user to the docker group.
# Idempotent — safe to re-run. Requires root or sudo.
#
# After this (log out/in once so the docker group applies), from the repo dir:
#   ./scripts/fetch-data.sh
#   docker compose up -d db
#   docker compose run --rm loader
#   docker compose up -d api mcp
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "Run as root, or install sudo." >&2
    exit 1
  fi
fi

# --- git (via the distro package manager) -------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "==> Installing git …"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update && $SUDO apt-get install -y git
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y git
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y git
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm git
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y git
  else
    echo "Unknown package manager — install git manually, then re-run." >&2
    exit 1
  fi
else
  echo "==> git already installed."
fi

# --- Docker Engine + Compose v2 + Buildx --------------------------------------
# get.docker.com installs docker-ce, the CLI, containerd, and the
# docker-compose-plugin and docker-buildx-plugin on supported distros.
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine (via get.docker.com) …"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  $SUDO sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
else
  echo "==> Docker already installed."
fi

echo "==> Enabling and starting the Docker service …"
$SUDO systemctl enable --now docker || true

# --- Let the current user run docker without sudo -----------------------------
if [ -n "$SUDO" ] && [ -n "${USER:-}" ] && [ "${USER}" != "root" ]; then
  echo "==> Adding $USER to the docker group (log out/in for it to take effect) …"
  $SUDO usermod -aG docker "$USER" || true
fi

echo
echo "==> Verifying:"
if $SUDO docker info >/dev/null 2>&1; then
  echo "    docker engine: OK"
else
  echo "    docker engine: NOT reachable" >&2
  exit 1
fi
$SUDO docker compose version
$SUDO docker buildx version

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
echo "If you were just added to the docker group, log out and back in so you can"
echo "run docker without sudo."
