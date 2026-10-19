import { defineConfig } from "vitest/config";

/**
 * The source uses NodeNext module resolution, so relative imports carry an
 * explicit ".js" extension even though the files are ".ts". TypeScript resolves
 * these at compile time, but Vite needs an equivalent rule. `resolve.extensionAlias`
 * makes Vite try ".ts" whenever an import ends in ".js", so tests run straight
 * against the TypeScript without a pre-build step.
 */
export default defineConfig({
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 15000,
    // Run test files in separate processes to avoid rate-limiter state leaking.
    pool: "forks",
  },
});
