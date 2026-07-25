const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Keep hierarchical lookup enabled so Metro can resolve packages that npm
// nests under a dependency's own node_modules (e.g. expo-modules-core under
// node_modules/expo). Disabling it caused "Unable to resolve" errors for
// nested packages in this monorepo. See expo-doctor's Metro config check.
config.resolver.disableHierarchicalLookup = false;

// nativewind's `jsxImportSource` rewrites every file's JSX runtime import to
// `react-native-css-interop/jsx-runtime`. npm nests that package under
// nativewind/node_modules (a peer conflict prevents hoisting it), so importers
// living under other packages (e.g. node_modules/expo/*) can't resolve it.
// Alias it to the installed nested copy so it resolves from anywhere.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-css-interop': path.resolve(
    projectRoot,
    'node_modules/nativewind/node_modules/react-native-css-interop'
  ),
};

// Wrap with NativeWind so Tailwind classNames are compiled and applied.
// Without this, className props are ignored and the UI renders unstyled.
module.exports = withNativeWind(config, { input: './global.css' });