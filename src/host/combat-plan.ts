import type { AdventureSnapshot, CombatAction, QueuedCombatAction, ThreatAbilityView, ThreatView } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";

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
};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; parent.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function art(parent: HTMLElement, icon: string): void {
  const image = node("img", "", parent); image.src = publicUrl("assets/ui/icons/" + (icon.startsWith("items/") ? icon : "spells/" + icon) + (icon.endsWith(".svg") ? "" : ".png")); image.alt = "";
}

export function createCombatPlan(host: HTMLElement, callbacks: {
  onRemove: (id: number) => void;
  onClear: () => void;
  onMove: (id: number, offsetSeconds: number) => void;
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
  staminaHint.textContent = "No stamina left. Fill open slots with V: Jab or N: Guard — both cost 0.";
  const danger = node("span", "combat-plan-danger", header); danger.id = "combat-plan-danger";
  danger.setAttribute("role", "status");
  const clock = node("div", "combat-plan-clock", root), clockFill = node("span", "", clock);
  const grid = node("div", "combat-plan-grid", root);
  const axis = node("div", "combat-plan-axis", grid);
  for (const label of ["You", "Beat", "Incoming"]) node("span", "", axis).textContent = label;
  const rows = Array.from({ length: 3 }, (_, beat) => {
    const row = node("div", "combat-plan-beat-row", grid); row.dataset.beat = String(beat);
    const player = node("div", "combat-plan-cell combat-plan-player", row);
    const tick = node("div", "combat-plan-tick", row);
    node("strong", "", tick).textContent = "Beat " + (beat + 1);
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
  const editor = node("div", "combat-plan-editor", root);
  const selection = node("span", "combat-plan-selection", editor);
  const delayButtons = Array.from({ length: 3 }, (_, seconds) => {
    const button = node("button", "combat-plan-delay", editor); button.type = "button";
    button.dataset.slot = String(seconds + 1); button.textContent = String(seconds + 1);
    button.title = "Place in slot " + (seconds + 1) + " · " + seconds + " seconds";
    button.addEventListener("click", () => moveSelected(seconds)); return button;
  });
  const remove = node("button", "combat-plan-remove", editor); remove.type = "button"; remove.textContent = "Remove";
  remove.addEventListener("click", removeSelected);
  const help = node("p", "combat-plan-help", root);
  help.textContent = "1–3 choose slot · Drag onto another move to swap · Backspace removes";
  const feedback = node("p", "combat-plan-feedback", root); feedback.id = "combat-plan-feedback";
  feedback.setAttribute("role", "status");
  const buttons = new Map<number, HTMLButtonElement>();
  let selectedId: number | null = null, lastId: number | null = null;
  let snapshot: AdventureSnapshot | null = null;
  const enemyTiles = new Map<string, { tile: HTMLSpanElement; damage: HTMLSpanElement; source: HTMLSpanElement; health: HTMLSpanElement; fill: HTMLSpanElement; tooltip: HTMLSpanElement }>();
  function actionLabel(action: CombatAction): string {
    return action === "strike" && snapshot?.player.archetype !== "warrior"
      ? snapshot?.player.archetype === "mage" ? "Arcane Bolt" : "Aimed Shot" : actions[action].name;
  }
  function selected(): QueuedCombatAction | undefined { return snapshot?.combat.queued.find(entry => entry.id === selectedId); }
  function removeSelected(): void { if (selectedId !== null) callbacks.onRemove(selectedId); }
  function moveSelected(offsetSeconds: number): void { if (selectedId !== null) callbacks.onMove(selectedId, offsetSeconds); }
  function updateEditor(): void {
    const move = selected();
    editor.dataset.empty = String(!move); editor.inert = !move;
    if (!move || !snapshot) return;
    write(selection, actionLabel(move.action) + (move.status === "pending" ? " · choose slot" : move.status === "executed" ? " · used" : " · failed"));
    for (const button of delayButtons) {
      button.disabled = move.status !== "pending";
      button.setAttribute("aria-pressed", String(Number(button.dataset.slot) === move.offsetSeconds + 1));
    }
    remove.disabled = move.status !== "pending";
  }
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
    const detail = enemy.name + " · " + ability.name + "\n" + ability.damage + " damage · Beat " + (beat + 1) + " · " + seconds.toFixed(2).replace(/0$/, "") + "s · " + state + "\n" + ability.description;
    view.tile.title = detail; view.tile.setAttribute("aria-label", detail);
    Object.assign(view.tile.dataset, { enemyId: enemy.id, abilityId: ability.id, offset: String(seconds), status });
    write(view.damage, status === "resolved" ? "✓" : ability.damage ? String(ability.damage) : "");
    write(view.source, enemy.name); write(view.tooltip, detail);
    view.health.title = enemy.name + " · " + enemy.health + "/" + enemy.maximumHealth + " health";
    view.health.setAttribute("aria-label", view.health.title);
    view.fill.style.width = Math.max(0, Math.min(100, 100 * enemy.health / enemy.maximumHealth)) + "%";
  }
  return {
    removeSelected, moveSelected,
    reset(): void { selectedId = lastId = null; snapshot = null; for (const view of enemyTiles.values()) view.tile.remove(); enemyTiles.clear(); },
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
      write(phase, combat.phase === "idle" ? "Opening plan · enter range to begin" : choosing ? "Choosing · " + combat.remainingSeconds.toFixed(1) + "s" : combat.phase === "preparation" ? "Ⅱ Prepare · " + combat.remainingSeconds.toFixed(1) + "s" : "Active · " + combat.remainingSeconds.toFixed(1) + "s left");
      write(resources, combat.queued.length + "/3 slots · " + combat.availableStamina + " stamina free · " + combat.reservedStamina + " reserved");
      staminaHint.hidden = combat.availableStamina > 0 || combat.queued.length >= 3;
      clockFill.style.width = (combat.phase === "idle" ? 0 : 100 * combat.elapsedSeconds / (combat.elapsedSeconds + combat.remainingSeconds)) + "%";
      clear.disabled = !combat.queued.some(entry => entry.status === "pending");
      const newest = combat.queued.reduce<QueuedCombatAction | undefined>((latest, move) => !latest || move.id > latest.id ? move : latest, undefined);
      if (newest && newest.id !== lastId) { selectedId = lastId = newest.id; }
      if (!combat.queued.some(entry => entry.id === selectedId)) selectedId = newest?.id ?? null;
      root.dataset.selectedId = String(selectedId ?? "");
      for (const [id, button] of buttons) if (!combat.queued.some(entry => entry.id === id)) { button.remove(); buttons.delete(id); }
      for (const move of combat.queued) {
        let button = buttons.get(move.id);
        const cell = cells[Math.min(2, Math.max(0, Math.floor(move.offsetSeconds)))];
        if (!cell) continue;
        if (!button) {
          button = node("button", "combat-plan-move", cell); button.type = "button";
          button.dataset.queueId = String(move.id); art(button, actions[move.action].icon);
          node("span", "combat-plan-move-time", button);
          const cost = node("span", "combat-plan-move-cost", button);
          cost.textContent = String(move.cost); cost.title = move.cost + " stamina";
          button.addEventListener("click", () => {
            selectedId = move.id; root.dataset.selectedId = String(move.id);
            for (const [id, control] of buttons) control.setAttribute("aria-pressed", String(id === selectedId));
            updateEditor();
          });
          button.addEventListener("dragstart", event => {
            if (!snapshot?.combat.queued.some(entry => entry.id === move.id && entry.status === "pending")) { event.preventDefault(); return; }
            selectedId = move.id; updateEditor();
            event.dataTransfer?.setData("application/x-greywrought-move", String(move.id));
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          });
          button.addEventListener("dragend", () => { for (const cell of cells) delete cell.dataset.drop; });
          buttons.set(move.id, button);
        }
        const ranged = next.player.archetype !== "warrior" && move.action === "strike";
        const moveName = actionLabel(move.action);
        const moveIcon = ranged ? (next.player.archetype === "mage" ? "wand-bolt.svg" : "bow-shot.svg") : actions[move.action].icon + ".png";
        const moveImage = button.querySelector<HTMLImageElement>("img");
        if (moveImage && !moveImage.src.endsWith("/" + moveIcon)) moveImage.src = publicUrl("assets/ui/icons/" + (moveIcon.startsWith("items/") ? "" : "spells/") + moveIcon);
        if (button.parentElement !== cell) cell.append(button);
        button.dataset.status = move.status; button.dataset.queuedAction = move.action; button.dataset.offset = String(move.offsetSeconds);
        button.draggable = move.status === "pending";
        button.setAttribute("aria-pressed", String(move.id === selectedId));
        const target = next.threats.find(threat => threat.id === move.targetId)?.name;
        const label = moveName + " at " + move.offsetSeconds.toFixed(1) + "s · " + move.cost + " stamina" + (target ? " · " + target : "") + " · " + move.status + (move.reason ? ": " + move.reason : "");
        button.title = label; button.setAttribute("aria-label", label);
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
      updateEditor();
      write(feedback, next.report);
      feedback.hidden = !/cannot|failed|needs|too little|already fill|out of reach|no .*available|no .*left/i.test(next.report);
    },
    dispose(): void { root.remove(); },
  };
}
