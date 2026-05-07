import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});
