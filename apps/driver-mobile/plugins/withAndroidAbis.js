const { withGradleProperties } = require('@expo/config-plugins');

const PROPERTY = 'reactNativeArchitectures';
const DEFAULT_ABIS = 'arm64-v8a';

/**
 * Config plugin: build Android native libs for arm64-v8a only.
 *
 * React Native defaults to `armeabi-v7a,arm64-v8a,x86,x86_64`, so every native
 * module is compiled four times. This project has a lot of them (reanimated,
 * worklets, firebase, expo-location, camera), and three of those four ABIs are
 * dead weight: every phone shipped since ~2019 is arm64-v8a, and the team
 * deploys to physical devices over Wi-Fi rather than to emulators. Dropping the
 * other three cuts native build time and APK size by roughly the same factor.
 *
 * **This makes the build incompatible with the standard Android emulator**,
 * which is x86_64 on Intel/AMD hosts (Apple Silicon emulators are arm64 and
 * remain fine). To build for an emulator, override without editing this file:
 *
 *     RN_ANDROID_ABIS=arm64-v8a,x86_64 npx expo run:android
 *
 * or, for a one-off Gradle invocation that bypasses the plugin entirely:
 *
 *     ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
 *
 * Set via a plugin rather than by hand-editing `android/gradle.properties`
 * because `android/` is generated — a `prebuild --clean` would silently restore
 * all four ABIs and the slow build would creep back.
 */
module.exports = function withAndroidAbis(config) {
  const abis = process.env.RN_ANDROID_ABIS || DEFAULT_ABIS;

  return withGradleProperties(config, (cfg) => {
    // Replace rather than append: prebuild writes the stock four-ABI line, and
    // a duplicate key would leave the winner up to file ordering.
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === PROPERTY),
    );

    cfg.modResults.push({
      type: 'comment',
      value: `Architectures to build native code for (see plugins/withAndroidAbis.js).`,
    });
    cfg.modResults.push({
      type: 'property',
      key: PROPERTY,
      value: abis,
    });

    return cfg;
  });
};