// web/tests/firebase-client.test.ts
import { describe, expect, it, vi } from "vitest";

vi.stubEnv(
  "NEXT_PUBLIC_FIREBASE_CONFIG",
  JSON.stringify({ apiKey: "test-key", authDomain: "test.firebaseapp.com", projectId: "demo-pew-test" }),
);
vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "true");

describe("firebase client", () => {
  it("initializes app, auth, and firestore from NEXT_PUBLIC_FIREBASE_CONFIG", async () => {
    const { app, auth, db } = await import("../shared/firebase/client");
    expect(app.options.projectId).toBe("demo-pew-test");
    expect(auth.app).toBe(app);
    expect(db.app).toBe(app);
  });
});
