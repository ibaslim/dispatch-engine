const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin: allow cleartext (plain HTTP) traffic in non-debug builds.
 *
 * Why this is needed even though `android.usesCleartextTraffic: true` is set in
 * app.json: Expo's prebuild writes that flag into
 * `android/app/src/debug/AndroidManifest.xml` only. It never lands in the main
 * manifest, so it applies to debug builds and nothing else. Android 9 (API 28)
 * changed the platform default to `false`, so a **release** APK silently blocks
 * every `http://` request — which reads as "could not reach server" for an
 * address that works fine in a browser.
 *
 * That matters here because test APKs point at a LAN dev server over plain HTTP
 * (`http://192.168.x.x:8000`), and TLS on an ad-hoc LAN IP isn't practical.
 *
 * Gated behind `ANDROID_ALLOW_CLEARTEXT=true` rather than always-on: shipping a
 * production build that permits unencrypted traffic to any host is a real
 * downgrade, and this flag keeps that an explicit, greppable decision instead of
 * an inherited default. Set it in `.env` for test builds; leave it unset for
 * production, which should be talking HTTPS anyway.
 */
module.exports = function withCleartextTraffic(config) {
  if (process.env.ANDROID_ALLOW_CLEARTEXT !== 'true') {
    return config;
  }

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('withCleartextTraffic: no <application> node in AndroidManifest');
    }

    application.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};