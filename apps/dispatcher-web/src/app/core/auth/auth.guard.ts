import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, _state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.getAccessToken()) {
    return router.createUrlTree(['/login']);
  }

  if (!auth.isLoggedIn()) {
    await auth.loadCurrentUser();
    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/login']);
    }
  }

  return true;
};
