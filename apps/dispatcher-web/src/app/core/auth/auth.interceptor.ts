import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, from, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getAccessToken();
  const isAuthSessionRequest =
    req.url.includes('/api/v1/auth/login') ||
    req.url.includes('/api/v1/auth/refresh') ||
    req.url.includes('/api/v1/auth/logout');

  const cloned = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(cloned).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        if (auth.currentUser()?.tenant_is_active === false) {
          router.navigate(['/suspended']);
          return throwError(() => err);
        }

        if (isAuthSessionRequest) {
          auth.clearTokens();
          router.navigate(['/login']);
          return throwError(() => err);
        }

        return from(auth.refreshAccessToken()).pipe(
          switchMap(() => {
            const refreshedToken = auth.getAccessToken();
            const retryReq = refreshedToken
              ? req.clone({ setHeaders: { Authorization: `Bearer ${refreshedToken}` } })
              : req;

            return next(retryReq);
          }),
          catchError((refreshErr) => {
            auth.clearTokens();
            router.navigate(['/login']);
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
