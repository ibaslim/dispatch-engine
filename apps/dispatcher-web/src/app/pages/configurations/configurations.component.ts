import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-configurations',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './configurations.component.html',
  styles: [`
    .configuration-tabs {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .configuration-tabs::-webkit-scrollbar {
      display: none;
    }
  `],
})
export class ConfigurationsComponent {}
