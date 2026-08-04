/**
 * Pusher Channels transport for the driver app.
 *
 * This is the React Native counterpart of the dispatcher's
 * `apps/dispatcher-web/src/app/core/realtime/pusher.service.ts`. The wire
 * contract (channel names, event names, payload envelope) is shared with it and
 * with the API's `pusher_service.py` — keep the three in step.
 *
 * Two things differ from the web client, both deliberate:
 *
 * 1. **Channels are subscribed independently.** `private-tenant-<id>` carries
 *    updates for jobs this driver already holds and stays up for the whole
 *    session; `private-drivers` carries the new-order broadcast and is attached
 *    only while the driver is online. A driver going off shift must stop being
 *    offered work without going deaf to the jobs they are already carrying.
 *
 * 2. **Events are signals, never data.** `publish_order` deliberately sends no
 *    address or payout over Pusher, so every handler re-reads the authorized
 *    REST endpoint. That also makes gaps self-healing: whatever was missed
 *    while disconnected is picked up by the refetch on reconnect.
 */
import Pusher, { type Channel, type ChannelAuthorizationHandler } from 'pusher-js';

import { fetchPublic, uploadWithAuth } from '@services/api';

/**
 * pusher-js ships three bundles with inconsistent CommonJS exports: web and
 * node assign the class to `module.exports`, but the React Native build — the
 * one Metro picks, via the package's `react-native` field — ends with
 * `module.exports.Pusher = …`. Its typings declare only a default export, so
 * TypeScript is happy while the default import resolves to the module object
 * at runtime and `new Pusher(...)` throws "constructor is not callable".
 *
 * Unwrap the named export when it's there, so this works on every bundle.
 */
const PusherClient = ((Pusher as unknown as { Pusher?: typeof Pusher }).Pusher ??
  Pusher) as typeof Pusher;

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

export type OrderRealtimeEventName = (typeof ORDER_REALTIME_EVENTS)[number];

/** The envelope minted by `PusherService.publish_order_event` on the API. */
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
  published_at?: string | null;
}

export type RealtimeConnectionState =
  /** Pusher is not configured on the API; realtime is off and REST carries on. */
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'unavailable'
  | 'disconnected';

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

const DRIVERS_CHANNEL = 'private-drivers';

/** Pusher delivers at least once; this is how long a seen id blocks a repeat. */
const DEDUPE_TTL_MS = 60_000;

type EventListener = (event: OrderRealtimeEvent) => void;
type StateListener = (state: RealtimeConnectionState) => void;

class DriverRealtimeClient {
  private pusher: Pusher | null = null;
  private readonly channels = new Map<string, Channel>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly seenEventIds = new Map<string, ReturnType<typeof setTimeout>>();

  private state: RealtimeConnectionState = 'disconnected';
  private tenantId: string | null = null;
  /** Whether the broadcast channel should be attached once connected. */
  private wantsBroadcast = false;
  /**
   * Bumped by every `connect`/`disconnect`. An async connect that finds the
   * generation has moved on aborts instead of installing a stale socket.
   */
  private generation = 0;

  getState(): RealtimeConnectionState {
    return this.state;
  }

  /** Subscribe to order events. Returns an unsubscribe function. */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Subscribe to connection-state changes. Returns an unsubscribe function. */
  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Open the socket for a driver tenant. `broadcast` decides whether the
   * new-order channel is attached now — pass the driver's current online state
   * rather than toggling it straight after, so a reconnect can never briefly
   * subscribe an off-shift driver to the broadcast.
   */
  async connect(tenantId: string, broadcast: boolean): Promise<void> {
    this.disconnect();

    const generation = this.generation;
    this.tenantId = tenantId;
    this.wantsBroadcast = broadcast;
    this.setState('connecting');

    try {
      const config = await fetchPublic<PublicRealtimeConfig>('/api/v1/public/config');
      if (generation !== this.generation) return;

      if (!config.pusher_enabled || !config.pusher_key || !config.pusher_cluster) {
        this.setState('disabled');
        return;
      }

      this.pusher = new PusherClient(config.pusher_key, {
        cluster: config.pusher_cluster,
        forceTLS: true,
        channelAuthorization: { customHandler: this.authorizeChannel },
      });

      this.pusher.connection.bind('connected', () => this.setState('connected'));
      this.pusher.connection.bind('unavailable', () => this.setState('unavailable'));
      this.pusher.connection.bind('disconnected', () => this.setState('disconnected'));
      this.pusher.connection.bind('error', (error: unknown) => {
        console.error('[Pusher] Connection error', error);
      });

      this.subscribe(`private-tenant-${tenantId}`);
      if (this.wantsBroadcast) {
        this.subscribe(DRIVERS_CHANNEL);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      console.error('[Pusher] Initialization failed', error);
      this.setState('unavailable');
      this.pusher?.disconnect();
      this.pusher = null;
    }
  }

  disconnect(): void {
    this.generation += 1;
    for (const channel of this.channels.values()) {
      channel.unbind_all();
    }
    this.channels.clear();
    this.pusher?.disconnect();
    this.pusher = null;
    this.tenantId = null;
    for (const timer of this.seenEventIds.values()) {
      clearTimeout(timer);
    }
    this.seenEventIds.clear();
    this.setState('disconnected');
  }

  /** Attach the new-order broadcast channel (driver went online). */
  subscribeBroadcast(): void {
    this.wantsBroadcast = true;
    if (this.pusher && !this.channels.has(DRIVERS_CHANNEL)) {
      this.subscribe(DRIVERS_CHANNEL);
    }
  }

  /** Detach the new-order broadcast, leaving the tenant channel up. */
  unsubscribeBroadcast(): void {
    this.wantsBroadcast = false;
    const channel = this.channels.get(DRIVERS_CHANNEL);
    if (!channel) return;
    channel.unbind_all();
    this.pusher?.unsubscribe(DRIVERS_CHANNEL);
    this.channels.delete(DRIVERS_CHANNEL);
  }

  /**
   * Sign a private-channel subscription through the API, which authorizes it
   * against the caller's JWT (`pusher_channels.py`). Going through the shared
   * api client keeps the bearer token and its 401-refresh path in one place.
   *
   * The endpoint declares `Form(...)` fields, which FastAPI also accepts as
   * multipart — so the existing multipart helper works and no new client
   * method (or url-encoded body support) is needed.
   */
  private readonly authorizeChannel: ChannelAuthorizationHandler = (params, callback) => {
    const form = new FormData();
    form.append('socket_id', params.socketId);
    form.append('channel_name', params.channelName);

    uploadWithAuth<ChannelAuthorizationResponse>('/api/v1/pusher/auth', form)
      .then((response) => callback(null, response))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Pusher channel authorization failed.';
        callback(new Error(message), null);
      });
  };

  private subscribe(channelName: string): void {
    if (!this.pusher || this.channels.has(channelName)) return;

    const channel = this.pusher.subscribe(channelName);
    for (const eventName of ORDER_REALTIME_EVENTS) {
      channel.bind(eventName, (data: unknown) => this.receive(eventName, data));
    }
    channel.bind('pusher:subscription_error', (error: unknown) => {
      console.error(`[Pusher] Subscription failed for ${channelName}`, error);
    });
    this.channels.set(channelName, channel);
  }

  private receive(eventName: OrderRealtimeEventName, data: unknown): void {
    if (!isEventPayload(data)) {
      console.warn(`[Pusher] Ignored malformed ${eventName} event.`);
      return;
    }

    // A driver subscribed to both their tenant channel and the broadcast gets
    // the same event twice; the id is minted per publish, so it collapses them.
    if (this.seenEventIds.has(data.event_id)) return;
    this.seenEventIds.set(
      data.event_id,
      setTimeout(() => this.seenEventIds.delete(data.event_id), DEDUPE_TTL_MS),
    );

    const event = { ...data, event: eventName } as OrderRealtimeEvent;
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}

function isEventPayload(value: unknown): value is Record<string, unknown> & {
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

/** Process-wide client. `RealtimeProvider` owns its lifecycle. */
export const realtime = new DriverRealtimeClient();