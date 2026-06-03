import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  OnboardingApplicationCreateRequest,
  OnboardingApplicationResponse,
  OnboardingApplicationReviewRequest,
  OnboardingStatus,
} from '@dispatch/shared/contracts';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);

  private readonly _myApplication = signal<OnboardingApplicationResponse | null>(null);
  readonly myApplication = this._myApplication.asReadonly();

  async loadMyApplication(): Promise<OnboardingApplicationResponse | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<OnboardingApplicationResponse | null>('/api/v1/onboarding/applications/me')
      );
      this._myApplication.set(res);
      return res;
    } catch {
      this._myApplication.set(null);
      return null;
    }
  }

  async submitApplication(
    req: OnboardingApplicationCreateRequest
  ): Promise<OnboardingApplicationResponse> {
    const res = await firstValueFrom(
      this.http.post<OnboardingApplicationResponse>('/api/v1/onboarding/applications', req)
    );
    this._myApplication.set(res);
    return res;
  }

  async uploadDocument(applicationId: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    await firstValueFrom(
      this.http.post<void>(`/api/v1/onboarding/applications/${applicationId}/document`, formData)
    );
  }

  async listApplications(status?: OnboardingStatus): Promise<OnboardingApplicationResponse[]> {
    const url = status
      ? `/api/v1/onboarding/applications?status=${encodeURIComponent(status)}`
      : '/api/v1/onboarding/applications';
    return await firstValueFrom(
      this.http.get<OnboardingApplicationResponse[]>(url)
    );
  }

  async approveApplication(id: string): Promise<OnboardingApplicationResponse> {
    return await firstValueFrom(
      this.http.post<OnboardingApplicationResponse>(
        `/api/v1/onboarding/applications/${id}/approve`,
        {}
      )
    );
  }

  async rejectApplication(
    id: string,
    req: OnboardingApplicationReviewRequest
  ): Promise<OnboardingApplicationResponse> {
    return await firstValueFrom(
      this.http.post<OnboardingApplicationResponse>(
        `/api/v1/onboarding/applications/${id}/reject`,
        req
      )
    );
  }
}
