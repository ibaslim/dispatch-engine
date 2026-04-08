import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { TableColumn } from '../../models/table.model';

import { Order } from '../../models/orders/current-orders.model';
import { ScheduledOrder } from '../../models/orders/scheduled-orders.model';
import { CompletedOrder } from '../../models/orders/completed-orders.model';
import { IncompleteOrder } from '../../models/orders/incomplete-orders.model';
import { HistoryOrder } from '../../models/orders/history-orders.model';

import { NewOrderFormComponent } from '../../components/new-order-form/new-order-form.component';
import { NewOrderFormValue } from '../../models/new-order-form/new-order-form.model';
import { PopupComponent } from '../../components/popup/popup.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CommonModule,
    PageComponent,
    TableComponent,
    SearchBarComponent,
    ButtonComponent,
    PopupComponent,
    NewOrderFormComponent
  ],
  templateUrl: './orders.component.html'
})
export class OrdersComponent {
  tabs = ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History'];
  activeTab = 'Current';

  // =========================
  // New Order modal state
  // =========================
  isNewOrderOpen = false;

  newOrderValue: NewOrderFormValue = this.createDefaultNewOrder();

  openNewOrder(): void {
    // If you want a fresh form every time:
    this.newOrderValue = this.createDefaultNewOrder();
    this.isNewOrderOpen = true;
  }

  closeNewOrder(): void {
    this.isNewOrderOpen = false;
  }

  saveNewOrder(): void {
    // TODO: integrate backend API later
    // This payload includes computed values: subtotal/taxAmount/total
    console.log('Saving new order payload:', this.newOrderValue);

    this.closeNewOrder();
  }

  // Optional: hooks from address pin clicks
  onPickupPin(): void {
    console.log('Pickup pin clicked');
  }

  onDeliveryPin(): void {
    console.log('Delivery pin clicked');
  }

  private todayYYYYMMDD(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private createDefaultNewOrder(): NewOrderFormValue {
    return {
      orderNumber: '',
      pickup: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        address: '',
        pickupTime: ''
      },
      delivery: {
        name: '',
        phone: { countryCode: '+1', number: '' },
        email: '',
        address: '',
        deliveryDate: this.todayYYYYMMDD(),
        deliveryTime: ''
      },
      details: {
        itemName: '',
        itemPrice: 0,
        itemQty: 0,

        taxRate: 0,
        deliveryFees: 0,
        deliveryTips: 0,
        discount: 0,

        subtotal: 0,
        taxAmount: 0,
        total: 0,

        instructions: '',
        paymentMethod: ''
      }
    };
  }

  // =========================
  // Tabs
  // =========================
  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  // Current tab columns
  currentColumns: TableColumn[] = [
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customer', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placed', label: 'Order placed', sortable: true },
    { key: 'reqPickup', label: 'Req. Pickup Time', sortable: true },
    { key: 'reqDelivery', label: 'Req. Delivery Time', sortable: true },
    { key: 'ready', label: 'Ready for pick-up', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'tracking', label: 'Tracking', sortable: true }
  ];

  // Scheduled tab columns
  scheduledColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'Customer Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'estDeliveryTime', label: 'Est. Delivery Time', sortable: true },
    { key: 'elapsedTime', label: 'Elapsed Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true }
  ];

  completedColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'reqDeliveryTime', label: 'Req. Delivery Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'feedback', label: 'Feedback', sortable: true }
  ];

  // Incomplete columns
  incompleteColumns: TableColumn[] = [
    { key: 'select', label: '', sortable: false },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', sortable: false }
  ];

  // History columns
  historyColumns: TableColumn[] = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'orderNo', label: 'Order No.', sortable: true },
    { key: 'customerName', label: 'C. Name', sortable: true },
    { key: 'pickup', label: 'Pick-up', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'distance', label: 'Distance', sortable: true },
    { key: 'placementTime', label: 'Placement Time', sortable: true },
    { key: 'startTime', label: 'Start Time', sortable: true },
    { key: 'pickupTime', label: 'Pick up Time', sortable: true },
    { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'status', label: 'Status', sortable: true }
  ];

  // Dummy dataset (Current)
  currentOrders: Order[] = [
    {
      orderNo: 'ORD-1001',
      customer: 'John Carter',
      pickup: 'Downtown Mall',
      amount: '$18.50',
      distance: '3.2 km',
      placed: '2026-04-01 10:32 AM',
      reqPickup: '2026-04-01 10:50 AM',
      reqDelivery: '2026-04-01 11:15 AM',
      ready: 'Yes',
      driver: 'Central Courier Services',
      status: 'Assigned',
      tracking: 'Active'
    },
    {
      orderNo: 'ORD-1002',
      customer: 'Emma Watson',
      pickup: 'City Plaza',
      amount: '$24.00',
      distance: '5.6 km',
      placed: '2026-04-01 11:05 AM',
      reqPickup: '2026-04-01 11:20 AM',
      reqDelivery: '2026-04-01 11:45 AM',
      ready: 'No',
      driver: 'Ghazanfarr Rehman',
      status: 'Pending',
      tracking: 'Inactive'
    }
  ];

  // Dummy dataset (Scheduled)
  scheduledOrders: ScheduledOrder[] = [
    {
      select: false,
      orderNo: 'SCH-2001',
      customerName: 'Sarah Ahmed',
      pickup: 'City Center',
      amount: '$30.00',
      distance: '6.5 km',
      placementTime: '2026-04-02 09:00 AM',
      estDeliveryTime: '2026-04-02 10:15 AM',
      elapsedTime: '—',
      driver: 'Central Courier Services',
      status: 'Scheduled'
    },
    {
      select: false,
      orderNo: 'SCH-2002',
      customerName: 'Mark Lee',
      pickup: 'Airport Plaza',
      amount: '$42.00',
      distance: '9.2 km',
      placementTime: '2026-04-02 11:20 AM',
      estDeliveryTime: '2026-04-02 12:30 PM',
      elapsedTime: '—',
      driver: 'Ghazanfarr Rehman',
      status: 'Scheduled'
    }
  ];

  completedOrders: CompletedOrder[] = [
    {
      select: false,
      date: '2026-04-01',
      orderNo: 'CMP-3001',
      customerName: 'Michael Scott',
      pickup: 'Downtown Plaza',
      amount: '$22.50',
      distance: '4.3 km',
      placementTime: '2026-04-01 09:10 AM',
      startTime: '2026-04-01 09:25 AM',
      pickupTime: '2026-04-01 09:40 AM',
      reqDeliveryTime: '2026-04-01 10:05 AM',
      deliveryTime: '2026-04-01 10:00 AM',
      driver: 'Central Courier Services',
      feedback: 'Excellent'
    },
    {
      select: false,
      date: '2026-04-01',
      orderNo: 'CMP-3002',
      customerName: 'Pam Beesly',
      pickup: 'City Mall',
      amount: '$16.75',
      distance: '2.8 km',
      placementTime: '2026-04-01 11:30 AM',
      startTime: '2026-04-01 11:45 AM',
      pickupTime: '2026-04-01 12:00 PM',
      reqDeliveryTime: '2026-04-01 12:25 PM',
      deliveryTime: '2026-04-01 12:20 PM',
      driver: 'Ghazanfarr Rehman',
      feedback: 'Good'
    }
  ];

  // Dummy data (Incomplete)
  incompleteOrders: IncompleteOrder[] = [
    {
      select: false,
      date: '2026-03-04',
      orderNo: 'Test order 001',
      customerName: 'Central Courier Services',
      pickup: 'Central Courier Services',
      amount: 'C$11.80',
      distance: '1.79 km',
      placementTime: '12:37 p.m.',
      startTime: 'N/A',
      pickupTime: '1:14 p.m.',
      deliveryTime: '1:44 p.m.',
      driver: '--',
      status: 'Unassigned',
      actions: ''
    }
  ];

  historyOrders: HistoryOrder[] = [
    {
      date: '2026-04-02',
      orderNo: 'HIS-4001',
      customerName: 'Rachel Green',
      pickup: 'City Center',
      amount: '$19.00',
      distance: '3.9 km',
      placementTime: '2026-04-02 08:45 AM',
      startTime: '2026-04-02 09:00 AM',
      pickupTime: '2026-04-02 09:15 AM',
      deliveryTime: '2026-04-02 09:45 AM',
      driver: 'Ali Anayat',
      status: 'Completed'
    },
    {
      date: '2026-04-02',
      orderNo: 'HIS-4002',
      customerName: 'Monica Geller',
      pickup: 'West Mall',
      amount: '$27.50',
      distance: '6.2 km',
      placementTime: '2026-04-02 10:30 AM',
      startTime: '2026-04-02 10:45 AM',
      pickupTime: '2026-04-02 11:05 AM',
      deliveryTime: '2026-04-02 11:40 AM',
      driver: 'Central Courier Services',
      status: 'Completed'
    }
  ];

  // Active bindings
  get columns(): TableColumn[] {
    if (this.activeTab === 'Scheduled') return this.scheduledColumns;
    if (this.activeTab === 'Completed') return this.completedColumns;
    if (this.activeTab === 'Incomplete') return this.incompleteColumns;
    if (this.activeTab === 'History') return this.historyColumns;
    return this.currentColumns;
  }

  get rows(): any[] {
    if (this.activeTab === 'Scheduled') return this.scheduledOrders;
    if (this.activeTab === 'Completed') return this.completedOrders;
    if (this.activeTab === 'Incomplete') return this.incompleteOrders;
    if (this.activeTab === 'History') return this.historyOrders;
    return this.currentOrders;
  }

  get emptyTitle(): string {
    return 'No data available';
  }

  get emptySubtitle(): string {
    return this.activeTab === 'History'
      ? 'Use date range and filters to see history'
      : '';
  }
}