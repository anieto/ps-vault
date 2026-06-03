#!/bin/sh
# P.S. Vault backup script
# Backs up the PostgreSQL database and file storage to a timestamped archive.
#
# Usage: ./backup.sh [output_dir]
# Default output dir: ./backups

set -e

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="psvault_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/${BACKUP_NAME}"

# Load env if .env exists alongside this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  # shellcheck disable=SC1090
  . "${SCRIPT_DIR}/../.env"
fi

: "${DB_URL:?DB_URL is required}"
: "${FILE_STORAGE_PATH:=./data/files}"

echo "[backup] Starting backup: ${BACKUP_NAME}"
mkdir -p "${TEMP_DIR}" "${BACKUP_DIR}"

# Database dump
echo "[backup] Dumping database..."
if command -v pg_dump > /dev/null 2>&1; then
  pg_dump "${DB_URL}" > "${TEMP_DIR}/database.sql"
else
  echo "[backup] pg_dump not found — dumping via Docker..."
  CONTAINER=$(docker ps --filter "name=psvault_db" --format "{{.Names}}" | head -1)
  if [ -z "${CONTAINER}" ]; then
    echo "[backup] ERROR: Could not find database container. Set DB_URL and install pg_dump, or ensure the container is named 'psvault_db'."
    exit 1
  fi
  docker exec "${CONTAINER}" pg_dumpall -U postgres > "${TEMP_DIR}/database.sql"
fi

# File storage
if [ -d "${FILE_STORAGE_PATH}" ]; then
  echo "[backup] Copying file storage..."
  cp -r "${FILE_STORAGE_PATH}" "${TEMP_DIR}/files"
else
  echo "[backup] No file storage directory found at ${FILE_STORAGE_PATH}, skipping."
fi

# Archive
echo "[backup] Creating archive..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "/tmp" "${BACKUP_NAME}"
rm -rf "${TEMP_DIR}"

echo "[backup] Done: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Prune backups older than 30 days
find "${BACKUP_DIR}" -name "psvault_backup_*.tar.gz" -mtime +30 -delete 2>/dev/null || true
echo "[backup] Old backups pruned (keeping 30 days)."
