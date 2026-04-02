import { Component } from '@angular/core';
import { BannerComponent } from '../../components/banner/banner.component';
import { CommonModule } from '@angular/common';
import { PageComponent } from '../../components/page/page.component';

@Component({
  selector: 'app-reviews',
  imports: [CommonModule, PageComponent, BannerComponent],
  templateUrl: './reviews.component.html'
})
export class ReviewsComponent { }
