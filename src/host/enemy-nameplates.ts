import type { AdventureSnapshot, ThreatView } from "../game/adventure-types.js";
import type { AdventureWorld } from "./adventure-world.js";
import { COMBAT_RULES } from "../game/adventure.js";
import { publicUrl } from "./public-url.js";
import { enemyRange, type RangeAudience } from "./combat-range.js";
import { enemyResponse, enemyResponseLabel } from "./enemy-response.js";

interface Plate {
  width: number; height: number;
  root: HTMLDivElement; target: HTMLButtonElement; health: HTMLElement; healthFill: HTMLElement;
  status: HTMLElement; level: HTMLElement; cast: ReturnType<typeof createEnemyCastBar>; shield: HTMLElement;
  opening: HTMLElement; openingClock: HTMLElement; effect: HTMLElement; effectClock: HTMLElement;
}
function span(className: string, parent: HTMLElement): HTMLSpanElement {
  const node = document.createElement("span"); node.className = className; parent.append(node); return node;
}
function write(node: HTMLElement, value: string): void { if (node.textContent !== value) node.textContent = value; }

export function createEnemyCastBar(parent: HTMLElement, id: string) {
  const root = document.createElement("button"); root.type = "button"; root.className = "enemy-cast-bar"; root.hidden = true;
  parent.append(root);
  const square = span("enemy-cast-icon", root);
  const icon = document.createElement("img"); icon.alt = ""; square.append(icon);
  const track = span("enemy-cast-track", root), fill = span("enemy-cast-fill", track);
  track.setAttribute("role", "progressbar"); track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100");
  const name = span("enemy-cast-name", track), clock = span("enemy-cast-clock", track);
  const tooltip = span("enemy-cast-tooltip", root); tooltip.id = "cast-" + id; tooltip.setAttribute("role", "tooltip");
  root.setAttribute("aria-describedby", tooltip.id);
  const artwork: Record<string, string> = {
    bite: "sword-strike", maul: "sword-strike", "ember-beam": "lightning-bolt", fireball: "fire-spell",
    "ember-ward": "defensive-shield", kindle: "energy-burst", nest: "poison-vial", warder: "nature-leaf",
    "ritual-guardian": "frost-spell", "foreman-pulse": "lightning-bolt", "foreman-press": "earth-stone", "foreman-shield": "defensive-shield",
  };
  return {
    root, tooltip,
    render(threat: ThreatView, snapshot: AdventureSnapshot, audience?: RangeAudience) {
      const cast = threat.cast;
      root.hidden = !cast || cast.status !== "casting" || !threat.active || !threat.aggro || threat.health <= 0;
      if (root.hidden || !cast) return;
      const { ability } = cast;
      const seconds = Math.max(0, cast.remainingSeconds);
      const progress = Math.max(0, Math.min(1, 1 - seconds / Math.max(0.01, cast.duration)));
      if (root.dataset.abilityId !== ability.id) {
        root.dataset.abilityId = ability.id;
        icon.src = publicUrl("assets/ui/icons/spells/" + (artwork[ability.id] ?? "sword-strike") + ".png");
      }
      write(name, ability.name);
      const time = seconds.toFixed(1) + "s";
      write(clock, time);
      fill.style.width = (progress * 100) + "%";
      track.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
      track.setAttribute("aria-label", ability.name);
      track.setAttribute("aria-valuetext", time + " remaining");
      root.dataset.remaining = String(seconds); root.dataset.duration = String(cast.duration);
      const range = enemyRange(snapshot, threat, ability, audience);
      root.dataset.range = range.state;
      const facts = [ability.damage > 0 ? ability.damage + " damage" : "Power / defense", ability.damage <= 0 ? "Self" : ability.id === "maul" ? COMBAT_RULES.wolf.lungeDistance + " m leap · " + ability.range + " m impact radius" : ability.range + " m range"];
      const response = [enemyResponseLabel(ability.id), enemyResponse(ability.id)].filter(Boolean).join(" · ");
      write(tooltip, [ability.name, facts.join(" · "), response, ability.description, "Casts in " + time + ".", range.text].filter(Boolean).join("\n"));
      root.setAttribute("aria-label", ability.name + ", " + time + " remaining." + (response ? " " + response : ""));
    },
  };
}
export function createEnemyNameplates(host: HTMLElement, snapshot: AdventureSnapshot) {
  host.replaceChildren();
  const plates = new Map<string, Plate>();
  snapshot.threats.forEach((threat) => {
    const root = document.createElement("div"); root.className = "enemy-nameplate";
    root.dataset.enemyId = threat.id; root.hidden = true; host.append(root);
    const target = document.createElement("button"); target.type = "button"; target.className = "nameplate-target";
    // The identity line leads the health bar, matching the compact nameplate
    // convention used by the rest of the game UI.
    const heading = span("nameplate-heading", target);
    const level = span("nameplate-level", heading); level.title = "Level " + threat.level; level.textContent = String(threat.level);
    span("nameplate-name", heading).textContent = threat.name;
    const status = span("nameplate-status", heading);
    const healthTrack = span("nameplate-health", target);
    const healthFill = span("nameplate-health-fill", healthTrack), health = span("nameplate-health-value", healthTrack);
    root.append(target);
    const cast = createEnemyCastBar(root, threat.id);
    const opening = span("nameplate-opening", root); opening.hidden = true;
    const openingIcon = document.createElement("img"); openingIcon.src = publicUrl("assets/ui/icons/spells/sword-strike.png"); openingIcon.alt = "Attack opening"; opening.append(openingIcon);
    const openingClock = span("nameplate-opening-clock", opening);
    const shield = span("nameplate-shield", root); shield.hidden = true;
    const effect = span("nameplate-rooted", root); effect.hidden = true; effect.title = "Rooted until you land";
    span("nameplate-effect-icon", effect).textContent = "\u2744";
    const effectClock = span("nameplate-effect-clock", effect);
    plates.set(threat.id, { width: 0, height: 0, root, target, health, healthFill, status, level, cast, shield, opening, openingClock, effect, effectClock });
  });
  let nextContentTime = 0;
  let bounds = { width: 0, height: 0 };
  return {
    render(snapshot: AdventureSnapshot, world: AdventureWorld, audience?: RangeAudience) {
      const now = performance.now();
      const refresh = now >= nextContentTime;
      if (refresh) { nextContentTime = now + 50; bounds = host.getBoundingClientRect(); }
      const visible = snapshot.threats.map(threat => ({ threat, anchor: world.projectThreat(threat.id) })).filter(({ threat, anchor }) =>
        anchor && threat.active && threat.health > 0 && Math.hypot(threat.position.x - snapshot.player.position.x, threat.position.z - snapshot.player.position.z) < 18);
      const visibleIds = new Set(visible.map(({ threat }) => threat.id));
      for (const threat of snapshot.threats) if (!visibleIds.has(threat.id)) world.setThreatNameplateVisible(threat.id, false);
      if (refresh) for (const threat of snapshot.threats) {
        const plate = plates.get(threat.id); if (!plate) continue;
        plate.root.hidden = !visibleIds.has(threat.id);
        Object.assign(plate.root.dataset, { phase: threat.phase, health: String(threat.health), remaining: String(threat.remainingSeconds), damage: String(threat.damage), actionSequence: String(threat.actionSequence), disposition: threat.disposition, aggro: String(threat.aggro), worldX: String(threat.position.x), worldZ: String(threat.position.z), rootedSeconds: String(threat.rootedSeconds), moving: String(threat.moving), currentAbility: threat.currentAbility.id, lastActionHit: String(threat.lastActionHit), movementMode: threat.movementMode, motionProgress: String(threat.motionProgress), nextAttackSeconds: String(threat.nextAttackSeconds), worldY: String(threat.position.y), targetX: String(threat.targetPosition.x), targetZ: String(threat.targetPosition.z), originX: String(threat.attackOrigin.x), originZ: String(threat.attackOrigin.z), block: String(threat.block), volley: String(threat.volley), projectileCount: String(threat.fireballs.length), cast: JSON.stringify(threat.cast && { id: threat.cast.ability.id, seconds: threat.cast.remainingSeconds, duration: threat.cast.duration }) });
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
          const opening = threat.aggro && (threat.phase === "recovery" || threat.currentActivity?.ability.id === "kindle") && threat.block === 0 && threat.canStrike;
          plate.opening.hidden = !opening;
          root.dataset.strikeOpening = String(opening);
          if (opening) {
            const seconds = threat.remainingSeconds.toFixed(1);
            write(plate.openingClock, seconds);
            plate.opening.title = "Exposed for " + seconds + "s. Attack before it recovers.";
          }
          plate.shield.hidden = threat.block <= 0;
          write(plate.shield, "⛨ " + threat.block); plate.shield.title = threat.block + " block · " + threat.blockSeconds.toFixed(1) + "s";
          plate.effect.hidden = threat.rootedSeconds <= 0;
          write(plate.effectClock, threat.rootedSeconds.toFixed(1));
          plate.healthFill.style.width = (100 * threat.health / threat.maximumHealth) + "%";
          plate.cast.render(threat, snapshot, audience);
          write(plate.status, threat.phase === "returning" ? "↶" : threat.disposition === "neutral" && !threat.aggro ? "\u25C7" : "\u25C6");
          plate.status.title = threat.phase === "returning" ? "Returning home · recovering" : threat.disposition === "neutral" && !threat.aggro ? "Neutral until attacked" : "Hostile";

          plate.width = root.offsetWidth; plate.height = root.offsetHeight;
        }
        const { width, height } = plate;
        const x = Math.max(8, Math.min(bounds.width - width - 8, anchor.x - width / 2));
        const y = anchor.y - height - 10;
        const fitsViewport = y >= 4 && y + height <= bounds.height - 4;
        world.setThreatNameplateVisible(threat.id, fitsViewport);
        root.style.visibility = fitsViewport ? "visible" : "hidden";
        root.style.transform = `translate(${x}px, ${y}px)`;
        root.dataset.tooltipBelow = String(y < 140);
        plate.cast.tooltip.style.left = `${Math.max(8 - x, Math.min(width / 2 - 120, bounds.width - 248 - x))}px`;
      }
    },
  };
}
