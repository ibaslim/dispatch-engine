import { Component, Input, Output, EventEmitter, TemplateRef, HostListener } from '@angular/core';
import { TableColumn } from '../../models/table.model';
import { CommonModule } from '@angular/common';
import { ToggleButtonComponent } from '../toggle-button/toggle-button.component';
import { ButtonComponent } from '../button/button.component';
import { MenuComponent } from '../menu/menu.component';

@Component({
  selector: 'app-table',
  standalone: true,
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
  @Input() actionIcon: 'dots' | 'eye' = 'dots';
  @Input() actionLabel = 'Row actions';

  @Output() menuSelect = new EventEmitter<any>();

  // action button click
  @Output() actionClick = new EventEmitter<any>();
  @Output() assignClick = new EventEmitter<any>();

  @Output() readyForPickupChange = new EventEmitter<{ id: string; value: boolean }>();
  @Output() activityStatusAction = new EventEmitter<{ id: string; next: string; type: string }>();
  @Output() directionsClick = new EventEmitter<any>();
  @Output() reportIncidentClick = new EventEmitter<any>();

  onActionClick(row: any, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent bubbling
    this.actionClick.emit(row);
  }

  onAssignClick(row: any, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent bubbling
    this.assignClick.emit(row);
  }

  onActivityStatusClick(row: any, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent bubbling
    if (!row.activityStatusNext) return;
    this.activityStatusAction.emit({
      id: row.id,
      next: row.activityStatusNext,
      type: row.activityStatusActionType || 'direct'
    });
  }

  onDirectionsIconClick(row: any, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent bubbling
    this.directionsClick.emit(row);
  }

  onReportIncidentClick(row: any, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent bubbling
    this.reportIncidentClick.emit(row);
  }

  getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  getStatusBadgeClasses(status: string): string {
    if (!status) return 'bg-gray-100 text-gray-700 dark:bg-[#2a2d2a] dark:text-gray-300';
    const normalized = status.toLowerCase();
    if (normalized.includes('approved') || normalized.includes('active')) {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
    if (normalized.includes('pending')) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    }
    if (normalized.includes('invited')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    if (normalized.includes('rejected') || normalized.includes('suspended') || normalized.includes('failed')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-gray-100 text-gray-700 dark:bg-[#2a2d2a] dark:text-gray-300';
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Only close menu if clicking outside menu and outside action buttons
    const clickedInsideMenu = target.closest('app-menu');
    const clickedInsideActionButton = target.closest('.row-action-button');

    if (clickedInsideMenu || clickedInsideActionButton) return;

    // Otherwise close menu
    this.activeMenuRow = null;
  }
}
