# Testing rules — `apps/api`

Rules for writing and changing tests in this suite. They override general instincts about
"quick test coverage". Read the whole file before adding a test file.

---

## 0. The one rule that matters

**A test must exercise production code imported from `app.`** If a test can pass while
`app/` is deleted, it is not a test.

This suite previously violated this: `conftest.py` defined `_UserStub`, `_InvitationStub`,
`_TenantStub` — dataclasses that *reimplemented* `has_role()`, `is_valid()`, and
`get_accessible_store_ids()` by hand — and every test asserted against those copies. The suite
was green while covering zero lines of `app/`. Do not reintroduce that pattern.

Concretely, never:
- Redefine a model, schema, or service as a local dataclass/dict "stand-in".
- Copy business logic into the test to assert the copy behaves as expected.
- Mock the thing under test.

If a test needs a `User`, import `app.models.user.User` and put a real row in the test DB.

---

## 1. Layers

| Layer | Directory | Touches | Budget |
|---|---|---|---|
| Unit | `tests/unit/` | Pure functions. No DB, no network, no app. | ~30% |
| Integration | `tests/integration/` | Real Postgres + real ASGI app via `client`. | ~60% |
| E2E | `tests/e2e/` | Multi-step business flows across routers. | ~10% |

Weight sits in **integration** on purpose. This service's risk is not arithmetic — it is
"the query forgot `WHERE tenant_id = :x`" and "the route forgot `Depends(require_tenant_admin)`".
Only a real DB and a real request catch those.

Put a test in `unit/` only if it has no I/O at all. Everything touching a router, a service that
takes an `AsyncSession`, or a model query goes in `integration/`.

---

## 2. File layout

```
tests/
  conftest.py            # engine, db, client, actors, domain fixtures
  factories.py           # builders over REAL app.models classes
  utils.py               # API prefix, auth_header, assert_not_found
  unit/                  # pure helpers, no I/O
  integration/
    test_infra_smoke.py  # guards the fixture contract itself
  e2e/                   # (to create)
```

- **One integration file per router**, named after it: `app/api/routers/orders.py` →
  `tests/integration/test_orders_api.py`. When a route breaks, the file is obvious.
- New shared fixtures go in `tests/conftest.py`. Add a nested `conftest.py` only when a fixture is
  genuinely meaningless outside that directory.
- No `__init__.py` in the subdirectories; rootdir-based collection handles it.
- Do not edit `test_infra_smoke.py` to make it pass. It failing means the fixtures are broken.

---

## 3. Fixtures — use them, do not roll your own

The fixture contract is fixed. Never create an engine, a session, or an `AsyncClient` inside a
test file.

| Fixture | Gives you |
|---|---|
| `engine` | Session-scoped engine; schema built once from model metadata. |
| `db` | `AsyncSession` in a transaction rolled back after the test. |
| `client` | `httpx.AsyncClient` on the app, `get_db` overridden to `db`. Unauthenticated. |
| `authenticate` | `authenticate(user)` -> the client with that user's real JWT attached. |
| `tenant` / `other_tenant` | Vendor tenants. `other_tenant` is the far side of isolation tests. |
| `driver_tenant` | Driver-role tenant. Orders reference drivers **by tenant id**. |
| `store`, `order` | Rows owned by `tenant`. |
| `platform_admin`, `tenant_admin`, `dispatcher`, `driver`, `outsider` | `User` rows. |
| `platform_admin_client`, `tenant_admin_client`, `dispatcher_client`, `driver_client`, `other_tenant_client` | The same client, authenticated as that actor. |
| `block_outbound_email` | Autouse. Captures `send_email_sync` calls; returns the list. |
| `published_events` | Opt-in. Records Pusher publishes for assertions. |

Routers are mounted under `/api/v1`. Import `API` from `tests.utils` and write
`f"{API}/orders"` — never hardcode the prefix.

Rules:
- **Isolation comes from the rollback, not from cleanup.** Never write teardown that deletes rows,
  and never call `db.commit()` expecting it to persist past the test.
- **Authenticate with real JWTs** from `app.core.security.create_access_token`. Do **not** override
  `_get_current_user` — that dependency contains four rejection branches (missing credentials,
  `type != "access"`, inactive user, inactive tenant) that are themselves under test.
- Need a variant actor? Build it from `UserFactory` in the test. Do not add a new
  `*_client` fixture unless three or more files need it.

---

## 4. Naming and shape

- Name the **behavior**, not the function: `test_expired_invitation_is_rejected`, not
  `test_accept_invitation_2`. The name should read as the requirement it defends.
- Arrange / Act / Assert, separated by blank lines.
- **One act per test.** Two endpoint calls means two tests — unless it is deliberately an
  `e2e/` flow test.
- Group by subject with `class TestX:` when a file exceeds ~8 tests. No `setUp`; use fixtures.
- Use `@pytest.mark.parametrize` for input variation (invalid emails, role permutations, distance
  boundaries). One body, N reported pass/fails.
- Docstring only when the *why* is non-obvious. The name carries the *what*.

---

## 5. Assertions

- **Always assert on the response body, not only the status code.** `assert r.status_code == 200`
  passes when the payload is `{}`.
- Assert the specific field that encodes the requirement, not a whole-dict equality that breaks on
  every unrelated schema addition.
- For failures, assert the status **and** that the error does not leak data.
- **Cross-tenant reads must assert `404`, not `403`.** A `403` confirms the resource exists and
  leaks existence across a tenant boundary. If a route returns `403` there, that is a bug to
  report, not a test to adjust.
- After a mutating request, re-read through the API or `db` and assert the state actually changed.
  A `200` is not evidence of a write.

---

## 6. Mocking boundary

Mock **only** what leaves the process:

- `app.services.pusher_service` — Pusher HTTP calls
- `app.services.email_service` — SMTP
- Google Maps / Routes calls (`google_maps_server_api_key` paths)
- Redis, where a test is not about Redis
- Celery task dispatch

Never mock: your own services, repositories, `AsyncSession`, models, or FastAPI dependencies other
than `get_db`. Patch at the point of *use* (`app.services.x.client`), not the library root.

---

## 7. Coverage priorities

When adding tests without a specific bug in hand, work down this list:

1. **Tenant isolation** — one test per tenant-scoped router: `other_tenant_client` gets `404`.
   Highest value in the suite; this is the security invariant the whole product rests on.
2. **Auth lifecycle** — all four rejection branches in `app/core/deps.py`, plus token expiry and
   refresh.
3. **RBAC matrix** — parametrized `(role, method, path) -> expected_status`. Catches the route
   missing its `require_*` dependency.
4. **Money** — `delivery_quote_service`, `driver_payout_service`. Arithmetic *and* rounding at
   boundaries.
5. **State machines** — order status transitions, including the illegal ones
   (`delivered -> assigned` must fail).

Roles are `app.models.user.RoleEnum`: `platform_admin`, `tenant_admin`, `central_dispatcher`,
`store_dispatcher`, `driver`, `vendor`, `individual`. RBAC tests must cover every role in the
enum, not a sample of two.

---

## 8. Project-specific gotchas

These have each cost real debugging time. Read before touching `conftest.py`.

- **Postgres only, never SQLite.** Models use `postgresql.UUID(as_uuid=True)` and the DB image is
  `timescale/timescaledb:latest-pg16`. SQLite would pass tests that production fails.
- **`get_db` override needs object identity.** `app/core/deps.py` does `get_db = _get_db`, aliasing
  `app.db.session.get_db`. Override that object — overriding a re-imported name silently does
  nothing and the test hits the dev database.
- **Services call `db.commit()`.** The `db` fixture must build its session with
  `join_transaction_mode="create_savepoint"`, or those commits escape the test transaction and leak
  state into the next test.
- **Do not run lifespan.** `app/main.py` lifespan calls `init_redis()`, `init_db()`,
  `seed_platform_admin()`, `seed_locations()`, `seed_canadian_pricing()`. `ASGITransport` does not
  run lifespan by default — keep it that way. Never wrap the test client in `LifespanManager`.
- **Schema via `Base.metadata.create_all`**, importing `app.models` so every mapper registers.
  Caveat: `driver_location_logs` is turned into a Timescale hypertable only in
  `alembic/versions/0031_driver_location_logs.py`, so `create_all` yields a plain table. Fine for
  everything except tests that assert hypertable behavior — those must run the Alembic path.
- **`pytest-asyncio` 1.3 with `asyncio_mode = "auto"`.** Session-scoped async fixtures need
  `@pytest_asyncio.fixture(scope="session", loop_scope="session")`, or they bind to a loop that is
  already closed.
- **Coverage under-reports async code.** Lines resuming after an `await` are recorded as
  unexecuted, so router and service bodies look far less covered than they are. Never set a
  `--cov-fail-under` gate off these numbers, and never conclude a path is untested from them --
  confirm by mutating the source and checking that a test fails.
- The `data/uploads/` tree is real dev data. Tests that write files must use `tmp_path`.

---

## 9. Commands

```bash
npm run test:api                        # everything, from the repo root
npm run test:api -- -m unit             # fast loop
npm run test:api -- tests/integration -q
npm run test:api:cov                    # with coverage

# What those wrap, if you are already inside the container:
sh /workspace/infra/scripts/test-api.sh
```

Everything after the script name is passed straight to pytest.

**Never run bare `pytest` inside the api container.** Its `DATABASE_URL` env var points at
`dispatch_dev`, and the suite drops and recreates the whole schema. `conftest.py` refuses to start
unless the target database name contains `test`, and `test-api.sh` sets that override for you.
That guard is the only thing between a stray env var and the dev database. Do not weaken it.

---

## 10. Before you call a test done

- [ ] It imports from `app.` and fails if that code is broken.
- [ ] The name states the behavior being defended.
- [ ] It asserts on response content, not just status.
- [ ] It passes in isolation *and* in a full run (`pytest -p randomly`).
- [ ] Nothing is mocked except a process boundary from §6.
- [ ] It is in the right layer directory.

If a test is hard to write because the production code is hard to reach, say so and propose the
refactor. Do not reach for a stub to make it easy.