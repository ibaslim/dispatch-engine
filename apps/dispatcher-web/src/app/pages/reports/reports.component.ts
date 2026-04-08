import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { CardComponent } from '../../components/card/card.component';

@Component({
  selector: 'app-reports',
  imports: [CommonModule, PageComponent, CardComponent],
  templateUrl: './reports.component.html'
})
export class ReportsComponent {
  cards = [
    { title: 'Sales', description: 'Key sales metrics revealing customer consumption patterns and preferences.', icon: 'ph-receipt' },
    { title: 'Drivers', description: 'Driver hours, payment and performance analysis for operational efficiency.', icon: 'ph-car' },
    { title: 'Performance', description: 'Key operational metrics revealing delivery efficiency.', icon: 'ph-chart-line-up'},
    { title: 'Extended', description: 'Comprehensive overview providing detailed insights into all order-related metrics.', icon: 'ph-infinity' },
    { title: 'Analytics', description: 'Time-based performance with charts for comprehensive insights into trends.', icon: 'ph-chart-bar' },
    { title: 'Heatmap', description: 'Spatial order distribution on a map for quick trend visualization.', icon: 'ph-map-trifold' },
    { title: 'Connect', description: 'Insights into connect delivery operations and essential key metrics.', icon: 'ph-link' },
    { title: 'Third party delivery services', description: 'Insights into third-party delivery operations and essential key metrics.', icon: 'ph-plugs' },
    { title: 'Refund', description: 'Insights into refund request and other associated information.', icon: 'ph-currency-circle-dollar' },
    { title: 'Customers', description: 'Insights into the customers, their order counts, spendings, and more.', icon: 'ph-user' },
  ];
}
