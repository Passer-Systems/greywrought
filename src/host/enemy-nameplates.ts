import type { AdventureSnapshot, ThreatAbilityView, ThreatView } from "../game/adventure-types.js";
import type { AdventureWorld } from "./adventure-world.js";
import { publicUrl } from "./public-url.js";

interface AbilityIcon { button: HTMLButtonElement; icon: HTMLElement; clock: HTMLElement; tooltip: HTMLElement; }
interface Plate {
  width: number; height: number;
  root: HTMLDivElement; target: HTMLButtonElement; health: HTMLElement; healthFill: HTMLElement;
  status: HTMLElement; level: HTMLElement; fill: HTMLElement; current: AbilityIcon; next: AbilityIcon; later: AbilityIcon; gap: HTMLElement; nextArrow: HTMLElement; laterArrow: HTMLElement; shield: HTMLElement;
  opening: HTMLElement; openingClock: HTMLElement; effect: HTMLElement; effectClock: HTMLElement;
}
function span(className: string, parent: HTMLElement): HTMLSpanElement {
  const node = document.createElement("span"); node.className = className; parent.append(node); return node;
}
function write(node: HTMLElement, value: string): void { if (node.textContent !== value) node.textContent = value; }
function abilityIcon(parent: HTMLElement, enemyId: string, slot: "current" | "next" | "later"): AbilityIcon {
  const button = document.createElement("button"); button.type = "button"; button.className = "nameplate-ability";
  button.dataset.abilitySlot = slot; parent.append(button);
  const square = span("nameplate-ability-square", button);
  const icon = span("nameplate-ability-art", square), clock = span("nameplate-ability-clock", square);
  const tooltip = span("nameplate-tooltip", button); tooltip.id = "intent-" + enemyId + "-" + slot; tooltip.setAttribute("role", "tooltip");
  button.setAttribute("aria-describedby", tooltip.id);
  return { button, icon, clock, tooltip };
}
function renderAbility(view: AbilityIcon, ability: ThreatAbilityView, threat: ThreatView, next: boolean, forecast?: ThreatView["forecast"][number]): void {
  if (view.button.dataset.abilityId !== ability.id) {
    view.button.dataset.abilityId = ability.id;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 32 32"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", ability.id === "bite" ? "M5 6L11 8L13 17L16 12L19 17L21 8L27 6L25 24L20 28L12 28L7 24ZM10 20L12 24L20 24L22 20L18 22L16 19L14 22Z" : ability.id === "maul" ? "M6 4L12 6L10 17L4 28L6 16ZM16 3L21 5L18 19L11 29L14 16ZM25 5L29 8L25 21L19 28L22 17Z" : "M24 3L29 8L17 20L20 23L17 26L13 22L7 29L3 25L10 18L6 14L9 11L12 14Z");
    svg.append(path);
    const artwork: Record<string,string> = {"ember-beam":"lightning-bolt",fireball:"fire-spell","ember-ward":"defensive-shield",kindle:"energy-burst",nest:"poison-vial",warder:"nature-leaf","ritual-guardian":"frost-spell"};
    if (artwork[ability.id]) { const img=document.createElement("img");img.src=publicUrl("assets/ui/icons/spells/"+artwork[ability.id]+".png");img.alt="";view.icon.replaceChildren(img); }
    else view.icon.replaceChildren(svg);
  }
  const seconds = forecast?.remainingSeconds ?? 0;
  const stored = forecast?.status === "stored";
  const active = forecast?.status === "active";
  view.button.dataset.state = active ? "active" : stored ? "waiting" : "warning";
  view.button.dataset.remaining = String(seconds);
  view.button.dataset.forecastStatus = forecast?.status ?? (stored ? "stored" : "pending");
  write(view.clock, stored ? "" : active ? seconds > 0 ? seconds.toFixed(1) + "s" : "NOW" : seconds <= 0 ? "Ready" : seconds.toFixed(1) + "s");
  const timing = stored ? "Stored opener: used on engagement as soon as you are in range." : active ? "Resolving now." : "Happens in " + seconds.toFixed(1) + " seconds. This move is already committed.";
  const facts = [ability.damage > 0 ? ability.damage + " damage" : "Power / defense", ability.range > 0 ? ability.range + " m range" : "Self"];
  const detail = [ability.name, facts.join(" · "), ability.description, timing].join("\n");
  write(view.tooltip, detail);
  view.button.setAttribute("aria-label", (active ? "Active" : stored ? "Opener" : next ? "Then" : "Next") + ": " + ability.name + ". " + timing);

}
export function createEnemyNameplates(host: HTMLElement, snapshot: AdventureSnapshot) {
  host.replaceChildren();
  const plates = new Map<string, Plate>();
  snapshot.threats.forEach((threat) => {
    const root = document.createElement("div"); root.className = "enemy-nameplate";
    root.dataset.enemyId = threat.id; root.hidden = true; host.append(root);
    const row = span("nameplate-intents", root);
    const current = abilityIcon(row, threat.id, "current");
    const nextArrow = span("nameplate-queue-arrow", row); nextArrow.textContent = "›";
    const next = abilityIcon(row, threat.id, "next");
    const laterArrow = span("nameplate-queue-arrow", row); laterArrow.textContent = "›";
    const gap = span("nameplate-wait", row);
    const later = abilityIcon(row, threat.id, "later");
    const target = document.createElement("button"); target.type = "button"; target.className = "nameplate-target";
    // The identity line leads the health bar, matching the compact nameplate
    // convention used by the rest of the game UI.
    const heading = span("nameplate-heading", target);
    const level = span("nameplate-level", heading); level.title = "Level " + threat.level; level.textContent = String(threat.level);
    span("nameplate-name", heading).textContent = threat.name;
    const status = span("nameplate-status", heading);
    const healthTrack = span("nameplate-health", target);
    const healthFill = span("nameplate-health-fill", healthTrack), health = span("nameplate-health-value", healthTrack);
    root.append(target, row);
    const track = span("nameplate-cast", root), fill = span("nameplate-cast-fill", track);
    const opening = span("nameplate-opening", root); opening.hidden = true;
    const openingIcon = document.createElement("img"); openingIcon.src = publicUrl("assets/ui/icons/spells/sword-strike.png"); openingIcon.alt = "Lunge opening"; opening.append(openingIcon);
    const openingClock = span("nameplate-opening-clock", opening);
    const shield = span("nameplate-shield", root); shield.hidden = true;
    const effect = span("nameplate-rooted", root); effect.hidden = true; effect.title = "Rooted until you land";
    span("nameplate-effect-icon", effect).textContent = "\u2744";
    const effectClock = span("nameplate-effect-clock", effect);
    plates.set(threat.id, { width: 0, height: 0, root, target, health, healthFill, status, level, fill, current, next, later, gap, nextArrow, laterArrow, shield, opening, openingClock, effect, effectClock });
  });
  let nextContentTime = 0;
  let bounds = { width: 0, height: 0 };
  return {
    render(snapshot: AdventureSnapshot, world: AdventureWorld) {
      const now = performance.now();
      const refresh = now >= nextContentTime;
      if (refresh) { nextContentTime = now + 50; bounds = host.getBoundingClientRect(); }
      const visible = snapshot.threats.map(threat => ({ threat, anchor: world.projectThreat(threat.id) })).filter(({ threat, anchor }) =>
        anchor && threat.active && threat.health > 0 && Math.hypot(threat.position.x - snapshot.player.position.x, threat.position.z - snapshot.player.position.z) < 18);
      const visibleIds = new Set(visible.map(({ threat }) => threat.id));
      if (refresh) for (const threat of snapshot.threats) {
        const plate = plates.get(threat.id); if (!plate) continue;
        plate.root.hidden = !visibleIds.has(threat.id);
        Object.assign(plate.root.dataset, { phase: threat.phase, health: String(threat.health), remaining: String(threat.remainingSeconds), damage: String(threat.damage), actionSequence: String(threat.actionSequence), disposition: threat.disposition, aggro: String(threat.aggro), worldX: String(threat.position.x), worldZ: String(threat.position.z), rootedSeconds: String(threat.rootedSeconds), moving: String(threat.moving), currentAbility: threat.currentAbility.id, nextAbility: threat.nextAbility.id, lastActionHit: String(threat.lastActionHit), movementMode: threat.movementMode, motionProgress: String(threat.motionProgress), nextAttackSeconds: String(threat.nextAttackSeconds), worldY: String(threat.position.y), targetX: String(threat.targetPosition.x), targetZ: String(threat.targetPosition.z), originX: String(threat.attackOrigin.x), originZ: String(threat.attackOrigin.z), block: String(threat.block), volley: String(threat.volley), projectileCount: String(threat.fireballs.length), forecast: JSON.stringify(threat.forecast.map(move => ({id:move.ability.id, seconds:move.remainingSeconds, status:move.status}))) });
      }
      for (const { threat, anchor } of visible) {
        const plate = plates.get(threat.id); if (!plate || !anchor) continue;
        const { root } = plate;
        const updateContent = refresh || root.hidden;
        if (root.hidden) root.hidden = false;
        if (updateContent) {
          Object.assign(root.dataset, { phase: threat.phase, selected: String(threat.selected), disposition: threat.disposition, aggro: String(threat.aggro), hostile: String(threat.disposition === "hostile" || threat.aggro) });
          plate.target.setAttribute("aria-pressed", String(threat.selected));
          plate.target.setAttribute("aria-label", "Target " + threat.name + ". " + Math.ceil(threat.health) + " of " + threat.maximumHealth + " health. " + threat.benefit);
          write(plate.health, Math.ceil(threat.health) + " (" + Math.round(100*threat.health/threat.maximumHealth) + "%)");
          write(plate.level, String(threat.level));
          const opening = snapshot.combat.phase === "active" && (threat.phase === "recovery" || threat.currentAbility.id === "kindle") && threat.block === 0 && threat.canStrike;
          plate.opening.hidden = !opening;
          root.dataset.strikeOpening = String(opening);
          if (opening) {
            const seconds = threat.remainingSeconds.toFixed(1);
            write(plate.openingClock, seconds);
            plate.opening.title = "Enemy open for " + seconds + "s. " + (threat.selected ? "Q queues Lunge at your next free beat." : "Select this enemy, then Q queues Lunge.");
          }
          plate.shield.hidden = threat.block <= 0;
          write(plate.shield, "⛨ " + threat.block); plate.shield.title = threat.block + " block · " + threat.blockSeconds.toFixed(1) + "s";
          plate.effect.hidden = threat.rootedSeconds <= 0;
          write(plate.effectClock, threat.rootedSeconds.toFixed(1));
          plate.healthFill.style.width = (100 * threat.health / threat.maximumHealth) + "%";
          const [first, second] = threat.forecast;
          const active = threat.currentActivity;
          plate.current.button.hidden = false;
          if (active) renderAbility(plate.current, active.ability, threat, false, active);
          else {
            const recovering = threat.phase === "recovery";
            const seconds = recovering ? threat.remainingSeconds : first?.remainingSeconds ?? 0;
            if (plate.current.button.dataset.abilityId !== "pause") {
              plate.current.button.dataset.abilityId = "pause";
              const symbol = document.createElement("span"); symbol.className = "nameplate-pause-symbol"; symbol.textContent = "Ⅱ"; plate.current.icon.replaceChildren(symbol);
            }
            plate.current.button.dataset.state = "waiting";
            write(plate.current.clock, !threat.aggro ? "" : seconds.toFixed(1) + "s");
            const detail = !threat.aggro ? "Watching. The stored opener fires when you engage and enter range." : threat.joinsNextWindow ? "Approaching. Joins the next shared active window without resetting the fight." : recovering ? "Recovering for " + seconds.toFixed(1) + " seconds. Attacks happen during the shared active window." : "Pause before the next special: " + seconds.toFixed(1) + " seconds. Prepare your next moves.";
            write(plate.current.tooltip, detail); plate.current.button.setAttribute("aria-label", detail);
          }
          plate.next.button.hidden = !first; plate.nextArrow.hidden = !first;
          plate.later.button.hidden = !second; plate.laterArrow.hidden = !second;
          plate.gap.hidden = !second || !first || second.remainingSeconds - first.remainingSeconds < .05;
          if (first) {
            renderAbility(plate.next, first.ability, threat, false, first);
          }
          if (second && first) {
            renderAbility(plate.later, second.ability, threat, true, second);
            const delay = Math.max(0, second.remainingSeconds-first.remainingSeconds);
            write(plate.gap, "Ⅱ " + delay.toFixed(1) + "s ›");
            plate.gap.title = delay.toFixed(1) + " seconds after " + first.ability.name;
            if (delay < .05) { write(plate.laterArrow, "+"); plate.laterArrow.title = "Together"; }
            else { write(plate.laterArrow, "›"); plate.laterArrow.title = "Then"; }
          }
          write(plate.status, threat.disposition === "neutral" && !threat.aggro ? "\u25C7" : "\u25C6");
          plate.status.title = threat.disposition === "neutral" && !threat.aggro ? "Neutral until attacked" : "Hostile";
          plate.fill.style.width = Math.max(0, Math.min(100, threat.remainingSeconds / Math.max(0.01, threat.phaseDuration) * 100)) + "%";
          plate.width = root.offsetWidth; plate.height = root.offsetHeight;
        }
        const { width, height } = plate;
        const x = Math.max(8, Math.min(bounds.width - width - 8, anchor.x - width / 2));
        const y = anchor.y - height - 10;
        const fitsViewport = y >= 4 && y + height <= bounds.height - 4;
        root.style.visibility = fitsViewport ? "visible" : "hidden";
        root.style.transform = `translate(${x}px, ${y}px)`;
        root.dataset.tooltipBelow = String(y < 140);
        for (const ability of [plate.current, plate.next, plate.later]) ability.tooltip.style.left = `${Math.max(8 - x, Math.min(width / 2 - 120, bounds.width - 248 - x))}px`;
      }
    },
  };
}
