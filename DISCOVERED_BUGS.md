# Discovered Bugs

Bugs found while building the API test suite. **Sorted by request flow through the
project**, not by severity — so a new bug slots into the section for the layer it lives in.

Flow order (add future bugs under the matching heading, in this sequence):

1. Auth & session (`auth.py`, `auth_service.py`, `core/deps.py`, `core/security.py`)
2. Onboarding (`onboarding.py`)
3. Tenants & platform (`tenants.py`, `platform.py`, `invitations.py`)
4. Stores (`stores.py`)
5. Orders (`orders.py`)
6. Drivers & tracking (`drivers.py`, `tracking.py`, `ws.py`)
7. Pricing & payroll (`pricing.py`, `driver_payroll.py`, `delivery_configuration.py`)
8. Misc (`posts.py`, `locations.py`, `public_config.py`, `pusher_channels.py`)

Status legend: **CONFIRMED** (reproduced) · **SUSPECTED** (found by code inspection, not yet
reproduced) · **FIXED**. Each bug links to its task in `apps/api/tests/testing_todo.md`.

---

## 1. Auth & session

### BUG-001 · Tenant guard fails open + SET NULL orphans admit unscoped users — CONFIRMED
- **Severity:** Low for the fail-open guard itself (see reachability); High for the reachable
  SET-NULL consequence, which chains into BUG-004 (T0).
- **Reproduced:** 2026-08-28 via `test_auth_api.py::test_user_whose_tenant_was_deleted_is_rejected`
  (strict xfail). Deleting the tenant nulled `user.tenant_id`; the user then got 200 on
  `/orders` instead of 401.
- **Location:** `apps/api/app/core/deps.py:56-67` (`_get_current_user`) and the same guard in
  `_get_current_user_allow_inactive` (`:113`). FK: `apps/api/app/models/user.py:38`.
- **What (two parts):**
  1. **Fail-open guard.** The check is
     `if tenant is not None and not tenant.is_active: raise exc`. A set `tenant_id` whose
     tenant row is missing gives `tenant is None`, so the guard is skipped and the user is
     admitted. It should fail closed: `if tenant is None or not tenant.is_active`.
  2. **Reachability caveat — the original repro does NOT work.** Nothing in the app
     hard-deletes tenants (suspension is soft: `platform.py:41` sets `is_active = False`,
     row kept), and `user.tenant_id` is `ForeignKey(..., ondelete="SET NULL")`. So deleting
     a tenant does not leave a dangling pointer — Postgres nulls the user's `tenant_id`.
     The `tenant is None` branch is therefore effectively unreachable through the app; it
     only triggers on out-of-band corruption. On its own, part 1 is a defensive smell.
  3. **The reachable path.** After `SET NULL`, every user of a hard-deleted tenant becomes
     **tenantless** (`tenant_id = None`). Such a user (a) still authenticates — via the
     `if user.tenant_id:` short-circuit at `:59`, the tenant check is skipped entirely — and
     (b) is now **unscoped**, which is fail-open path #3 of BUG-004: `get_orders` adds no
     `WHERE` and returns every order.
- **Repro (to write):** hard-delete a tenant row (DB-level; no app route does this), then
  call a protected route with an affected user's JWT → currently 200; then `GET /orders`
  → currently leaks all orders. Both should be rejected/empty.
- **Fix:** (a) fail closed on a set-but-missing tenant:
  `if tenant is None or not tenant.is_active: raise exc`; and (b) the durable fix — reject a
  non-platform-admin session that has no tenant (`not is_platform_admin and tenant_id is None
  → 401`), which also closes BUG-004 path #3. Platform admins legitimately carry
  `tenant_id = None`, so scope the check to non-admins.
- **Task:** T6 (`test_auth_api.py`) in `apps/api/tests/testing_todo.md`; related to BUG-004.

### BUG-002 · `get_ws_user` never checks tenant active — CONFIRMED
- **Severity:** Medium (suspended tenant retains realtime access)
- **Reproduced:** 2026-08-28 via
  `test_auth_api.py::TestWebsocketAuth::test_suspended_tenant_driver_is_rejected`
  (strict xfail). `get_ws_user` returned the `User` for a suspended-tenant driver; should
  return `None`.
- **Location:** `apps/api/app/core/deps.py:203` (`get_ws_user`, used by `ws.py`).
- **What:** The websocket authenticator validates the token and that the user
  `is_active`, but — unlike `_get_current_user` — it **never checks whether the user's
  tenant is active**. A driver on a suspended tenant is refused over HTTP yet keeps a live
  websocket, so suspension does not fully cut off realtime location/order streams.
- **Repro (to write):** suspend a tenant, open a WS with its driver's token → currently
  expected to connect, should be rejected.
- **Fix:** mirror the tenant-active check from `_get_current_user` before returning the
  user (and apply the BUG-001 missing-tenant fix here too).
- **Task:** T17 (ws coverage) in `apps/api/tests/testing_todo.md`.

---

## 2. Onboarding

### BUG-003 · Document download path traversal (CWE-22) — CONFIRMED
- **Severity:** High (arbitrary file read from the server)
- **Reproduced:** pinned by two strict xfails in
  `apps/api/tests/integration/test_onboarding_documents.py:201,229`.
- **Location:** `apps/api/app/api/routers/onboarding.py:424`
  (`download_application_document`).
- **What:** `filepath = os.path.join(uploads_dir, application_id, name)` builds the path from
  the caller-supplied `name` with no containment check, so `name` can traverse out of the
  application folder (`../../...`) and read arbitrary files.
- **Repro:** request the download endpoint with `name` containing `../` segments.
- **Fix:** resolve the path and assert it stays under
  `Path(uploads_dir)/application_id`, or — preferred — look the stored filename up in the DB
  and never build a path from the raw `name`. Remove the two xfail markers once fixed.
- **Task:** T3 in `apps/api/tests/testing_todo.md`.

---

## 5. Orders

### BUG-004 · `GET /orders` scoping fails open — CONFIRMED LIVE
- **Severity:** Critical (cross-tenant data disclosure; leaks every order)
- **Reproduced:** 2026-08-28 against the running dev API. Logged in as
  `individual@dispatch.com` (individual tenant, owns 0 orders); `GET /api/v1/orders`
  returned **both** orders in the database. Also proved with three integration probes
  (individual role, roleless tenant, vendor named after victim) — all leaked.
- **Location:** `apps/api/app/api/routers/orders.py:363` (`get_orders`); sibling guards
  carrying the same `pickup_name == tenant.name` fallback: `update_status` (~`:688`),
  `_authorize_pod_view` (~`:1044`, guards `GET /orders/{id}/proof-of-delivery/{kind}`).
  The POD-view leak is pinned by
  `test_orders_api.py::TestGetProofOfDeliveryImage::test_does_not_leak_pod_to_a_vendor_named_after_the_pickup_name`
  (strict xfail).
- **What:** the query starts as `select(Order)` with no `WHERE`. Only `driver` and `vendor`
  tenant roles add a filter, so four paths reach `execute` unfiltered and return every order:
  1. `tenant.role == TenantRole.individual` — matches neither branch.
  2. `tenant.role IS NULL` — column is nullable; `invitation_service.py:43` creates
     `Tenant(name=, slug=)` with no role, so invite-onboarded tenants are roleless by default.
  3. non-platform-admin with `tenant_id IS NULL` — outer `if` skipped entirely (this is the
     reachable tail of BUG-001).
  4. `tenant_id` pointing at a deleted tenant — `if tenant:` is false.
  Additionally the vendor branch widens the filter with `Order.pickup_name == tenant.name`
  (`:382`) — free text an attacker controls by naming their tenant after a victim's pickup
  name (was tracked as T1).
- **Fix:** invert to deny-by-default — filter by `driver_id`/`vendor_id` per role, drop the
  `pickup_name` fallback, and `return []` (or 403) for any other case. Apply the same to the
  single-order guards at `:688` and `:1044`.
- **Task:** T0 (folds in T1) in `apps/api/tests/testing_todo.md`.

### BUG-005 · `update_status` permission guard can never fire — CONFIRMED
- **Severity:** Critical (any order's status is writable by any tenant)
- **Reproduced:** pinned by two strict xfails in
  `apps/api/tests/integration/test_orders_api.py:147,165`.
- **Location:** `apps/api/app/api/routers/orders.py:685-689` (`update_status`).
- **What:** the guard is
  `(role == driver AND driver_id != tenant.id) AND (role == vendor AND vendor_id != tenant.id ...)`.
  A tenant has exactly one role, so one side of the outer AND is always false → the whole
  condition is always false → the `raise 403` is unreachable. **No tenant is ever refused a
  status change on any order.** The clauses should be OR, not AND.
- **Repro:** as a vendor from another tenant, `PATCH /orders/{id}/status` on an order you do
  not own → currently 200, should be 403/404.
- **Fix:** change the outer AND to OR (a tenant is refused when it fails its own role's
  ownership check). Remove the two xfail markers once fixed.
- **Task:** T2 in `apps/api/tests/testing_todo.md`.

---

<!--
Template for new entries — keep the flow ordering above.

### BUG-0NN · <one-line title> — CONFIRMED | SUSPECTED | FIXED
- **Severity:**
- **Location:** file:line
- **What:**
- **Repro:**
- **Fix:**
- **Task:** T?? in apps/api/tests/testing_todo.md
-->
