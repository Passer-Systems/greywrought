import type { AdventureSnapshot, ThreatView } from "../game/adventure-types.js";
import type { AdventureWorld } from "./adventure-world.js";

interface Plate {
  root: HTMLButtonElement; name: HTMLElement; health: HTMLElement; healthFill: HTMLElement;
  action: HTMLElement; clock: HTMLElement; fill: HTMLElement; queue: HTMLElement; response: HTMLElement;
  tether: HTMLElement;
}
interface Box { x: number; y: number; width: number; height: number; }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;
function span(className: string, parent: HTMLElement): HTMLSpanElement {
  const node = document.createElement("span"); node.className = className; parent.append(node); return node;
}
function write(node: HTMLElement, value: string): void { if (node.textContent !== value) node.textContent = value; }

export function createEnemyNameplates(host: HTMLElement, snapshot: AdventureSnapshot) {
  host.replaceChildren();
  const plates = new Map<string, Plate>();
  snapshot.threats.forEach((threat, index) => {
    const tether = span("nameplate-tether", host);
    const root = document.createElement("button"); root.type = "button"; root.className = "enemy-nameplate";
    root.dataset.enemyId = threat.id; root.hidden = true; host.append(root);
    const heading = span("nameplate-heading", root);
    span("nameplate-number", heading).textContent = String(index + 1);
    const name = span("nameplate-name", heading); name.textContent = threat.name;
    const healthTrack = span("nameplate-health", root);
    const healthFill = span("nameplate-health-fill", healthTrack), health = span("nameplate-health-value", healthTrack);
    const current = span("nameplate-current", root);
    const action = span("nameplate-action", current), clock = span("nameplate-clock", current);
    const track = span("nameplate-cast", root), fill = span("nameplate-cast-fill", track);
    const queue = span("nameplate-queue", root), response = span("nameplate-response", root);
    plates.set(threat.id, { root, name, health, healthFill, action, clock, fill, queue, response, tether });
  });
  return {
    render(snapshot: AdventureSnapshot, world: AdventureWorld) {
      const bounds = host.getBoundingClientRect();
      const occupied: Box[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(".adventure-vitals, .adventure-objective, .adventure-map, .adventure-bottom, .adventure-menu-button")) {
        const box = node.getBoundingClientRect();
        if (box.width) occupied.push({ x: box.left - bounds.left, y: box.top - bounds.top, width: box.width, height: box.height });
      }
      const visible = snapshot.threats.map(threat => ({ threat, anchor: world.projectThreat(threat.id) })).filter(({ threat, anchor }) =>
        anchor && threat.active && threat.health > 0 && Math.hypot(threat.position.x - snapshot.player.position.x, threat.position.z - snapshot.player.position.z) < 18);
      for (const { anchor } of visible) if (anchor) occupied.push({ x: anchor.x - 32, y: anchor.y, width: 64, height: Math.max(45, anchor.feetY - anchor.y) });
      const visibleIds = new Set(visible.map(({ threat }) => threat.id));
      for (const threat of snapshot.threats) {
        const plate = plates.get(threat.id); if (!plate) continue;
        plate.root.hidden = !visibleIds.has(threat.id); plate.tether.hidden = plate.root.hidden;
        Object.assign(plate.root.dataset, { phase: threat.phase, health: String(threat.health), remaining: String(threat.remainingSeconds), damage: String(threat.damage), actionSequence: String(threat.actionSequence), disposition: threat.disposition, aggro: String(threat.aggro), worldX: String(threat.position.x), worldZ: String(threat.position.z) });
      }
      // Selected and committed threats get the nearest free space first.
      visible.sort((a, b) => Number(b.threat.selected) - Number(a.threat.selected) || Number(b.threat.phase === "preparation") - Number(a.threat.phase === "preparation") || a.threat.id.localeCompare(b.threat.id));
      for (const { threat, anchor } of visible) {
        const plate = plates.get(threat.id); if (!plate || !anchor) continue;
        const { root } = plate;
        root.hidden = false;
        Object.assign(root.dataset, { phase: threat.phase, selected: String(threat.selected), disposition: threat.disposition, aggro: String(threat.aggro), hostile: String(threat.disposition === "hostile" || threat.aggro) });
        root.setAttribute("aria-pressed", String(threat.selected));
        write(plate.health, `${Math.ceil(threat.health)} / ${threat.maximumHealth}`);
        plate.healthFill.style.width = `${100 * threat.health / threat.maximumHealth}%`;
        const copy = intention(threat);
        write(plate.action, copy.action); write(plate.clock, copy.clock); write(plate.response, copy.response);
        if (plate.queue.dataset.copy !== copy.queue) {
          plate.queue.dataset.copy = copy.queue; plate.queue.replaceChildren();
          const steps = copy.queue.split(" → ");
          const lead = steps.shift() ?? "";
          steps.forEach((step, index) => {
            const chip = span("nameplate-step", plate.queue);
            span("nameplate-step-label", chip).textContent = index === 0 ? lead : "THEN";
            span("nameplate-step-title", chip).textContent = step;
          });
          if (!steps.length) write(plate.queue, lead);
        }
        root.setAttribute("aria-label", `Target ${threat.name}. ${copy.action}. ${copy.clock}. ${copy.queue}. ${copy.response}`);
        plate.fill.style.width = `${Math.max(0, Math.min(100, threat.remainingSeconds / Math.max(0.01, threat.phaseDuration) * 100))}%`;
        const width = root.offsetWidth, height = root.offsetHeight;
        let chosen: Box | undefined;
        const candidates: Box[] = [];
        for (const rise of [0, height + 12, 2 * (height + 12)]) for (const shift of [0, -width - 14, width + 14, -width / 2 - 14, width / 2 + 14]) {
          const box = { x: Math.max(8, Math.min(bounds.width - width - 8, anchor.x - width / 2 + shift)), y: Math.max(8, Math.min(bounds.height - height - 8, anchor.y - height - 18 - rise)), width, height };
          candidates.push(box);
          if (!chosen && !occupied.some(other => overlaps(box, other))) chosen = box;
        }
        chosen ??= candidates.sort((a, b) => occupied.filter(other => overlaps(a, other)).length - occupied.filter(other => overlaps(b, other)).length)[0];
        if (!chosen) continue;
        occupied.push(chosen);
        root.style.transform = `translate(${Math.round(chosen.x)}px, ${Math.round(chosen.y)}px)`;
        const startX = Math.max(chosen.x + 12, Math.min(chosen.x + width - 12, anchor.x)), startY = chosen.y + height;
        const dx = anchor.x - startX, dy = anchor.y - 5 - startY;
        plate.tether.hidden = false;
        plate.tether.style.cssText = `left:${startX}px;top:${startY}px;width:${Math.hypot(dx, dy)}px;transform:rotate(${Math.atan2(dy, dx)}rad)`;
        plate.tether.dataset.selected = String(threat.selected);
      }
    },
  };
}
function intention(threat: ThreatView): { action: string; clock: string; queue: string; response: string } {
  const alarm = threat.damage === 0;
  const attack = threat.intention;
  switch (threat.phase) {
    case "preparation": return {
      action: alarm ? "Preparing alarm" : attack, clock: `${threat.remainingSeconds.toFixed(1)}s`,
      queue: `NOW → ${alarm ? "Alarm" : `${threat.damage} damage`} → Recover → ${attack}`,
      response: alarm ? "Defeat the lookout to stop its alarms" : "Step outside amber · B / E: halve damage",
    };
    case "action": return { action: alarm ? "Alarm sounded" : attack, clock: alarm ? "DANGER ↑" : threat.lastActionHit ? "HIT" : "AVOIDED",
      queue: `NOW → Recover → ${attack}`, response: alarm ? "The forest grows more dangerous" : threat.lastActionHit ? "Brace halves damage; leaving the area avoids it" : "You were outside the attack" };
    case "recovery": return { action: "Recovering", clock: `${threat.remainingSeconds.toFixed(1)}s`, queue: `NEXT → Prepare → ${attack}`,
      response: alarm ? "Another alarm follows if you stay nearby" : "A moment to strike or reposition" };
    case "approach": return { action: "Closing in", clock: "", queue: "NEXT → Prepare → " + attack, response: "Keep your distance or ready your strike" };
    case "returning": return { action: "Returning home", clock: "", queue: "Leaving the fight", response: "" };
    case "dormant": return { action: threat.disposition === "neutral" && !threat.aggro ? "Neutral · will defend itself" : "Hostile · watching", clock: "", queue: `NEXT → ${attack}`, response: threat.selected ? threat.benefit : "" };
    case "cleared": return { action: "Defeated", clock: "", queue: "", response: "" };
  }
}
