import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PageComponent } from '../../components/page/page.component';
import { PopupComponent } from '../../components/popup/popup.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { TableComponent } from '../../components/table/table.component';
import { ToastService } from '../../core/toast/toast.service';
import { TableColumn } from '../../models/table.model';
import {
  DriverPaymentGroup,
  DriverProfile,
  DriversService,
  PaymentRuleType,
} from '../../services/drivers/drivers.service';

interface DriverTableRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  paymentGroup: string;
  completed: number;
  status: string;
  actions: string;
  source: DriverProfile;
}

type ProfileTab = 'bio' | 'payments' | 'reviews';

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [CommonModule, PageComponent, PopupComponent, SearchBarComponent, TableComponent],
  templateUrl: './drivers.component.html',
})
export class DriversComponent implements OnInit {
  private readonly driversService = inject(DriversService);
  private readonly toast = inject(ToastService);

  readonly columns: TableColumn[] = [
    { key: 'name', label: 'Driver', sortable: true, align: 'left' },
    { key: 'phone', label: 'Phone', sortable: true, align: 'left' },
    { key: 'vehicle', label: 'Vehicle', sortable: true },
    { key: 'paymentGroup', label: 'Payment group', sortable: true },
    { key: 'completed', label: 'Completed', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Action' },
  ];

  drivers: DriverProfile[] = [];
  paymentGroups: DriverPaymentGroup[] = [];
  selectedDriver: DriverProfile | null = null;
  activeProfileTab: ProfileTab = 'bio';
  searchQuery = '';
  isLoading = false;

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      [this.drivers, this.paymentGroups] = await Promise.all([
        firstValueFrom(this.driversService.getDrivers()),
        firstValueFrom(this.driversService.getPaymentGroups()),
      ]);
    } catch {
      this.toast.error('Failed to load drivers.');
    } finally {
      this.isLoading = false;
    }
  }

  get rows(): DriverTableRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.drivers
      .map((driver) => ({
        id: driver.id,
        name: driver.name,
        phone: this.phone(driver),
        email: driver.contact_email || 'Not provided',
        vehicle: driver.vehicle_type || 'Not provided',
        paymentGroup: driver.payment_group_name || 'Not assigned',
        completed: driver.completed_deliveries,
        status: driver.is_active ? 'Active' : 'Inactive',
        actions: '',
        source: driver,
      }))
      .filter((row) => !query || [row.name, row.phone, row.email, row.vehicle, row.paymentGroup, row.status]
        .some((value) => String(value).toLowerCase().includes(query)));
  }

  openProfile(row: DriverTableRow): void {
    this.selectedDriver = row.source;
    this.activeProfileTab = 'bio';
  }

  closeProfile(): void {
    this.selectedDriver = null;
  }

  setProfileTab(tab: ProfileTab): void {
    this.activeProfileTab = tab;
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  phone(driver: DriverProfile): string {
    const value = `${driver.contact_phone_country_code || ''}${driver.contact_phone_number || ''}`.trim();
    return value || 'Not provided';
  }

  selectedPaymentGroup(): DriverPaymentGroup | null {
    return this.paymentGroups.find((group) => group.id === this.selectedDriver?.payment_group_id) || null;
  }

  ruleLabel(rule: PaymentRuleType | null | undefined): string {
    if (!rule) return 'Not assigned';
    return {
      fixed: 'Fixed pay per delivery',
      percentage: 'Order value percentage',
      passthrough: 'Pass-through earnings',
    }[rule];
  }

  ruleSummary(group: DriverPaymentGroup): string {
    if (group.rule_type === 'fixed') return `C$${this.money(group.fixed_amount)} per completed delivery`;
    if (group.rule_type === 'percentage') return `${group.delivery_fee_percentage || 0}% of the delivery fee`;
    return `${group.delivery_fee_percentage || 0}% of the delivery fee plus ${100 - (group.platform_tip_percentage || 0)}% of tips`;
  }

  private money(value: number | null): string {
    return Number(value || 0).toFixed(2);
  }
}
