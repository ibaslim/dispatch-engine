import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MenuItem {
  label: string;
  action: string;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu.component.html'
})
export class MenuComponent {
  @Input() items: MenuItem[] = [];
  @Input() visible = false;

  @Output() select = new EventEmitter<MenuItem>();

  onSelect(item: MenuItem): void {
    this.select.emit(item);
  }
}