import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
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
import { ToastService } from '../../core/toast/toast.service';
import {SearchBarComponent} from "../search-bar/search-bar.component";

const ROLE_LABELS: Record<TenantRole, string> = {
  [TenantRole.Vendor]: 'Partner',
  [TenantRole.Driver]: 'Driver',
  [TenantRole.Individual]: 'Individual',
};

type TenantStatus = OnboardingStatus | 'invited';

const STATUS_LABELS: Record<TenantStatus, string> = {
  pre_pending: 'Pending-onboarding',
  pending: 'Pending Approval',
  approved: 'Active',
  rejected: 'Rejected',
  invited: 'Invited',
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
  createdAtTime?: string;
  applicationId?: string;
  tenantId?: string | null;
}

interface TenantInvitation {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  created_at: string;
  expires_at: string;
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
    SearchBarComponent,
  ],
  templateUrl: './tenant-management.component.html',
})
export class TenantManagementComponent implements OnInit, OnDestroy {
  private readonly onboarding = inject(OnboardingService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly TenantRole = TenantRole;

  private refreshInterval?: any;

  invitePopupOpen = false;
  viewDrawerOpen = false;
  suspendPopupOpen = false;
  suspensionReason = '';
  isSuspending = false;
  tenantToSuspend: TenantUser | null = null;

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
    { key: 'number', label: '#', align: 'center', hiddenOnMobile: true },
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
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.loadTenants();
    }, 30000); // 30 seconds
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
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
      this.toast.success('Tenant invited successfully.');
      await this.loadTenants();
      this.onInviteSent();
    } catch (err: unknown) {
      this.toast.error('Invitation failed.');
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

  searchQuery = '';
  activeRoleFilters: Set<TenantRole> = new Set();
toggleRoleFilter(role: TenantRole): void {
  if (this.activeRoleFilters.has(role)) {
    this.activeRoleFilters.delete(role);
  } else {
    this.activeRoleFilters.add(role);
  }
  this.activeRoleFilters = new Set(this.activeRoleFilters); // trigger change detection
}

get filteredTenants() {
  const q = this.searchQuery.trim().toLowerCase();
  let results = this.tenants;

  if (this.activeRoleFilters.size > 0) {
    results = results.filter(t => this.activeRoleFilters.has(t.role));
  }

  if (!q) return results;
  return results.filter((t) =>
    [t.name, t.email, t.status, t.role]
      .some((val) => String(val ?? '').toLowerCase().includes(q))
  );
}
  private async loadTenants(): Promise<void> {
    try {
      const [applications, invitations] = await Promise.all([
        this.onboarding.listApplications(),
        this.loadInvitations(),
      ]);
      this.pendingApplications = applications;
      const tenantIds = applications
        .map((application) => application.tenant_id)
        .filter((tenantId): tenantId is string => !!tenantId);
      const tenantStatusMap = await this.loadTenantStatuses(tenantIds);

      const applicationRows = applications.map((application) => {
        const data = application.data ?? {};
        const username = (data['username'] as string) || '—';
        let name = (data['fullName'] as string);
        if (!name || name === 'Pending Applicant') {
          name = username !== '—' ? username : 'Pending Applicant';
        }

        const isSuspended = application.tenant_id
          ? tenantStatusMap.get(application.tenant_id) === false
          : false;

        return {
          id: application.id,
          number: 0,
          applicationId: application.id,
          tenantId: application.tenant_id,
          name: name,
          username: username,
          email: (data['email'] as string) || '—',
          role: (application.role as TenantRole) ?? TenantRole.Driver,
          status: isSuspended
            ? 'Suspended'
            : STATUS_LABELS[application.status as TenantStatus] ?? application.status,
          phone: this.formatPhone(data['phone']),
          createdAt: application.created_at?.split('T')[0],
          createdAtTime: application.created_at,
        };
      });

      const invitedRows = invitations.map((invite) => {
        const displayName = invite.name || invite.email.split('@')[0];
        return {
          id: invite.id,
          number: 0,
          applicationId: undefined,
          tenantId: null,
          name: displayName,
          username: '—',
          email: invite.email,
          role: (invite.role as TenantRole) ?? TenantRole.Driver,
          status: STATUS_LABELS.invited,
          phone: undefined,
          createdAt: invite.created_at?.split('T')[0],
          createdAtTime: invite.created_at,
        };
      });

      const combined = [...invitedRows, ...applicationRows].sort((a, b) => {
        return new Date(b.createdAtTime || 0).getTime() - new Date(a.createdAtTime || 0).getTime();
      });

      this.tenants = combined.map((row, index) => ({
        ...row,
        number: index + 1,
      }));

      this.syncSelectedTenantFromLatestRows();
    } catch {
      this.tenants = [];
      this.pendingApplications = [];
    }
  }

  private async loadTenantStatuses(tenantIds: string[]): Promise<Map<string, boolean>> {
    if (!tenantIds.length) {
      return new Map();
    }
    try {
      const query = tenantIds.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
      const response = await firstValueFrom(
        this.http.get<{ id: string; is_active: boolean }[]>(`/api/v1/tenants/status?${query}`)
      );
      return new Map(response.map((item) => [item.id, item.is_active]));
    } catch {
      return new Map();
    }
  }

  private async loadInvitations(): Promise<TenantInvitation[]> {
    try {
      return await firstValueFrom(
        this.http.get<TenantInvitation[]>('/api/v1/tenants/invitations')
      );
    } catch {
      return [];
    }
  }

  private buildApplicationEntries(
    application: OnboardingApplicationResponse | null
  ): { label: string; value: string; isFile?: boolean; fileName?: string }[] {
    if (!application) return [];
    const entries: { label: string; value: string; isFile?: boolean; fileName?: string }[] = [];
    for (const [key, value] of Object.entries(application.data ?? {})) {
      if (key === 'password' || key === 'password_hash' || key === 'confirmPassword') continue;
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
      this.toast.error('Failed to download document.');
    }
  }

  async previewDocument(applicationId: string, fileName: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`/api/v1/onboarding/applications/${applicationId}/document?name=${encodeURIComponent(fileName)}`, { responseType: 'blob' })
      );
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.error('Failed to preview document.');
    }
  }

  openSuspendPopup(): void {
    this.tenantToSuspend = this.selectedTenant;
    this.suspensionReason = '';
    this.suspendPopupOpen = true;
    this.closeViewDrawer();
  }

  closeSuspendPopup(): void {
    this.suspendPopupOpen = false;
    this.suspensionReason = '';
    this.tenantToSuspend = null;
  }

  async confirmSuspendTenant(): Promise<void> {
    if (!this.tenantToSuspend?.tenantId || !this.suspensionReason.trim()) return;
    this.isSuspending = true;
    try {
      await firstValueFrom(
        this.http.post(`/api/v1/platform/tenants/${this.tenantToSuspend.tenantId}/suspend`, {
          reason: this.suspensionReason.trim()
        })
      );
      this.toast.success('Tenant suspended successfully.');
      this.updateTenantStatus(this.tenantToSuspend.tenantId, 'Suspended');
      await this.loadTenants();
      this.closeSuspendPopup();
    } catch (err) {
      this.toast.error('Failed to suspend tenant.');
      console.error('Failed to suspend tenant', err);
    } finally {
      this.isSuspending = false;
    }
  }

  async unsuspendTenant(): Promise<void> {
    if (!this.selectedTenant?.tenantId) return;
    try {
      await firstValueFrom(this.http.post(`/api/v1/platform/tenants/${this.selectedTenant.tenantId}/unsuspend`, {}));
      this.updateTenantStatus(this.selectedTenant.tenantId, 'Active');
      await this.loadTenants();
    } catch (err) {
      console.error('Failed to unsuspend tenant', err);
    }
  }

  private updateTenantStatus(tenantId: string, status: string): void {
    this.tenants = this.tenants.map((tenant) =>
      tenant.tenantId === tenantId ? { ...tenant, status } : tenant
    );
    if (this.selectedTenant?.tenantId === tenantId) {
      this.selectedTenant = { ...this.selectedTenant, status };
    }
  }

  isSelectedTenantSuspended(): boolean {
    return this.getSelectedTenant()?.status === 'Suspended';
  }

  isSelectedTenantApproved(): boolean {
    return this.selectedApplication?.status === 'approved';
  }

  private syncSelectedTenantFromLatestRows(): void {
    const selected = this.selectedTenant;
    if (!selected) return;

    const refreshedTenant = selected.tenantId
      ? this.tenants.find((tenant) => tenant.tenantId === selected.tenantId)
      : this.tenants.find((tenant) => tenant.id === selected.id);

    if (refreshedTenant) {
      this.selectedTenant = refreshedTenant;
    }

    if (this.selectedApplication) {
      this.selectedApplication = this.pendingApplications.find(
        (application) => application.id === this.selectedApplication?.id
      ) ?? this.selectedApplication;
      this.selectedApplicationEntries = this.buildApplicationEntries(this.selectedApplication);
    }
  }

  private getSelectedTenant(): TenantUser | null {
    if (!this.selectedTenant) return null;
    return this.selectedTenant.tenantId
      ? this.tenants.find((tenant) => tenant.tenantId === this.selectedTenant?.tenantId) ?? this.selectedTenant
      : this.tenants.find((tenant) => tenant.id === this.selectedTenant?.id) ?? this.selectedTenant;
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


  clearInviteFeedback(): void {
    this.inviteError = '';
    this.inviteSuccess = '';
  }
}