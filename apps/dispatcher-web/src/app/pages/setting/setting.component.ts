import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';

@Component({
  selector: 'app-setting',
  imports: [CommonModule, PageComponent],
  templateUrl: './setting.component.html'
})
export class SettingComponent {
  activeItem = 'business';

  navItems = [
    { key: 'business', label: 'Business settings', icon: 'ph-storefront' },
    { key: 'brand', label: 'Brand customization', icon: 'ph-palette' },
    { key: 'tracking', label: 'Tracking Page Promotions', icon: 'ph-megaphone', badge: 'New' },
    { key: 'dispatch', label: 'Dispatch settings', icon: 'ph-headset' },
    { key: 'driver', label: 'Driver settings', icon: 'ph-steering-wheel' },
    { key: 'customer', label: 'Customer notification', icon: 'ph-bell' },
    { key: 'route', label: 'Route planning', icon: 'ph-map-pin' },
    { key: 'connect', label: 'Shipday connect', icon: 'ph-plugs', badge: 'New' },
    { key: 'users', label: 'Users', icon: 'ph-users' },
    { key: 'location', label: 'Location', icon: 'ph-globe' },
    { key: 'agentflow', label: 'Shipday AgentFlow', icon: 'ph-gear', badge: 'New' },
  ];
}
