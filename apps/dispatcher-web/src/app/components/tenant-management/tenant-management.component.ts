import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageComponent } from '../page/page.component';
import { ButtonComponent } from '../button/button.component';
import { TableComponent } from '../table/table.component';
import { SideDrawerComponent} from "../side-drawer/Side-drawer.component";
import { TableColumn } from '../../models/table.model';

export enum TenantRole {
  Admin = 'Admin',
  Dispatcher = 'Dispatcher',
  Viewer = 'Viewer',
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: TenantRole;
  status: 'Active' | 'Invited' | 'Suspended';
  phone?: string;
  createdAt?: string;
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
    SideDrawerComponent, // ← added
  ],
  templateUrl: './tenant-management.component.html',
})
export class TenantManagementComponent {
  inviteDrawerOpen = false;
  viewDrawerOpen = false;

  inviteEmail = '';
  inviteRole: TenantRole = TenantRole.Dispatcher;
  roles = Object.values(TenantRole);

  tenants: TenantUser[] = [
    {
      id: 'tn-001',
      name: 'Ibrahim Sayys',
      email: 'ibrahim@dispatch.com',
      role: TenantRole.Admin,
      status: 'Active',
      phone: '+234 800 000 0000',
      createdAt: '2026-04-12',
    },
    {
      id: 'tn-002',
      name: 'Fola Martins',
      email: 'fola@dispatch.com',
      role: TenantRole.Dispatcher,
      status: 'Invited',
      createdAt: '2026-05-01',
    },
  ];

  selectedTenant: TenantUser | null = null;

  columns: TableColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions' },
  ];

  openInviteDrawer(): void {
    this.inviteDrawerOpen = true;
  }

  closeInviteDrawer(): void {
    this.inviteDrawerOpen = false;
  }

  sendInvitation(): void {
    const payload = {
      email: this.inviteEmail.trim(),
      role: this.inviteRole,
      inviteUrl: 'http://localhost:4200/login',
    };
    // TODO: send payload to backend invite endpoint.
    console.log('Invite payload:', payload);
    this.inviteEmail = '';
    this.inviteRole = TenantRole.Dispatcher;
    this.inviteDrawerOpen = false;
  }

  onTableActionClick(row: TenantUser): void {
    this.openViewDrawer(row);
  }

  openViewDrawer(tenant: TenantUser): void {
    this.selectedTenant = tenant;
    this.viewDrawerOpen = true;
  }

  closeViewDrawer(): void {
    this.viewDrawerOpen = false;
    this.selectedTenant = null;
  }
}