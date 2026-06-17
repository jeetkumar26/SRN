module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    /**
     * Resolve TypeScript path aliases at Babel/Metro compile time.
     *
     * tsconfig.json defines:
     *   "@/*" → "./src/*"
     *   "@workspace/api-client-react" → "./lib/api-client-react/src/index.ts"
     *
     * Without this plugin the aliases work for type-checking but Metro
     * cannot resolve them at runtime, causing "Cannot find module '@/...'" errors.
     *
     * Install if not present:  pnpm add -D babel-plugin-module-resolver
     */
    [
      "module-resolver",
      {
        root: ["."],
        extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
        alias: {
          "@": "./src",
          "@workspace/api-client-react": "./lib/api-client-react/src/index.ts",
        },
      },
    ],
  ],
};
