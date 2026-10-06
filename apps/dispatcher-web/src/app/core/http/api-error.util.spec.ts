import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from './api-error.util';

describe('apiErrorMessage', () => {
  it("returns the API's message", () => {
    const error = new HttpErrorResponse({ status: 422, error: { detail: 'No price is set.' } });
    expect(apiErrorMessage(error, 'Failed.')).toBe('No price is set.');
  });

  it('returns the fallback when the API gave no message', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500, error: '' }), 'Failed.')).toBe('Failed.');
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500, error: null }), 'Failed.')).toBe('Failed.');
  });

  it('returns the fallback for a message that is not text', () => {
    const error = new HttpErrorResponse({ status: 422, error: { detail: [{ msg: 'bad' }] } });
    expect(apiErrorMessage(error, 'Failed.')).toBe('Failed.');
  });

  it('returns the fallback for anything that is not an HTTP error', () => {
    expect(apiErrorMessage(new Error('boom'), 'Failed.')).toBe('Failed.');
    expect(apiErrorMessage(undefined, 'Failed.')).toBe('Failed.');
  });
});
