import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest uses Vite’s resolver; mirror `tsconfig` path aliases so `@/` and generated Prisma imports match app code.
 * Why: auth action tests import `@/lib/actions/auth` which pulls `@/lib/prisma` and `@/generated/prisma` types.
 */
export default defineConfig({
  resolve: {
    // Array + regex: a bare `@` alias makes `@/generated/prisma` resolve to the folder, not `client.ts`, and can be parsed like a scoped npm package.
    alias: [
      {
        find: /^@\/generated\/prisma$/,
        replacement: path.join(rootDir, "src/generated/prisma/client.ts"),
      },
      {
        find: /^@\//,
        replacement: `${path.join(rootDir, "src")}/`,
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/vitest-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
  },
});
