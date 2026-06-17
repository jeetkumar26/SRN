const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("path");

const projectRoot = __dirname;

/**
 * pnpm monorepo Metro configuration.
 *
 * Problem: Metro doesn't follow pnpm's symlinked workspace packages by default,
 * so `@workspace/api-client-react` (in lib/) would fail to resolve.
 *
 * Fix: tell Metro to watch the lib/ directory and add the project's own
 * node_modules as a resolver root so workspace symlinks resolve correctly.
 */
const config = {
  // Watch the lib/ workspace packages so Metro picks up changes
  watchFolders: [
    path.resolve(projectRoot, "lib"),
  ],

  resolver: {
    // Ensure Metro resolves modules from the project root first
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
    ],
    // Allow Metro to follow symlinks created by pnpm
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
