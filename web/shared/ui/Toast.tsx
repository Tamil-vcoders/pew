// web/shared/ui/Toast.tsx — error-only toast primitive (Phase 5 polish pass). Scope: wired
// into the six new Phase-5 mutation sites only (ProfileSection, SecuritySection,
// ModelRegistrySection, PrivacySection, MembersPanel, DangerZoneSection) — existing tabs
// already surface mutation errors via working inline error <div>s and are left untouched.
"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { COLORS } from "./tokens";

const AUTO_DISMISS_MS = 4000;

interface ToastMessage {
  id: number;
  message: string;
}

interface ToastContextValue {
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const showError = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showError }}>
      {children}
      <div
        style={{
          position: "fixed", bottom: 16, right: 16, display: "flex", flexDirection: "column",
          gap: 8, zIndex: 1000, maxWidth: 320,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            style={{
              background: COLORS.badDim, color: COLORS.bad, border: `0.5px solid ${COLORS.bad}55`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, lineHeight: 1.5,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
