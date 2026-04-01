import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';

@Component({
  selector: 'app-dispatch',
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './dispatch.component.html',
  styleUrl: './dispatch.component.css'
})
export class DispatchComponent {}
