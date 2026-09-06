// web/vitest.config.mts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Playwright's e2e/happy-path.spec.ts otherwise matches vitest's default
    // **/*.spec.ts include glob and gets picked up (and fails) as a vitest test file.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
