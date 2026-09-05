// web/shared/ui/tokens.ts
// Ported verbatim from docs/prototype.jsx lines 25-32 (COLORS) and 51-52 (ROLE_COLOR).
export const COLORS = {
  bg: "#14161B", surface: "#1B1E25", surface2: "#22262F",
  border: "#2E323C", text: "#ECEAE4", muted: "#9498A3", faint: "#5B606C",
  accent: "#7C93F0", accentDim: "#7C93F026",
  good: "#6FBF8B", goodDim: "#6FBF8B1F",
  mid: "#D9A441", midDim: "#D9A4411F",
  bad: "#DB6B5A", badDim: "#DB6B5A1F",
} as const;

export const ROLE_COLOR: Record<string, string> = {
  viewer: COLORS.faint,
  contributor: COLORS.good,
  maintainer: COLORS.mid,
  administrator: COLORS.accent,
};
