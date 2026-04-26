import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';

@Component({
  selector: 'app-online-order-forms',
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './online-order-forms.component.html'
})
export class OnlineOrderFormsComponent {
  sections = [
    {
      title: 'Courier order forms',
      items: [
        { name: 'Courier Short Order Form 1' },
        { name: 'Courier Short Order Form 2' },
        { name: 'Courier Detail Order Form' },
      ],
    },
    {
      title: 'Restaurant order forms',
      items: [
        { name: 'Restaurant Short Order Form' },
        { name: 'Restaurant Short Order Form 2' },
        { name: 'Restaurant Order Form (Payment on Delivery)' },
        { name: 'Restaurant Short Order Form (with pick up time)' },
      ],
    },
    {
      title: 'Food/Grocery/Business order forms',
      items: [
        { name: 'Food/Grocery Delivery Order Form' },
        { name: 'Business Delivery Order Form' },
        { name: 'Business Delivery Order Form (with Driver Tips)' },
        { name: 'Business Delivery Order Form (with Delivery Date)' },
      ],
    },
  ];
}
