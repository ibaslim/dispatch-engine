# Dispatch Engine

A multi-tenant delivery dispatch system built as an Nx monorepo.

## Tech Stack

| Layer | Technology |
|---|---|
| Dispatcher portal | Angular 17 + Tailwind CSS |
| Public tracking | Angular 17 + Tailwind CSS |
| Driver mobile | React Native (Expo) + NativeWind |
| Backend API | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 + Alembic migrations |
| Cache / Queue | Redis + Celery |
| Email (local) | Mailpit |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Monorepo | Nx 18 |

## Repository Structure

```text
.
├── apps/
│   ├── dispatcher-web/     # Angular ops console (port 4200)
│   ├── tracking-web/       # Angular public tracking (port 4300)
│   ├── driver-mobile/      # React Native driver app (Expo)
│   └── api/                # FastAPI backend (port 8000)
├── libs/
│   └── shared/
│       ├── domain/         # TypeScript enums (roles, statuses)
│       ├── contracts/      # API DTO interfaces + OpenAPI generation
│       └── api-client/     # Typed HTTP client wrapper
├── infra/
│   ├── docker/             # docker-compose + Nginx config
│   └── scripts/            # Migration + bootstrap scripts
├── docker-compose.yml      # Root-level convenience wrapper
└── .env.local.example      # Environment variable template
```

---

## Quick Start

### Prerequisites

Only **Docker + Docker Compose** are required for the one-command setup below.

### One-Command Setup (Recommended)

```bash
git clone https://github.com/ibaslim/dispatch-engine.git
cd dispatch-engine
docker compose up
```

That's it. Open http://localhost:4200 and log in with the default admin credentials.

**What happens automatically:**

1. `.env.local` is generated with a random `JWT_SECRET_KEY`
2. PostgreSQL, Redis, and Mailpit start
3. Database migrations run
4. Platform admin is seeded (`admin@dispatch.local` / `Admin123!`)
5. FastAPI API starts on port 8000
6. Celery worker starts
7. Angular dispatcher-web starts on port 4200
8. Angular tracking-web starts on port 4300

### Service URLs

| Service | URL |
|---|---|
| Dispatcher Portal | http://localhost:4200 |
| Tracking Web | http://localhost:4300 |
| API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Mailpit (email UI) | http://localhost:8025 |

### Default Admin Credentials

| Field | Value |
|---|---|
| Email | `admin@dispatch.local` |
| Password | `Admin123!` |

---

## Manual / Granular Setup

For developers who want to run services individually without Docker for all layers.

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| Python | ≥ 3.12 |
| Docker + Docker Compose | Latest (for infra services) |

### 1. Clone and configure environment

```bash
git clone https://github.com/ibaslim/dispatch-engine.git
cd dispatch-engine
cp .env.local.example .env.local
# Edit .env.local and set JWT_SECRET_KEY to a secure random string:
#   openssl rand -hex 32
```

### 2. Start infrastructure services

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailpit
```

This spins up PostgreSQL, Redis, and Mailpit (email UI at http://localhost:8025).

### 3. Install Node dependencies

```bash
npm install
```

### 4. Set up and start the Python API

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.local .env
alembic upgrade head
uvicorn app.main:app --reload
```

> API: http://localhost:8000 | Swagger: http://localhost:8000/docs
> The platform admin (`admin@dispatch.local` / `Admin123!`) is seeded automatically on first boot.

### 5. Start web apps (separate terminals)

```bash
# Dispatcher portal (http://localhost:4200)
npx nx serve dispatcher-web

# Tracking web (http://localhost:4300)
npx nx serve tracking-web
```

### 6. Start Celery worker (optional — required for emails)

```bash
cd apps/api
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info
```

---

## Hot-Reload & Development Workflow

| Change | Auto-reflects? | Action needed |
|---|---|---|
| Edit Python file (`.py`) | ✅ Instant | None — uvicorn `--reload` |
| Edit Angular file (`.ts`/`.html`/`.css`) | ✅ Instant | None — Nx HMR |
| Edit shared lib (`libs/shared/*`) | ✅ Instant | None — Nx watches workspace |
| Create new Alembic migration | ⚠️ On restart | `docker compose restart api` |
| Add new pip package (`requirements.txt`) | ⚠️ On restart | `docker compose restart api` |
| Add new npm package (`package.json`) | ⚠️ On restart | `docker compose restart dispatcher-web` |
| Change `docker-compose.yml` | 🔄 Rebuild | `docker compose up --build` |

---

## Driver Mobile App (React Native)

React Native / Expo **cannot run inside Docker** — it needs simulator/emulator access, USB device connections, and the Metro bundler on the host machine. Run it directly:

```bash
cd apps/driver-mobile
npm install
npx expo start
```

Requirements: a Firebase project configured with `google-services.json` (Android) and `GoogleService-Info.plist` (iOS).

---

## Useful Docker Commands

```bash
docker compose up              # Start everything
docker compose up -d           # Start in background
docker compose down            # Stop all services
docker compose down -v         # Stop + remove volumes (fresh start)
docker compose restart api     # Restart API (picks up new migrations/deps)
docker compose logs -f api     # Follow API logs
docker compose logs -f         # Follow all logs
```

---

## Authentication Flow

1. **Platform admin**: auto-seeded on first API boot (or run `bootstrap_platform_admin` CLI for production).
2. **Invite tenant admin**: platform admin calls `POST /api/v1/platform/tenants/invite` (or via the Platform Admin page in dispatcher-web).
3. **Accept invitation**: invited user visits `/invite/accept?token=...` in dispatcher-web, sets password → gets JWT tokens → redirected to dashboard.
4. **Normal login**: `POST /api/v1/auth/login` → access token (15 min) + refresh token (7 days).
5. **Token refresh**: `POST /api/v1/auth/refresh` → new token pair (rotation).

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/login` | Public | Login with email + password |
| POST | `/api/v1/auth/refresh` | Public | Refresh access token |
| POST | `/api/v1/auth/logout` | Public | Revoke refresh token |
| GET | `/api/v1/auth/me` | Bearer | Get current user |
| POST | `/api/v1/auth/forgot-password` | Public | Request password reset (stub) |
| POST | `/api/v1/auth/reset-password` | Public | Reset password (stub) |
| POST | `/api/v1/platform/tenants/invite` | Platform Admin | Invite tenant admin |
| POST | `/api/v1/invitations/accept` | Public | Accept invitation & set password |
| GET | `/api/v1/stores` | Bearer | List stores (tenant-scoped) |
| POST | `/api/v1/stores` | Tenant Admin | Create store |
| GET | `/api/v1/tracking/{token}` | Public | Get delivery tracking info |
| GET | `/api/v1/ws` | Bearer (WS) | WebSocket for real-time updates |

OpenAPI docs available at: http://localhost:8000/docs

---

## Nx Commands

```bash
# Build
npx nx build dispatcher-web
npx nx build tracking-web

# Serve (dev)
npx nx serve dispatcher-web
npx nx serve tracking-web

# Lint
npx nx lint dispatcher-web
npx nx lint tracking-web
npx nx lint shared-domain

# Test
npx nx test shared-domain
npx nx test shared-api-client

# Generate API contracts from running API
npx nx run shared-contracts:generate
```

---

## Running Tests

**Python tests (via Docker):**

```bash
docker compose exec api pytest tests/ -v
```

**Python tests (locally):**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/ -v
```

Expected: 13 unit tests for invitation validity and tenant scoping (no database required).

**TypeScript tests:**

```bash
npx nx test shared-domain
npx nx test shared-api-client
```

---

## Multi-Tenant Architecture

- **Platform admin**: system-wide, manages tenants.
- **Tenant admin**: manages one tenant (all stores, all dispatchers).
- **Central dispatcher**: operates across all stores within their tenant.
- **Store dispatcher**: scoped to assigned store(s) only (`user_store_access` table).
- **Driver**: assigned to jobs within their tenant.

Tenant isolation is enforced at the service layer via `require_same_tenant` dependency and scoped DB queries.

---

## Environment Variables

See `.env.local.example` for the full list. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL async URL | `postgresql+asyncpg://dispatch:dispatch@localhost:5432/dispatch_dev` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | Secret for signing JWTs — auto-generated by Docker init service | `changeme-…` |
| `DISPATCHER_WEB_BASE_URL` | Used for invitation links | `http://localhost:4200` |
| `MAIL_HOST` / `MAIL_PORT` | SMTP settings (Mailpit locally) | `localhost` / `1025` |
| `PLATFORM_ADMIN_EMAIL` | Email for the auto-seeded admin | `admin@dispatch.local` |
| `PLATFORM_ADMIN_PASSWORD` | Password for the auto-seeded admin | `Admin123!` |
| `PLATFORM_ADMIN_NAME` | Display name for the auto-seeded admin | `Platform Admin` |

---

## Contributing

1. Create a feature branch from `master`.
2. Run lints and tests before opening a PR.
3. API changes must include schema updates and a new Alembic migration.

