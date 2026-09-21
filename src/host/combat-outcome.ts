import { classAction } from "../game/class-kit.js";
import type { AdventureSnapshot, CombatForecast } from "../game/adventure-types.js";

export interface CombatOutcome {
  readonly text: string;
  readonly tone: "safe" | "danger" | "warning" | "neutral";
  readonly detail?: string;
}

export function movementRetreat(snapshot: AdventureSnapshot, forecast: CombatForecast): string | null {
  if (!forecast.actions.some(action => action.actorId === forecast.playerId && action.action === "bait" && action.result === "executed")) return null;
  const player = forecast.outcomes.find(outcome => outcome.id === forecast.playerId);
  if (!player || player.health <= 0) return null;
  const ids = new Set(forecast.events.filter(event => event.kind === "retreat" && event.targetId === forecast.playerId).map(event => event.sourceId));
  if (!ids.size) return null;
  if (!player.inCombat) return "Leaves combat";
  const names = snapshot.threats.filter(threat => ids.has(threat.id)).map(threat => threat.name);
  return names.length === 1 ? `${names[0]} retreats` : `${ids.size} enemies retreat`;
}

export function combatOutcome(snapshot: AdventureSnapshot, forecast: CombatForecast): CombatOutcome {
  const damage = forecast.events.reduce((total, event) => total + (event.kind === "hit" && event.targetId === forecast.playerId ? event.damage : 0), 0);
  const fallen = forecast.outcomes.some(outcome => outcome.id === forecast.playerId && outcome.health <= 0);
  const action = forecast.actions.find(entry => entry.actorId === forecast.playerId && entry.action !== "bait");
  let actionText = "No action planned";
  let failed = false;
  if (action) {
    const name = classAction(snapshot.player.archetype, action.action).name;
    failed = action.result !== "executed";
    switch (action.result) {
      case "executed": {
        if (action.action === "brace") actionText = "Defend activates";
        else {
          const hits = forecast.events.filter(event => event.kind === "hit" && event.sourceId === forecast.playerId && event.queueId === action.queueId);
          const defeated = forecast.events.some(event => event.kind === "defeat" && event.sourceId === forecast.playerId && event.queueId === action.queueId && event.targetId === action.targetId);
          const target = snapshot.threats.find(threat => threat.id === action.targetId);
          actionText = defeated && target ? `${target.name} defeated` : hits.length > 0 && hits.every(hit => hit.damage === 0) ? `${name} blocked` : hits.length ? `${name} connects` : `${name} hits no enemies`;
        }
        break;
      }
      case "out-of-range": actionText = `${name} out of range`; break;
      case "behind-cover": actionText = `${name} stopped by cover`; break;
      case "target-unavailable": actionText = "Target unavailable"; break;
      case "moving": actionText = `${name} interrupted by movement`; break;
      case "insufficient-stamina": actionText = `${name} lacks Energy`; break;
      case "destination-unreachable": actionText = "Move cannot reach its tile"; break;
      case "not-executed": actionText = `${name} does not happen`; break;
    }
  }
  const classEvents = forecast.events.filter(event => event.kind === "class" && event.sourceId === forecast.playerId);
  const classText = classEvents.at(-1)?.text;
  const ignition = forecast.events.some(event => event.kind === "ignition" && event.text === "Volatile residue ignites!");
  const ready = !fallen && (!action || failed) ? snapshot.player.counterattackReady ? "Counterattack ready (+12)" : snapshot.player.focusReady ? "Focus ready (+10)" : null : null;
  const extra = ignition ? "Residue ignites" : classText ?? ready;
  const friendlyFire = new Map<string, { source: string; target: string; damage: number }>();
  for (const event of forecast.events) {
    if (event.kind !== "hit" || event.damage <= 0 || event.sourceId === event.targetId) continue;
    const source = snapshot.threats.find(threat => threat.id === event.sourceId);
    const target = snapshot.threats.find(threat => threat.id === event.targetId);
    if (!source || !target) continue;
    const key = source.id + ":" + target.id;
    const hit = friendlyFire.get(key) ?? { source: source.name, target: target.name, damage: 0 };
    hit.damage += event.damage; friendlyFire.set(key, hit);
  }
  const hits = [...friendlyFire.values()];
  const collateral = hits.length === 1 ? `${hits[0]!.target} takes ${hits[0]!.damage} friendly fire` : hits.length ? `Enemies take ${hits.reduce((sum, hit) => sum + hit.damage, 0)} friendly fire` : null;
  const retreat = movementRetreat(snapshot, forecast);
  return {
    text: [fallen ? "You fall" : damage > 0 ? `Take ${damage} damage` : "No damage", actionText, retreat, collateral, extra].filter(Boolean).join(" · "),
    tone: fallen || damage > 0 ? "danger" : failed || retreat ? "warning" : action ? "safe" : "neutral",
    ...(hits.length ? { detail: hits.map(hit => `${hit.source} hits ${hit.target} for ${hit.damage} damage.`).join("\n") } : {}),
  };
}
