/**
 * Devspec §13 happy path, run locally: sign in -> tree -> editor+validation -> run
 * streaming -> apply suggestion -> cycle to target-met.
 *
 * Prerequisites (see README.md "Local setup" / docs/demo-script.md): Firestore + Auth
 * emulators running (`firebase emulators:start`), pew-api running with
 * `USE_FAKE_LLM=true FIRESTORE_EMULATOR_HOST=localhost:8080
 * FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 FIREBASE_PROJECT_ID=demo-pew-test`, the seed
 * script run once against that same project id, and `npm run dev` (web) with
 * `NEXT_PUBLIC_USE_EMULATOR=true`.
 */
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "asha@acme.dev";
const DEMO_PASSWORD = "correct horse battery staple";

test("sign in, edit, run, apply suggestion, cycle to target-met", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/^password$/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: /Ticket triage/i }).click();

  // Editor + live validation: the seeded triage prompt fails all 4 catalogue rules.
  await expect(page.getByText(/Hedging language/i)).toBeVisible();

  // Run tab: run once, wait for the composite to populate.
  await page.getByRole("button", { name: "Run" }).click();
  await page.getByRole("button", { name: "Run once" }).click();
  await page.getByRole("button", { name: "Confirm & run" }).click();
  await expect(page.getByText("composite")).toBeVisible();
  await expect(page.locator("text=cases").locator("..").getByText(/3 \/ 3/)).toBeVisible({ timeout: 20_000 });

  // Suggestions: apply the top suggestion as a new version.
  await page.getByRole("button", { name: "Suggestions" }).click();
  await page.getByRole("button", { name: "Apply as new version" }).first().click();

  // Setup: start an improvement cycle with a low, guaranteed-met target (FakeLLMProvider's
  // deterministic composite floor is documented in tests/integration/test_cycles.py).
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByLabel("Target score").fill("0.4");
  await page.getByLabel("Max iterations").fill("2");
  await page.getByRole("button", { name: /Start cycle on/ }).click();

  await page.getByRole("button", { name: "Dataset" }).click();
  await page.getByRole("button", { name: "Approve dataset & continue" }).click();

  await page.getByRole("button", { name: "Run" }).click();
  await page.getByRole("button", { name: "Confirm & run iteration" }).click();
  await page.getByRole("button", { name: "Continue to checks" }).click({ timeout: 20_000 });

  // The ended-cycle summary (reason "target-met" -> displayed label "Target met") renders
  // in the Setup tab's CycleEndedCard, not the Run tab we're currently on.
  await page.getByRole("button", { name: "Setup" }).click();
  await expect(page.getByText(/target met/i)).toBeVisible({ timeout: 20_000 });
});
