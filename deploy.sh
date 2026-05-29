#!/bin/bash
set -e
cd "$(dirname "$0")"
git pull origin main
docker compose build
docker compose up -d
