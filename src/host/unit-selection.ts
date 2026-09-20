import type { ThreatView } from "../game/adventure-types.js";

export type UnitSelection = { readonly kind: "enemy"; readonly id: string }
  | { readonly kind: "player"; readonly id: string }
  | null;

export function newAttackerTarget(threats: readonly ThreatView[], selection: UnitSelection, playerId: string, previousAttackers: ReadonlySet<string>): string | null {
  if (selection?.kind === "enemy" && threats.some(threat => threat.id === selection.id && threat.active && threat.health > 0)) return null;
  return threats.find(threat => threat.active && threat.health > 0 && threat.aggro && threat.targetPlayerId === playerId && !previousAttackers.has(threat.id))?.id ?? null;
}
