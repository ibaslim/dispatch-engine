import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PopupComponent } from '@components/popup/popup.component';
import { ButtonComponent } from '@components/button/button.component';
import { SearchBarComponent } from '@components/search-bar/search-bar.component';
import { OrderEntity } from '@models/orders/order-entity.model';
import { OrdersService } from '@services/orders/orders.service';
import { DriversService } from '@services/drivers/drivers.service';
import { ToastService } from '@core/toast/toast.service';
import { AssignableDriver, formatTenantPhone } from '@pages/orders/orders-mapping.util';

@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule, PopupComponent, ButtonComponent, SearchBarComponent],
  templateUrl: './assign-driver-modal.component.html'
})
export class AssignDriverModalComponent implements OnChanges {
  @Input() open = false;
  @Input() order: OrderEntity | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() assigned = new EventEmitter<void>();
  @Output() unassigned = new EventEmitter<void>();

  assignDriverQuery = '';
  selectedDriverId = '';
  availableAssignableDrivers: AssignableDriver[] = [];
  isLoadingAssignableDrivers = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly driversService: DriversService,
    private readonly toast: ToastService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order'] && this.order) {
      this.assignDriverQuery = '';
      this.selectedDriverId = '';
      void this.loadAssignableDrivers(this.order.id);
    }
  }

  onClose(): void {
    this.assignDriverQuery = '';
    this.selectedDriverId = '';
    this.close.emit();
  }

  get filteredAssignableDrivers(): AssignableDriver[] {
    const query = this.assignDriverQuery.trim().toLowerCase();
    const drivers = this.availableAssignableDrivers;
    if (!query) return drivers;
    return drivers.filter((driver) =>
      [driver.name, driver.contactName, driver.email, driver.phone, driver.address]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }

  async assignSelectedDriver(): Promise<void> {
    if (!this.order || !this.selectedDriverId) {
      this.toast.error('Select a driver to assign.');
      return;
    }
    try {
      await firstValueFrom(this.ordersService.assignDriver(this.order.id, this.selectedDriverId));
      const selectedDriver = this.availableAssignableDrivers.find((driver) => driver.id === this.selectedDriverId);
      const driverLabel = selectedDriver ? selectedDriver.contactName || selectedDriver.name : 'Driver';
      this.toast.success(`${driverLabel} assigned to order ${this.order.full.orderNumber ?? ''}.`);
      this.assigned.emit();
      this.onClose();
    } catch {
      this.toast.error('Unable to assign driver.');
    }
  }

  async unassignSelectedDriver(): Promise<void> {
    if (!this.order) return;
    try {
      await firstValueFrom(this.ordersService.unassignDriver(this.order.id));
      this.toast.success(`Driver removed from order ${this.order.full.orderNumber ?? ''}.`);
      this.unassigned.emit();
      this.onClose();
    } catch {
      this.toast.error('Unable to remove driver.');
    }
  }

  private async loadAssignableDrivers(selectedOrderId?: string): Promise<void> {
    this.isLoadingAssignableDrivers = true;

    try {
      const drivers = await firstValueFrom(this.driversService.getAvailableDrivers());
      this.availableAssignableDrivers = drivers.map((driver: any) => ({
        id: String(driver.id),
        name: String(driver.name ?? '').trim(),
        contactName: String(driver.contact_name ?? '').trim(),
        email: String(driver.contact_email ?? '').trim(),
        phone: formatTenantPhone(
          driver.contact_phone_country_code,
          driver.contact_phone_number
        ),
        address: String(driver.address ?? '').trim()
      }));

      if (selectedOrderId && this.order?.id === selectedOrderId) {
        const currentDriverName = this.order.view.current.driver.trim();
        this.selectedDriverId = this.availableAssignableDrivers.find((driver) =>
          driver.id === currentDriverName || driver.name === currentDriverName || driver.contactName === currentDriverName
        )?.id ?? '';
      }
    } catch {
      this.availableAssignableDrivers = [];
      this.toast.error('Unable to load drivers from tenants.');
    } finally {
      this.isLoadingAssignableDrivers = false;
    }
  }
}
