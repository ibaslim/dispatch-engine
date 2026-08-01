import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import Pusher, { Channel, ChannelAuthorizationHandler } from 'pusher-js';
import { Subject, firstValueFrom } from 'rxjs';


export const ORDER_REALTIME_EVENTS = [
  'order-created',
  'order-updated',
  'order-deleted',
  'order-status-changed',
  'order-activity-changed',
  'order-ready-changed',
  'order-driver-changed',
  'order-published',
  'order-accepted',
  'order-incident-reported',
  'order-pod-updated',
] as const;

export type OrderRealtimeEventName = typeof ORDER_REALTIME_EVENTS[number];

export interface OrderRealtimeEvent {
  event_id: string;
  event: OrderRealtimeEventName;
  order_id: string;
  actor_user_id: string;
  occurred_at: string;
  order_number?: string;
  driver_id?: string | null;
  driver_name?: string | null;
  status?: string;
  activity_status?: string;
  ready_for_pickup?: boolean;
  changed_fields?: string[];
  stage?: string;
  reason?: string;
  kind?: string;
}

interface PublicRealtimeConfig {
  pusher_enabled: boolean;
  pusher_key: string;
  pusher_cluster: string;
}

interface ChannelAuthorizationResponse {
  auth: string;
  channel_data?: string;
  shared_secret?: string;
}

type ConnectionState = 'disabled' | 'connecting' | 'connected' | 'unavailable' | 'disconnected';

interface RealtimeIdentity {
  id: string;
  is_platform_admin: boolean;
  tenant_id: string | null;
  tenant_role: string | null;
}

export function pusherChannelsFor(user: Omit<RealtimeIdentity, 'id'>): string[] {
  if (user.is_platform_admin) {
    return ['private-platform'];
  }

  const channels: string[] = [];
  if (user.tenant_id) {
    channels.push(`private-tenant-${user.tenant_id}`);
  }
  if (user.tenant_role === 'driver') {
    channels.push('private-drivers');
  }
  return channels;
}

@Injectable({ providedIn: 'root' })
export class PusherService {
  private readonly http = inject(HttpClient);
  private readonly eventsSubject = new Subject<OrderRealtimeEvent>();
  private readonly seenEventIds = new Set<string>();

  readonly orderEvents$ = this.eventsSubject.asObservable();
  readonly connectionState = signal<ConnectionState>('disconnected');

  private pusher: Pusher | null = null;
  private channels: Channel[] = [];
  private connectedIdentity: string | null = null;
  private connectingIdentity: string | null = null;
  private connectionGeneration = 0;

  async connect(user: RealtimeIdentity): Promise<void> {
    const identity = `${user.id}:${user.tenant_id ?? 'platform'}:${user.tenant_role ?? ''}`;
    if (identity === this.connectedIdentity || identity === this.connectingIdentity) {
      return;
    }

    this.disconnect();
    const generation = this.connectionGeneration;
    this.connectingIdentity = identity;
    this.connectionState.set('connecting');

    try {
      const config = await firstValueFrom(
        this.http.get<PublicRealtimeConfig>('/api/v1/public/config')
      );

      if (generation !== this.connectionGeneration) return;

      if (!config.pusher_enabled || !config.pusher_key || !config.pusher_cluster) {
        this.connectionState.set('disabled');
        return;
      }

      const channelAuthorizer: ChannelAuthorizationHandler = (params, callback) => {
        const body = new HttpParams()
          .set('socket_id', params.socketId)
          .set('channel_name', params.channelName);

        this.http.post<ChannelAuthorizationResponse>('/api/v1/pusher/auth', body).subscribe({
          next: (response) => callback(null, response),
          error: (error: HttpErrorResponse) => {
            callback(new Error(error.error?.detail || 'Pusher channel authorization failed.'), null);
          },
        });
      };

      this.pusher = new Pusher(config.pusher_key, {
        cluster: config.pusher_cluster,
        forceTLS: true,
        channelAuthorization: { customHandler: channelAuthorizer },
      });

      this.pusher.connection.bind('connected', () => this.connectionState.set('connected'));
      this.pusher.connection.bind('unavailable', () => this.connectionState.set('unavailable'));
      this.pusher.connection.bind('disconnected', () => this.connectionState.set('disconnected'));
      this.pusher.connection.bind('error', (error: unknown) => {
        console.error('[Pusher] Connection error', error);
      });

      const channelNames = pusherChannelsFor(user);
      this.channels = channelNames.map((channelName) => this.subscribe(channelName));
      this.connectedIdentity = identity;
    } catch (error) {
      if (generation !== this.connectionGeneration) return;
      this.connectionState.set('unavailable');
      console.error('[Pusher] Initialization failed', error);
      this.pusher?.disconnect();
      this.pusher = null;
    } finally {
      if (generation === this.connectionGeneration) {
        this.connectingIdentity = null;
      }
    }
  }

  disconnect(): void {
    this.connectionGeneration++;
    for (const channel of this.channels) {
      channel.unbind_all();
    }
    this.channels = [];
    this.pusher?.disconnect();
    this.pusher = null;
    this.connectedIdentity = null;
    this.connectingIdentity = null;
    this.seenEventIds.clear();
    this.connectionState.set('disconnected');
  }

  private subscribe(channelName: string): Channel {
    const channel = this.pusher!.subscribe(channelName);
    for (const eventName of ORDER_REALTIME_EVENTS) {
      channel.bind(eventName, (data: unknown) => this.receive(eventName, data));
    }
    channel.bind('pusher:subscription_error', (error: unknown) => {
      console.error(`[Pusher] Subscription failed for ${channelName}`, error);
    });
    return channel;
  }

  private receive(eventName: OrderRealtimeEventName, data: unknown): void {
    if (!this.isEventPayload(data)) {
      console.warn(`[Pusher] Ignored malformed ${eventName} event.`);
      return;
    }

    if (this.seenEventIds.has(data.event_id)) {
      return;
    }
    this.seenEventIds.add(data.event_id);
    window.setTimeout(() => this.seenEventIds.delete(data.event_id), 60_000);

    this.eventsSubject.next({
      ...data,
      event: eventName,
    } as OrderRealtimeEvent);
  }

  private isEventPayload(value: unknown): value is Record<string, unknown> & {
    event_id: string;
    order_id: string;
    actor_user_id: string;
    occurred_at: string;
  } {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    return (
      typeof payload['event_id'] === 'string' &&
      typeof payload['order_id'] === 'string' &&
      typeof payload['actor_user_id'] === 'string' &&
      typeof payload['occurred_at'] === 'string'
    );
  }
}
