#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Pulling latest code"
git pull

echo "==> Building Docker images"
docker compose -f docker/docker-compose.build.yml build

echo "==> Restarting containers"
docker compose -f docker/docker-compose.build.yml up -d

echo "==> Deploy complete"
