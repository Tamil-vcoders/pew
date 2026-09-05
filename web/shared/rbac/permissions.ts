export const ROLE_LEVEL = {
  viewer: 0,
  contributor: 1,
  maintainer: 2,
  administrator: 3,
} as const;

export type Role = keyof typeof ROLE_LEVEL;

export interface Capabilities {
  edit: boolean;
  settings: boolean;
  admin: boolean;
}

export function capabilitiesFor(role: Role | null): Capabilities {
  const level = role ? ROLE_LEVEL[role] : -1;
  return { edit: level >= 1, settings: level >= 2, admin: level >= 3 };
}

export function requiresRoleCaption(min: Role): string {
  return `Requires ${min} role`;
}
