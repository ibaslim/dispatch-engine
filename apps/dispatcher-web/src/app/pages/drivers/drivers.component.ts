import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { TableColumn } from '../../models/table.model';
import { DriverRow } from '../../models/drivers/drivers-list.model';
import { DailyPaymentRow } from '../../models/drivers/daily-payment.model';

@Component({
  selector: 'app-drivers',
  imports: [CommonModule, PageComponent, TableComponent, SearchBarComponent, ButtonComponent],
  templateUrl: './drivers.component.html'
})
export class DriversComponent {
  tabs = ['Driver List', 'Daily Payment'];
  activeTab = 'Driver List';

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  // Driver List columns
  driverColumns: TableColumn[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'rating', label: 'Rating', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'vehicle', label: 'Vehicle', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', sortable: false },
  ];

  // Daily Payment columns
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

  // templates
  driverColumnTemplate = '2fr 1fr 1fr 2fr 1fr 1fr 40px';
  dailyColumnTemplate = '2fr 1fr 1.5fr 1fr 1fr 1fr 1fr 1fr';

  // Driver List rows
  driverRows: DriverRow[] = [
    {
      name: 'Central Courier Services',
      rating: 'N/A',
      phone: '+17807520248',
      email: 'dispatch@centralcourier.ca',
      vehicle: '—',
      status: 'Off Duty',
      actions: ''
    },
    {
      name: 'Ghazanfarr Rehman',
      rating: 'N/A',
      phone: '+17802456176',
      email: 'ghrehman@gmail.com',
      vehicle: '—',
      status: 'Off Duty',
      actions: ''
    },
    {
      name: 'Ali Anayat',
      rating: 'N/A',
      phone: '+18255225808',
      email: 'anayat.wip@gmail.com',
      vehicle: '—',
      status: 'Off Duty',
      actions: ''
    }
  ];

  // Daily Payment rows
  dailyRows: DailyPaymentRow[] = [
    {
      name: 'Central Courier Services',
      phone: '+17807520248',
      completed: '0',
      basePay: 'N/A',
      tips: 'N/A',
      shiftEarning: 'N/A',
      adjustments: '0',
      paymentDue: 'N/A'
    },
    {
      name: 'Ghazanfarr Rehman',
      phone: '+17802456176',
      completed: '0',
      basePay: 'N/A',
      tips: 'N/A',
      shiftEarning: 'N/A',
      adjustments: '0',
      paymentDue: 'N/A'
    },
    {
      name: 'Ali Anayat',
      phone: '+18255225808',
      completed: '0',
      basePay: 'N/A',
      tips: 'N/A',
      shiftEarning: 'N/A',
      adjustments: '0',
      paymentDue: 'N/A'
    }
  ];

  get columns(): TableColumn[] {
    return this.activeTab === 'Daily Payment'
      ? this.dailyPaymentColumns
      : this.driverColumns;
  }

  get rows(): any[] {
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
}