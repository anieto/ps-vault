#!/bin/sh
# P.S. Vault restore script
# Restores a PostgreSQL database dump and file storage from a backup archive.
#
# Usage: ./restore.sh <backup_file.tar.gz>
#
# WARNING: This will DROP and recreate the database and overwrite file storage.
#          Run only on a stopped or maintenance instance.

set -e

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <backup_file.tar.gz>"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[restore] ERROR: File not found: ${BACKUP_FILE}"
  exit 1
fi

# Load env if .env exists alongside this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  # shellcheck disable=SC1090
  . "${SCRIPT_DIR}/../.env"
fi

: "${DB_URL:?DB_URL is required}"
: "${FILE_STORAGE_PATH:=./data/files}"

echo "[restore] Starting restore from: ${BACKUP_FILE}"

# Confirm before proceeding
printf "[restore] WARNING: This will overwrite the database and file storage. Continue? [y/N] "
read -r CONFIRM
case "${CONFIRM}" in
  [yY]|[yY][eE][sS]) ;;
  *)
    echo "[restore] Aborted."
    exit 0
    ;;
esac

TEMP_DIR="/tmp/psvault_restore_$$"
mkdir -p "${TEMP_DIR}"

# Extract archive
echo "[restore] Extracting archive..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted backup directory (psvault_backup_YYYYMMDD_HHMMSS)
EXTRACTED=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name "psvault_backup_*" | head -1)
if [ -z "${EXTRACTED}" ]; then
  echo "[restore] ERROR: Could not find backup directory inside archive."
  rm -rf "${TEMP_DIR}"
  exit 1
fi

# Restore database
if [ -f "${EXTRACTED}/database.sql" ]; then
  echo "[restore] Restoring database..."
  if command -v psql > /dev/null 2>&1; then
    # Drop all connections and recreate the database
    DB_NAME=$(echo "${DB_URL}" | sed 's|.*/||' | sed 's|?.*||')
    DB_HOST=$(echo "${DB_URL}" | sed 's|.*@||' | sed 's|/.*||' | cut -d: -f1)
    DB_PORT=$(echo "${DB_URL}" | sed 's|.*@||' | sed 's|/.*||' | cut -d: -f2)
    DB_USER=$(echo "${DB_URL}" | sed 's|.*://||' | sed 's|:.*||')
    psql "${DB_URL%/$DB_NAME}" \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
      -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
      -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || true
    psql "${DB_URL}" < "${EXTRACTED}/database.sql"
  else
    echo "[restore] psql not found — restoring via Docker..."
    CONTAINER=$(docker ps --filter "name=psvault_db" --format "{{.Names}}" | head -1)
    if [ -z "${CONTAINER}" ]; then
      echo "[restore] ERROR: Could not find database container. Install psql or ensure the container is named 'psvault_db'."
      rm -rf "${TEMP_DIR}"
      exit 1
    fi
    docker cp "${EXTRACTED}/database.sql" "${CONTAINER}:/tmp/psvault_restore.sql"
    docker exec "${CONTAINER}" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid();" postgres 2>/dev/null || true
    docker exec "${CONTAINER}" psql -U postgres < /dev/null -c "\i /tmp/psvault_restore.sql" 2>/dev/null || \
      docker exec -i "${CONTAINER}" psql -U postgres -f /tmp/psvault_restore.sql
  fi
  echo "[restore] Database restored."
else
  echo "[restore] WARNING: No database.sql found in archive, skipping database restore."
fi

# Restore file storage
if [ -d "${EXTRACTED}/files" ]; then
  echo "[restore] Restoring file storage to ${FILE_STORAGE_PATH}..."
  rm -rf "${FILE_STORAGE_PATH}"
  mkdir -p "$(dirname "${FILE_STORAGE_PATH}")"
  cp -r "${EXTRACTED}/files" "${FILE_STORAGE_PATH}"
  echo "[restore] File storage restored."
else
  echo "[restore] No file storage in archive, skipping."
fi

rm -rf "${TEMP_DIR}"
echo "[restore] Done. Restart the P.S. Vault container to apply."
