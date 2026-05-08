import { defineConfig } from "vitest/config";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: path.resolve(__dirname, ".."),
    include: ["tests/unit/**/*.test.ts"],
  },
});
