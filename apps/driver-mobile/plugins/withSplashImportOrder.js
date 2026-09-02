const { withMainActivity } = require('@expo/config-plugins');

/**
 * Config plugin: keep `package` first in MainActivity.kt.
 *
 * `expo-splash-screen`'s prebuild step adds
 * `import expo.modules.splashscreen.SplashScreenManager` by prepending it to the
 * file rather than inserting it after the package declaration, producing:
 *
 *     import expo.modules.splashscreen.SplashScreenManager
 *     package com.dispatch.drivermobile
 *
 * Kotlin requires `package` to be the first declaration, so the build dies with
 * a run of `Syntax error: Expecting a top level declaration` plus a misleading
 * `Unresolved reference 'BuildConfig'` — the whole file failed to parse.
 *
 * Hand-fixing `android/` doesn't stick: it's generated, so the next prebuild
 * writes the broken order back. This runs as a mod for the same reason as
 * withNotifeeMavenRepo / withAndroidAbis.
 *
 * **Ordering matters.** `withMainActivity` mods run in *reverse* registration
 * order (each mod runs its own action, then calls the previously registered one
 * via `nextMod`), so this plugin must be listed *before* `expo-splash-screen` in
 * app.json's `plugins` to run *after* it. Listed after, it would tidy the file
 * before splash-screen breaks it, and the build would still fail.
 *
 * Fixing the order rather than the import itself keeps this a no-op once the
 * upstream generator is fixed, and it catches any other plugin with the same bug.
 */
module.exports = function withSplashImportOrder(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      return cfg;
    }

    cfg.modResults.contents = hoistPackageDeclaration(cfg.modResults.contents);
    return cfg;
  });
};

/**
 * Move the `package` declaration back above anything that got prepended to it.
 * Displaced lines stay in their relative order, just below the package — imports
 * are legal there, which is where they belonged in the first place.
 */
function hoistPackageDeclaration(contents) {
  const lines = contents.split(/\r?\n/);
  const packageIndex = lines.findIndex((line) => /^\s*package\s+\S/.test(line));

  // No package declaration, or already first — nothing to do.
  if (packageIndex <= 0) {
    return contents;
  }

  const displaced = lines.slice(0, packageIndex).filter((line) => line.trim() !== '');
  if (displaced.length === 0) {
    return contents;
  }

  return [lines[packageIndex], '', ...displaced, ...lines.slice(packageIndex + 1)].join('\n');
}

module.exports.hoistPackageDeclaration = hoistPackageDeclaration;
