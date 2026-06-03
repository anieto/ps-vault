#!/bin/sh
set -e

PGDATA=/data/db

if [ -f "${PGDATA}/PG_VERSION" ]; then
    echo "[init-db] Data directory already initialized, skipping."
    exit 0
fi

echo "[init-db] Initializing PostgreSQL data directory..."

install -d -m 0700 -o postgres -g postgres "${PGDATA}"
su-exec postgres initdb -D "${PGDATA}" -U postgres --auth-local=trust --auth-host=md5

# Allow localhost TCP connections without password (all internal to container)
printf "\nhost all all 127.0.0.1/32 trust\nhost all all ::1/128 trust\n" >> "${PGDATA}/pg_hba.conf"

# Only listen on localhost
printf "\nlisten_addresses = 'localhost'\n" >> "${PGDATA}/postgresql.conf"

echo "[init-db] Starting PostgreSQL temporarily to create user and database..."
su-exec postgres pg_ctl -D "${PGDATA}" -o "-k /run/postgresql -h ''" -l /tmp/pg-init.log start

until su-exec postgres pg_isready -h /run/postgresql 2>/dev/null; do
    sleep 0.5
done

su-exec postgres psql -h /run/postgresql -U postgres -c \
    "CREATE USER psvault WITH PASSWORD 'psvault_db_internal';"
su-exec postgres psql -h /run/postgresql -U postgres -c \
    "CREATE DATABASE psvault OWNER psvault;"

su-exec postgres pg_ctl -D "${PGDATA}" stop

echo "[init-db] Done."
