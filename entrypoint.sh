#!/bin/sh
set -e

BACKUP_DIR="/app/backups"
DB_NAME="${MONGODB_DB:-yad2search}"
MONGODB_URL="${MONGODB_URL:-mongodb://mongo:27017}"

# Wait for MongoDB to be ready
echo "[entrypoint] Waiting for MongoDB..."
for i in $(seq 1 30); do
    if mongodump --uri="$MONGODB_URL" --db="$DB_NAME" --archive=/dev/null --gzip 2>/dev/null; then
        echo "[entrypoint] MongoDB is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[entrypoint] MongoDB not reachable after 30s, starting app anyway"
    fi
    sleep 1
done

# Check if the database already has data
DOC_COUNT=$(mongodump --uri="$MONGODB_URL" --db="$DB_NAME" --collection=listings --archive=/dev/null --gzip 2>&1 | grep -c "done dumping" || true)

if [ "$DOC_COUNT" -gt 0 ]; then
    echo "[entrypoint] Database already has data, skipping restore"
else
    # Find the latest backup file
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/${DB_NAME}_*.gz 2>/dev/null | head -1)

    if [ -n "$LATEST_BACKUP" ]; then
        echo "[entrypoint] Restoring from backup: $LATEST_BACKUP"
        mongorestore --uri="$MONGODB_URL" --archive="$LATEST_BACKUP" \
            --gzip --drop --noIndexRestore 2>&1
        echo "[entrypoint] Restore complete (indexes will be created by the app)"
    else
        echo "[entrypoint] No backup found in $BACKUP_DIR, starting fresh"
    fi
fi

# Start the app with configurable port
exec "$@" --port "${PORT:-8000}"
