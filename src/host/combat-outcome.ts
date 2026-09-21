import type { AdventureSnapshot, CombatForecast } from "../game/adventure-types.js";

export interface CombatOutcome {
  readonly text: string;
  readonly tone: "safe" | "danger" | "warning" | "neutral";
  readonly detail?: string;
}

export function combatOutcome(snapshot: AdventureSnapshot, forecast: CombatForecast): CombatOutcome {
  const damage = forecast.events.reduce((total, event) => total + (event.kind === "hit" && event.targetId === forecast.playerId ? event.damage : 0), 0);
  const fallen = forecast.outcomes.some(outcome => outcome.id === forecast.playerId && outcome.health <= 0);
  const action = forecast.actions.find(entry => entry.actorId === forecast.playerId && entry.action !== "bait");
  let actionText = "No action planned";
  let failed = false;
  if (action) {
    const name = action.action === "strike" ? "Attack" : "Defend";
    failed = action.result !== "executed";
    switch (action.result) {
      case "executed": {
        if (action.action === "brace") actionText = "Defend activates";
        else {
          const hits = forecast.events.filter(event => event.kind === "hit" && event.sourceId === forecast.playerId && event.queueId === action.queueId);
          const defeated = forecast.events.some(event => event.kind === "defeat" && event.sourceId === forecast.playerId && event.queueId === action.queueId && event.targetId === action.targetId);
          const target = snapshot.threats.find(threat => threat.id === action.targetId);
          actionText = defeated && target ? `${target.name} defeated` : hits.length > 0 && hits.every(hit => hit.damage === 0) ? "Attack blocked" : "Attack connects";
        }
        break;
      }
      case "out-of-range": actionText = "Attack out of range"; break;
      case "behind-cover": actionText = "Attack stopped by cover"; break;
      case "target-unavailable": actionText = "Target unavailable"; break;
      case "moving": actionText = "Attack interrupted by movement"; break;
      case "insufficient-stamina": actionText = `${name} lacks stamina`; break;
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
  return {
    text: [fallen ? "You fall" : damage > 0 ? `Take ${damage} damage` : "No damage", actionText, collateral, extra].filter(Boolean).join(" · "),
    tone: fallen || damage > 0 ? "danger" : failed ? "warning" : action ? "safe" : "neutral",
    ...(hits.length ? { detail: hits.map(hit => `${hit.source} hits ${hit.target} for ${hit.damage} damage.`).join("\n") } : {}),
  };
}
