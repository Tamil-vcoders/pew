// web/features/auth/authService.ts
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/shared/firebase/client";

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(name: string, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  return credential;
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

// Firebase requires a recent login for a sensitive change like updatePassword, so we
// re-authenticate with the current password immediately before it. Accounts that signed up
// via Google have no password credential to reauthenticate with (docs/prototype.jsx's
// GlobalSettings note: "accounts signed in with Google manage their password with Google") —
// reject those up front with a message matching that note, rather than letting Firebase's
// own error surface first.
export async function changePassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Not signed in.");
  }
  if (user.providerData.some((p) => p.providerId === "google.com")) {
    throw new Error("This account signs in with Google — manage your password with Google.");
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function signOutUser() {
  return firebaseSignOut(auth);
}
