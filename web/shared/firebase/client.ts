// web/shared/firebase/client.ts
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

function loadConfig(): Record<string, string> {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) {
    throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG is not set");
  }
  return JSON.parse(raw) as Record<string, string>;
}

const existing = getApps();
export const app: FirebaseApp = existing.length > 0 ? existing[0] : initializeApp(loadConfig());
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Module-local state does not survive Next.js hot-reload (this module can be
// re-executed while the underlying Firebase app/auth/db singletons persist),
// so the "already connected" guard is tracked on globalThis instead of a
// module-scoped `let`.
const globalForFirebase = globalThis as unknown as { __pewEmulatorsConnected?: boolean };

if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !globalForFirebase.__pewEmulatorsConnected) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  globalForFirebase.__pewEmulatorsConnected = true;
}
