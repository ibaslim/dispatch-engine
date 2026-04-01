import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { TableComponent } from '../../components/table/table.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { ButtonComponent } from '../../components/button/button.component';
import { TableColumn } from '../../models/table.model';

@Component({
  selector: 'app-drivers',
  imports: [CommonModule, PageComponent, TableComponent, SearchBarComponent, ButtonComponent],
  templateUrl: './drivers.component.html',
  styleUrl: './drivers.component.css'
})
export class DriversComponent {
  tabs = ['Driver List', 'Daily Payment'];
  activeTab = 'Driver List';

  columns: TableColumn[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'rating', label: 'Rating', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'vehicle', label: 'Vehicle', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', sortable: false },
  ];

  // match screenshot proportions
  columnTemplate = '220px 120px 140px 220px 120px 120px 40px';

  rows = [
    {
      name: 'Central Courier Services',
      rating: 'N/A',
      phone: '+17807520248',
      email: 'dispatch@centralcourier.ca',
      vehicle: '—',
      status: 'Off Duty',
      actions: '...'
    },
    {
      name: 'Ghazanfarr Rehman',
      rating: 'N/A',
      phone: '+17802456176',
      email: 'ghrehman@gmail.com',
      vehicle: '—',
      status: 'Off Duty',
      actions: '...'
    },
    {
      name: 'Ali Anayat',
      rating: 'N/A',
      phone: '+18255225808',
      email: 'anayat.wip@gmail.com',
      vehicle: '—',
      status: 'Off Duty',
      actions: '...'
    }
  ];
}