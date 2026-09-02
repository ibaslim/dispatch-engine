const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = '@notifee/react-native/android/libs';
const REPO_LINE =
  "    maven { url(new File(rootDir, '../node_modules/@notifee/react-native/android/libs')) } // notifee (see plugins/withNotifeeMavenRepo.js)";

/**
 * Config plugin: register notifee's bundled Maven repo.
 *
 * notifee ships `app.notifee:core` as local artifacts under its own
 * node_modules, not on any public repo. It self-registers via
 * `rootProject.allprojects` in its build.gradle, but Expo's CLI builds with
 * `--configure-on-demand`, so that runs too late for `:app`'s dependency
 * resolution — the build fails with "Could not find any matches for
 * app.notifee:core:+", having searched only google/mavenCentral/jitpack.
 *
 * Declaring it in the root project's `allprojects` block fixes the ordering.
 * A plugin rather than a hand-edit because `android/` is generated — a
 * `prebuild --clean` would drop it and the build would break again.
 */
module.exports = function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withNotifeeMavenRepo: expected a groovy build.gradle');
    }
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }

    // Anchor on the allprojects repositories block, not the buildscript one:
    // the artifact is a runtime dependency, not a build classpath entry.
    const anchor = /allprojects\s*\{\s*\n(\s*)repositories\s*\{\s*\n/;
    if (!anchor.test(cfg.modResults.contents)) {
      throw new Error('withNotifeeMavenRepo: no allprojects.repositories block found');
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      anchor,
      (match) => `${match}${REPO_LINE}\n`,
    );

    return cfg;
  });
};