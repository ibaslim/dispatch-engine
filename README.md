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

## Shared TypeScript Libraries

Three libraries in `libs/shared/` carry TypeScript types across all frontend apps. Keeping business types in one place means a change to an API response shape only needs to be made in one file, and TypeScript will surface every caller that is now broken.

### Library overview

| Library | Nx project name | Import alias | What lives here |
|---------|----------------|-------------|-----------------|
| `libs/shared/domain` | `shared-domain` | `@dispatch/shared/domain` | Enums: `TenantRole`, `OrderStatus`, `DriverStatus`, … |
| `libs/shared/contracts` | `shared-contracts` | `@dispatch/shared/contracts` | DTO interfaces: `LoginRequest`, `MeResponse`, `TrackingResponse`, … |
| `libs/shared/api-client` | `shared-api-client` | `@dispatch/shared/api-client` | `DispatchApiClient` class + pluggable `TokenStorage` interface |

The import aliases are declared in `tsconfig.base.json` → `compilerOptions.paths`. Every tsconfig that extends the base file (all Angular apps) automatically resolves them.

> **React Native note:** `apps/driver-mobile/tsconfig.json` extends `expo/tsconfig.base`, not the workspace base, so the `@dispatch/shared/*` aliases are not present by default. See [Adding aliases to driver-mobile](#adding-the-path-aliases-to-driver-mobile) below.

---

### `libs/shared/domain` — enums

Use this library for values that must match both the Python `Enum` definitions in the API and the TypeScript UI. Any new enum should be mirrored in the corresponding SQLAlchemy model.

#### Adding a new enum

1. Create or edit a file under `libs/shared/domain/src/`:

   ```ts
   // libs/shared/domain/src/priority.ts
   export enum OrderPriority {
     Standard = 'standard',
     Express  = 'express',
     SameDay  = 'same_day',
   }
   ```

2. Re-export it from the barrel:

   ```ts
   // libs/shared/domain/src/index.ts
   export * from './priority';
   ```

3. Mirror the enum in the Python API (`apps/api/app/models/`):

   ```python
   import enum
   class OrderPriority(str, enum.Enum):
       standard = "standard"
       express  = "express"
       same_day = "same_day"
   ```

4. Consume it in any Angular app or in the shared API client:

   ```ts
   import { OrderPriority } from '@dispatch/shared/domain';
   ```

---

### `libs/shared/contracts` — DTO interfaces

This library holds the TypeScript shape of every request body and response payload. There are two ways to keep it up to date:

#### Option A — manual interfaces (current approach)

Edit `libs/shared/contracts/src/index.ts` directly. This is the right approach while the API is still being fleshed out.

```ts
// libs/shared/contracts/src/index.ts
export interface CreateOrderRequest {
  store_id: string;
  recipient_name: string;
  recipient_address: string;
  priority: string;
}

export interface OrderResponse {
  id: string;
  status: string;
  priority: string;
  created_at: string;
}
```

#### Option B — generate from OpenAPI (recommended for stable endpoints)

The API serves an OpenAPI schema at `/openapi.json`. The `shared-contracts:generate` target fetches it and runs `openapi-typescript` to produce a fully typed `generated/api-schema.ts`.

```bash
# Docker must be running (API needs to be reachable)
docker compose up -d api

# Generate from the running API
npx nx run shared-contracts:generate

# Or point at a saved spec file
OPENAPI_SPEC_PATH=./openapi.json npx nx run shared-contracts:generate
```

The generator writes to `libs/shared/contracts/src/generated/api-schema.ts` (gitignored). Uncomment the re-export line in `index.ts` after first generation:

```ts
// libs/shared/contracts/src/index.ts
export type { components, paths, operations } from './generated/api-schema';
```

Then import generated types by path expression:

```ts
import type { components } from '@dispatch/shared/contracts';
type Order = components['schemas']['OrderResponse'];
```

---

### `libs/shared/api-client` — typed HTTP client

`DispatchApiClient` wraps every API call with the correct types from `@dispatch/shared/contracts`. It is platform-agnostic: the storage strategy is injected via the `TokenStorage` interface.

#### Adding a new API method

1. Add the DTO interfaces to `libs/shared/contracts/src/index.ts` (or use the generated types).
2. Add the method to `libs/shared/api-client/src/api-client.ts`:

   ```ts
   async createOrder(req: CreateOrderRequest): Promise<OrderResponse> {
     return this.post<OrderResponse>('/api/v1/orders', req);
   }
   ```

3. Re-export nothing extra — `index.ts` already re-exports the entire module.

---

### Consuming shared libraries in each app

#### `apps/dispatcher-web` and `apps/tracking-web` (Angular)

Both Angular apps extend `tsconfig.base.json` and resolve `@dispatch/shared/*` automatically.

```ts
// Any Angular component or service
import type { OrderResponse }  from '@dispatch/shared/contracts';
import { OrderStatus }         from '@dispatch/shared/domain';
import { DispatchApiClient }   from '@dispatch/shared/api-client';
```

#### `apps/driver-mobile` (React Native / Expo)

##### Adding the path aliases to driver-mobile

`apps/driver-mobile/tsconfig.json` extends `expo/tsconfig.base`. Add the `@dispatch/shared/*` paths manually:

```jsonc
// apps/driver-mobile/tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": "../..",        // <-- workspace root
    "paths": {
      "@/*": ["apps/driver-mobile/src/*"],
      "@dispatch/shared/domain":     ["libs/shared/domain/src/index.ts"],
      "@dispatch/shared/contracts":  ["libs/shared/contracts/src/index.ts"],
      "@dispatch/shared/api-client": ["libs/shared/api-client/src/index.ts"]
    },
    "jsx": "react-native"
  }
}
```

Metro (the React Native bundler) also needs to resolve the aliases. Add a `resolver.extraNodeModules` entry or use `babel-plugin-module-resolver` in `apps/driver-mobile/babel.config.js`:

```js
// apps/driver-mobile/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['../..'],           // workspace root
        alias: {
          '@dispatch/shared/domain':     '../../libs/shared/domain/src/index.ts',
          '@dispatch/shared/contracts':  '../../libs/shared/contracts/src/index.ts',
          '@dispatch/shared/api-client': '../../libs/shared/api-client/src/index.ts',
        },
      }],
    ],
  };
};
```

Install the resolver plugin once if it is not already present:

```bash
cd apps/driver-mobile
npm install --save-dev babel-plugin-module-resolver
```

##### Using a custom `TokenStorage` for React Native

`LocalTokenStorage` uses `localStorage` — unavailable in React Native. Provide a `SecureStore`-backed implementation instead:

```ts
// apps/driver-mobile/src/services/secure-token-storage.ts
import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from '@dispatch/shared/api-client';

export class SecureTokenStorage implements TokenStorage {
  private readonly ACCESS_KEY  = 'dispatch:access_token';
  private readonly REFRESH_KEY = 'dispatch:refresh_token';

  getAccessToken()              { return SecureStore.getItemAsync(this.ACCESS_KEY); }
  getRefreshToken()             { return SecureStore.getItemAsync(this.REFRESH_KEY); }
  setTokens(access: string, refresh: string) {
    return Promise.all([
      SecureStore.setItemAsync(this.ACCESS_KEY,  access),
      SecureStore.setItemAsync(this.REFRESH_KEY, refresh),
    ]).then(() => undefined);
  }
  clearTokens() {
    return Promise.all([
      SecureStore.deleteItemAsync(this.ACCESS_KEY),
      SecureStore.deleteItemAsync(this.REFRESH_KEY),
    ]).then(() => undefined);
  }
}
```

Then instantiate the shared client with your storage:

```ts
import { DispatchApiClient } from '@dispatch/shared/api-client';
import { SecureTokenStorage }  from './services/secure-token-storage';

export const api = new DispatchApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
  tokenStorage: new SecureTokenStorage(),
});
```

---

### Creating a new shared library

Use the Nx generator to scaffold the library correctly (sets up `project.json`, `tsconfig`, barrel export):

```bash
npx nx g @nx/js:lib libs/shared/<name> \
  --publishable=false \
  --tags "scope:shared,type:util"
```

Then add the import alias to `tsconfig.base.json`:

```jsonc
"paths": {
  "@dispatch/shared/<name>": ["libs/shared/<name>/src/index.ts"]
}
```

And add it to `apps/driver-mobile/tsconfig.json` and `babel.config.js` following the pattern above.

---

### Nx dependency graph

To visualise how libraries and apps depend on each other:

```bash
npx nx graph
```

This opens a browser view showing every `import` edge between projects. Use it to catch unexpected cross-boundary dependencies before they reach review.

---

## Contributing

### Branching

Always branch from `master` (or `stage` if one exists) and name branches by type:

```
feature/<short-description>
fix/<short-description>
chore/<short-description>
```

Run lints and tests for the relevant app before opening a PR. Specific instructions for each app are below.

---

### Contributing to `apps/api`

The backend is a **FastAPI / Python 3.12** application using SQLAlchemy (async), Alembic, and Celery.

#### 1. Start the dev environment

```bash
docker compose up
```

That single command handles everything automatically via bind-mounted volumes:

| Step | What happens |
|------|-------------|
| `init` service | Generates `.env.local` with a random `JWT_SECRET_KEY` if it doesn't exist |
| `api` service | Copies `.env.local` → `apps/api/.env`, runs `pip install -r requirements.txt`, runs `alembic upgrade head`, starts uvicorn with `--reload` |
| `celery-worker` service | Copies `.env.local` → `apps/api/.env`, runs `pip install`, starts the Celery worker |

**Hot-reload is on by default.** Because `apps/api/` is bind-mounted into the container, any `.py` file you save on the host is immediately picked up by uvicorn's file watcher — no restart needed.

#### 2. Running the API without Docker (optional)

If you need to run the API outside Docker (e.g. for debugging with a local IDE):

```bash
# Infra only — Postgres, Redis, Mailpit
docker compose up -d postgres redis mailpit

cd apps/api
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
cp ../../.env.local .env
alembic upgrade head
uvicorn app.main:app --reload
# API: http://localhost:8000   Swagger: http://localhost:8000/docs
```

#### 3. Project layout conventions

| Path | What goes here |
|------|----------------|
| `app/models/` | SQLAlchemy ORM models (one file per domain entity) |
| `app/schemas/` | Pydantic request/response schemas (one file per domain entity) |
| `app/services/` | Business logic — no HTTP concerns, no direct DB sessions from routers |
| `app/api/routers/` | FastAPI routers — thin controllers, delegate to services |
| `app/core/config.py` | Pydantic Settings — add new env vars here |
| `app/core/deps.py` | Dependency injection — current user, DB session, RBAC guards |
| `app/core/security.py` | Password hashing and JWT encoding/decoding |
| `app/workers/` | Celery tasks |
| `alembic/versions/` | Database migration scripts |
| `tests/` | pytest integration tests |

#### 4. Adding a new feature (end-to-end example)

1. **Model** — add/edit `app/models/<entity>.py`, import it in `app/db/base.py` so Alembic detects it.
2. **Migration** — generate the migration inside the running container, then review it:
   ```bash
   docker compose exec api alembic revision --autogenerate -m "add <entity>"
   # The generated file appears in apps/api/alembic/versions/ on your host.
   # Review it, then apply:
   docker compose exec api alembic upgrade head
   ```
3. **Schema** — add Pydantic schemas in `app/schemas/<entity>.py`.
4. **Service** — add business logic in `app/services/<entity>_service.py`.
5. **Router** — add endpoints in `app/api/routers/<entity>.py`, register the router in `app/main.py`.
6. **Tests** — add tests in `tests/test_<feature>.py`.

Because the source directory is bind-mounted, steps 3–6 take effect immediately via hot-reload. Only migrations require the explicit `exec` command above.

#### 5. Writing and running tests

```bash
# Via Docker (no local Python needed)
docker compose exec api pytest tests/ -v
docker compose exec api pytest tests/ -v --cov=app --cov-report=term-missing

# Or locally with a venv (see step 2 above)
cd apps/api && source .venv/bin/activate && pytest tests/ -v
```

Tests use `pytest-asyncio` in `auto` mode and run entirely in-process — no live Postgres required.

#### 6. Adding a pip dependency

1. Add the package + pinned version to `apps/api/requirements.txt`.
2. Restart the API container — it re-runs `pip install` on startup:
   ```bash
   docker compose restart api celery-worker
   ```

#### 7. Database migrations checklist

- Every model change **must** have an Alembic migration.
- Always review the auto-generated migration before committing — autogenerate can miss things (e.g. renamed columns, custom types).
- Migrations must be reversible: implement `downgrade()` correctly.
- Test both directions: `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`.

#### 8. Adding or changing environment variables

1. Add the field to `app/core/config.py` (`Settings` class) with a sensible default.
2. Add the variable (with an example value) to `.env.local.example` at the repo root.
3. Document it in the **Environment Variables** table in this README.

---

### Contributing to `apps/dispatcher-web`

The dispatcher portal is an **Angular 19** single-page application in the Nx monorepo with Tailwind CSS.

#### 1. Start the dev environment

```bash
docker compose up
```

Docker handles everything automatically:

| Step | What happens |
|------|-------------|
| `node-deps` service | Runs `npm ci` once against the bind-mounted workspace |
| `dispatcher-web` service | Runs `npx nx serve dispatcher-web` on port 4200 after `node-deps` completes |

**Hot-reload (HMR) is on by default.** The entire repo root is bind-mounted into the container, so any `.ts`, `.html`, or `.css` file you save on the host is reflected in the browser immediately — no restart needed.

The dev server proxies `/api/*` requests to `http://api:8000` (the API container) via `proxy.conf.json`.

#### 2. Running the Angular dev server without Docker (optional)

```bash
# Start infra + API via Docker
docker compose up -d postgres redis mailpit api

# In a separate terminal on the host
npm install
npx nx serve dispatcher-web
# http://localhost:4200
# proxy.conf.json rewrites /api/* → http://localhost:8000
```

#### 3. Project layout conventions

| Path | What goes here |
|------|----------------|
| `src/app/pages/` | Route-level page components (one folder per route) |
| `src/app/core/auth/` | `AuthService`, `AuthGuard`, `AuthInterceptor` |
| `libs/shared/contracts/src/` | Shared DTO interfaces used by all frontends |
| `libs/shared/domain/src/` | TypeScript enums (roles, statuses) shared across apps |
| `libs/shared/api-client/src/` | Typed HTTP client wrappers |
| `proxy.conf.json` | Dev-server proxy — forwards `/api/*` to the API |

#### 3. Adding a new page / route

1. Create the component: `npx nx g @angular/core:component pages/<name>/<name> --project=dispatcher-web`
2. Add the route to `src/app/app.routes.ts`.
3. If the page requires auth, wrap the route with `canActivate: [AuthGuard]`.
4. If the page calls a new API endpoint, add the corresponding DTO to `libs/shared/contracts/src/` and regenerate:
   ```bash
   npx nx run shared-contracts:generate   # requires running API on :8000
   ```

#### 4. Calling the API

- Use the typed client from `@dispatch/shared/api-client` where available.
- For one-off calls, inject `HttpClient` directly — use relative URLs (`/api/v1/...`). Do **not** hardcode `localhost:8000`.
- The `AuthInterceptor` (`src/app/core/auth/auth.interceptor.ts`) automatically attaches the Bearer token to every outgoing request.

#### 5. Linting and tests

```bash
# Lint
npx nx lint dispatcher-web

# Unit tests (Jest + jsdom)
npx nx test dispatcher-web

# Run all affected tests after changes
npx nx affected --target=test
```

#### 6. Adding an npm dependency

```bash
npm install <package>
# Then restart the Docker container if running via Docker:
docker compose restart dispatcher-web
```

---

### Contributing to `apps/tracking-web`

The public tracking portal is identical in tech stack to `dispatcher-web` (Angular 19 + Tailwind, same Nx project structure) but has no authentication — it serves public delivery tracking pages.

#### 1. Start the dev environment

```bash
docker compose up
```

Docker handles everything automatically:

| Step | What happens |
|------|-------------|
| `node-deps` service | Runs `npm ci` once against the bind-mounted workspace |
| `tracking-web` service | Runs `npx nx serve tracking-web` on port 4300 after `node-deps` completes |

**Hot-reload (HMR) is on by default.** Any `.ts`, `.html`, or `.css` save on the host reflects in the browser immediately.

The dev server proxies `/api/*` requests to `http://api:8000` via `proxy.conf.json`.

#### 2. Running the Angular dev server without Docker (optional)

```bash
# Start infra + API via Docker
docker compose up -d postgres redis api

# In a separate terminal on the host
npm install
npx nx serve tracking-web
# http://localhost:4300
```

#### 3. Project layout conventions

| Path | What goes here |
|------|----------------|
| `src/app/pages/tracking/` | Public tracking page — reads delivery status via token |
| `src/app/pages/not-found/` | 404 fallback page |
| `proxy.conf.json` | Same shared proxy config as dispatcher-web |

The tracking page is intentionally minimal and public (no auth). Keep it that way — do not introduce auth guards or JWT logic here.

#### 3. Linting and tests

```bash
npx nx lint tracking-web
npx nx test tracking-web
```

All other conventions (API calls via relative URLs, shared contracts, no hardcoded ports) are identical to `dispatcher-web` above.

---

### Contributing to `apps/driver-mobile`

The driver app is a **React Native / Expo 51** project using NativeWind (Tailwind for RN), Expo Router, and React Native Firebase for push notifications.

> React Native **cannot run inside Docker**. You must run it on the host machine with a simulator, emulator, or physical device.

#### 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | Host machine |
| Expo CLI | Latest | `npm install -g expo-cli` |
| Android Studio | Latest | For Android emulator |
| Xcode | Latest | macOS only — for iOS simulator |
| Firebase project | — | For push notifications (see step 4) |

#### 2. Set up and start the dev server

```bash
# Start the full backend stack (API, DB, Redis, Mailpit, web apps)
docker compose up -d

# In a separate terminal
cd apps/driver-mobile
npm install
npx expo start
```

Then press:
- `a` — open Android emulator
- `i` — open iOS simulator (macOS only)
- Scan the QR code with the **Expo Go** app on a physical device

#### 3. Configuring the API URL

The mobile app must know where the API lives. Copy and edit the example env file:

```bash
cp apps/driver-mobile/.env.example apps/driver-mobile/.env
```

Set `API_BASE_URL` to the API address reachable from the device/emulator. The Docker API is exposed on the host network, so:

| Environment | Value |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | `http://<your-machine-LAN-IP>:8000` |

#### 4. Firebase / push notifications

The app uses React Native Firebase for FCM push notifications. To enable them:

1. Create a Firebase project at https://console.firebase.google.com.
2. Add an Android app and download `google-services.json` → place it in `apps/driver-mobile/android/app/`.
3. Add an iOS app and download `GoogleService-Info.plist` → place it in `apps/driver-mobile/ios/DispatchDriver/`.
4. Set `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_CLIENT_EMAIL` in the root `.env.local` (used server-side by the API to send push notifications).

> These files are gitignored. Never commit them.

#### 5. Project layout conventions

| Path | What goes here |
|------|----------------|
| `src/screens/` | Individual screen components |
| `src/services/` | API clients and device services (e.g. FCM token registration) |
| `App.tsx` | Root component and navigation setup |
| `global.css` | NativeWind global styles |

#### 6. Adding a new screen

1. Create `src/screens/<ScreenName>.tsx`.
2. Register it in the Expo Router config in `App.tsx` (or the relevant `_layout.tsx` if using file-based routing).
3. If the screen calls a new API endpoint, add the DTO type to `libs/shared/contracts/src/` and regenerate contracts:
   ```bash
   npx nx run shared-contracts:generate
   ```

#### 7. Linting and tests

```bash
cd apps/driver-mobile
npm run lint
npm test
```

---

### Shared Libraries

See the [**Shared TypeScript Libraries**](#shared-typescript-libraries) section for detailed instructions on:
- Adding new DTO interfaces and enums
- Regenerating types from the OpenAPI spec
- Consuming shared types in Angular and React Native
- Creating a new shared library

Changes to `libs/shared/*` affect all apps simultaneously — be careful.

| Library | Change requires |
|---|---|
| `libs/shared/domain` | Update TypeScript enums **and** mirror the change in the Python `Enum` in `apps/api/app/models/` |
| `libs/shared/contracts` | Re-run `npx nx run shared-contracts:generate` after API schema changes |
| `libs/shared/api-client` | Update the typed wrapper + run `npx nx test shared-api-client` |

```bash
# Test all shared libs
npx nx test shared-domain
npx nx test shared-api-client

# Lint all shared libs
npx nx lint shared-domain
npx nx lint shared-api-client
```

---

### Pre-PR Checklist

Before opening a pull request, verify the following for the app(s) you changed:

| Check | Command |
|---|---|
| API tests pass | `cd apps/api && pytest tests/ -v` |
| API linted | `cd apps/api && python -m mypy app` (optional but encouraged) |
| Alembic migration included | `alembic upgrade head` succeeds on a clean DB |
| Angular app lints clean | `npx nx lint dispatcher-web` / `npx nx lint tracking-web` |
| Angular tests pass | `npx nx test dispatcher-web` / `npx nx test tracking-web` |
| Mobile lints clean | `cd apps/driver-mobile && npm run lint` |
| Shared lib tests pass | `npx nx test shared-domain && npx nx test shared-api-client` |
| `.env.local.example` updated | If new env vars were added |
| README updated | If new setup steps, endpoints, or env vars were added |

