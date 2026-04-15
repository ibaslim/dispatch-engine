import { Component, Input, Output, EventEmitter, TemplateRef } from '@angular/core';
import { TableColumn } from '../../models/table.model';
import { CommonModule } from '@angular/common';
import { ToggleButtonComponent } from '../toggle-button/toggle-button.component';
import { ButtonComponent } from '../button/button.component';
import { MenuComponent } from '../menu/menu.component';

@Component({
  selector: 'app-table',
  imports: [CommonModule, ToggleButtonComponent, ButtonComponent, MenuComponent],
  templateUrl: './table.component.html',
})
export class TableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() rows: any[] = [];
  @Input() cellTemplate?: (row: any, col: TableColumn) => TemplateRef<any> | null;
  @Input() emptyTitle = 'You currently have no orders';
  @Input() emptySubtitle = '';

  // optional custom column widths
  @Input() columnTemplate = '';
  @Input() activeMenuRow: any = null;
  @Input() menuItems: any[] = [];

  @Output() menuSelect = new EventEmitter<any>();

  // action button click
  @Output() actionClick = new EventEmitter<any>();

  onActionClick(row: any): void {
    this.actionClick.emit(row);
  }

  getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}