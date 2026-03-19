import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PostsComponent } from './posts.component';

describe('PostsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads posts from API and renders title/summary text', async () => {
    const fixture = TestBed.createComponent(PostsComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/posts?limit=20');
    expect(req.request.method).toBe('GET');

    req.flush([
      {
        id: '8e9d91f2-8fd8-469e-90f6-73ad7ca17bb1',
        title: 'Sample Post',
        summary: 'Summary text',
        content: 'Detailed body',
        is_published: true,
        created_at: '2026-03-19T10:00:00Z',
      },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sample Post');
    expect(text).toContain('Summary text');
  });
});
