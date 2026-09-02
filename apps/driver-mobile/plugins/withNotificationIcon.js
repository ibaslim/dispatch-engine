const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidColors,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

/**
 * Config plugin: install the Android notification small icon (`ic_notification`).
 *
 * Android renders the small icon as a *silhouette* — it keeps the alpha channel
 * and throws the colours away. Pointing at `ic_launcher` (what display.ts used
 * to do) therefore draws a solid white square in the status bar and shade, since
 * the launcher icon is opaque edge to edge. The fix is a dedicated white-on-
 * transparent asset, which `scripts/generate-app-icons.js` renders into
 * `assets/notification/drawable-*` at the five Android densities.
 *
 * This is a plugin rather than files committed under `android/` because that
 * directory is generated — `expo prebuild --clean` wipes anything hand-placed
 * there (same reasoning as withNotifeeMavenRepo / withAndroidAbis).
 *
 * The manifest meta-data is a backstop, not the main path: our own pushes are
 * data-only and drawn by notifee, which passes `smallIcon` explicitly. But if a
 * payload with a `notification` block ever reaches the device (a Firebase
 * console test message, say), the OS draws it without consulting our code, and
 * without these defaults it falls back to the launcher icon and the white square
 * is back.
 */
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const ICON_NAME = 'ic_notification';
/** Tint applied behind the silhouette. Keep in sync with `NOTIFICATION_COLOR` in src/services/notifications/display.ts. */
const ICON_COLOR = '#1d4ed8';

module.exports = function withNotificationIcon(config) {
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'notification');
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');

      if (!fs.existsSync(source)) {
        throw new Error(
          `withNotificationIcon: ${source} is missing — run \`npm run icons\` to generate it.`,
        );
      }

      for (const density of DENSITIES) {
        const from = path.join(source, `drawable-${density}`, `${ICON_NAME}.png`);
        if (!fs.existsSync(from)) {
          throw new Error(`withNotificationIcon: missing ${from} — run \`npm run icons\`.`);
        }
        const dir = path.join(res, `drawable-${density}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(from, path.join(dir, `${ICON_NAME}.png`));
      }

      return cfg;
    },
  ]);

  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'notificationColor',
      value: ICON_COLOR,
    });
    return cfg;
  });

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('withNotificationIcon: no <application> node in AndroidManifest');
    }

    // `tools:replace` is required, not optional: :react-native-firebase_messaging
    // declares both meta-data itself (colour = @color/white), so without it the
    // merger fails with "is also present at [:react-native-firebase_messaging]".
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    application['meta-data'] = application['meta-data'] ?? [];
    const upsert = (name, attribute, value) => {
      const existing = application['meta-data'].find((m) => m.$['android:name'] === name);
      const attrs = existing ? existing.$ : { 'android:name': name };
      attrs[attribute] = value;
      attrs['tools:replace'] = attribute;
      if (!existing) application['meta-data'].push({ $: attrs });
    };

    upsert(
      'com.google.firebase.messaging.default_notification_icon',
      'android:resource',
      `@drawable/${ICON_NAME}`,
    );
    upsert(
      'com.google.firebase.messaging.default_notification_color',
      'android:resource',
      '@color/notificationColor',
    );

    return cfg;
  });
};

module.exports.ICON_COLOR = ICON_COLOR;
