import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from '@components/button/button.component';
import { TableComponent } from '@components/table/table.component';
import { SideDrawerComponent } from '@components/side-drawer/Side-drawer.component';
import { PopupComponent } from '@components/popup/popup.component';
import { BaseInputComponent } from '@components/base-input/base-input.component';
import { DropdownSelectorComponent } from '@components/dropdown-selector/dropdown-selector.component';
import { SearchBarComponent } from '@components/search-bar/search-bar.component';
import { SelectOption } from '@models/dropdown-selector/dropdown-selector.model';
import { TableColumn } from '@models/table.model';
import { PLATFORM_LEVEL_ROLES, PlatformRole } from '@dispatch/shared/domain';
import type { OnboardingApplicationResponse, OnboardingStatus } from '@dispatch/shared/contracts';
import { OnboardingService } from '@core/onboarding/onboarding.service';
import { ToastService } from '@core/toast/toast.service';

const ROLE_LABELS: Record<string, string> = {
  [PlatformRole.PlatformAdmin]: 'Platform Admin',
  [PlatformRole.OperationalAdmin]: 'Operational Admin',
  [PlatformRole.AccountsAdmin]: 'Accounts Admin',
};

const INVITABLE_ROLES: PlatformRole[] = [PlatformRole.OperationalAdmin, PlatformRole.AccountsAdmin];

type UserStatus = OnboardingStatus | 'invited';

const STATUS_LABELS: Record<UserStatus, string> = {
  pre_pending: 'Pending-onboarding',
  pending: 'Pending Approval',
  approved: 'Active',
  rejected: 'Rejected',
  invited: 'Invited',
};

interface PlatformUserRow {
  id: string;
  number: number;
  name: string;
  email: string;
  role: string;
  status: string;
  phone?: string;
  createdAt?: string;
  createdAtTime?: string;
  applicationId?: string;
}

interface PlatformInvitation {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  created_at: string;
  expires_at: string;
}

@Component({
  selector: 'app-platform-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    TableComponent,
    SideDrawerComponent,
    PopupComponent,
    BaseInputComponent,
    DropdownSelectorComponent,
    SearchBarComponent,
  ],
  templateUrl: './platform-users.component.html',
})
export class PlatformUsersComponent implements OnInit, OnDestroy {
  private readonly onboarding = inject(OnboardingService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  private refreshInterval?: any;

  invitePopupOpen = false;
  inviteEmail = '';
  inviteName = '';
  inviteRole: PlatformRole = PlatformRole.OperationalAdmin;
  inviteError = '';
  isInviting = false;
  roleOptions: SelectOption<PlatformRole>[] = INVITABLE_ROLES.map((role) => ({
    label: ROLE_LABELS[role] ?? role,
    value: role,
  }));

  searchQuery = '';
  activeRoleFilters: Set<string> = new Set();

  users: PlatformUserRow[] = [];
  pendingApplications: OnboardingApplicationResponse[] = [];
  selectedUser: PlatformUserRow | null = null;
  selectedApplication: OnboardingApplicationResponse | null = null;
  selectedApplicationEntries: { label: string; value: string; isFile?: boolean; fileName?: string }[] = [];
  viewDrawerOpen = false;
  isReviewing = false;

  columns: TableColumn[] = [
    { key: 'number', label: '#', align: 'center', hiddenOnMobile: true },
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'email', label: 'Email', align: 'left' },
    { key: 'role', label: 'Role', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' },
    { key: 'createdAt', label: 'Created at', align: 'center' },
    { key: 'actions', label: 'Actions', align: 'center' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.loadUsers();
    }, 30000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  toggleRoleFilter(role: string): void {
    if (this.activeRoleFilters.has(role)) {
      this.activeRoleFilters.delete(role);
    } else {
      this.activeRoleFilters.add(role);
    }
    this.activeRoleFilters = new Set(this.activeRoleFilters);
  }

  get filteredUsers(): PlatformUserRow[] {
    const q = this.searchQuery.trim().toLowerCase();
    let results = this.users;

    if (this.activeRoleFilters.size > 0) {
      results = results.filter((u) => this.activeRoleFilters.has(u.role));
    }

    if (!q) return results;
    return results.filter((u) =>
      [u.name, u.email, u.status, u.role].some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }

  openInvitePopup(): void {
    this.invitePopupOpen = true;
    this.inviteError = '';
  }

  closeInvitePopup(): void {
    this.invitePopupOpen = false;
    this.inviteError = '';
  }

  async sendInvite(): Promise<void> {
    this.inviteError = '';

    const email = this.inviteEmail.trim();
    const name = this.inviteName.trim();
    const role = this.inviteRole;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.inviteError = 'Enter a valid email address.';
      return;
    }
    if (!name) {
      this.inviteError = 'Enter a name.';
      return;
    }

    this.isInviting = true;
    try {
      await firstValueFrom(
        this.http.post('/api/v1/platform/users/invite', { email, name, role })
      );
      this.toast.success('Platform user invited successfully.');
      await this.loadUsers();
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
    this.inviteName = '';
    this.inviteRole = PlatformRole.OperationalAdmin;
    this.invitePopupOpen = false;
  }

  onTableActionClick(row: PlatformUserRow): void {
    this.openViewDrawer(row);
  }

  openViewDrawer(user: PlatformUserRow): void {
    this.selectedUser = user;
    this.selectedApplication = this.pendingApplications.find(
      (application) => application.id === user.applicationId
    ) ?? null;
    this.selectedApplicationEntries = this.buildApplicationEntries(this.selectedApplication);
    this.viewDrawerOpen = true;
  }

  closeViewDrawer(): void {
    this.viewDrawerOpen = false;
    this.selectedUser = null;
    this.selectedApplication = null;
    this.selectedApplicationEntries = [];
  }

  async approveSelected(): Promise<void> {
    if (!this.selectedApplication || this.isReviewing) return;
    this.isReviewing = true;
    try {
      await this.onboarding.approveApplication(this.selectedApplication.id);
      await this.loadUsers();
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
      await this.loadUsers();
      this.closeViewDrawer();
    } finally {
      this.isReviewing = false;
    }
  }

  private async loadUsers(): Promise<void> {
    try {
      const [allApplications, allInvitations] = await Promise.all([
        this.onboarding.listApplications(),
        this.loadInvitations(),
      ]);

      const applications = allApplications.filter((application) =>
        PLATFORM_LEVEL_ROLES.includes(application.role as PlatformRole)
      );
      const invitations = allInvitations.filter((invite) =>
        PLATFORM_LEVEL_ROLES.includes(invite.role as PlatformRole)
      );

      this.pendingApplications = applications;

      const applicationRows: PlatformUserRow[] = applications.map((application) => {
        const data = application.data ?? {};
        const name = (data['fullName'] as string) || (data['email'] as string) || 'Pending Applicant';
        return {
          id: application.id,
          number: 0,
          applicationId: application.id,
          name,
          email: (data['email'] as string) || '—',
          role: application.role,
          status: STATUS_LABELS[application.status as UserStatus] ?? application.status,
          phone: this.formatPhone(data['phone']),
          createdAt: application.created_at?.split('T')[0],
          createdAtTime: application.created_at,
        };
      });

      const invitedRows: PlatformUserRow[] = invitations.map((invite) => ({
        id: invite.id,
        number: 0,
        applicationId: undefined,
        name: invite.name || invite.email.split('@')[0],
        email: invite.email,
        role: invite.role,
        status: STATUS_LABELS.invited,
        createdAt: invite.created_at?.split('T')[0],
        createdAtTime: invite.created_at,
      }));

      const combined = [...invitedRows, ...applicationRows].sort(
        (a, b) => new Date(b.createdAtTime || 0).getTime() - new Date(a.createdAtTime || 0).getTime()
      );

      this.users = combined.map((row, index) => ({ ...row, number: index + 1 }));
      this.syncSelectedUserFromLatestRows();
    } catch {
      this.users = [];
      this.pendingApplications = [];
    }
  }

  private async loadInvitations(): Promise<PlatformInvitation[]> {
    try {
      return await firstValueFrom(
        this.http.get<PlatformInvitation[]>('/api/v1/tenants/invitations')
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

      if (key.toLowerCase().includes('phone') && typeof value === 'object' && value !== null) {
        const phone = value as { countryCode?: string; number?: string };
        const displayValue = phone.number ? `${phone.countryCode ?? ''} ${phone.number}`.trim() : '—';
        entries.push({ label: this.toTitleCase(key), value: displayValue });
        continue;
      }

      if (key.toLowerCase().endsWith('filename') && typeof value === 'string' && value) {
        entries.push({ label: this.toTitleCase(key.replace(/FileName$/i, 'Document')), value, isFile: true, fileName: value });
        continue;
      }

      if (key === 'documents' && typeof value === 'object' && value !== null) {
        for (const [docType, fileName] of Object.entries(value as Record<string, unknown>)) {
          if (typeof fileName === 'string' && fileName) {
            entries.push({ label: this.toTitleCase(docType), value: fileName, isFile: true, fileName });
          }
        }
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
    } catch {
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

  private syncSelectedUserFromLatestRows(): void {
    const selected = this.selectedUser;
    if (!selected) return;

    const refreshed = this.users.find((user) => user.id === selected.id);
    if (refreshed) {
      this.selectedUser = refreshed;
    }

    if (this.selectedApplication) {
      this.selectedApplication = this.pendingApplications.find(
        (application) => application.id === this.selectedApplication?.id
      ) ?? this.selectedApplication;
      this.selectedApplicationEntries = this.buildApplicationEntries(this.selectedApplication);
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

  getRoleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }
}
