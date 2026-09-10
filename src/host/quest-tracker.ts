import type { AdventureSnapshot } from "../game/adventure-types.js";
import { QUESTS, YARD } from "../game/yard-content.js";

export function updateQuestTracker(s: AdventureSnapshot): void {
  const view = s.quests.find(q => q.status === "active" || q.status === "ready") ?? s.quests.find(q => q.status === "available");
  const definition = QUESTS.find(q => q.id === view?.id);
  const complete = s.quests.every(q => q.status === "completed");
  const returning = view?.status === "ready";
  const offered = view?.status === "available";
  let destinationId = returning || offered ? definition?.giver : definition?.destinationId;
  let title = offered ? `Speak with ${definition?.giverName}` : returning ? `Return to ${definition?.giverName}` : definition?.title ?? "The shift is over";
  let detail = offered ? `Find ${definition?.giverName} in ${YARD.settlement}. Press F to talk and accept “${definition?.title}”.`
    : returning ? `Your task is done. Speak with ${definition?.giverName} and choose Complete quest to receive your reward.`
    : definition?.objective ?? "The names are home. Rowan has a place for you at the table.";
  let warning = "";
  if (view?.status === "active" && view.id === "cold-hands") {
    detail = "Gather blue coolant crystals beyond the gate. Click the crystals or press G nearby. Bring three back to Mara.";
    warning = s.threats.some(t => t.id === "warder" && t.health > 0) ? "The live line costs 8 health per gather while its linekeeper stands. Keep the crystals for Mara; do not trade them." : "The linekeeper is defeated. Gathering is safe. Keep three crystals for Mara.";
  }
  if (view?.status === "active" && view.id === "roll-call") detail = "Defeat the Cinder Watchman by the broken line. Then return to Rowan at the inn.";
  if (view?.status === "active" && view.id === "last-shift") {
    const foreman = s.threats.find(t => t.id === "ritual-guardian");
    const roll = s.loot.find(item => item.kind === "relic" && item.available);
    if (!s.ritualCalled) {
      destinationId = s.cargo >= 6 ? "ritual-site" : "frost-cores";
      detail = s.cargo >= 6 ? `Go to the ${YARD.works}. Press R nearby to offer six carried crystals.` : "Gather six coolant crystals to wake the engine. Stay beyond the gate: entering town trades spare crystals for supplies.";
      warning = `${s.cargo} / 6 carried crystals · Equip your earned coat and weapon in town before you leave.`;
    } else if (roll) {
      detail = "Approach Foreman Nine’s remains. Press F, then take the Last Shift Roll. Return it to Rowan.";
    } else {
      detail = "Defeat Foreman Nine. Read the next attack, then recover the Last Shift Roll from its remains.";
      warning = foreman?.health === 0 ? "Find the Last Shift Roll before returning to Rowan." : "Block the pulse, leave the press, and recover while its shield holds.";
    }
  }
  if (s.phase === "lost") { title = "Journey ended"; detail = "This adventurer has fallen. Choose a new character to begin again."; warning = "Your carried loot was lost."; }
  const set = (id: string, value: string) => {
    const node = document.getElementById(id)!;
    if (node.textContent !== value) node.textContent = value;
  };
  set("quest-title", YARD.questTitle);
  set("route-objective", title);
  set("route-detail", detail);
  set("route-warning", warning);
  document.getElementById("route-warning")!.hidden = !warning;
  set("quest-progress", complete ? "COMPLETE" : offered ? "NEW QUEST" : view ? `${view.progress} / ${view.required}` : "");
  QUESTS.forEach((quest, index) => {
    const state = s.quests.find(q => q.id === quest.id)?.status ?? "locked";
    const row = document.getElementById(`quest-step-${index}`)!;
    row.dataset.state = state === "completed" ? "done" : quest.id === view?.id ? "current" : "future";
    if (quest.id === view?.id) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current");
    set(`quest-step-${index}`, `${state === "completed" ? "✓" : state === "available" ? "!" : state === "ready" ? "?" : index + 1 + "."} ${quest.title}`);
  });
  const destination = s.places.find(p => p.id === destinationId);
  const threat = s.threats.find(t => t.id === destinationId);
  const target = destination?.position ?? threat?.position;
  const targetName = returning || offered ? definition?.giverName : destination?.name ?? threat?.name;
  let direction = "";
  if (target && !complete && s.phase !== "lost") {
    const dx = target.x - s.player.position.x, dz = target.z - s.player.position.z;
    const distance = Math.hypot(dx, dz);
    const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) + 8) % 8];
    direction = `${targetName} · ${distance <= 3 ? "Nearby" : `${compass} · ${Math.ceil(distance)} m`}`;
  }
  set("quest-destination", direction);
  document.getElementById("quest-destination")!.hidden = !direction;
  document.getElementById("quest-tracker")!.dataset.step = complete ? "complete" : view?.id ?? "none";
  for (const marker of document.querySelectorAll<HTMLElement>("[data-map-place], .map-enemy[data-enemy-id]")) {
    marker.classList.toggle("quest-destination", !complete && s.phase !== "lost" && (marker.dataset.mapPlace ?? marker.dataset.enemyId) === destinationId);
  }
  set("cargo-summary", `Carried: ${s.cargo} crystals · ${s.carriedSalvage} salvage${s.carriedRelics ? " · Last Shift Roll" : ""}`);
}
