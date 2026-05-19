import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ToastService } from '../toast/toast.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const onboarding = inject(OnboardingService);
  const router = inject(Router);
  const toast = inject(ToastService);

  // Check access token first
  if (!auth.getAccessToken()) {
    return router.createUrlTree(['/login']);
  }

  // Load user if not already loaded
  if (!auth.isLoggedIn()) {
    await auth.loadCurrentUser();

    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/login']);
    }
  }

  const currentUser = auth.currentUser();

  if (!currentUser) {
    return router.createUrlTree(['/login']);
  }

  // Skip onboarding checks for platform admin
  if (!currentUser.is_platform_admin) {
    const application = await onboarding.loadMyApplication();

    const tenantRole = (
      application?.role ||
      currentUser.roles.find(
        (role) =>
          role === 'vendor' ||
          role === 'driver' ||
          role === 'individual'
      )
    )?.toLowerCase();

    const isOnboardingRoute =
      state.url.startsWith('/onboarding');

    const allowedTenantRoutes = [
      '/orders',
      '/map',
      '/onboarding',
      '/login'
    ];

    const isAllowedTenantRoute =
      allowedTenantRoutes.some((route) =>
        state.url.startsWith(route)
      );

    if (!isAllowedTenantRoute) {
      toast.error('Please complete your setup first.');
      return router.createUrlTree(['/orders']);
    }

    if (
      application?.status === 'pending' &&
      !state.url.startsWith('/onboarding/pending')
    ) {
      toast.error(
        'Your account is in pending approval state'
      );
      return router.createUrlTree([
        '/onboarding/pending'
      ]);
    }

    if (
      tenantRole &&
      (
        !application ||
        application.status === 'rejected' ||
        application.status === 'pre_pending'
      ) &&
      !isOnboardingRoute
    ) {
      toast.error('Please complete your setup first.');
      return router.createUrlTree([
        `/onboarding/${tenantRole}`
      ]);
    }
  }

  return true;
};