## Visual Guide: Updated Onboarding Flow

### Before (Current/Broken Flow)
```
┌─────────────────────┐
│ Accept Invitation   │
│  Page (Set Password)│
└──────────┬──────────┘
           │
           ↓
    [Activate Account]
           │
           ↓ (Ignored role from URL)
┌─────────────────────┐
│  Pending Approval   │ ❌ User skips onboarding!
│     (Waiting)       │
└─────────────────────┘
```

### After (Fixed Flow with Onboarding)
```
┌─────────────────────┐
│ Accept Invitation   │
│  Page (Set Password)│
│  (Role in URL query)│
└──────────┬──────────┘
           │
           ↓
    [Activate Account]
           │
           ↓ Role-based routing
           │
     ┌─────┴─────────────────────┬────────────┬──────────┐
     │                           │            │          │
     ↓                           ↓            ↓          ↓
┌─────────────┐  ┌─────────────┐ ┌──────────┐ ┌─────────────┐
│  Driver     │  │ Vendor/Tenant│ │ Central  │ │Store        │
│ Onboarding  │  │ Admin        │ │Dispatcher│ │Dispatcher   │
│             │  │ Onboarding   │ │Onboarding│ │Onboarding   │
│ • Full Name │  │              │ │          │ │             │
│ • Email     │  │ • Full Name  │ │• Full Nm │ │ • Full Name │
│ • Phone     │  │ • Email      │ │• Email   │ │ • Email     │
│ • Address   │  │ • Phone      │ │• Phone   │ │ • Phone     │
│ • Notes     │  │ • Address    │ │• Address │ │ • Address   │
│ • Passport  │  │ • NTN Number │ │• NTN Num │ │ • NTN Number│
│ • License   │  │ • Nat' l ID  │ │• Nat' l  │ │ • National  │
│             │  │ • Notes      │ │  ID      │ │   ID        │
│             │  │              │ │• Notes   │ │ • Notes     │
└──────┬──────┘  └──────┬───────┘ └────┬─────┘ └──────┬──────┘
       │                │              │              │
       └────────────────┴──────────────┴──────────────┘
                        │
                        ↓ "Apply for Approval"
         ┌──────────────────────────────┐
         │   Pending Approval Page       │
         │ (User waits for admin review) │
         └──────────────────────────────┘
```

---

## File Structure

### New Components Created
```
dispatcher-web/src/app/pages/
│
├── central_dispatcher_onboarding/
│   ├── central-dispatcher.onboarding.component.ts
│   └── central-dispatcher.onboarding.component.html
│
└── store_dispatcher_onboarding/
    ├── store-dispatcher.onboarding.component.ts
    └── store-dispatcher.onboarding.component.html
```

### Role-to-Path Mapping
```
TenantRole.Driver
    ↓
    /onboarding/driver
    ↓
    DriverOnboardingComponent

TenantRole.TenantAdmin (Vendor)
    ↓
    /onboarding/vendor
    ↓
    VendorOnboardingComponent

TenantRole.CentralDispatcher
    ↓
    /onboarding/central-dispatcher
    ↓
    CentralDispatcherOnboardingComponent ✨ NEW

TenantRole.StoreDispatcher
    ↓
    /onboarding/store-dispatcher
    ↓
    StoreDispatcherOnboardingComponent ✨ NEW
```

---

## Where the Roles Dropdown is Located

### Flow Path
```
Main Application
    ↓
Routes: /tenants (path: 'tenants')
    ↓
TenantManagementComponent
    ├── Path: apps/dispatcher-web/src/app/components/tenant-management/
    ├── File: tenant-management.component.ts (TypeScript logic)
    └── File: tenant-management.component.html (UI)
        ↓
        Button: "+ Add New Tenant"
        ↓
        Side Drawer Opens
        ├── Input: Email address
        └── Dropdown: Role Selection ⭐ HERE
            ├── Option: Tenant Admin (for vendors)
            ├── Option: Central Dispatcher
            ├── Option: Store Dispatcher
            └── Option: Driver
```

### Code Location Details

**TypeScript Component** (Lines 62-67):
```typescript
inviteRole: TenantRole = TenantRole.StoreDispatcher;
roles = Object.values(TenantRole) as TenantRole[];
roleOptions: SelectOption<TenantRole>[] = this.roles.map((role) => ({
  label: ROLE_LABELS[role] ?? role,
  value: role,
}));
```

**HTML Template** (Lines 54-60):
```html
<app-dropdown-selector
  label="Role"
  [required]="true"
  [options]="roleOptions"
  [value]="inviteRole"
  (valueChange)="inviteRole = $event || inviteRole">
</app-dropdown-selector>
```

**Role Labels** (Lines 16-21):
```typescript
const ROLE_LABELS: Record<TenantRole, string> = {
  [TenantRole.TenantAdmin]: 'Tenant Admin',
  [TenantRole.CentralDispatcher]: 'Central Dispatcher',
  [TenantRole.StoreDispatcher]: 'Store Dispatcher',
  [TenantRole.Driver]: 'Driver',
};
```

---

## How It Works

### Step 1: Admin Invites User
1. Admin goes to `/tenants` (Tenant Management page)
2. Clicks "+ Add New Tenant" button
3. Side drawer opens with role dropdown
4. Selects role (e.g., "Central Dispatcher")
5. Enters user's email
6. Clicks "+ Invite"
7. User receives invitation with: `?token=xxx&role=central_dispatcher`

### Step 2: User Accepts Invitation
1. User clicks invitation link
2. Lands on `/invite/accept?token=xxx&role=central_dispatcher`
3. Fills in name and password
4. Clicks "Activate account"

### Step 3: Role-Based Routing
1. Component reads role from URL: `central_dispatcher`
2. Looks up mapping in `ROLE_TO_ONBOARDING_PATH`
3. Navigates to `/onboarding/central-dispatcher`

### Step 4: User Fills Onboarding
1. CentralDispatcherOnboardingComponent loads
2. User fills form with:
   - Full Name, Email, Phone, Address
   - NTN Number
   - National Identity Scan (file upload)
   - Optional notes
3. Clicks "Apply for Approval"

### Step 5: Form Submission
1. OnboardingService.submitApplication() called with:
   - role: TenantRole.CentralDispatcher
   - data: { all form fields }
2. Navigates to `/onboarding/pending`

### Step 6: Admin Review
1. Admin goes to Tenant Management
2. Sees pending application
3. Reviews submitted data
4. Approves or rejects
5. User gains access (if approved)

---

## Testing Checklist

- [ ] Admin can select "Central Dispatcher" in role dropdown
- [ ] Admin can select "Store Dispatcher" in role dropdown
- [ ] Invitation email contains role in URL
- [ ] Driver role → redirects to `/onboarding/driver`
- [ ] Vendor/Admin role → redirects to `/onboarding/vendor`
- [ ] Central Dispatcher → redirects to `/onboarding/central-dispatcher`
- [ ] Store Dispatcher → redirects to `/onboarding/store-dispatcher`
- [ ] Central Dispatcher form shows 5 input fields + file upload
- [ ] Store Dispatcher form shows 5 input fields + file upload
- [ ] Form validation works (email, required fields)
- [ ] File upload works
- [ ] "Apply for Approval" redirects to `/onboarding/pending`
- [ ] Admin can see and approve/reject onboarding applications

---

## Summary Table

| Role | Onboarding Page | Fields | File Upload |
|------|-----------------|--------|-------------|
| Driver | `/onboarding/driver` | Name, Email, Phone, Address, Notes | Passport + License |
| Vendor (TenantAdmin) | `/onboarding/vendor` | Name, Email, Phone, Address, NTN, Notes | National ID |
| Central Dispatcher ✨ | `/onboarding/central-dispatcher` | Name, Email, Phone, Address, NTN, Notes | National ID |
| Store Dispatcher ✨ | `/onboarding/store-dispatcher` | Name, Email, Phone, Address, NTN, Notes | National ID |

✨ = Newly created components

