import { CommonModule } from '@angular/common';
import { Component, effect, EffectRef, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, startWith, Subject, takeUntil } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { PusherService } from './core/realtime/pusher.service';
import { RealtimeNotificationsService } from './core/realtime/realtime-notifications.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ToastContainerComponent],
  template: `
    <app-navbar *ngIf="auth.currentUser() && !hideNavbar"></app-navbar>
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly pusher = inject(PusherService);
  private readonly realtimeNotifications = inject(RealtimeNotificationsService);
  private readonly destroy$ = new Subject<void>();
  private readonly realtimeEffect: EffectRef = effect(() => {
    const user = this.auth.currentUser();
    if (user) {
      void this.pusher.connect(user);
    } else {
      this.pusher.disconnect();
    }
  });

  hideNavbar = false;

  ngOnInit(): void {
    this.realtimeNotifications.start();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const activeRoute = this.getDeepestRoute(this.route);
        this.hideNavbar = activeRoute.snapshot.data?.['hideNavbar'] === true;
      });
  }

  ngOnDestroy(): void {
    this.realtimeEffect.destroy();
    this.realtimeNotifications.stop();
    this.pusher.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let current = route;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }
}
