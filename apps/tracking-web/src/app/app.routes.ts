import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 't/:token',
    loadComponent: () =>
      import('./pages/tracking/tracking.component').then(
        (m) => m.TrackingComponent
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then(
        (m) => m.NotFoundComponent
      ),
  },
];
