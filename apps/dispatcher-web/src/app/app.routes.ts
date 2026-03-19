import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
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
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
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
    path: '**',
    redirectTo: '/dashboard',
  },
];
