import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { PopupComponent } from '../../components/popup/popup.component';
import { BaseInputComponent } from '../../components/base-input/base-input.component';
import { PhoneInputComponent } from '../../components/phone-input/phone-input.component';
import { DropdownSelectorComponent } from '../../components/dropdown-selector/dropdown-selector.component';
import { PhoneValue } from '../../models/phone-input/phone-input.model';
import { TableColumn } from '../../models/table.model';
import { DailyPaymentRow } from '../../models/drivers/daily-payment.model';
import { DriverRow } from '../../models/drivers/drivers-list.model';
import { DriverFormValue, DriverStatus } from '../../models/drivers/driver.model';
import { DemoDriversService } from '../../services/demo-drivers/demo-drivers.service';

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    TableComponent,
    SearchBarComponent,
    ButtonComponent,
    PopupComponent,
    BaseInputComponent,
    PhoneInputComponent,
    DropdownSelectorComponent
  ],
  templateUrl: './drivers.component.html'
})
export class DriversComponent implements OnInit {
  tabs = ['Driver List', 'Daily Payment'];
  activeTab = 'Driver List';

  searchQuery = '';
  feedbackMessage = '';
  feedbackTone: 'success' | 'error' | 'info' = 'info';

  isNewDriverOpen = false;
  driverFormValue: DriverFormValue;

  readonly showLocalDemoButton = this.isLocalhost();

  driverColumns: TableColumn[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'rating', label: 'Rating', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'vehicle', label: 'Vehicle', sortable: true },
    { key: 'status', label: 'Status', sortable: true }
  ];

  dailyPaymentColumns: TableColumn[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'phone', label: 'Phone Number', sortable: true },
    { key: 'completed', label: '# Of Completed Deliveries', sortable: true },
    { key: 'basePay', label: 'Base Driver Pay', sortable: true },
    { key: 'tips', label: 'Online Tips', sortable: true },
    { key: 'shiftEarning', label: 'Shift Earning', sortable: true },
    { key: 'adjustments', label: 'Adjustments', sortable: false },
    { key: 'paymentDue', label: 'Payment Due', sortable: true }
  ];

  driverColumnTemplate = '1.7fr .8fr 1.1fr 1.8fr 1.2fr 1fr';
  dailyColumnTemplate = '1.7fr 1.1fr 1.4fr 1fr 1fr 1fr 1fr 1fr';

  constructor(private readonly demoDriversService: DemoDriversService) {
    this.driverFormValue = this.demoDriversService.createDefaultDriverFormValue();
  }

  ngOnInit(): void {
    if (this.showLocalDemoButton && this.demoDriversService.listDrivers().length === 0) {
      this.seedDrivers();
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  get driverRows(): DriverRow[] {
    return this.demoDriversService.toDriverRows(this.searchQuery);
  }

  get dailyRows(): DailyPaymentRow[] {
    return this.demoDriversService.toDailyPaymentRows(this.searchQuery);
  }

  get columns(): TableColumn[] {
    return this.activeTab === 'Daily Payment'
      ? this.dailyPaymentColumns
      : this.driverColumns;
  }

  get rows(): Array<DriverRow | DailyPaymentRow> {
    return this.activeTab === 'Daily Payment'
      ? this.dailyRows
      : this.driverRows;
  }

  get columnTemplate(): string {
    return this.activeTab === 'Daily Payment'
      ? this.dailyColumnTemplate
      : this.driverColumnTemplate;
  }

  get emptyTitle(): string {
    return 'No data available';
  }

  get emptySubtitle(): string {
    return this.activeTab === 'Daily Payment'
      ? 'No daily payment data available'
      : 'No driver data available';
  }

  get driverStatusOptions(): Array<{ label: DriverStatus; value: DriverStatus }> {
    return this.demoDriversService.getDriverStatusOptions();
  }

  openNewDriver(): void {
    this.driverFormValue = this.demoDriversService.createDefaultDriverFormValue();
    this.isNewDriverOpen = true;
  }

  closeNewDriver(): void {
    this.isNewDriverOpen = false;
  }

  seedDrivers(): void {
    this.demoDriversService.seedDrivers();
    this.setFeedback('Demo drivers loaded for assignment and payment walkthroughs.', 'success');
  }

  fillDriverDummyData(): void {
    this.driverFormValue = this.demoDriversService.createDummyDriverFormValue();
    this.setFeedback('Driver form filled with demo data.', 'success');
  }

  patchDriverForm(patch: Partial<DriverFormValue>): void {
    this.driverFormValue = {
      ...this.driverFormValue,
      ...patch
    };
  }

  patchDriverPhone(phone: PhoneValue): void {
    this.driverFormValue = {
      ...this.driverFormValue,
      phone
    };
  }

  saveDriver(): void {
    if (this.hasDriverFormErrors()) {
      this.setFeedback('Complete the driver form before saving.', 'error');
      return;
    }

    const driver = this.demoDriversService.saveDriverFromForm(this.driverFormValue);
    this.setFeedback(`${driver.name} saved to Drivers.`, 'success');
    this.closeNewDriver();
  }

  private hasDriverFormErrors(): boolean {
    const value = this.driverFormValue;
    if (!value.name.trim()) return true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) return true;
    if (!/^\d{10}$/.test(value.phone.number)) return true;
    if (!value.vehicle.trim()) return true;
    if (!value.status) return true;
    return false;
  }

  private setFeedback(
    message: string,
    tone: 'success' | 'error' | 'info'
  ): void {
    this.feedbackMessage = message;
    this.feedbackTone = tone;
  }

  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }
}
