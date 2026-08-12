/**
 * Push wire contract. Mirrored server-side in
 * `apps/api/app/services/push_contract.py` — change both together; drift fails
 * silently on a driver's phone, not in a build.
 *
 * Rules:
 * 1. Every value is a string — FCM's `data` map is `Map<string, string>`.
 * 2. `route` is server-decided, so retargeting isn't an app release.
 * 3. Unknown `type`/`v` is ignored silently, so the server can add types first.
 */

/** Bumped only for a breaking payload change; unknown versions are ignored. */
export const PUSH_CONTRACT_VERSION = '1';

export const PUSH_TYPES = {
  OFFER_PUBLISHED: 'offer_published',
  OFFER_REVOKED: 'offer_revoked',
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_UPDATED: 'order_updated',
} as const;

export type PushType = (typeof PUSH_TYPES)[keyof typeof PUSH_TYPES];

/**
 * Android channel id / iOS category id. Versioned because an Android channel's
 * importance is immutable once created — changing it needs a new id.
 */
export const PUSH_CATEGORY_OFFER = 'order-offers-v1';

/** Action ids. Must match the notifee actions and the iOS category actions. */
export const PUSH_ACTIONS = {
  DISMISS: 'dismiss',
  DETAILS: 'details',
} as const;

export type PushActionId = (typeof PUSH_ACTIONS)[keyof typeof PUSH_ACTIONS];

/** The `data` map as it crosses the wire. All values are strings. */
export interface PushPayload {
  v: string;
  type: string;
  order_id: string;
  route: string;
  title: string;
  body: string;
  /** ISO-8601. After this the notification is stale and self-cancels. */
  expires_at: string;
  category: string;
  /** `'1'` when the payload must be handled without being displayed. */
  silent?: string;
}

/** A payload that passed validation, with values usable by the app. */
export interface ParsedPush {
  type: PushType;
  orderId: string;
  route: string;
  title: string;
  body: string;
  expiresAt: Date | null;
  category: string;
  silent: boolean;
}

function isKnownType(value: string): value is PushType {
  return (Object.values(PUSH_TYPES) as string[]).includes(value);
}

/**
 * Validate and normalise. `null` means "ignore this message", never "error" —
 * a future server will send types this build has never heard of.
 */
export function parsePushPayload(data: unknown): ParsedPush | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;

  const str = (key: string): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : '';

  if (str('v') !== PUSH_CONTRACT_VERSION) return null;

  const type = str('type');
  if (!isKnownType(type)) return null;

  const orderId = str('order_id');
  if (!orderId) return null;

  const expiresRaw = str('expires_at');
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

  return {
    type,
    orderId,
    route: str('route'),
    title: str('title'),
    body: str('body'),
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    category: str('category') || PUSH_CATEGORY_OFFER,
    silent: str('silent') === '1',
  };
}

export function isExpired(push: ParsedPush, now: Date = new Date()): boolean {
  return push.expiresAt !== null && push.expiresAt.getTime() <= now.getTime();
}