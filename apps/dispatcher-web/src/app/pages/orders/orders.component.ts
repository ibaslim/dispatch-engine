import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { TableColumn } from '../../models/table.model';

@Component({
  selector: 'app-orders',
  imports: [CommonModule, PageComponent, TableComponent, SearchBarComponent, ButtonComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent {
  tabs = ['Current', 'Scheduled', 'Completed', 'Incomplete', 'History'];
  activeTab = 'Current';

  columns: TableColumn[] = [
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

  rows: any[] = [];
}
