# Onboarding Flow: Tenants in Tenants Table

## Overview
Tenants (vendors, drivers, individuals) are now stored directly in the `tenants` table instead of being associated with `users` accounts. This is a clear separation of concerns where:
- **Tenants** = Organizations/Entities (vendors, drivers, individuals)
- **Users** = Platform accounts with specific roles within tenants

## Changes Made

### 1. Database Schema (Migration 0006)
**File**: `alembic/versions/0006_add_tenant_role.py`

Added a `role` column to the `tenants` table:
- Type: `tenant_role_enum` (ENUM: 'vendor', 'driver', 'individual')
- Nullable: Yes (existing tenants may not have a role specified)

Database table structure:
```sql
ALTER TABLE tenants ADD COLUMN role tenant_role_enum;
```

### 2. Tenant Model Update
**File**: `app/models/tenant.py`

Enhanced the Tenant model with:
- `TenantRole` enum class with values: `vendor`, `driver`, `individual`
- `role` field mapped to the database column

```python
class TenantRole(str, Enum):
    vendor = "vendor"
    driver = "driver"
    individual = "individual"

class Tenant(Base, UUIDMixin, TimestampMixin):
    ...
    role: Mapped[str | None] = mapped_column(
        SAEnum(TenantRole, name="tenant_role_enum"),
        nullable=True,
    )
```

### 3. Onboarding Router Logic
**File**: `app/api/routers/onboarding.py`

#### Key Changes:

##### a) Tenant Creation Function
- Refactored `_ensure_tenant_for_application()` to:
  - Accept the onboarding application directly
  - Extract tenant data from the application's `data` JSONB field
  - Create a new tenant record with the appropriate role
  - Set tenant as active immediately upon approval
  - Generate unique slug for the tenant

```python
async def _ensure_tenant_for_application(
    db: AsyncSession,
    application: OnboardingApplication,
) -> Tenant:
    """Create or update a tenant for a vendor/driver/individual onboarding application."""
    # Creates tenant with: name, slug, role, contact details, etc.
    # Returns the created tenant object
```

##### b) Approval Flow
The `approve_application` endpoint now handles two paths:

**Path 1: Tenant Roles (vendor, driver, individual)**
- Calls `_ensure_tenant_for_application()` to create/store tenant in tenants table
- **Does NOT** create or activate a user account
- Marks the onboarding application as approved

**Path 2: User Roles (platform_admin, tenant_admin, dispatcher, etc.)**
- Activates the user account
- Assigns the user role
- For future expansion: existing tenant personnel joining

```python
# For vendor/driver/individual tenants:
if application.role in {RoleEnum.vendor.value, RoleEnum.driver.value, RoleEnum.individual.value}:
    await _ensure_tenant_for_application(db, application)
    # Tenant is created and stored in tenants table
    # No user account is created
else:
    # For user roles: activate the user account
    user.is_active = True
```

## Data Flow

### Before Approval
1. User submits onboarding form (vendor/driver/individual)
2. Data is stored in `onboarding_applications` table
3. Status: `pending`
4. User record exists but is inactive

### Upon Approval
1. Admin approves the onboarding application
2. New **Tenant** record is created in `tenants` table with:
   - Name, contact details (email, phone, address)
   - Role (vendor/driver/individual)
   - NTN number, national ID filename
   - is_active = true
3. Application status: `approved`
4. **No user account is activated** (tenants are not users)

### Data Storage
- **Onboarding Application Data**: `onboarding_applications` table (audit trail)
- **Tenant Organization Data**: `tenants` table (active tenant records)
- **Tenant Contact Fields**:
  - contact_name
  - contact_email
  - contact_phone_country_code
  - contact_phone_number
  - address
  - ntn_number
  - notes
  - national_id_file_name

## Database Schema

### Tenants Table Columns (Relevant)
```
id (UUID, PK)
name (String, Required)
slug (String, Unique, Required)
role (tenant_role_enum - vendor/driver/individual)
is_active (Boolean, default=true)
created_at (Timestamp)
updated_at (Timestamp)

--- Tenant Profile Fields (from Migration 0005+) ---
contact_name (String)
contact_email (String)
contact_phone_country_code (String)
contact_phone_number (String)
address (String)
ntn_number (String)
notes (String)
national_id_file_name (String)
```

### Onboarding Applications Table (For Reference)
```
id (UUID, PK)
user_id (UUID, FK -> users.id)  # Tracks who submitted
role (role_enum - vendor/driver/individual)
status (onboarding_status_enum - pending/approved/rejected)
data (JSONB - form submission data)
reviewed_at (Timestamp)
reviewed_by_id (UUID, FK -> users.id)  # Admin who reviewed
decision_reason (String)
created_at (Timestamp)
updated_at (Timestamp)
```

## API Endpoints

### Submit Onboarding Application
**POST** `/api/v1/onboarding/applications`
```json
{
  "role": "vendor",  // or "driver", "individual"
  "data": {
    "fullName": "Business Name",
    "email": "contact@business.local",
    "phone": {
      "countryCode": "+92",
      "number": "3001234567"
    },
    "address": "Business Address",
    "ntnNumber": "123456789",
    "notes": "Optional notes"
  }
}
```

### Approve Application
**POST** `/api/v1/onboarding/applications/{application_id}/approve`
- Creates a new tenant in `tenants` table
- Sets tenant as active
- Returns updated application with status: "approved"

### Reject Application
**POST** `/api/v1/onboarding/applications/{application_id}/reject`
- Marks application as rejected
- No tenant is created
- Provides reason for rejection

## Migration Path

**Applied Migration**: `0006_add_tenant_role`
- Alembic revision ID: 0006
- Creates `tenant_role_enum` type
- Adds `role` column to `tenants` table
- Nullable to maintain backward compatibility

Run with:
```bash
cd apps/api
alembic upgrade head  # Will apply migration 0006
```

## Summary of Architecture

**Before**:
```
Onboarding Form → User Account (inactive) → Tenant (after approval)
```

**Now**:
```
Onboarding Form → Tenant (after approval, vendor/driver/individual roles)
                → User Account (only for platform users)
```

**Benefits**:
- Clear separation: Tenants are organizations, not user accounts
- Vendor/driver/individual data is properly stored in tenants table
- User accounts are reserved for platform personnel
- Cleaner data model and easier querying
- JSONB form data remains in onboarding_applications for audit trail

## Testing

Verification script created: `verify_changes.py`
```bash
cd apps/api
python verify_changes.py
```

Checks:
- ✓ Models import correctly
- ✓ Tenant model has role field
- ✓ TenantRole enum has all values
- ✓ Onboarding router has correct logic
- ✓ Database schema has role column

All checks passed ✓

## Files Modified

1. **app/models/tenant.py**
   - Added TenantRole enum
   - Added role field to Tenant model

2. **app/api/routers/onboarding.py**
   - Refactored `_ensure_tenant_for_application()`
   - Updated `approve_application()` endpoint
   - Changed from user activation to tenant creation

3. **alembic/versions/0006_add_tenant_role.py** (New)
   - Migration to add role column to tenants table

## Next Steps / Considerations

1. **User Interface**: Update admin panel to display tenants with roles
2. **Filtering**: Add endpoints to filter tenants by role (vendors/drivers/individuals)
3. **Relationships**: Link stores/operations to specific tenants by role
4. **Platform Users**: Separate flow for creating platform users who work for tenants
5. **Document Management**: Ensure documents uploaded during onboarding are accessible after tenant creation

