import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';

@Component({
  selector: 'app-dispatch',
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './dispatch.component.html'
})
export class DispatchComponent {
  assignedDrivers = [
    {
      name: 'Alex Morgan',
      status: 'Online',
      orders: [
        { id: '#A-1024', pickup: 'Central Grill', dropoff: 'Downtown Plaza', time: '12:40 PM' },
        { id: '#A-1027', pickup: 'Urban Café', dropoff: 'River Park', time: '01:10 PM' },
      ],
    },
    {
      name: 'Sara Khan',
      status: 'On Delivery',
      orders: [
        { id: '#B-1102', pickup: 'Fresh Mart', dropoff: 'Oak Street', time: '12:55 PM' },
      ],
    },
  ];

  selectedOrder = {
    id: '#A-1024',
    pickup: {
      name: 'Central Grill',
      phone: '+1 (415) 222‑0198',
      address: '104 Market St, San Francisco',
      time: '12:40 PM'
    },
    delivery: {
      name: 'Emma Watson',
      phone: '+1 (415) 888‑4410',
      address: '88 Mission St, San Francisco',
      date: '04/02/2026',
      time: '01:05 PM'
    },
    items: [
      { name: 'Burger Combo', price: 12.5, qty: 1 },
      { name: 'Veggie Wrap', price: 9.75, qty: 2 },
    ],
    taxRate: 8,
    deliveryFee: 3.5,
    tip: 2,
    discount: 1.5,
    payment: 'Card',
    instructions: 'Leave at front desk.'
  };

  newOrders = [
    { id: '#N-2041', pickup: 'Golden Sushi', dropoff: 'Pine Street', eta: '25 mins', total: '$26.40' },
    { id: '#N-2042', pickup: 'Bistro 27', dropoff: 'Mission Bay', eta: '30 mins', total: '$18.90' },
    { id: '#N-2043', pickup: 'Coffee Hub', dropoff: 'Folsom Ave', eta: '18 mins', total: '$12.20' },
  ];
}