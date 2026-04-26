import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-account-card-section',
  imports: [],
  templateUrl: './account-card-section.component.html'
})
export class AccountCardSectionComponent {
  @Input() extraClasses = '';
}
