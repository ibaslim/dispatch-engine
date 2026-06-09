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
    path: 'pending-approval',
    loadComponent: () =>
      import('./pages/pending-approval/pending-approval.component').then(
        (m) => m.PendingApprovalComponent
      ),
  },
  {
    path: 'onboarding/driver',
    loadComponent: () =>
      import('./pages/driver_onboarding/driver.onboarding.component').then(
        (m) => m.DriverOnboardingComponent
      ),
  },
  {
    path: 'onboarding/pending',
    loadComponent: () =>
      import('./pages/onboarding-pending/onboarding-pending.component').then(
        (m) => m.OnboardingPendingComponent
      ),
  },
  {
    path: 'onboarding/vendor',
    loadComponent: () =>
      import('./pages/vendor_onboarding/vendor.onboarding.component').then(
        (m) => m.VendorOnboardingComponent
      ),
  },
  {
    path: 'onboarding/individual',
    loadComponent: () =>
      import('./pages/individual_onboarding/individual.onboarding.component').then(
        (m) => m.IndividualOnboardingComponent
      ),
  },
  {
    path: 'suspended',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/suspended/suspended.component').then(
        (m) => m.SuspendedComponent
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
    path: 'tenants',
    redirectTo: '/configurations/tenants',
    pathMatch: 'full',
  },
  {
    path: 'configurations',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/configurations/configurations.component').then(
        (m) => m.ConfigurationsComponent
      ),
    children: [
      {
        path: '',
        redirectTo: 'pricing',
        pathMatch: 'full',
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./pages/configurations/pricing/pricing.component').then(
            (m) => m.PricingComponent
          ),
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./components/tenant-management/tenant-management.component').then(
            (m) => m.TenantManagementComponent
          ),
      },
    ],
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
    path: 'online-order-forms',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/online-order-forms/online-order-forms.component').then(
        (m) => m.OnlineOrderFormsComponent
      ),
  },
  {
    path: 'map',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/map/map.component').then(
        (m) => m.MapComponent
      ),
  },
  {
    path: '**',
    redirectTo: '/orders',
  },
];
