# Current State Report

Last updated: 2026-03-19
Owner: Team (update on major infra/feature/test changes)

## Purpose
This file tracks the operational state of the repository separately from `README.md`.
Use it for live status, known issues, and verification outcomes.

## Overall Status
- Backend + web Docker development flow: stable
- Fullstack `posts` reference feature: implemented and running
- Shared TypeScript contract/client usage: improved and in use across API + web + mobile
- Mobile runtime flow: partially stable (network/environment dependent)

## What Is Working
- `docker compose up -d --build` starts full local stack after clean reset.
- API starts healthy and exposes OpenAPI at `http://localhost:8000/openapi.json`.
- Posts endpoint returns seeded data at `/api/v1/posts`.
- Dispatcher web and tracking web serve in Docker (`4200`, `4300`).
- Fresh-clone simulation was validated by:
  - `docker compose down -v --remove-orphans`
  - cleanup of generated local artifacts
  - `docker compose up -d --build`

## Major Improvements Completed
- Infra startup moved to dedicated scripts under `infra/scripts/`.
- Compose build made resilient to Docker Hub timeout risk via configurable Python base image.
- API Docker build hardened with pip retries/timeouts.
- Node dependency sync stamp moved to `.cache/dev` to avoid lock race/noise.
- `.cache/` added to `.gitignore` to avoid tracking runtime artifacts.
- End-to-end posts feature added across:
  - API (`model`, `schema`, `service`, `router`, migration)
  - shared libs (`PostResponse`, API client method)
  - dispatcher web and tracking web pages/routes
  - mobile jobs screen posts rendering
- Test guidance in `README.md` expanded with explicit backend/frontend/shared commands.

## Verified Tests (Current)
- Backend posts unit tests pass (`apps/api/tests/test_posts.py`).
- Dispatcher posts component unit test passes (`posts.component.spec.ts`).
- Tracking web test target runs with `--passWithNoTests`.

## Known Issues / Risks
- Mobile development on some networks is unstable due to Expo API reachability and IPv6 path failures.
- React Native app uses native Firebase modules, so Expo Go/web path may not fully represent production runtime.
- Generated files (e.g. `.env.local`) may occasionally be created with root ownership depending on container write path.

## Recommended Verification Commands
```bash
# Full reset + fresh start

docker compose down -v --remove-orphans
rm -f .env.local apps/api/.env
rm -rf .cache/dev apps/driver-mobile/.expo
docker compose up -d --build

# Health checks

docker compose ps
curl -sS http://localhost:8000/openapi.json | head -c 200
curl -sS "http://localhost:8000/api/v1/posts?limit=2"

# Tests

docker compose exec api pytest tests/ -v
docker compose exec dispatcher-web npx nx test dispatcher-web
docker compose exec tracking-web npx nx test tracking-web --passWithNoTests
```

## Update Rules
- Update this file when any of the following changes:
  - local setup flow
  - infra/runtime assumptions
  - test pass/fail baseline
  - known blockers
- Keep entries factual and dated.
- Do not duplicate full README content; link/point to it when needed.
