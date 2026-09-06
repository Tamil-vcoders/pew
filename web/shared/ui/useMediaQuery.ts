// web/shared/ui/useMediaQuery.ts — SSR-safe matchMedia hook (Phase 5 polish pass: narrow-width
// tree collapse in web/app/(workspace)/layout.tsx). Defaults to `false` on the server and on
// the very first client render (so SSR/client markup match), then syncs to the real match in
// an effect. Also guards environments where `window.matchMedia` isn't implemented (e.g. jsdom
// in this project's own vitest suite), which would otherwise throw on call.
"use client";
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
