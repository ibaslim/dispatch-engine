export interface TenantDriverEntity {
  id: string;
  name: string;
  isActive: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhoneCountryCode: string | null;
  contactPhoneNumber: string | null;
  address: string | null;
}

