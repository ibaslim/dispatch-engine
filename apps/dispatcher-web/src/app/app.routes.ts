import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/orders',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'invite/accept',
    loadComponent: () =>
      import('./pages/invite-accept/invite-accept.component').then(
        (m) => m.InviteAcceptComponent
      ),
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/orders/orders.component').then(
        (m) => m.OrdersComponent
      ),
  },
  {
    path: 'dispatch',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dispatch/dispatch.component').then(
        (m) => m.DispatchComponent
      ),
  },
  {
    path: 'drivers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/drivers/drivers.component').then(
        (m) => m.DriversComponent
      ),
  },
  {
    path: 'reviews',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/reviews/reviews.component').then(
        (m) => m.ReviewsComponent
      ),
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/reports/reports.component').then(
        (m) => m.ReportsComponent
      ),
  },
  {
    path: 'my-account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/my-account/my-account.component').then(
        (m) => m.MyAccountComponent
      ),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/setting/setting.component').then(
        (m) => m.SettingComponent
      ),
  },
  {
    path: '**',
    redirectTo: '/orders',
  },
];