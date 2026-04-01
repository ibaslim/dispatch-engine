import { Component, Input } from '@angular/core';
import { TableColumn } from '../../models/table.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table',
  imports: [CommonModule],
  templateUrl: './table.component.html',
})
export class TableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() rows: any[] = [];

  @Input() emptyTitle = 'You currently have no orders';
  @Input() emptySubtitle = '';

  // optional custom column widths
  @Input() columnTemplate = '';

  getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}