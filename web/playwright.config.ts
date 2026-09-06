// web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    // Overridable so a contributor's own scratch stack (a different port, to avoid
    // colliding with another already-running dev server) can be targeted without editing
    // this file — defaults to the port a fresh checkout's `npm run dev` binds to.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // No `webServer` here deliberately: this spec runs against the local stack (Firestore/Auth
  // emulators + pew-api with USE_FAKE_LLM=true + `npm run dev`), started separately — see the
  // header comment in e2e/happy-path.spec.ts and CLAUDE.md/README's local-setup section for
  // the exact commands. Auto-managing three independent processes (Java-backed emulators,
  // a Python/uvicorn api, a Next.js dev server) through one Playwright webServer entry is
  // more fragile than documenting three `npm`/`firebase`/`uvicorn` commands to run first.
});
