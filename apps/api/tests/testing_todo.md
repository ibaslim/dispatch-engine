# Testing TODO

Work queue for the `apps/api` test suite. Priority order; pick any item.
See `CLAUDE.md` (rulebook) and `README.md` (how-to) in this folder.

Status as of 2026-08-31: **460 passed, 9 xfailed**, ~266s. Routers with HTTP coverage:
`onboarding` (8/8), `stores` (2/2), `auth` (4/6 + deps + `get_ws_user`), `orders` (17/18),
`drivers` (7/7), `tracking` (1/2), `platform` (3/3), `tenants` (6/6),
`delivery_configuration` (27/27), `driver_payroll` (10/10), `pricing` (9/9). Route coverage now
**94/106 (~89%)** across **11/17 routers**. The config/money routers each use a split RBAC matrix
(GET routes are CurrentUser-open, so only writes assert 403; all routes assert 401 for anon) plus
CRUD/validation and money happy-paths; matrices are mutation-verified. `drivers` surfaced
**BUG-006** (no-auth live-GPS read; strict xfail, "To review / P0" in `DISCOVERED_BUGS.md`).

Two findings from tenants/platform (noted, not pinned):
- `/tenants/unsuspend` (and `/suspend`) target the caller's OWN tenant, but once suspended the
  admin fails the suspended-tenant auth guard (401) and can never self-unsuspend — the endpoint
  is effectively unreachable; only `/platform/.../unsuspend` (platform admin) can restore a
  tenant. Documented in `test_tenants_api.py::TestUnsuspendMyTenant`.
- Test-infra papercut: `TenantFactory`/`InvitationFactory` default emails use the reserved
  `.test` TLD, which `EmailStr` rejects on request and response validation. Any endpoint taking
  or returning an EmailStr needs `@example.com`-style emails in tests. Worth fixing the factory
  defaults to a real-looking TLD (small infra task).

Orders remaining: `POST /orders/quote` and the `create_order` happy path (need a seeded
pricing/quote fixture). Tracking `/{token}/order` enumeration is a product decision (T5).
Legacy metric to move: *routers with a cross-tenant 404 test* = **3/17**. Confirmed bugs tracked
in the root `DISCOVERED_BUGS.md`.

---

## P0 — Proven bugs (tests already written and failing)

Each has a strict `xfail` pinning it. Fix the code, delete the marker, watch it go green.

### T0 · `GET /orders` scoping fails open — CONFIRMED LIVE
`app/api/routers/orders.py:363` (`get_orders`). The query starts as `select(Order)` with
no `WHERE`, and only `driver`/`vendor` tenant roles add a filter. Four paths reach the
`execute` unfiltered and return **every order in the system**:
1. `tenant.role == TenantRole.individual` — matches neither branch.
2. `tenant.role IS NULL` — column is nullable; `invitation_service.py:43` creates
   `Tenant(name=, slug=)` with no role, so invite-onboarded tenants are roleless by default.
3. non-platform-admin with `tenant_id IS NULL` — outer `if` skipped entirely.
4. `tenant_id` pointing at a deleted tenant — `if tenant:` is false.

Proven against the running dev API on 2026-08-28: logged in as `individual@dispatch.com`
(individual tenant, owns 0 orders), `GET /api/v1/orders` returned both orders in the DB.

**Fix:** invert to deny-by-default. Drop the `Order.pickup_name == tenant.name` fallback
(that is T1). Apply the same correction to the two sibling guards at `orders.py:689` and
`orders.py:1047`.
```python
query = select(Order).options(selectinload(Order.driver))
if not current_user.is_platform_admin:
    tenant = ...
    if tenant and tenant.role == TenantRole.driver:
        query = query.where(Order.driver_id == tenant.id)
    elif tenant and tenant.role == TenantRole.vendor:
        query = query.where(Order.vendor_id == tenant.id)
    else:
        return []
```
**Tests to add:** individual-role, roleless-tenant, and impersonating-vendor cases in
`tests/integration/test_orders_api.py`, each asserting `[]`. (Ready — probed and confirmed
failing before the fix.)
Effort: small. **Highest priority — widest hole, no attacker setup needed.**

### T1 · `get_orders` pickup_name fallback — folded into T0
`orders.py:382` widens the vendor filter with `Order.pickup_name == tenant.name`.
`pickup_name` is free text an attacker controls on their own order; registering a tenant
whose name matches a victim's `pickup_name` pulls the victim's orders into the list.
Fixed by dropping the fallback in T0. Remove the xfail at `test_orders_api.py:86`.

### T2 · `update_status` guard can never fire
`orders.py`. The driver clause is ANDed with the vendor clause. A vendor tenant fails the
driver half, a driver tenant fails the vendor half, so the condition is unsatisfiable and
**no tenant is ever refused a status change on any order.** Change AND to OR.
Removes xfails at `test_orders_api.py:147` and `:165`. Effort: one line.

### T3 · Document path traversal (CWE-22)
`onboarding.py`, `download_application_document` builds
`os.path.join(uploads_dir, application_id, name)` with no containment check, so `name` can
traverse out. Prefer a DB lookup of the filename over path filtering — makes traversal
structurally impossible. Removes xfails at `test_onboarding_documents.py:201,229`.
Effort: small.

---

## P0 — Suspected live vulnerabilities (not yet tested)

### T4 · `GET /drivers/{driver_id}/location` has no authentication
`drivers.py:187` takes only `redis: RedisClient` — no auth dependency. Anyone with a driver
UUID reads live lat/lng. Add `tests/integration/test_drivers_api.py` proving an
unauthenticated client and a rival tenant both get 404/401. Expect immediate failure → P0 fix.

### T5 · Tracking endpoint is enumerable
`tracking.py:33` (`GET /tracking/{token}/order`) accepts `Order.order_number`
(format `ORD20082601`, date-sequential and guessable), unauthenticated, and returns
pickup/delivery names, addresses, times, driver name. `GET /{token}` (`:14`) is a stub that
returns hardcoded fake data to production callers. Add `test_tracking_api.py`. Needs a
product decision: if public tracking-by-number is intended, the fix is a separate opaque
token column, not a test tweak.

---

## P1 — Foundation (blocks the rest)

### T6 · `tests/integration/test_auth_api.py` — DONE (2026-08-28)
Landed: 35 tests over login (9), refresh (5), logout (2), `/me` (4), the `_get_current_user`
rejection matrix (9), and `get_ws_user` (4). Two bugs found and pinned with strict xfail:
- **BUG-001** — a user whose tenant was deleted keeps a valid session (FK is `SET NULL`, so
  the user becomes tenantless and is admitted unscoped; the literal dangling-pointer branch
  is unreachable). `test_user_whose_tenant_was_deleted_is_rejected`.
- **BUG-002** — `get_ws_user` (`deps.py:203`) never checks tenant active; suspended tenant
  keeps its WS. `test_suspended_tenant_driver_is_rejected`.
Both are in `DISCOVERED_BUGS.md`; fix on a separate branch and remove the markers.
Not covered (stubs today, worth revisiting when implemented): `/forgot-password` and
`/reset-password` are no-op stubs returning 204 — add contract tests when they gain behavior.

### T7 · Migrate the 7 legacy root-level files
57 tests carry no marker → `-m unit` sees 35, `-m integration` sees 97 of 189; a third of the
suite is invisible to both selectors. Three files still hand-roll `AsyncSession` fakes and
must be rewritten against the real `db` fixture and moved to `integration/`:
- `test_posts.py` — `_SessionStub` reimplements the `is_published` filter + ordering, then
  asserts the stub sorted right (the exact §0 anti-pattern).
- `test_driver_payroll.py` — `_FakePayrollSession`, `asyncio.run` in test bodies.
- `test_driver_payment_groups.py` — `_EmptyScalars`, `_CreateGroupSession`.
The other four (`test_pricing`, `test_delivery_configuration`, `test_tenant_scoping`,
`test_invitation_accept`, `test_pusher_channels`) are genuinely pure — mark `unit`, move to
`unit/`. Do this before new P2 work or the layer split keeps drifting. Effort: medium.

### T8 · RBAC matrix + missing actor fixtures — §7 priority #3
§7 demands every role in `RoleEnum` but conftest ships only 5 actors. Add `store_dispatcher`,
`vendor`, `individual` fixtures, then one parametrized `(role, method, path) -> status`
table. This is the test that catches a route missing its `require_*` dependency — exactly
what T4 turned out to be. Resolves the §3-vs-§7 contradiction. Effort: fixtures small,
matrix medium.

### T9 · CI workflow
No `.github/workflows` exists — suite only runs when someone remembers. Postgres + Redis
services, run `test-api.sh`, fail the build on `strict=True` xpass so a fixed bug can't
silently keep its marker. Effort: small. Multiplies the value of everything else.

---

## P2 — Router isolation coverage (§7 priority #1, currently 3/17)

One file each, `test_stores_api.py` shape: damage list → happy path → isolation → RBAC.
Ordered by blast radius.

| ID | Router | Why | Size |
|---|---|---|---|
| T10 | `tenants` + `platform` | `/suspend`, `/unsuspend`, `/invite` — priv-esc + DoS on other tenants. 9 endpoints. | ~15 |
| T11 | `drivers` | Driver PII, push tokens, location write/delete. Pairs with T4. | ~12 |
| T12 | `driver_payroll` | §7 #4 money — 10 endpoints, per-driver/state/city rate writes. Only stub tests today. | ~18 |
| T13 | `delivery_configuration` | 598 LOC, 24 endpoints, all tenant-scoped config. | ~25 |
| T14 | `pricing` | 9 endpoints, money, partner rate overrides. | ~12 |
| T15 | `invitations` | One endpoint but it mints tokens. Current test only covers `is_valid()`, not HTTP accept. | ~6 |
| T16 | `posts`, `locations`, `public_config`, `pusher_channels` | Small, mostly read-only; check `public_config` for secret leakage. | ~10 |
| T17 | `ws` | WS auth via query param. Needs a different client than `AsyncClient`. | ~5 |

---

## P3 — Plan and process fixes

- **T18 · Create `tests/e2e/`** — §1 budgets 10%, at 0%. First flow: order lifecycle
  (create → publish → driver accepts → status transitions → delivered → payout snapshot).
- **T19 · Install `pytest-randomly`** — `CLAUDE.md` §10 requires `pytest -p randomly`; plugin
  isn't in the image, so that checklist item has never been satisfiable.
- **T20 · Replace the discarded metric** — track *routers with a cross-tenant 404 test*
  (3/17) in the README; update as tasks land. Coverage % is rejected for async code.
- **T21 · Make the mutation check auditable** — README §6 is the best idea in the docs and
  the only step no reviewer can verify. Require a one-line docstring naming the mutation each
  test catches.
- **T22 · `.gitattributes` + drop CRLF noise** — 9 `infra/scripts/*.sh` files show
  line-ending-only diffs and there's no `.gitattributes`. Add `*.sh text eol=lf` and
  `git checkout` them. A CRLF `#!/bin/sh` breaks in the container.
- **T23 · Resolve the 403/404 policy conflict** — §5 mandates 404 for cross-tenant reads, but
  `require_same_tenant` (`deps.py:181`, currently dead code) returns 403. Delete it or fix it
  to 404 before someone wires it up.

---

## Suggested order

T0 → T2 → T3 → T9 (lock the fixes in) → T6 → T7 (before any P2) → P2 by blast radius.
