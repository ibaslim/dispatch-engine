import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageComponent } from '../page/page.component';
import { ButtonComponent } from '../button/button.component';
import { TableComponent } from '../table/table.component';
import { SideDrawerComponent } from '../side-drawer/Side-drawer.component';
import { PopupComponent } from '../popup/popup.component';
import { BaseInputComponent } from '../base-input/base-input.component';
import { DropdownSelectorComponent } from '../dropdown-selector/dropdown-selector.component';
import { SelectOption } from '../../models/dropdown-selector/dropdown-selector.model';
import { TableColumn } from '../../models/table.model';
import { TenantRole } from '@dispatch/shared/domain';
import type { OnboardingApplicationResponse, OnboardingStatus } from '@dispatch/shared/contracts';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const ROLE_LABELS: Record<TenantRole, string> = {
  [TenantRole.Vendor]: 'Vendor',
  [TenantRole.Driver]: 'Driver',
  [TenantRole.Individual]: 'Individual',
};

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  pre_pending: 'Pre-Pending',
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

interface TenantUser {
  id: string;
  number: number;
  name: string;
  username: string;
  email: string;
  role: TenantRole;
  status: string;
  phone?: string;
  createdAt?: string;
  applicationId?: string;
  tenantId?: string | null;
}

@Component({
  selector: 'app-tenant-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageComponent,
    ButtonComponent,
    TableComponent,
    SideDrawerComponent,
    PopupComponent,
    BaseInputComponent,
    DropdownSelectorComponent,
  ],
  templateUrl: './tenant-management.component.html',
})
export class TenantManagementComponent implements OnInit {
  private readonly onboarding = inject(OnboardingService);
  private readonly http = inject(HttpClient);

  invitePopupOpen = false;
  viewDrawerOpen = false;

  inviteEmail = '';
  inviteRole: TenantRole = TenantRole.Vendor;
  inviteError = '';
  inviteSuccess = '';
  isInviting = false;
  roles: TenantRole[] = [TenantRole.Vendor, TenantRole.Driver, TenantRole.Individual];
  roleOptions: SelectOption<TenantRole>[] = this.roles.map((role) => ({
    label: ROLE_LABELS[role] ?? role,
    value: role,
  }));

  tenants: TenantUser[] = [];
  pendingApplications: OnboardingApplicationResponse[] = [];
  selectedTenant: TenantUser | null = null;
  selectedApplication: OnboardingApplicationResponse | null = null;
  selectedApplicationEntries: { label: string; value: string; isFile?: boolean; fileName?: string }[] = [];
  isReviewing = false;

  columns: TableColumn[] = [
    { key: 'number', label: '#', align: 'center' },
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'username', label: 'Username', align: 'left' },
    { key: 'email', label: 'Email', align: 'left' },
    { key: 'role', label: 'Role', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' },
    { key: 'createdAt', label: 'Created at', align: 'center' },
    { key: 'actions', label: 'Actions', align: 'center' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadTenants();
  }

  openInvitePopup(): void {
    this.invitePopupOpen = true;
    this.clearInviteFeedback();
  }

  closeInvitePopup(): void {
    this.invitePopupOpen = false;
    this.clearInviteFeedback();
  }

  async sendInvite(): Promise<void> {
    this.clearInviteFeedback();

    const email = this.inviteEmail.trim();
    const role = this.inviteRole;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.inviteError = 'Enter a valid email address.';
      return;
    }

    if (!role) {
      this.inviteError = 'Select a role.';
      return;
    }

    this.isInviting = true;
    try {
      await firstValueFrom(
        this.http.post('/api/v1/tenants/invite', { email, role })
      );
      this.inviteSuccess = 'Invitation sent successfully.';
      this.onInviteSent();
    } catch (err: unknown) {
      this.inviteError = err instanceof Error ? err.message : 'Failed to send invite.';
    } finally {
      this.isInviting = false;
    }
  }

  onInviteSent(): void {
    this.inviteEmail = '';
    this.inviteRole = TenantRole.Vendor;
    this.invitePopupOpen = false;
  }

  onTableActionClick(row: TenantUser): void {
    this.openViewDrawer(row);
  }

  openViewDrawer(tenant: TenantUser): void {
    this.selectedTenant = tenant;
    this.selectedApplication = this.pendingApplications.find(
      (application) => application.id === tenant.applicationId
    ) ?? null;
    this.selectedApplicationEntries = this.buildApplicationEntries(this.selectedApplication);
    this.viewDrawerOpen = true;
  }

  closeViewDrawer(): void {
    this.viewDrawerOpen = false;
    this.selectedTenant = null;
    this.selectedApplication = null;
    this.selectedApplicationEntries = [];
  }

  async approveSelected(): Promise<void> {
    if (!this.selectedApplication || this.isReviewing) return;
    this.isReviewing = true;
    try {
      await this.onboarding.approveApplication(this.selectedApplication.id);
      await this.loadTenants();
      this.closeViewDrawer();
    } finally {
      this.isReviewing = false;
    }
  }

  async rejectSelected(): Promise<void> {
    if (!this.selectedApplication || this.isReviewing) return;
    this.isReviewing = true;
    try {
      await this.onboarding.rejectApplication(this.selectedApplication.id, { reason: null });
      await this.loadTenants();
      this.closeViewDrawer();
    } finally {
      this.isReviewing = false;
    }
  }

  private async loadTenants(): Promise<void> {
    try {
      const applications = await this.onboarding.listApplications();
      this.pendingApplications = applications;
      this.tenants = applications.map((application, index) => {
        const data = application.data ?? {};
        const username = (data['username'] as string) || '—';
        let name = (data['fullName'] as string);
        if (!name || name === 'Pending Applicant') {
          name = username !== '—' ? username : 'Pending Applicant';
        }

        return {
          id: application.id,
          number: index + 1,
          applicationId: application.id,
          tenantId: application.tenant_id,
          name: name,
          username: username,
          email: (data['email'] as string) || '—',
          role: (application.role as TenantRole) ?? TenantRole.Driver,
          status: STATUS_LABELS[application.status] ?? application.status,
          phone: this.formatPhone(data['phone']),
          createdAt: application.created_at?.split('T')[0],
        };
      });
    } catch {
      this.tenants = [];
      this.pendingApplications = [];
    }
  }

  private buildApplicationEntries(
    application: OnboardingApplicationResponse | null
  ): { label: string; value: string; isFile?: boolean; fileName?: string }[] {
    if (!application) return [];
    const entries: { label: string; value: string; isFile?: boolean; fileName?: string }[] = [];
    for (const [key, value] of Object.entries(application.data ?? {})) {
      // Format phone object nicely instead of raw JSON
      if (key.toLowerCase().includes('phone') && typeof value === 'object' && value !== null) {
        const phone = value as { countryCode?: string; number?: string };
        const displayValue = phone.number ? `${phone.countryCode ?? ''} ${phone.number}`.trim() : '—';
        entries.push({ label: this.toTitleCase(key), value: displayValue });
        continue;
      }

      // File names stored with keys ending in FileName -> render as file entry
      if (key.toLowerCase().endsWith('filename') && typeof value === 'string' && value) {
        entries.push({ label: this.toTitleCase(key.replace(/FileName$/i, 'Document')), value: value, isFile: true, fileName: value });
        continue;
      }

      const displayValue = typeof value === 'string'
        ? value
        : value === null
          ? '—'
          : JSON.stringify(value);
      entries.push({ label: this.toTitleCase(key), value: displayValue });
    }
    return entries;
  }

  async downloadDocument(applicationId: string, fileName: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`/api/v1/onboarding/applications/${applicationId}/document?name=${encodeURIComponent(fileName)}`, { responseType: 'blob' })
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // ignore or show message
      console.error('Failed to download document', err);
    }
  }

  async suspendTenant(): Promise<void> {
    if (!this.selectedTenant?.tenantId) return;
    try {
      await firstValueFrom(this.http.post(`/api/v1/platform/tenants/${this.selectedTenant.tenantId}/suspend`, {}));
      await this.loadTenants();
      this.closeViewDrawer();
    } catch (err) {
      console.error('Failed to suspend tenant', err);
    }
  }

  async unsuspendTenant(): Promise<void> {
    if (!this.selectedTenant?.tenantId) return;
    try {
      await firstValueFrom(this.http.post(`/api/v1/platform/tenants/${this.selectedTenant.tenantId}/unsuspend`, {}));
      await this.loadTenants();
      this.closeViewDrawer();
    } catch (err) {
      console.error('Failed to unsuspend tenant', err);
    }
  }

  private formatPhone(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const phone = value as { countryCode?: string; number?: string };
    if (!phone.number) return undefined;
    return `${phone.countryCode ?? ''} ${phone.number}`.trim();
  }

  private toTitleCase(value: string): string {
    return value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase());
  }

  getRoleLabel(role: TenantRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  getStatusLabel(status: OnboardingStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  clearInviteFeedback(): void {
    this.inviteError = '';
    this.inviteSuccess = '';
  }
}