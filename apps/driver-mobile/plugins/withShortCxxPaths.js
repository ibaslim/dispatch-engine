const { withProjectBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const START = '// >>> withShortCxxPaths (generated)';
const END = '// <<< withShortCxxPaths';

/**
 * Config plugin: relocate each native module's CMake staging directory (`.cxx/`)
 * to a short absolute path on Windows.
 *
 * Why: Gradle nests the generated prefab configs under
 * `<module>/android/.cxx/Debug/<hash>/prefab/<abi>/prefab/lib/<triple>/cmake/...`.
 * For deeply nested modules (e.g. `node_modules/nativewind/node_modules/
 * react-native-reanimated`) that exceeds Windows' 260-char MAX_PATH — the
 * react-native-worklets prefab config lands at 262 chars. ninja stats those
 * paths without long-path support, sees the file as missing, and a missing
 * input on a phony edge is permanently dirty, so CMake regenerates forever and
 * the build dies with:
 *
 *     ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 * Enabling LongPathsEnabled in the registry does not help: ninja is not
 * manifested to opt into it.
 *
 * Moving the staging dir to `C:/rn-cxx/<module>` cuts that path to ~160 chars.
 * Override the root with the RN_CXX_DIR environment variable.
 *
 * No-op on macOS/Linux, which have no such limit — CI and non-Windows
 * developers keep the stock layout.
 *
 * This must live in `settings.gradle`: `buildStagingDirectory` is read while a
 * project is configured, so registering the hook from the root `build.gradle`
 * fails with "It is too late to set buildStagingDirectory". `gradle.beforeProject`
 * from the settings script runs before any project is evaluated, and
 * `plugins.withId` then fires as the Android plugin is applied — early enough to
 * set the DSL, and safe under `--configure-on-demand`.
 */
const SETTINGS_SNIPPET = `
${START}
// Keep generated CMake paths under Windows' 260-char MAX_PATH. See
// plugins/withShortCxxPaths.js for the full rationale.
if (System.properties['os.name'].toLowerCase().contains('windows')) {
    def cxxRoot = System.getenv('RN_CXX_DIR') ?: 'C:/rn-cxx'
    gradle.beforeProject { project ->
        def relocateCxx = {
            project.android.externalNativeBuild.cmake.buildStagingDirectory =
                new File("\${cxxRoot}/\${project.name}")
        }
        project.plugins.withId('com.android.library') { relocateCxx() }
        project.plugins.withId('com.android.application') { relocateCxx() }
    }
}
${END}
`;

/** Remove a previously injected block, if present. */
function stripBlock(contents) {
  const start = contents.indexOf(START);
  if (start === -1) return contents;
  const end = contents.indexOf(END);
  return contents.slice(0, start) + contents.slice(end + END.length);
}

module.exports = function withShortCxxPaths(config) {
  // Earlier revisions of this plugin injected into the root build.gradle, which
  // is evaluated too late. Strip that block so existing android/ dirs migrate.
  config = withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = stripBlock(cfg.modResults.contents).trimEnd() + '\n';
    return cfg;
  });

  return withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withShortCxxPaths: expected a Groovy settings.gradle');
    }
    cfg.modResults.contents =
      stripBlock(cfg.modResults.contents).trimEnd() + '\n' + SETTINGS_SNIPPET;
    return cfg;
  });
};
