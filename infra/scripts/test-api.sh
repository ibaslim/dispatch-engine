#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_DIR="$ROOT_DIR/apps/api"

# conftest.py refuses any database whose name lacks "test".
DB_HOST="${TEST_DB_HOST:-postgres}"
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql+asyncpg://dispatch:dispatch@${DB_HOST}:5432/dispatch_test}"

# Measure coverage with PEP 669 sys.monitoring (Python 3.12+). The default settrace
# tracer does not record lines that resume after an `await`, so async endpoints report
# far below their true coverage; sysmon tracks resumed coroutine frames correctly (and
# runs faster). No effect on non-coverage runs.
export COVERAGE_CORE="${COVERAGE_CORE:-sysmon}"

cd "$APP_DIR"

# Create the test database on first run; a no-op afterwards.
python - <<'PY'
import asyncio, os
import asyncpg
from sqlalchemy.engine import make_url

url = make_url(os.environ["DATABASE_URL"])


async def main():
    conn = await asyncpg.connect(
        user=url.username, password=url.password,
        host=url.host, port=url.port or 5432, database="postgres",
    )
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", url.database):
            await conn.execute(f'CREATE DATABASE "{url.database}" OWNER "{url.username}"')
            print(f"[test] created database {url.database}")
    finally:
        await conn.close()


asyncio.run(main())
PY

echo "[test] running against ${DATABASE_URL##*@}"
exec python -m pytest "$@"
