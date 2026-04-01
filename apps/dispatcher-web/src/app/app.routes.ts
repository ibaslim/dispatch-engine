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
    path: 'platform-admin',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/platform-admin/platform-admin.component').then(
        (m) => m.PlatformAdminComponent
      ),
  },
  {
    path: 'posts',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/posts/posts.component').then((m) => m.PostsComponent),
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
    path: '**',
    redirectTo: '/orders',
  },
];