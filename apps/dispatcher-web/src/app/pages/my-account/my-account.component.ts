import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ButtonComponent } from '../../components/button/button.component';
import { PageComponent } from '../../components/page/page.component';
import { BillingInfo, ProfileInfo } from '../../models/my-account/my-account.model';
import { UsageRow } from '../../models/my-account/billing.model';
import { AccountCardSectionComponent } from '../../components/account-card-section/account-card-section.component';
import { AccountInfoRowComponent } from '../../components/account-info-row/account-info-row.component';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [CommonModule, ButtonComponent, PageComponent, AccountCardSectionComponent, AccountInfoRowComponent],
  templateUrl: './my-account.component.html',
})
export class MyAccountComponent {
  accountTabs = ['Account', 'Billing & Usage'];
  activeTab = 'Account';

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  showApiKey = false;

  profile: ProfileInfo = {
    ownerName: 'Central Courier Services',
    phone: '+1 780 752 0248',
    email: 'dispatch@centralcourier.ca',
    apiKey: 'sk_live_51N2d4f9K8Z9xQp3',
    password: '********',
  };

  billing: BillingInfo = {
    companyName: 'Central Courier Services',
    email: 'dispatch@centralcourier.ca',
    address: 'Edmonton, AB, Canada',
    contactName: 'Cameron Lee',
    contactPhone: '+1 780 555 0199',
  };

  usageRows: UsageRow[] = [
    {
      month: 'Current',
      billedOrders: 0,
      plan: 'Starter',
      cost: '0.00',
      invoice: '',
      report: '',
    },
    {
      month: 'Mar - 2026',
      billedOrders: 0,
      plan: 'Starter',
      cost: '0.00',
      invoice: '⬇',
      report: '',
    },
  ];
}