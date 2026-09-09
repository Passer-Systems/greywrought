import type { AdventureSnapshot, CombatAction, QueuedCombatAction, ThreatAbilityView } from "../game/adventure-types.js";
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
  const danger = node("p", "combat-plan-danger", root); danger.id = "combat-plan-danger";
  danger.setAttribute("role", "status");
  const clock = node("div", "combat-plan-clock", root), clockFill = node("span", "", clock);
  const grid = node("div", "combat-plan-grid", root);
  node("span", "combat-plan-axis", grid).textContent = "Beat";
  for (let i = 0; i < 3; i++) node("span", "combat-plan-tick", grid).textContent = "Slot " + (i + 1) + " · " + i + "s";
  const enemyLabel = node("span", "combat-plan-row-label", grid);
  const enemyCells = Array.from({ length: 3 }, () => node("div", "combat-plan-cell combat-plan-enemy", grid));
  node("span", "combat-plan-row-label", grid).textContent = "You";
  const cells = Array.from({ length: 3 }, () => node("div", "combat-plan-cell combat-plan-player", grid));
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
  let snapshot: AdventureSnapshot | null = null, enemyKey = "";
  function actionLabel(action: CombatAction): string {
    return action === "strike" && snapshot?.player.archetype !== "warrior"
      ? snapshot?.player.archetype === "mage" ? "Arcane Bolt" : "Aimed Shot" : actions[action].name;
  }
  function selected(): QueuedCombatAction | undefined { return snapshot?.combat.queued.find(entry => entry.id === selectedId); }
  function removeSelected(): void { if (selectedId !== null) callbacks.onRemove(selectedId); }
  function moveSelected(offsetSeconds: number): void { if (selectedId !== null) callbacks.onMove(selectedId, offsetSeconds); }
  function updateEditor(): void {
    const move = selected();
    editor.hidden = !move;
    if (!move || !snapshot) return;
    write(selection, actionLabel(move.action) + (move.status === "pending" ? " · choose slot" : move.status === "executed" ? " · used" : " · failed"));
    for (const button of delayButtons) {
      button.disabled = move.status !== "pending";
      button.setAttribute("aria-pressed", String(Number(button.dataset.slot) === move.offsetSeconds + 1));
    }
    remove.disabled = move.status !== "pending";
  }
  function enemyMove(cell: HTMLElement, ability: ThreatAbilityView, seconds: number, status: string): void {
    const icon = node("span", "combat-plan-enemy-move", cell); art(icon, enemyArt[ability.id] ?? "sword-strike");
    const detail = ability.name + " · " + seconds.toFixed(1) + "s · " + status + "\n" + ability.description;
    icon.title = detail; icon.setAttribute("aria-label", detail);
    icon.dataset.abilityId = ability.id; icon.dataset.offset = String(seconds);
    icon.dataset.status = status;
    node("span", "combat-plan-damage", icon).textContent = status === "resolved" ? "✓" : ability.damage ? String(ability.damage) : "";
  }
  return {
    removeSelected, moveSelected,
    reset(): void { selectedId = lastId = null; snapshot = null; enemyKey = ""; },
    update(next: AdventureSnapshot): void {
      snapshot = next;
      const combat = next.combat;
      const enemy = next.threats.find(threat => threat.id === next.selectedThreat && threat.active && threat.health > 0);
      const attackers = next.threats.filter(threat => threat.active && threat.health > 0 && threat.aggro);
      root.dataset.enemies = String(attackers.length);
      danger.hidden = attackers.length < 2;
      danger.dataset.severity = attackers.length >= 3 ? "critical" : "danger";
      write(danger, attackers.length >= 3 ? `${attackers.length} enemies · Overwhelmed — retreat!` : "2 enemies · Dangerous pull — defend or retreat");
      danger.title = attackers.map(threat => threat.name + (threat.joinsNextWindow ? " · joining next window" : "")).join("\n");
      root.hidden = next.phase !== "expedition" || (!enemy && combat.phase === "idle");
      Object.assign(root.dataset, { phase: combat.phase, cycle: String(combat.cycle), remaining: String(combat.remainingSeconds), elapsed: String(combat.elapsedSeconds), queued: JSON.stringify(combat.queued), selectedId: String(selectedId ?? "") });
      write(phase, combat.phase === "idle" ? "Opening plan · enter range to begin" : combat.phase === "preparation" ? "Ⅱ Prepare · " + combat.remainingSeconds.toFixed(1) + "s" : "Active · " + combat.remainingSeconds.toFixed(1) + "s left");
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
      const shown = enemy?.joinsNextWindow && combat.phase === "active" ? [] : enemy?.windowAction
        ? [{ ability: enemy.windowAction.ability, seconds: enemy.windowAction.offsetSeconds, status: enemy.windowAction.status }]
        : enemy?.forecast.slice(0, 1).map(move => ({ ability: move.ability, seconds: 0, status: move.status })) ?? [];
      const key = JSON.stringify([enemy?.id, enemy?.joinsNextWindow, shown.map(move => [move.ability.id, move.seconds, move.ability.damage, move.status])]);
      if (key !== enemyKey) {
        enemyKey = key;
        for (const cell of enemyCells) cell.replaceChildren();
        for (const move of shown) {
          const cell = enemyCells[Math.min(2, Math.max(0, Math.floor(move.seconds + .02)))];
          if (cell) enemyMove(cell, move.ability, Math.max(0, move.seconds), move.status);
        }
      }
      write(enemyLabel, (enemy?.name ?? "No target") + (enemy?.joinsNextWindow ? " · next window" : "")); enemyLabel.title = enemy?.joinsNextWindow ? "Joins the next active window" : "Selected enemy’s announced moves";
      for (let i = 0; i < cells.length; i++) cells[i]!.dataset.current = String(combat.phase === "active" && Math.floor(combat.elapsedSeconds) === i);
      updateEditor();
      write(feedback, next.report);
    },
    dispose(): void { root.remove(); },
  };
}
