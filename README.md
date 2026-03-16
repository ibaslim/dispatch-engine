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
└── .env.local.example      # Environment variable template
```

## Quick Start (Local Dev)

### Prerequisites

- Node.js ≥ 20
- Python ≥ 3.12
- Docker + Docker Compose

### 1. Clone and configure environment

```bash
git clone https://github.com/ibaslim/dispatch-engine
cd dispatch-engine
cp .env.local.example .env.local
# Edit .env.local and set JWT_SECRET_KEY to a secure random string
```

### 2. Start infrastructure services

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailpit
```

### 3. Install Node dependencies

```bash
npm install
```

### 4. Start the API (in a separate terminal)

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.local .env   # or export vars
alembic upgrade head
uvicorn app.main:app --reload
```

### 5. Bootstrap the platform admin (first-time only)

```bash
cd apps/api
python -m app.cli.bootstrap_platform_admin \
  --email admin@dispatch.local \
  --password YourSecurePassword123 \
  --name "Platform Admin"
```

### 6. Start web apps

```bash
# Dispatcher portal (http://localhost:4200)
npx nx serve dispatcher-web

# Tracking web (http://localhost:4300)
npx nx serve tracking-web
```

### 7. Start Celery worker (optional, required for emails)

```bash
cd apps/api
celery -A app.workers.celery_app worker --loglevel=info
```

### Full stack with Docker Compose

```bash
docker compose -f infra/docker/docker-compose.yml up
```

This starts: postgres, redis, mailpit, api, celery-worker, dispatcher-web, tracking-web.

**Mailpit UI:** http://localhost:8025 (view all sent emails locally)

---

## Authentication Flow

1. **Platform admin bootstrap**: run `bootstrap_platform_admin` CLI once.
2. **Invite tenant admin**: platform admin calls `POST /api/v1/platform/tenants/invite` (also via the Platform Admin page in dispatcher-web).
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

## Running Python Tests

```bash
cd apps/api
source .venv/bin/activate
pytest tests/ -v
```

Expected: 13 unit tests for invitation validity and tenant scoping (no database required).

---

## Multi-Tenant / Multi-Store Architecture

- **Platform admin**: system-wide, manages tenants.
- **Tenant admin**: manages one tenant (all stores, all dispatchers).
- **Central dispatcher**: operates across all stores within their tenant.
- **Store dispatcher**: scoped to assigned store(s) only (`user_store_access` table).
- **Driver**: assigned to jobs within their tenant.

Tenant isolation is enforced at the service layer via `require_same_tenant` dependency and scoped DB queries.

---

## Driver Mobile (React Native)

```bash
cd apps/driver-mobile
npm install
npx expo start
```

Requirements: Firebase project configured (`google-services.json` for Android, `GoogleService-Info.plist` for iOS).

---

## Environment Variables

See `.env.local.example` for the full list. Key variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async URL |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET_KEY` | Secret for signing JWTs (keep secure!) |
| `DISPATCHER_WEB_BASE_URL` | Used for invitation links |
| `MAIL_HOST` / `MAIL_PORT` | SMTP settings (point to Mailpit locally) |

---

## Contributing

1. Create a feature branch from `master`.
2. Run lints and tests before opening a PR.
3. API changes must include schema updates and a new Alembic migration.
