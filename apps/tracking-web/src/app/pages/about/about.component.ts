import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Differentiator {
  title: string;
  icon: 'tag' | 'pin' | 'clock' | 'coin' | 'check';
}

interface Service {
  title: string;
  description: string;
}

interface TeamMember {
  name: string;
  role: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
})
export class AboutComponent {
  readonly differentiators: Differentiator[] = [
    { title: 'Transparent pricing structure', icon: 'tag' },
    { title: 'Real-time package tracking', icon: 'pin' },
    { title: 'Round-the-clock online support', icon: 'clock' },
    { title: 'Affordable rates', icon: 'coin' },
    { title: 'Punctual deliveries', icon: 'check' },
  ];

  readonly services: Service[] = [
    {
      title: 'Messenger',
      description: 'Documents and packages, hand-delivered across Edmonton.',
    },
    {
      title: 'Scheduled Delivery',
      description: 'Plan ahead — we build your delivery into the route.',
    },
    {
      title: 'Same-Day Courier',
      description: 'Urgent shipments picked up and delivered the same day.',
    },
    {
      title: 'Warehousing',
      description: 'Secure storage between stops, whenever you need it.',
    },
  ];

  readonly team: TeamMember[] = [
    { name: 'Rey Ghrehman', role: 'CEO & Founder' },
    { name: 'Boris Jonson', role: 'CTO' },
    { name: 'Markel William', role: 'Project Manager' },
  ];

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('');
  }
}