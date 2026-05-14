## Summary of Changes - Onboarding Flow Implementation

### Problem Statement
1. Users were being redirected directly to the waiting page (/pending-approval) after accepting the invitation and activating their account
2. No onboarding forms were being shown before the approval stage
3. Only Driver and Vendor (TenantAdmin) roles had onboarding pages
4. The role allocation by admin was not being used in the redirect logic

### Solution Implemented

#### 1. **Modified Invite Accept Component** 
📍 File: `/apps/dispatcher-web/src/app/pages/invite-accept/invite-accept.component.ts`

**Changes:**
- Imported `TenantRole` from `@dispatch/shared/domain`
- Created a mapping constant `ROLE_TO_ONBOARDING_PATH` that maps each role to its corresponding onboarding page:
  - `Driver` → `/onboarding/driver`
  - `TenantAdmin` → `/onboarding/vendor`
  - `CentralDispatcher` → `/onboarding/central-dispatcher`
  - `StoreDispatcher` → `/onboarding/store-dispatcher`
- Updated the success message from "Redirecting to pending approval" to "Redirecting to onboarding"
- Created a new private method `navigateToOnboarding()` that:
  - Reads the role from the URL query parameter (already being captured)
  - Routes to the appropriate onboarding page based on the role
  - Falls back to `/pending-approval` if role is missing or unknown

#### 2. **Created New Onboarding Components**

##### Central Dispatcher Onboarding
📍 Directory: `/apps/dispatcher-web/src/app/pages/central_dispatcher_onboarding/`
- **TypeScript:** `central-dispatcher.onboarding.component.ts`
- **HTML:** `central-dispatcher.onboarding.component.html`

##### Store Dispatcher Onboarding
📍 Directory: `/apps/dispatcher-web/src/app/pages/store_dispatcher_onboarding/`
- **TypeScript:** `store-dispatcher.onboarding.component.ts`
- **HTML:** `store-dispatcher.onboarding.component.html`

**Component Features:**
- Both components follow the same vendor-like structure with these input fields:
  - Full Name (required)
  - Email (required, with validation)
  - Phone Number (required)
  - Address (required)
  - NTN Number (required)
  - National Identity Scan (required file upload)
  - Additional Notes (optional)
- Form validation with error messages
- File upload handling
- Submit button that directs to `/onboarding/pending` after successful submission
- Both submit with their respective TenantRole (CentralDispatcher or StoreDispatcher)

#### 3. **Added Routes to App Routes**
📍 File: `/apps/dispatcher-web/src/app/app.routes.ts`

**New Routes Added:**
```typescript
{
  path: 'onboarding/central-dispatcher',
  canActivate: [authGuard],
  data: { hideNavbar: true },
  loadComponent: () => import('./pages/central_dispatcher_onboarding/central-dispatcher.onboarding.component')
    .then((m) => m.CentralDispatcherOnboardingComponent),
},
{
  path: 'onboarding/store-dispatcher',
  canActivate: [authGuard],
  data: { hideNavbar: true },
  loadComponent: () => import('./pages/store_dispatcher_onboarding/store-dispatcher.onboarding.component')
    .then((m) => m.StoreDispatcherOnboardingComponent),
}
```

---

### Part 2: Roles Dropdown Location

#### Where the Roles Dropdown is Shown
📍 File: `/apps/dispatcher-web/src/app/components/tenant-management/tenant-management.component.html` (Lines 54-60)
📍 Component: `/apps/dispatcher-web/src/app/components/tenant-management/tenant-management.component.ts`

**Location:** In the "Invite New User" side drawer when an admin adds a new tenant

**Implementation Details:**

**In the TypeScript (Lines 62-67):**
```typescript
inviteRole: TenantRole = TenantRole.StoreDispatcher;  // Default role
roles = Object.values(TenantRole) as TenantRole[];   // All available roles
roleOptions: SelectOption<TenantRole>[] = this.roles.map((role) => ({
  label: ROLE_LABELS[role] ?? role,
  value: role,
}));
```

**Where ROLE_LABELS is defined (Lines 16-21):**
```typescript
const ROLE_LABELS: Record<TenantRole, string> = {
  [TenantRole.TenantAdmin]: 'Tenant Admin',
  [TenantRole.CentralDispatcher]: 'Central Dispatcher',
  [TenantRole.StoreDispatcher]: 'Store Dispatcher',
  [TenantRole.Driver]: 'Driver',
};
```

**In the HTML Template (Lines 54-60):**
```html
<app-dropdown-selector
  label="Role"
  [required]="true"
  [options]="roleOptions"
  [value]="inviteRole"
  (valueChange)="inviteRole = $event || inviteRole">
</app-dropdown-selector>
```

**Flow:**
1. Admin clicks "Add New Tenant" button
2. Side drawer opens with email and role fields
3. Role dropdown shows 4 options: Tenant Admin, Central Dispatcher, Store Dispatcher, Driver
4. Default selection is "Store Dispatcher"
5. Admin selects desired role and sends invitation
6. The role is passed to the invited user via URL query parameter
7. When user accepts and activates account, they're directed to the role-specific onboarding page

---

### Complete User Journey

1. **Admin Page** (Tenant Management)
   - Opens "Add New Tenant" drawer
   - Selects role from dropdown (4 options available)
   - Sends invitation

2. **User Receives Invitation** 
   - Gets invitation link with token and role in query params
   - Example: `/invite/accept?token=xxx&role=central_dispatcher`

3. **Accept Invitation Page**
   - User enters name and password
   - Clicks "Activate account"
   - System reads role from URL

4. **Role-Based Redirect** (NEW)
   - Driver → Onboarding form for drivers (passport + license)
   - Tenant Admin → Onboarding form for vendors (NTN + national ID)
   - Central Dispatcher → Onboarding form (NTN + national ID)
   - Store Dispatcher → Onboarding form (NTN + national ID)

5. **Onboarding Form** (NEW for Dispatchers)
   - User fills out form with required information
   - Uploads national identity document
   - Clicks "Apply for Approval"

6. **Pending Approval Page**
   - User waits for admin approval
   - Admin can view and approve/reject from Tenant Management

7. **Approved Access**
   - User gets access to the system based on their role

---

### Files Created/Modified

**Created:**
- `/apps/dispatcher-web/src/app/pages/central_dispatcher_onboarding/central-dispatcher.onboarding.component.ts`
- `/apps/dispatcher-web/src/app/pages/central_dispatcher_onboarding/central-dispatcher.onboarding.component.html`
- `/apps/dispatcher-web/src/app/pages/store_dispatcher_onboarding/store-dispatcher.onboarding.component.ts`
- `/apps/dispatcher-web/src/app/pages/store_dispatcher_onboarding/store-dispatcher.onboarding.component.html`

**Modified:**
- `/apps/dispatcher-web/src/app/pages/invite-accept/invite-accept.component.ts`
- `/apps/dispatcher-web/src/app/app.routes.ts`

**Unchanged (Referenced):**
- `/apps/dispatcher-web/src/app/components/tenant-management/tenant-management.component.ts` (Roles dropdown source)
- `/apps/dispatcher-web/src/app/components/tenant-management/tenant-management.component.html` (Roles dropdown UI)

