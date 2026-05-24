import { deriveRole, type JobOrUnset, type Role } from "@/domain/types";

// Role tint applied to the player lane, the roster cell, and the active
// portion of a mit bar. Tanks/healers/DPS each get one color; the three DPS
// sub-roles (melee/ranged/caster) share a single tint per the spec.
const ROLE_COLOR: Record<Role, string> = {
  tank: "#2D3A80",
  healer: "#346624",
  melee: "#732828",
  ranged: "#732828",
  caster: "#732828",
  unset: "#2a2a2a",
};

export function jobColor(job: JobOrUnset): string {
  return ROLE_COLOR[deriveRole(job)];
}
