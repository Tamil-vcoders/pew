// web/features/auth/useAuth.tsx
"use client";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/shared/api/client";
import { auth } from "@/shared/firebase/client";
import { UserSchema, type User } from "@/shared/types";
import { signOutUser } from "./authService";

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-fetches and re-parses `/me`, updating `profile` — e.g. after ProfileSection changes
   * the display name, so the header/RoleBadge update without a full reload. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(): Promise<User | null> {
  try {
    const body = await apiFetch<unknown>("/me");
    return UserSchema.parse(body);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user as FirebaseUser | null);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      fetchProfile()
        .then(setProfile)
        .finally(() => setLoading(false));
    });
  }, []);

  const value: AuthContextValue = {
    firebaseUser,
    profile,
    loading,
    signOut: async () => {
      await signOutUser();
    },
    refreshProfile: async () => {
      setProfile(await fetchProfile());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
