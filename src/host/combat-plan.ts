import type { AdventureSnapshot, CombatAction, QueuedCombatAction, ThreatAbilityView, ThreatView } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";
import { enemyRange, playerRange, type RangeAudience } from "./combat-range.js";
import { GEAR, gearName } from "../game/yard-content.js";
import { classAction } from "../game/class-kit.js";
import { enemyResponse } from "./enemy-response.js";

const actions: Record<CombatAction, { name: string; icon: string }> = {
  strike: { name: "Lunge", icon: "sword-strike" },
  brace: { name: "Block", icon: "defensive-shield" },
  disengage: { name: "Disengage", icon: "mobility-boots" },
  bloodRage: { name: "Blood Rage", icon: "energy-burst" },
  jab: { name: "Jab", icon: "sword-strike" },
  guard: { name: "Guard", icon: "protective-ward" },
  drinkPotion: { name: "Health potion", icon: "items/health-potion-red" },
};
const enemyArt: Record<string, string> = {
  "ember-beam": "lightning-bolt", fireball: "fire-spell", "ember-ward": "defensive-shield",
  kindle: "energy-burst", maul: "sword-strike", nest: "poison-vial",
  warder: "nature-leaf", "ritual-guardian": "frost-spell",
  "foreman-pulse": "lightning-bolt", "foreman-press": "earth-stone", "foreman-shield": "defensive-shield",
};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; parent.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function art(parent: HTMLElement, icon: string): void {
  const image = node("img", "", parent); image.src = publicUrl("assets/ui/icons/" + (icon.startsWith("items/") ? icon : "spells/" + icon) + (icon.endsWith(".svg") || icon.endsWith(".png") ? "" : ".png")); image.alt = "";
}

export function createCombatPlan(host: HTMLElement, callbacks: {
  onSelect: () => void;
  onReplace: (id: number, action: CombatAction) => boolean;
  onRemove: (id: number) => void;
  onClear: () => void;
  onMove: (id: number, offsetSeconds: number) => void;
  rangeAudience?: () => RangeAudience | undefined;
}) {
  const root = node("section", "combat-plan", host); root.id = "combat-plan"; root.hidden = true;
  root.setAttribute("aria-label", "Shared combat timing");
  const header = node("header", "combat-plan-heading", root);
  const phase = node("strong", "combat-plan-phase", header); phase.id = "combat-plan-phase";
  const resources = node("span", "combat-plan-resources", header);
  const clear = node("button", "combat-plan-clear", header); clear.type = "button"; clear.textContent = "Clear";
  clear.addEventListener("click", callbacks.onClear);
  const staminaHint = node("p", "combat-plan-stamina-hint", root);
  staminaHint.setAttribute("role", "status");
  staminaHint.textContent = "No stamina left. Remove or replace a move to change your plan.";
  const danger = node("span", "combat-plan-danger", header); danger.id = "combat-plan-danger";
  danger.setAttribute("role", "status");
  const clock = node("div", "combat-plan-clock", root), clockFill = node("span", "", clock);
  const grid = node("div", "combat-plan-grid", root);
  const rows = Array.from({ length: 3 }, (_, beat) => {
    const row = node("div", "combat-plan-beat-row", grid); row.dataset.beat = String(beat);
    const player = node("div", "combat-plan-cell combat-plan-player", row);
    const tick = node("div", "combat-plan-tick", row);
    node("strong", "", tick).textContent = "Turn " + (beat + 1);
    node("span", "", tick).textContent = beat + "s";
    const enemy = node("div", "combat-plan-cell combat-plan-enemy", row); enemy.dataset.beat = String(beat);
    return { row, player, enemy };
  });
  const cells = rows.map(row => row.player), enemyCells = rows.map(row => row.enemy);
  const joining = node("p", "combat-plan-joining", root); joining.hidden = true;
  cells.forEach((cell, offset) => {
    cell.dataset.beat = String(offset);
    cell.addEventListener("dragover", event => {
      if (!event.dataTransfer?.types.includes("application/x-greywrought-move")) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move"; cell.dataset.drop = "true";
    });
    cell.addEventListener("dragleave", () => { delete cell.dataset.drop; });
    cell.addEventListener("drop", event => {
      event.preventDefault(); delete cell.dataset.drop;
      const raw = event.dataTransfer?.getData("application/x-greywrought-move");
      if (raw && Number.isInteger(Number(raw))) callbacks.onMove(Number(raw), offset);
    });
  });
  const help = node("p", "combat-plan-help", root);
  help.textContent = "Click a move, then an ability to replace · Right-click removes · Drag to swap";
  const feedback = node("p", "combat-plan-feedback", root); feedback.id = "combat-plan-feedback";
  feedback.setAttribute("role", "status");
  const buttons = new Map<number, HTMLButtonElement>();
  let selectedId: number | null = null, lastId: number | null = null;
  let replacementId: number | null = null;
  let snapshot: AdventureSnapshot | null = null;
  const enemyTiles = new Map<string, { tile: HTMLSpanElement; damage: HTMLSpanElement; source: HTMLSpanElement; health: HTMLSpanElement; fill: HTMLSpanElement; tooltip: HTMLSpanElement }>();
  function actionLabel(action: CombatAction): string {
    return snapshot ? classAction(snapshot.player.archetype, action).name : actions[action].name;
  }
  function removeSelected(): void { if (selectedId !== null) callbacks.onRemove(selectedId); }
  function moveSelected(offsetSeconds: number): void { if (selectedId !== null) callbacks.onMove(selectedId, offsetSeconds); }
  function enemyMove(cell: HTMLElement, enemy: ThreatView, ability: ThreatAbilityView, seconds: number, status: string): void {
    const id = enemy.id + ":" + ability.id;
    let view = enemyTiles.get(id);
    if (!view) {
      const tile = node("span", "combat-plan-enemy-move", cell); tile.tabIndex = 0;
      const picture = node("span", "combat-plan-enemy-art", tile); art(picture, enemyArt[ability.id] ?? "sword-strike");
      const damage = node("span", "combat-plan-damage", picture);
      const source = node("span", "combat-plan-enemy-source", tile);
      const health = node("span", "combat-plan-enemy-health", tile), fill = node("span", "", health);
      const tooltip = node("span", "combat-plan-tooltip", tile); tooltip.setAttribute("role", "tooltip");
      view = { tile, damage, source, health, fill, tooltip }; enemyTiles.set(id, view);
    }
    if (view.tile.parentElement !== cell) cell.append(view.tile);
    const beat = Math.min(2, Math.max(0, Math.floor(seconds)));
    const state = status === "stored" ? "Stored opener" : status === "pending" ? "Planned" : status === "active" ? "In progress" : "Resolved";
    const range = status === "resolved" || !snapshot ? null : enemyRange(snapshot, enemy, ability, callbacks.rangeAudience?.());
    view.tile.dataset.range = range?.state ?? "none";
    const response = enemyResponse(ability.id);
    const detail = enemy.name + " · " + ability.name + "\n" + ability.damage + " damage · Turn " + (beat + 1) + " · " + seconds.toFixed(2).replace(/0$/, "") + "s · " + state + "\n" + ability.description + (response ? "\nResponse: " + response : "") + (range?.text ? "\n" + range.text : "");
    view.tile.setAttribute("aria-label", detail);
    Object.assign(view.tile.dataset, { enemyId: enemy.id, abilityId: ability.id, offset: String(seconds), status });
    write(view.damage, status === "resolved" ? "✓" : ability.damage ? String(ability.damage) : "");
    write(view.source, enemy.name); write(view.tooltip, detail);
    view.health.setAttribute("aria-label", enemy.name + " · " + enemy.health + "/" + enemy.maximumHealth + " health");
    view.fill.style.width = Math.max(0, Math.min(100, 100 * enemy.health / enemy.maximumHealth)) + "%";
  }
  return {
    removeSelected, moveSelected,
    get replacementId(): number | null { return replacementId; },
    replaceSelected(action: CombatAction): boolean {
      if (replacementId === null) return false;
      if (callbacks.onReplace(replacementId, action)) replacementId = null;
      if (snapshot) this.update(snapshot);
      return true;
    },
    reset(): void { selectedId = lastId = replacementId = null; snapshot = null; for (const view of enemyTiles.values()) view.tile.remove(); enemyTiles.clear(); },
    update(next: AdventureSnapshot): void {
      snapshot = next;
      const combat = next.combat;
      const enemy = next.threats.find(threat => threat.id === next.selectedThreat && threat.active && threat.health > 0);
      const attackers = next.threats.filter(threat => threat.active && threat.health > 0 && threat.aggro);
      root.dataset.enemies = String(attackers.length);
      danger.hidden = attackers.length < 2;
      danger.dataset.severity = attackers.length >= 3 ? "critical" : "danger";
      write(danger, `${attackers.length} enemies`);
      danger.title = attackers.map(threat => threat.name + (threat.joinsNextWindow ? " · joining next window" : "")).join("\n");
      root.hidden = next.phase !== "expedition" || (!enemy && combat.phase === "idle");
      Object.assign(root.dataset, { phase: combat.phase, cycle: String(combat.cycle), remaining: String(combat.remainingSeconds), elapsed: String(combat.elapsedSeconds), queued: JSON.stringify(combat.queued), selectedId: String(selectedId ?? "") });
      const choosing = combat.phase === "choosing";
      const phaseLabel = combat.phase === "idle" ? playerRange(next, "strike").state === "out" ? "Out of range" : "Ready" : choosing ? "Choosing" : combat.phase === "preparation" ? "Prepare " + combat.remainingSeconds.toFixed(1) + "s" : "Active";
      write(phase, "Combat · " + phaseLabel);
      phase.title = "Round " + combat.cycle + " · three action turns, then preparation";
      write(resources, combat.availableStamina + " stamina");
      resources.title = combat.availableStamina + " stamina free · " + combat.reservedStamina + " reserved · " + combat.queued.length + "/3 moves queued";
      clock.title = phaseLabel + " · " + combat.remainingSeconds.toFixed(1) + "s remaining";

      staminaHint.hidden = combat.availableStamina > 0 || combat.queued.length >= 3;
      clockFill.style.width = (combat.phase === "idle" ? 0 : 100 * combat.elapsedSeconds / (combat.elapsedSeconds + combat.remainingSeconds)) + "%";
      clear.disabled = !combat.queued.some(entry => entry.status === "pending");
      const newest = combat.queued.reduce<QueuedCombatAction | undefined>((latest, move) => !latest || move.id > latest.id ? move : latest, undefined);
      if (newest && newest.id !== lastId) { selectedId = lastId = newest.id; }
      if (!combat.queued.some(entry => entry.id === selectedId)) selectedId = newest?.id ?? null;
      if (!combat.queued.some(entry => entry.id === replacementId && entry.status === "pending")) replacementId = null;
      root.dataset.replacementId = String(replacementId ?? "");
      root.dataset.selectedId = String(selectedId ?? "");
      for (const [id, button] of buttons) if (!combat.queued.some(entry => entry.id === id)) { button.remove(); buttons.delete(id); }
      for (const move of combat.queued) {
        let button = buttons.get(move.id);
        const cell = cells[Math.min(2, Math.max(0, Math.floor(move.offsetSeconds)))];
        if (!cell) continue;
        if (!button) {
          button = node("button", "combat-plan-move", cell); button.type = "button";
          button.dataset.queueId = String(move.id); art(button, move.action === "equip" ? "items/leather-satchel" : actions[move.action].icon);
          node("span", "combat-plan-move-time", button);
          const cost = node("span", "combat-plan-move-cost", button);
          cost.textContent = String(move.cost); cost.title = move.cost + " stamina";
          button.addEventListener("click", () => {
            if (!snapshot?.combat.queued.some(entry => entry.id === move.id && entry.status === "pending")) return;
            selectedId = move.id; replacementId = replacementId === move.id ? null : move.id;
            if (snapshot) this.update(snapshot);
            callbacks.onSelect();
          });
          button.addEventListener("contextmenu", event => {
            event.preventDefault(); callbacks.onRemove(move.id);
          });
          button.addEventListener("dragstart", event => {
            if (!snapshot?.combat.queued.some(entry => entry.id === move.id && entry.status === "pending")) { event.preventDefault(); return; }
            replacementId = null;
            selectedId = move.id; root.dataset.selectedId = String(move.id);
            event.dataTransfer?.setData("application/x-greywrought-move", String(move.id));
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          });
          button.addEventListener("dragend", () => { for (const cell of cells) delete cell.dataset.drop; });
          buttons.set(move.id, button);
        }
        const ranged = next.player.archetype !== "warrior" && move.action === "strike";
        const weaponArt = classAction(next.player.archetype, "strike").icon.replace("assets/ui/icons/spells/", "");
        let moveName: string, moveIcon: string;
        if (move.action === "equip") {
          const gear = move.gear.item ?? (move.gear.slot === "chest" ? "insulated-coat" : "yard-weapon");
          moveName = `${move.gear.item ? "Equip" : "Unequip"} ${gearName(gear, next.player.archetype)}`;
          moveIcon = gear === "yard-weapon" ? weaponArt : GEAR[gear].icon + ".png";
        } else {
          moveName = actionLabel(move.action);
          moveIcon = ranged ? weaponArt : classAction(next.player.archetype, move.action).icon.replace("assets/ui/icons/spells/", "");
        }
        const moveImage = button.querySelector<HTMLImageElement>("img");
        if (moveImage && !moveImage.src.endsWith("/" + moveIcon)) moveImage.src = publicUrl("assets/ui/icons/" + (moveIcon.startsWith("items/") ? "" : "spells/") + moveIcon);
        if (button.parentElement !== cell) cell.append(button);
        button.dataset.status = move.status; button.dataset.queuedAction = move.action; button.dataset.offset = String(move.offsetSeconds);
        button.draggable = move.status === "pending";
        button.dataset.replacing = String(move.id === replacementId);
        const costLabel = button.querySelector<HTMLElement>(".combat-plan-move-cost")!;
        write(costLabel, String(move.cost)); costLabel.title = move.cost + " stamina";
        button.setAttribute("aria-pressed", String(move.id === selectedId));
        const target = next.threats.find(threat => threat.id === move.targetId)?.name;
        const range = move.status === "pending" && move.action !== "equip" ? playerRange(next, move.action, move.targetId) : null;
        button.dataset.range = range?.state ?? "none";
        const label = moveName + " at " + move.offsetSeconds.toFixed(1) + "s · " + move.cost + " stamina" + (target ? " · " + target : "") + " · " + move.status + (move.reason ? ": " + move.reason : "") + (range?.text ? " · " + range.text : "");
        button.title = label + (move.status === "pending" ? " · Click to replace · Right-click to remove" : ""); button.setAttribute("aria-label", label);
        write(button.querySelector<HTMLElement>(".combat-plan-move-time")!, move.status === "executed" ? "✓" : move.status === "failed" ? "×" : move.offsetSeconds.toFixed(1) + "s");
      }
      const visibleEnemies = combat.phase === "idle" ? enemy ? [enemy] : [] : attackers;
      const shown = choosing ? [] : visibleEnemies.flatMap<{ source: ThreatView; ability: ThreatAbilityView; seconds: number; status: "stored" | "pending" | "active" | "resolved" }>(source => {
        if (combat.phase === "active" && source.joinsNextWindow) return [];
        if (source.windowAction) return [{ source, ability: source.windowAction.ability, seconds: source.windowAction.offsetSeconds, status: source.windowAction.status }];
        if (combat.phase === "idle") return source.forecast.slice(0, 1).map(move => ({ source, ability: move.ability, seconds: 0, status: move.status }));
        return [];
      });
      const visibleIds = new Set(shown.map(move => move.source.id + ":" + move.ability.id));
      for (const [id, view] of enemyTiles) if (!visibleIds.has(id)) { view.tile.remove(); enemyTiles.delete(id); }
      for (const move of shown) {
        const cell = enemyCells[Math.min(2, Math.max(0, Math.floor(move.seconds)))];
        if (cell) enemyMove(cell, move.source, move.ability, Math.max(0, move.seconds), move.status);
      }
      const arriving = attackers.filter(source => source.joinsNextWindow);
      joining.hidden = !(combat.phase === "active" && arriving.length > 0);
      write(joining, arriving.map(source => source.name).join(", ") + " · joining next window");
      for (let i = 0; i < rows.length; i++) {
        const current = String(combat.phase === "active" && Math.floor(combat.elapsedSeconds) === i);
        rows[i]!.row.dataset.current = current; cells[i]!.dataset.current = current;
      }
      write(feedback, next.report);
      feedback.hidden = !/cannot|failed|needs|too little|already fill|out of reach|no .*available|no .*left/i.test(next.report);
    },
    dispose(): void { root.remove(); },
  };
}
