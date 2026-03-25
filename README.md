# Dispatch Engine

A multi-tenant delivery dispatch system built as an Nx monorepo.

## Tech Stack

| Layer | Technology |
|---|---|
| Dispatcher portal | Angular 21 + Tailwind CSS |
| Public tracking | Angular 21 + Tailwind CSS |
| Driver mobile | React Native (Expo 55) + NativeWind |
| Backend API | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 + Alembic migrations |
| Cache / Queue | Redis + Celery |
| Email (local) | Mailpit |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Monorepo | Nx 22 |

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

For backend and web development, only **Docker + Docker Compose** are required.

For mobile development, you also need **Node.js 20+** on the host machine because Expo cannot run inside Docker.

### Recommended Local Setup

```bash
git clone https://github.com/ibaslim/dispatch-engine.git
cd dispatch-engine
docker compose up -d
```

This is the default development path for the repo.

Open:

- http://localhost:4200 for the dispatcher portal
- http://localhost:4300 for the tracking app
- http://localhost:8000/docs for Swagger

**What happens automatically:**

1. `.env.local` is generated with a random `JWT_SECRET_KEY`
2. PostgreSQL, Redis, and Mailpit start
3. API dependencies are synced inside Docker when `requirements.txt` changes
4. Database migrations run automatically
5. Platform admin is seeded on first boot (`admin@dispatch.local` / `Admin123!`)
6. FastAPI API starts on port 8000 with reload enabled
7. Celery worker starts
8. Workspace Node dependencies are synced inside Docker when `package-lock.json` changes
9. Angular dispatcher-web starts on port 4200
10. Angular tracking-web starts on port 4300

### Recommended Development Model

- Docker owns Postgres, Redis, Mailpit, FastAPI, Celery, and both Angular dev servers.
- Your editor on the host edits the bind-mounted source tree directly.
- React Native runs on the host, but it consumes the same shared TypeScript libraries from `libs/shared/*`.

This keeps the common path simple:

1. `docker compose up -d`
2. Edit API or Angular code immediately
3. Start Expo on the host only when you need the mobile app

### One-time setup per developer

- Backend + web: no manual dependency installation is required on the host when using Docker.
- Mobile: each developer must run `npm install` in `apps/driver-mobile` at least once on their machine.
- If mobile dependencies change (`apps/driver-mobile/package.json`), run `npm install` again in `apps/driver-mobile`.

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

## App-by-App Development Start

Use this section when onboarding a new contributor. It is the shortest path to start each app without blockers.

### 1) API (`apps/api`)

```bash
# from repo root
docker compose up -d
docker compose exec api pytest tests/ -v
```

Working state:

- API docs open at `http://localhost:8000/docs`
- posts endpoint returns data at `http://localhost:8000/api/v1/posts?limit=2`

### 2) Dispatcher Web (`apps/dispatcher-web`)

```bash
# from repo root
docker compose up -d
docker compose exec dispatcher-web npx nx test dispatcher-web --testPathPattern=posts.component.spec.ts
```

Working state:

- app loads at `http://localhost:4200`
- authenticated posts page is reachable at `/posts`

### 3) Tracking Web (`apps/tracking-web`)

```bash
# from repo root
docker compose up -d
docker compose exec tracking-web npx nx test tracking-web --passWithNoTests
```

Working state:

- app loads at `http://localhost:4300`
- public posts page is reachable at `/posts`

### 4) Driver Mobile (`apps/driver-mobile`)

```bash
# backend still runs in Docker
docker compose up -d

# in a second terminal
cd apps/driver-mobile
cp .env.example .env
npm install
npm run lint
npm test -- --passWithNoTests
npm run start
```

If Expo network reachability is flaky:

```bash
cd apps/driver-mobile
npm run start:offline
```

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/driver-mobile/.env` to a reachable API URL:

| Environment | Value |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | `http://<your-machine-LAN-IP>:8000` |

## Posts Feature End-to-End Check

Use this exact checklist to verify the reference `posts` feature across all apps.

### API

```bash
docker compose exec api pytest tests/test_posts.py -v
curl -sS "http://localhost:8000/api/v1/posts?limit=2"
```

### Dispatcher Web

```bash
docker compose exec dispatcher-web npx nx test dispatcher-web --testPathPattern=posts.component.spec.ts
```

Open `http://localhost:4200/posts` after login.

### Tracking Web

Open `http://localhost:4300/posts`.

### Driver Mobile

Posts are shown in `JobsScreen` under the "Latest Posts" section, loaded from `/api/v1/posts?limit=5`.

---

## Daily Commands

```bash
docker compose up -d             # Start the full local stack
docker compose logs -f api       # Follow API logs
docker compose logs -f           # Follow all service logs
docker compose restart api       # Re-run API startup, dependency sync, and migrations
docker compose restart celery-worker
docker compose restart dispatcher-web tracking-web
docker compose down              # Stop all services
docker compose down -v           # Stop services and reset local volumes
```

### Host-only flows

Use these when you need tools that must run outside Docker:

```bash
# Mobile app (host only)
cd apps/driver-mobile
cp .env.example .env
npm install                    # one-time per developer, then again when package.json changes
npm run start
```

```bash
# Optional: run the API directly on the host
docker compose up -d postgres redis mailpit
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
cp ../../.env.local .env
alembic upgrade head
uvicorn app.main:app --reload
```

---

## Hot-Reload & Development Workflow

| Change | Auto-reflects? | Action needed |
|---|---|---|
| Edit Python file (`.py`) | ✅ Instant | None — uvicorn `--reload` |
| Edit Angular file (`.ts`/`.html`/`.css`) | ✅ Instant | None — Nx HMR |
| Edit shared lib (`libs/shared/*`) | ✅ Instant | None — Nx watches workspace |
| Edit React Native file (`.ts`/`.tsx`) | ✅ Instant after Expo starts | Run Expo on the host |
| Create new Alembic migration | ⚠️ Manual command | `docker compose exec api alembic revision --autogenerate -m "..."` |
| Add new pip package (`requirements.txt`) | ⚠️ Restart API services | `docker compose restart api celery-worker` |
| Add new root npm package (`package.json`) | ⚠️ Restart web services | `docker compose restart dispatcher-web tracking-web` |
| Change Docker config | 🔄 Recreate services | `docker compose up -d --build` |

---

## Driver Mobile App (React Native)

React Native / Expo runs on the host machine, but it now shares the same `libs/shared/*` TypeScript libraries as the web apps.

### Start the mobile app

```bash
cd apps/driver-mobile
cp .env.example .env
npm install
npm run start
```

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/driver-mobile/.env` to the API address reachable from the simulator or device:

| Environment | Value |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | `http://<your-machine-LAN-IP>:8000` |

Shared imports already work in mobile:

```ts
import type { LoginResponse } from '@dispatch/shared/contracts';
import { DispatchApiClient } from '@dispatch/shared/api-client';
```

Requirements: a Firebase project configured with `google-services.json` (Android) and `GoogleService-Info.plist` (iOS).

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
| GET | `/api/v1/posts` | Public | List published posts |
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

Expected: 16 unit tests total, including invitation, tenant-scoping, and posts service tests.

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
| `JWT_SECRET_KEY` | Secret for signing JWTs — auto-generated by the Docker startup flow | `changeme-…` |
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

`apps/driver-mobile` is wired for the same aliases through its own tsconfig, Babel, and Metro config, so web and mobile can import the same shared contracts and client code.

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

The mobile app is already configured to consume `@dispatch/shared/*` imports directly.

Files involved:

- `apps/driver-mobile/tsconfig.json`
- `apps/driver-mobile/babel.config.js`
- `apps/driver-mobile/metro.config.js`

##### Using a custom `TokenStorage` for React Native

`LocalTokenStorage` uses `localStorage` — unavailable in React Native. Provide a `SecureStore`-backed implementation instead:

```ts
// apps/driver-mobile/src/services/secureTokenStorage.ts
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
import { SecureTokenStorage } from './services/secureTokenStorage';

export const api = new DispatchApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
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

## Feature Development Workflow

This is the intended flow for new features.

### 1. Add or change the backend API

1. Start the stack with `docker compose up -d`.
2. Edit models, schemas, services, and routers under `apps/api/app/`.
3. If the database schema changes, generate and apply a migration:

  ```bash
  docker compose exec api alembic revision --autogenerate -m "add <feature>"
  docker compose exec api alembic upgrade head
  ```

4. The API reloads automatically.

### 2. Add or change shared TypeScript contracts

1. Update `libs/shared/contracts/src/index.ts` for request and response DTOs.
2. Update `libs/shared/domain/src/` for shared enums.
3. If you prefer generated contracts, run:

  ```bash
  docker compose exec dispatcher-web npx nx run shared-contracts:generate
  ```

### 3. Build the Angular side

1. Add components, routes, and services in `apps/dispatcher-web` or `apps/tracking-web`.
2. Import shared DTOs directly from `@dispatch/shared/contracts`.
3. HMR picks up the changes automatically while Docker is running.

Optional generator commands:

```bash
docker compose exec dispatcher-web npx nx g @angular/core:component pages/<name>/<name> --project=dispatcher-web
docker compose exec tracking-web npx nx g @angular/core:component pages/<name>/<name> --project=tracking-web
```

### 4. Build the mobile side

1. Keep `docker compose up -d` running for backend services.
2. In a host terminal, run Expo from `apps/driver-mobile`.
3. Import DTOs and helpers from `@dispatch/shared/*` directly.
4. Expo reloads mobile changes automatically.

### 5. Validate before opening a PR

Tests are required for every new feature. Do not open a PR with feature code only.

```bash
docker compose exec api pytest tests/ -v
docker compose exec dispatcher-web npx nx lint dispatcher-web
docker compose exec tracking-web npx nx lint tracking-web
docker compose exec dispatcher-web npx nx test shared-domain
docker compose exec dispatcher-web npx nx test shared-api-client
cd apps/driver-mobile && npm run lint && npm test
```

Minimum expectation for a new feature:

1. Add or update API unit tests.
2. Add or update frontend tests where behavior changed.
3. Ensure shared library tests pass if contracts or shared client changed.

### 6. How To Add Unit Tests

#### Backend API (`apps/api`)

1. Create a test file under `apps/api/tests/` using `test_<feature>.py` naming.
2. Keep unit tests isolated from external services when possible (use stubs/fakes for DB session behavior).
3. Test behavior, not framework internals:
  - filtering/sorting rules
  - validation paths
  - edge cases (empty results, invalid inputs, limits)
4. Run backend tests:

```bash
docker compose exec api pytest tests/ -v
docker compose exec api pytest tests/test_<feature>.py -v
```

#### Frontend Unit Tests (`dispatcher-web`, `tracking-web`)

1. Place spec files next to components/services as `*.spec.ts`.
2. For API-backed components, use `HttpTestingController` from `@angular/common/http/testing`.
3. Assert both request behavior and rendered/UI state.
4. Run frontend tests:

```bash
docker compose exec dispatcher-web npx nx test dispatcher-web
docker compose exec tracking-web npx nx test tracking-web --passWithNoTests

# Single spec file
docker compose exec dispatcher-web npx nx test dispatcher-web --testPathPattern=<file>.spec.ts
```

#### Shared Libraries

If the feature changes shared contracts or shared API client, run:

```bash
docker compose exec dispatcher-web npx nx test shared-domain
docker compose exec dispatcher-web npx nx test shared-api-client
```

### Fullstack Example: `posts` Feature

This repository includes a reference implementation of a small fullstack feature (`posts`) that touches API, shared contracts, web, and mobile.

Use it as the template for future features.

#### Backend (API)

Files:

- `apps/api/app/models/post.py`
- `apps/api/app/schemas/post.py`
- `apps/api/app/services/post_service.py`
- `apps/api/app/api/routers/posts.py`
- `apps/api/alembic/versions/0002_posts.py`

Behavior:

- `GET /api/v1/posts?limit=20` returns published posts ordered by newest first.
- Migration `0002` creates the `posts` table and inserts sample rows for local development.
- Unit tests live in `apps/api/tests/test_posts.py`.

#### Shared TypeScript contracts

Files:

- `libs/shared/contracts/src/index.ts`
- `libs/shared/api-client/src/api-client.ts`

Behavior:

- `PostResponse` is defined once in shared contracts.
- Shared API client exposes `getPosts(limit?: number)`.

#### Dispatcher web

Files:

- `apps/dispatcher-web/src/app/pages/posts/posts.component.ts`
- `apps/dispatcher-web/src/app/pages/posts/posts.component.spec.ts`
- `apps/dispatcher-web/src/app/app.routes.ts`
- `apps/dispatcher-web/src/app/pages/dashboard/dashboard.component.ts`

Behavior:

- New authenticated route: `/posts`
- Dashboard links to posts listing.
- Unit test verifies API fetch and render behavior for the posts component.

#### Tracking web

Files:

- `apps/tracking-web/src/app/pages/posts/posts.component.ts`
- `apps/tracking-web/src/app/app.routes.ts`

Behavior:

- Public route: `/posts`
- Root path redirects to `/posts`

#### Driver mobile

Files:

- `apps/driver-mobile/src/screens/JobsScreen.tsx`
- `apps/driver-mobile/src/services/api.ts`

Behavior:

- Jobs screen now loads and displays latest posts from `/api/v1/posts`.
- Uses shared `PostResponse` type from `@dispatch/shared/contracts`.

#### Reproduce this flow for a new feature

1. Add DB model and migration.
2. Add schema, service, and router endpoint.
3. Add shared contract interface.
4. Optionally add a shared API client method.
5. Add UI screens/pages in dispatcher-web, tracking-web, and driver-mobile.
6. Add tests for backend/shared/frontend changes.
7. Validate with lint/tests and include feature docs in README.

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
docker compose up -d
```

That is the recommended path. The API container now owns the startup workflow:

| Step | What happens |
|------|-------------|
| `api` service | Generates `.env.local` if needed, syncs Python deps when `requirements.txt` changes, applies migrations, starts uvicorn with `--reload` |
| `celery-worker` service | Reuses the same env and dependency sync, then starts the Celery worker |

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

The dispatcher portal is an **Angular 21** single-page application in the Nx monorepo with Tailwind CSS.

#### 1. Start the dev environment

```bash
docker compose up -d
```

Docker handles the standard path automatically:

| Step | What happens |
|------|-------------|
| `dispatcher-web` service | Syncs workspace Node deps when `package-lock.json` changes, then runs `npx nx serve dispatcher-web` on port 4200 |

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

The public tracking portal is identical in tech stack to `dispatcher-web` (Angular 21 + Tailwind, same Nx project structure) but has no authentication — it serves public delivery tracking pages.

#### 1. Start the dev environment

```bash
docker compose up -d
```

Docker handles the standard path automatically:

| Step | What happens |
|------|-------------|
| `tracking-web` service | Syncs workspace Node deps when `package-lock.json` changes, then runs `npx nx serve tracking-web` on port 4300 |

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

The driver app is a **React Native / Expo 55** project using NativeWind and React Native Firebase for push notifications.

> React Native **cannot run inside Docker**. You must run it on the host machine with a simulator, emulator, or physical device.

#### 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | Host machine |
| Expo CLI | Bundled via project | Use `npm run start` from `apps/driver-mobile` |
| Android Studio | Latest | For Android emulator |
| Xcode | Latest | macOS only — for iOS simulator |
| Firebase project | — | For push notifications (see step 4) |

#### 2. Set up and start the dev server

```bash
# Start the backend and web stack first
docker compose up -d

# In a separate host terminal
cd apps/driver-mobile
npm install   # one-time per developer, then again when package.json changes
npm run start
```

Then press:
- `a` — open Android emulator
- `i` — open iOS simulator (macOS only)
- Scan the QR code with the **Expo Go** app on a physical device

If Expo endpoint reachability is flaky on your network, use:

```bash
cd apps/driver-mobile
npm run start:offline
```

#### 3. Configuring the API URL

The mobile app must know where the API lives. Copy and edit the example env file:

```bash
cp apps/driver-mobile/.env.example apps/driver-mobile/.env
```

Set `EXPO_PUBLIC_API_BASE_URL` to the API address reachable from the device/emulator. The Docker API is exposed on the host network, so:

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
2. Register it in `App.tsx`.
3. If the screen calls a new API endpoint, add the DTO type to `libs/shared/contracts/src/` and regenerate contracts:
   ```bash
   npx nx run shared-contracts:generate
   ```
4. Import shared DTOs, enums, or the shared API client directly from `@dispatch/shared/*`.

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
| API tests pass | `docker compose exec api pytest tests/ -v` |
| API linted | `cd apps/api && python -m mypy app` (optional but encouraged) |
| Alembic migration included | `alembic upgrade head` succeeds on a clean DB |
| Angular app lints clean | `npx nx lint dispatcher-web` / `npx nx lint tracking-web` |
| Angular tests pass | `npx nx test dispatcher-web` / `npx nx test tracking-web` |
| Mobile lints clean | `cd apps/driver-mobile && npm run lint` |
| Shared lib tests pass | `npx nx test shared-domain && npx nx test shared-api-client` |
| `.env.local.example` updated | If new env vars were added |
| README updated | If new setup steps, endpoints, or env vars were added |

