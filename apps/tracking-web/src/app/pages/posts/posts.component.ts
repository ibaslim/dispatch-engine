import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { PostResponse } from '@dispatch/shared/contracts';

@Component({
  selector: 'app-public-posts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm">
        <div class="max-w-3xl mx-auto px-4 py-4">
          <h1 class="text-xl font-semibold text-gray-900">Dispatch Updates</h1>
          <p class="text-sm text-gray-500 mt-1">Public posts endpoint demo.</p>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 py-6">
        @if (isLoading()) {
          <div class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        } @else if (errorMessage()) {
          <div class="rounded-lg bg-red-50 p-4 text-red-800">{{ errorMessage() }}</div>
        } @else {
          <div class="space-y-4">
            @for (post of posts(); track post.id) {
              <article class="bg-white rounded-lg shadow-sm p-5">
                <h2 class="text-lg font-semibold text-gray-900">{{ post.title }}</h2>
                <p class="text-sm text-gray-500 mt-1">{{ post.created_at | date:'medium' }}</p>
                <p class="mt-3 text-sm font-medium text-gray-700">{{ post.summary }}</p>
                <p class="mt-2 text-gray-600 leading-relaxed">{{ post.content }}</p>
              </article>
            }
          </div>
        }
      </main>
    </div>
  `,
})
export class PostsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly posts = signal<PostResponse[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadPosts();
  }

  private async loadPosts(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<PostResponse[]>('/api/v1/posts?limit=20')
      );
      this.posts.set(data);
    } catch {
      this.errorMessage.set('Unable to load posts right now.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
