"""
FCM transport. All push leaves through here, so a future migration is one file.

Platform split matters: Android gets data-only (a `notification` block makes the
OS draw it — no buttons, our handler never runs), iOS gets a real alert (silent
pushes aren't delivered after force-quit). Exception: `offer_revoked` is silent
on both, since it clears a notification rather than showing one.

Nothing here raises. A failed push costs a notification, which the app's REST
refetch heals; a raised exception could cost a committed order.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.core.config import settings
from app.services.push_contract import ACTION_DETAILS, ACTION_DISMISS, PushEnvelope

logger = logging.getLogger(__name__)

# FCM rejects a larger multicast outright — the whole batch, not just the overflow.
MAX_TOKENS_PER_MULTICAST = 500

# "This registration is dead." Everything else is transient; reaping on a
# network blip would unsubscribe a live fleet.
DEAD_TOKEN_ERRORS = frozenset(
    {"UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH", "NOT_FOUND"}
)


@dataclass(frozen=True, slots=True)
class SendResult:
    success_count: int
    failure_count: int
    dead_tokens: list[str]


class FcmService:
    def __init__(self) -> None:
        self._app = None
        self._init_failed = False

    @property
    def enabled(self) -> bool:
        return settings.fcm_enabled

    def _get_app(self):
        # Latch failure so a bad credential logs once, not once per order.
        if self._app is not None or self._init_failed:
            return self._app

        try:
            import firebase_admin
            from firebase_admin import credentials

            cred = credentials.Certificate(json.loads(settings.firebase_credentials_json))
            # Named app: avoids colliding with any other firebase_admin use in-process.
            self._app = firebase_admin.initialize_app(cred, name="dispatch-fcm")
            logger.info("FCM initialised")
        except Exception:
            self._init_failed = True
            logger.exception("FCM init failed; push disabled for this process")

        return self._app

    def _build_message(self, envelope: PushEnvelope, tokens: list[str]):
        from firebase_admin import messaging

        expiration = int(envelope.expires_at.timestamp())

        # No `notification=` — high priority is what wakes a killed app.
        android = messaging.AndroidConfig(priority="high", ttl=envelope.ttl_seconds)

        if envelope.silent:
            apns = messaging.APNSConfig(
                # Apple rejects priority 10 for content-available.
                headers={
                    "apns-priority": "5",
                    "apns-push-type": "background",
                    "apns-expiration": str(expiration),
                },
                payload=messaging.APNSPayload(aps=messaging.Aps(content_available=True)),
            )
        else:
            apns = messaging.APNSConfig(
                headers={
                    "apns-priority": "10",
                    "apns-push-type": "alert",
                    "apns-expiration": str(expiration),
                },
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        alert=messaging.ApsAlert(title=envelope.title, body=envelope.body),
                        sound="default",
                        # Buttons come from this category. Unregistered id =
                        # alert with no buttons and no error anywhere.
                        category=envelope.category,
                        thread_id="offers",
                    ),
                ),
            )

        return messaging.MulticastMessage(
            tokens=tokens, data=envelope.data, android=android, apns=apns
        )

    def send_to_tokens(self, tokens: list[str], envelope: PushEnvelope) -> SendResult:
        """Chunked send. Never raises. Returns dead tokens for the caller to reap."""
        if not self.enabled:
            logger.debug("FCM disabled; skipped %s", envelope.data.get("type"))
            return SendResult(0, 0, [])
        if not tokens or self._get_app() is None:
            return SendResult(0, len(tokens) if tokens else 0, [])

        from firebase_admin import messaging

        success = failure = 0
        dead: list[str] = []

        for start in range(0, len(tokens), MAX_TOKENS_PER_MULTICAST):
            chunk = tokens[start : start + MAX_TOKENS_PER_MULTICAST]
            try:
                response = messaging.send_each_for_multicast(
                    self._build_message(envelope, chunk), app=self._app
                )
            except Exception:
                failure += len(chunk)
                logger.exception("FCM multicast failed (%d tokens)", len(chunk))
                continue

            success += response.success_count
            failure += response.failure_count

            for token, result in zip(chunk, response.responses):
                if result.success:
                    continue
                code = getattr(getattr(result, "exception", None), "code", None)
                # Codes vary in shape across firebase-admin versions.
                normalised = str(code).upper().replace("-", "_") if code else ""
                if normalised in DEAD_TOKEN_ERRORS:
                    dead.append(token)
                else:
                    logger.warning("FCM send failed (%s)", normalised or "UNKNOWN")

        logger.info(
            "FCM %s: %d sent, %d failed, %d dead",
            envelope.data.get("type"),
            success,
            failure,
            len(dead),
        )
        return SendResult(success, failure, dead)


fcm_service = FcmService()

__all__ = ["fcm_service", "FcmService", "SendResult", "ACTION_DISMISS", "ACTION_DETAILS"]