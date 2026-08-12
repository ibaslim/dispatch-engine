# Firebase Setup Guide — Driver Push Notifications

Phase 0 of `PUSH_NOTIFICATIONS_PLAN.md`. This is console work; no code changes here.

**Time:** ~20 minutes for Android. iOS adds ~15 minutes *and* requires a paid Apple Developer account.

**You will produce 4 artifacts:**

| # | Artifact | Platform | Secret? | Lands in |
|---|---|---|---|---|
| 1 | `google-services.json` | Android | No (client config) | `apps/driver-mobile/google-services.json` |
| 2 | `GoogleService-Info.plist` | iOS | No (client config) | `apps/driver-mobile/GoogleService-Info.plist` |
| 3 | APNs auth key `.p8` | iOS | **YES** | uploaded to Firebase; original stored in your password manager |
| 4 | Service-account JSON | Server | **YES** | `apps/api/.env` as an env var — **never committed** |

> **Secret vs. not.** #1 and #2 ship inside the app binary and are extractable by anyone with the
> APK — they are identifiers, not credentials, and are fine to commit (the repo already commits a
> placeholder `google-services.json`). #3 and #4 can send push to every driver's device and must
> never enter git.

---

## Part A — Create the project (5 min)

1. Sign in to <https://console.firebase.google.com> with the Google account you chose.
2. **Create a project** (or **Add Firebase to an existing Google Cloud project** if you're reusing
   the project that holds your Maps keys — see the ownership discussion in the plan).
3. Name it, e.g. `dispatch-engine-dev`. Note the auto-generated **Project ID** — it is permanent.
4. **Google Analytics: turn it OFF.** Not needed for FCM, and it adds a data-processing consent flow
   you don't want in a test project.
5. Wait for provisioning → **Continue**.

✅ *Check:* the project dashboard loads and the URL contains your project id.

---

## Part B — Register the Android app (5 min)

The package name must match `app.json` → `expo.android.package` **exactly**. A mismatch produces an
app that builds fine and never receives a single notification, with no error message.

1. Project dashboard → **Add app** → **Android** (robot icon).
2. **Android package name:** `com.dispatch.drivermobile`
3. App nickname: `Driver App (Android)`. Leave **Debug signing certificate SHA-1 empty** — it is only
   needed for Google Sign-In / Dynamic Links, not FCM.
4. **Register app** → **Download `google-services.json`**.
5. Skip the "Add Firebase SDK" and "Verify installation" steps — `@react-native-firebase` is already
   wired in this project. Click **Next → Continue to console**.

### Where the file goes

Replace the committed placeholder (currently `"project_id": "dispatch-driver-placeholder"`):

```bash
# from repo root
cp ~/Downloads/google-services.json apps/driver-mobile/google-services.json
```

`app.json` already points at it via `expo.android.googleServicesFile: "./google-services.json"`, so
`expo prebuild` copies it into `android/app/` for you.

✅ *Check:*
```bash
grep project_id apps/driver-mobile/google-services.json
# must NOT say dispatch-driver-placeholder
```

---

## Part C — Service-account credential for the server (5 min)

This is what lets the API send. Treat it like a database password.

1. Firebase console → **⚙ gear icon → Project settings → Service accounts** tab.
2. Click **Generate new private key** → **Generate key**. A `.json` file downloads.
3. Store the original in your password manager. It cannot be re-downloaded — only regenerated.

### Where it goes

Add to `apps/api/.env` (already gitignored). Either form works with the planned config:

```ini
# Option 1 — path (easier locally)
FIREBASE_CREDENTIALS_JSON=C:/secure/dispatch-firebase-sa.json

# Option 2 — inline JSON, single line (easier for containers/CI)
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"...", ...}

FIREBASE_PROJECT_ID=<your-project-id>
FCM_ENABLED_FLAG=true
```

> **Do not** place this file anywhere under `apps/driver-mobile/`. It belongs to the server only.
> Putting it in the app would ship your send-credential to every driver's phone.

### Tighten the permissions (2 min, worth it)

The default key gets a broad role. Narrow it:

1. <https://console.cloud.google.com/iam-admin/iam> → select the same project.
2. Find the `firebase-adminsdk-...@...` service account → ✏ **Edit**.
3. Remove `Editor`; add **`Firebase Cloud Messaging API Admin`**.

This matters more if you reused your Maps project — it stops a leaked push credential from also
reaching your Maps billing.

✅ *Check:* the JSON contains `"type": "service_account"` and a `"private_key"` starting with
`-----BEGIN PRIVATE KEY-----`.

---

## Part D — iOS (only with a paid Apple Developer account)

Skip this entirely if you're testing Android first. Nothing in Parts A–C depends on it.

### D1 — Create the APNs auth key (Apple side)

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles** → **Keys**.
2. **+** → name it `Dispatch Engine APNs` → tick **Apple Push Notifications service (APNs)**.
3. **Continue → Register → Download**. You get `AuthKey_XXXXXXXXXX.p8`.
4. **It downloads exactly once.** Save it to your password manager immediately.
5. Record two values you'll need next: the **Key ID** (the `XXXXXXXXXX` in the filename) and your
   **Team ID** (top-right of the Apple developer portal, or Membership details).

> A `.p8` key is per *Apple account*, not per app — one key covers all your apps and never expires.
> This is why it survives a later move to a production Firebase project.

### D2 — Register the iOS app (Firebase side)

1. Firebase → **Add app** → **iOS**.
2. **Bundle ID:** `com.dispatch.drivermobile` (must match `app.json` → `expo.ios.bundleIdentifier`).
3. **Register app** → **Download `GoogleService-Info.plist`** → skip the remaining SDK steps.

```bash
cp ~/Downloads/GoogleService-Info.plist apps/driver-mobile/GoogleService-Info.plist
```

Then add the pointer to `app.json` — **it is currently missing**:

```jsonc
"ios": {
  "bundleIdentifier": "com.dispatch.drivermobile",
  "googleServicesFile": "./GoogleService-Info.plist",   // ← add this line
  ...
}
```

> Wire it through `app.json`, never by dragging the file into `ios/` in Xcode. This repo uses the
> managed workflow — `expo prebuild --clean` wipes `ios/`, and a hand-placed file vanishes with it.

### D3 — Upload the key to Firebase ← *the step everyone skips*

1. Firebase → **⚙ Project settings → Cloud Messaging** tab.
2. Under **Apple app configuration** → your iOS app → **APNs Authentication Key** → **Upload**.
3. Provide the `.p8` file, the **Key ID**, and the **Team ID** from D1.

**If you skip this, iOS push fails completely and silently.** The app registers, receives a valid
FCM token, the server reports a successful send — and nothing ever arrives. There is no error
anywhere in the chain. Budget your debugging suspicion here first.

✅ *Check:* the Cloud Messaging tab shows your key listed with its Key ID under the iOS app.

---

## Part E — Verify before writing any code (5 min)

Prove the pipe works end-to-end *before* Phase 1–3 exist. If this fails, no amount of correct code
will help.

1. Rebuild the dev client so it picks up the real config:
   ```bash
   cd apps/driver-mobile
   npx expo prebuild --clean
   npx expo run:android
   ```
2. Log in on the device. `registerFcmToken()` runs on login today, so add a temporary
   `console.log` of the token in `src/services/notifications/fcm.ts:47`, or read it from the API's
   `push_tokens` table.
3. Firebase console → **Messaging → Create your first campaign → Firebase Notification messages**
   → **Send test message** → paste the token → **Test**.
4. **Background the app** and send again.

**Expected at this stage:** a plain notification, **no buttons**. That is correct — buttons arrive in
Phase 3 with notifee. All you're proving here is that the project id, package name and credentials
line up.

✅ *Check:* notification arrives with the app backgrounded.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| No token; `getToken()` throws | Placeholder `google-services.json` still in place, or dev client not rebuilt after replacing it |
| Token issued, nothing ever arrives (Android) | Package name mismatch with `app.json` → `expo.android.package` |
| Token issued, nothing ever arrives (iOS) | APNs `.p8` not uploaded (Part D3), or bundle-ID mismatch |
| Works foregrounded, not backgrounded | Expected before Phase 3 for data-only messages; the console's test tool sends a `notification` block, so it should still show |
| Works on emulator, not on a real Xiaomi/Oppo | OEM battery manager — needs autostart + battery-optimisation exemption |
| `SENDER_ID_MISMATCH` from the server | App built against a different Firebase project than the service-account key |

---

## Completion checklist

- [ ] Firebase project created, Analytics off, **Project ID recorded**
- [ ] Android app registered as `com.dispatch.drivermobile`
- [ ] Real `google-services.json` in `apps/driver-mobile/` (placeholder gone)
- [ ] Service-account JSON generated, stored in password manager
- [ ] `FIREBASE_CREDENTIALS_JSON` + `FIREBASE_PROJECT_ID` set in `apps/api/.env`
- [ ] Service account narrowed to **FCM API Admin**
- [ ] Dev client rebuilt; test message received with app backgrounded
- [ ] *(iOS only)* `.p8` created and **uploaded to Firebase**, Key ID + Team ID recorded
- [ ] *(iOS only)* `GoogleService-Info.plist` in place + `app.json` `ios.googleServicesFile` added

Once the boxes above are ticked, Phase 1 (presence) and Phase 3 (notifee) can both start.
