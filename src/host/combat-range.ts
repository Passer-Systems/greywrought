import { COMBAT_RULES } from "../game/adventure.js";
import type { AdventureSnapshot, CombatAction, Position, ThreatAbilityView, ThreatView } from "../game/adventure-types.js";
import type { RemotePlayerView } from "../game/multiplayer-types.js";

export interface RangeAudience { readonly selfId: string; readonly players: readonly RemotePlayerView[]; }
export interface RangeCue { readonly state: "in" | "out" | "none" | "unknown"; readonly text: string; }
const none: RangeCue = { state: "none", text: "" };
function reach(from: Position, to: Position, metres: number, target = ""): RangeCue {
  const inside = Math.hypot(from.x - to.x, from.z - to.z) <= metres + 1e-9;
  return { state: inside ? "in" : "out", text: (inside ? "In range now" : "Out of range now") + target + ". Positions can change before impact." };
}

export function playerRange(snapshot: AdventureSnapshot, action: CombatAction, targetId: string | null = snapshot.selectedThreat): RangeCue {
  if (action !== "strike" && action !== "disengage" && action !== "jab") return none;
  const target = snapshot.threats.find(threat => threat.id === targetId && threat.active && threat.health > 0);
  if (!target) return { state: "unknown", text: "No living target selected." };
  const metres = action === "strike" && snapshot.player.archetype !== "warrior" ? COMBAT_RULES.strike.rangedRange : COMBAT_RULES[action].range;
  return reach(snapshot.player.position, target.position, metres);
}

export function enemyRange(snapshot: AdventureSnapshot, threat: ThreatView, ability: ThreatAbilityView, audience?: RangeAudience): RangeCue {
  if (ability.damage <= 0) return none;
  const other = threat.targetPlayerId && audience && threat.targetPlayerId !== audience.selfId;
  const target = other ? audience.players.find(player => player.id === threat.targetPlayerId) : undefined;
  if (other && !target) return { state: "unknown", text: "Targeting another adventurer. Their current range is unavailable." };
  const position = target?.player.position ?? snapshot.player.position;
  const targetLabel = target ? " · targeting " + target.name : " · to you";
  // Ground attacks lock their impact centre on launch; homing attacks continue
  // checking distance from the attacker at impact.
  const homing = ability.id === "fireball" || ability.id === "ember-beam" || ability.id === "foreman-pulse";
  if (homing) return reach(threat.position, position, ability.range, targetLabel);
  if (threat.phase === "action") return reach(threat.targetPosition, position, ability.range, targetLabel);
  // Maul's range is its landing radius, in addition to the distance it leaps.
  const leap = ability.id === "maul" && threat.rootedSeconds <= 0 ? COMBAT_RULES.wolf.lungeDistance : 0;
  return reach(threat.position, position, ability.range + leap, targetLabel);
}
