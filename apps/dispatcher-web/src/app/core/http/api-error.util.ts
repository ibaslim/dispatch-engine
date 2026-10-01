import { HttpErrorResponse } from '@angular/common/http';

/** The API's own message for a failed request, or the fallback when it gave none. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
    return error.error.detail;
  }
  return fallback;
}
