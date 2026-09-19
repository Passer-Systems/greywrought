import type { AdventureSnapshot, CombatAction, ThreatAbilityView } from "../game/adventure-types.js";
import { classAction } from "../game/class-kit.js";
import type { CombatPreview } from "./ground-telegraphs.js";
import { enemyResponse } from "./enemy-response.js";
import { publicUrl } from "./public-url.js";

const actions: Record<CombatAction, { name: string; icon: string }> = {
  bait: { name: "Bait", icon: "mobility-boots" },
  shove: { name: "Shove", icon: "earth-stone" },
  finish: { name: "Finish", icon: "sword-strike" },
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
type QueuedCombatAction = AdventureSnapshot["combat"]["queued"][number];
type ShownEnemyMove = { id: string; enemy: string; ability: ThreatAbilityView; seconds: number; status: string };
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; parent.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function art(parent: HTMLElement, icon: string): void {
  const image = node("img", "", parent); image.src = publicUrl("assets/ui/icons/" + (icon.startsWith("items/") ? icon : "spells/" + icon) + (icon.endsWith(".svg") ? "" : ".png")); image.alt = "";
}

export function createCombatPlan(host: HTMLElement, callbacks: {
  portrait: (id: string) => string | undefined;
  onRemove: (id: number) => void;
  onClear: () => void;
  onMove: (id: number, offsetSeconds: number) => void;
  onReady: () => void;
  onPreview: (preview: CombatPreview | null) => void;
}) {
  const root = node("section", "combat-plan", host); root.id = "combat-plan"; root.hidden = true;
  root.setAttribute("aria-label", "Combat plan");
  const header = node("header", "combat-plan-heading", root);
  const phase = node("strong", "combat-plan-phase", header); phase.id = "combat-plan-phase";
  const resources = node("span", "combat-plan-resources", header);
  const clear = node("button", "combat-plan-clear", header); clear.type = "button"; clear.textContent = "Clear";
  clear.addEventListener("click", callbacks.onClear);
  const ready = node("button", "combat-plan-ready", header); ready.type = "button"; ready.textContent = "Ready (R)";
  ready.setAttribute("aria-keyshortcuts", "R");
  ready.title = "Begin this combat sequence now (R)";
  ready.addEventListener("click", callbacks.onReady);
  const staminaHint = node("p", "combat-plan-stamina-hint", root);
  staminaHint.setAttribute("role", "status");
  staminaHint.textContent = "No stamina left. Free attacks and defenses can fill open slots.";
  const danger = node("p", "combat-plan-danger", root); danger.id = "combat-plan-danger";
  danger.setAttribute("role", "status");
  const clock = node("div", "combat-plan-clock", root), clockFill = node("span", "", clock);
  const grid = node("div", "combat-plan-grid", root);
  const labels = node("div", "combat-plan-columns", grid);
  node("span", "", labels).textContent = "You";
  const enemyLabel = node("span", "", labels);
  const cells: HTMLElement[] = [], enemyCells: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const row = node("div", "combat-plan-beat", grid); row.dataset.beat = String(i);
    const player = node("div", "combat-plan-cell combat-plan-player", row);
    node("span", "combat-plan-tick", player).textContent = String(i + 1);
    cells.push(player);
    const enemies = node("div", "combat-plan-cell combat-plan-enemy", row);
    enemies.dataset.beat = String(i); enemyCells.push(enemies);
  }
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
  const inspect = node("div", "combat-plan-inspect", root);
  const inspectTitle = node("strong", "combat-plan-inspect-title", inspect);
  const forecastSummary = node("p", "combat-plan-forecast-summary", inspect);
  const inspectCopy = node("p", "combat-plan-inspect-copy", inspect);
  const unpin = node("button", "combat-plan-unpin", inspect); unpin.type = "button"; unpin.textContent = "Clear preview";
  unpin.addEventListener("click", () => { pinnedPreview = transientPreview = null; updatePreview(); });
  const help = node("p", "combat-plan-help", root);
  help.textContent = "Inspect moves · drag between beats · R to start";
  const feedback = node("p", "combat-plan-feedback", root); feedback.id = "combat-plan-feedback";
  feedback.setAttribute("role", "status");
  const buttons = new Map<number, HTMLButtonElement>();
  let selectedId: number | null = null, lastId: number | null = null;
  let snapshot: AdventureSnapshot | null = null, enemyKey = "";
  let pinnedPreview: CombatPreview | null = null, transientPreview: CombatPreview | null = null;
  let previousCycle = -1;
  function updatePreview(): void {
    const preview = editing() ? transientPreview ?? pinnedPreview : null;
    callbacks.onPreview(preview);
    inspect.hidden = !editing() || !preview;
    unpin.hidden = !pinnedPreview;
    let title = "Turn their attacks against them";
    let copy = "Bait into a better position, Shove enemies together, then Finish a staggered foe. Beats mark the cast; impacts may come later.";
    if (preview && snapshot) {
      if (preview.kind === "enemy") {
        const threat = snapshot.threats.find(threat => threat.id === preview.threatId);
        const ability = threat?.windowAction?.ability;
        if (threat && ability) {
          title = threat.name + " · " + ability.name;
          copy = ability.description + " " + enemyResponse(ability.id);
        }
      } else {
        const move = snapshot.combat.queued.find(move => move.id === preview.queueId);
        if (move) { title = actionLabel(move.action); copy = String(move.action) === "equip" ? "Change equipment on the chosen beat." : classAction(snapshot.player.archetype, move.action).description; }
      }
      const events = snapshot.combat.forecast?.events.filter(event => preview.kind === "move" || event.sourceId === preview.threatId || event.targetId === preview.threatId) ?? [];
      const consequences = events.filter(event => event.kind !== "hit").slice(0, 3);
      copy += " If started now: " + (consequences.length ? consequences.map(event => event.time.toFixed(1) + "s · " + event.text).join("; ") : "inspect the path; positions can change while planning.");
    }
    const forecast = snapshot?.combat.forecast;
    const playerOutcome = forecast?.outcomes.find(outcome => outcome.id === forecast.playerId);
    const defeats = forecast?.outcomes.filter(outcome => outcome.health === 0 && snapshot?.threats.some(threat => threat.id === outcome.id && threat.health > 0)).map(outcome => snapshot!.threats.find(threat => threat.id === outcome.id)!.name) ?? [];
    forecastSummary.hidden = !preview || !playerOutcome;
    if (playerOutcome && snapshot) write(forecastSummary, "If started now · Your health " + Math.ceil(snapshot.player.health) + " → " + Math.ceil(playerOutcome.health) + (defeats.length ? " · Defeats: " + defeats.join(", ") : ""));
    write(inspectTitle, title); write(inspectCopy, copy);
    for (const button of enemyCells.flatMap(cell => [...cell.querySelectorAll<HTMLButtonElement>("button")])) button.setAttribute("aria-pressed", String(preview?.kind === "enemy" && button.dataset.threatId === preview.threatId));
  }
  function inspectControl(button: HTMLButtonElement, preview: CombatPreview): void {
    button.addEventListener("mouseenter", () => { transientPreview = preview; updatePreview(); });
    button.addEventListener("mouseleave", () => { transientPreview = null; updatePreview(); });
    button.addEventListener("focus", () => { transientPreview = preview; updatePreview(); });
    button.addEventListener("blur", () => { transientPreview = null; updatePreview(); });
  }
  function actionLabel(action: CombatAction | "equip"): string {
    if (action === "equip") return "Equipment";
    if (snapshot) {
      const spec = classAction(snapshot.player.archetype, action);
      if (spec?.name) return spec.name;
    }
    return actions[action].name;
  }
  function selected(): QueuedCombatAction | undefined { return snapshot?.combat.queued.find(entry => entry.id === selectedId); }
  function editing(): boolean { return snapshot?.combat.phase === "preparation"; }
  function removeSelected(): void { if (editing() && selectedId !== null) callbacks.onRemove(selectedId); }
  function moveSelected(offsetSeconds: number): void { if (editing() && selectedId !== null) callbacks.onMove(selectedId, offsetSeconds); }
  function updateEditor(): void {
    const move = selected();
    editor.hidden = !move;
    if (!move || !snapshot) return;
    write(selection, actionLabel(move.action) + (move.status === "pending" ? " · choose slot" : move.status === "executed" ? " · used" : " · failed"));
    for (const button of delayButtons) {
      button.disabled = move.status !== "pending" || !editing();
      button.setAttribute("aria-pressed", String(Number(button.dataset.slot) === move.offsetSeconds + 1));
    }
    remove.disabled = move.status !== "pending" || !editing();
  }
  function enemyMove(cell: HTMLElement, ability: ThreatAbilityView, seconds: number, status: string, enemyName: string, threatId: string): void {
    const icon = node("button", "combat-plan-enemy-move", cell); icon.type = "button";
    const preview: CombatPreview = { kind: "enemy", threatId };
    icon.dataset.threatId = threatId; inspectControl(icon, preview);
    icon.addEventListener("click", () => { pinnedPreview = pinnedPreview?.kind === "enemy" && pinnedPreview.threatId === threatId ? null : preview; transientPreview = null; updatePreview(); });
    const actionArt = node("span", "combat-plan-enemy-art", icon);
    art(actionArt, enemyArt[ability.id] ?? "sword-strike");
    const identity = node("span", "combat-plan-enemy-identity", icon);
    const portrait = node("img", "combat-plan-portrait", identity); portrait.alt = "";
    const portraitUrl = callbacks.portrait(threatId);
    if (portraitUrl) portrait.src = portraitUrl; else portrait.hidden = true;
    const words = node("span", "combat-plan-enemy-words", identity);
    node("strong", "combat-plan-enemy-name", words).textContent = enemyName;
    node("span", "combat-plan-enemy-action", words).textContent = ability.name;
    node("span", "combat-plan-enemy-status", words).textContent = status === "pending" ? "" : status;
    const detail = enemyName + " · " + ability.name + " · " + seconds.toFixed(1) + "s · " + status + "\n" + ability.description;
    icon.title = detail; icon.setAttribute("aria-label", detail);
    icon.dataset.abilityId = ability.id; icon.dataset.offset = String(seconds);
    icon.dataset.status = status;
    node("span", "combat-plan-damage", actionArt).textContent = status === "resolved" ? "✓" : ability.damage ? String(ability.damage) : "";
  }
  return {
    removeSelected, moveSelected,
    reset(): void { selectedId = lastId = null; snapshot = null; enemyKey = ""; pinnedPreview = transientPreview = null; previousCycle = -1; callbacks.onPreview(null); },
    update(next: AdventureSnapshot): void {
      snapshot = next;
      const combat = next.combat;
      if (combat.phase !== "preparation" || combat.cycle !== previousCycle) pinnedPreview = transientPreview = null;
      previousCycle = combat.cycle;
      const pinned = pinnedPreview;
      if (pinned?.kind === "move" && !combat.queued.some(move => move.id === pinned.queueId)) pinnedPreview = null;
      const attackers = next.threats.filter(threat => threat.active && (threat.health > 0 || combat.phase === "active" && threat.windowAction !== null) && (threat.aggro || threat.joinsNextWindow || threat.windowAction !== null || threat.forecast.length > 0));
      root.dataset.enemies = String(attackers.length);
      danger.hidden = attackers.length < 2;
      danger.dataset.severity = "tactics";
      write(danger, `${attackers.length} enemies · Make their attacks work for you`);
      danger.title = attackers.map(threat => threat.name).join("\n");
      root.hidden = next.phase !== "expedition" || combat.phase === "idle" || attackers.length === 0;
      Object.assign(root.dataset, { phase: combat.phase, cycle: String(combat.cycle), remaining: String(combat.remainingSeconds), elapsed: String(combat.elapsedSeconds), queued: JSON.stringify(combat.queued), selectedId: String(selectedId ?? "") });
      const choosing = combat.phase === "choosing";
      write(phase, combat.phase === "idle" ? "Opening plan · enter range to begin" : choosing ? "Enemies choose · momentarily" : combat.phase === "preparation" ? "Planning · " + Math.ceil(combat.remainingSeconds) + "s" : "Playing sequence");
      write(resources, combat.queued.length + "/3 · " + combat.availableStamina + " stamina");
      staminaHint.hidden = combat.availableStamina > 0 || combat.queued.length >= 3;
      clockFill.style.width = (combat.phase === "idle" ? 0 : 100 * combat.elapsedSeconds / (combat.elapsedSeconds + combat.remainingSeconds)) + "%";
      clear.disabled = combat.phase !== "preparation" || !combat.queued.some(entry => entry.status === "pending");
      ready.hidden = combat.phase !== "preparation";
      ready.disabled = combat.phase !== "preparation" || combat.ready;
      write(ready, combat.ready ? "Ready ✓" : "Ready (R)");
      ready.title = combat.ready ? "Waiting for the other players or the timer" : "Begin this combat sequence now (R)";
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
          button.dataset.queueId = String(move.id); art(button, String(move.action) === "equip" ? "defensive-shield" : actions[move.action].icon);
          node("span", "combat-plan-move-time", button);
          node("span", "combat-plan-move-label", button);
          const cost = node("span", "combat-plan-move-cost", button);
          cost.textContent = String(move.cost); cost.title = move.cost + " stamina";
          inspectControl(button, { kind: "move", queueId: move.id });
          button.addEventListener("click", () => {
            pinnedPreview = { kind: "move", queueId: move.id }; transientPreview = null; updatePreview();
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
        const moveIcon = String(move.action) === "equip" ? "defensive-shield.png" : ranged ? (next.player.archetype === "mage" ? "wand-bolt.svg" : "bow-shot.svg") : actions[move.action].icon + ".png";
        const moveImage = button.querySelector<HTMLImageElement>("img");
        if (moveImage && !moveImage.src.endsWith("/" + moveIcon)) moveImage.src = publicUrl("assets/ui/icons/" + (moveIcon.startsWith("items/") ? "" : "spells/") + moveIcon);
        if (button.parentElement !== cell) cell.append(button);
        button.dataset.status = move.status; button.dataset.queuedAction = move.action; button.dataset.offset = String(move.offsetSeconds);
      button.draggable = combat.phase === "preparation" && move.status === "pending";
        button.setAttribute("aria-pressed", String(move.id === selectedId));
        const target = next.threats.find(threat => threat.id === move.targetId)?.name;
        const label = moveName + " at " + move.offsetSeconds.toFixed(1) + "s · " + move.cost + " stamina" + (target ? " · " + target : "") + " · " + move.status + (move.reason ? ": " + move.reason : "");
        write(button.querySelector<HTMLElement>(".combat-plan-move-label")!, moveName);
        button.title = label; button.setAttribute("aria-label", label);
        write(button.querySelector<HTMLElement>(".combat-plan-move-time")!, move.status === "executed" ? "✓" : move.status === "failed" ? "×" : move.offsetSeconds.toFixed(1) + "s");
      }
      const shown: ShownEnemyMove[] = choosing ? [] : attackers.flatMap<ShownEnemyMove>(threat => {
        if (threat.joinsNextWindow && combat.phase === "active") return [];
        if (threat.windowAction) return [{ id: threat.id, enemy: threat.name, ability: threat.windowAction.ability, seconds: threat.windowAction.offsetSeconds, status: threat.windowAction.status }];
        return threat.forecast.slice(0, 1).map(move => ({ id: threat.id, enemy: threat.name, ability: move.ability, seconds: 0, status: move.status }));
      });
      const key = JSON.stringify([combat.phase, shown.map(move => Boolean(callbacks.portrait(move.id))), attackers.map(threat => [threat.id, threat.joinsNextWindow]), shown.map(move => [move.enemy, move.ability.id, move.seconds, move.ability.damage, move.status])]);
      if (key !== enemyKey) {
        enemyKey = key;
        for (const cell of enemyCells) cell.replaceChildren();
        for (const move of shown) {
          const cell = enemyCells[Math.min(2, Math.max(0, Math.floor(move.seconds + .02)))];
          if (cell) enemyMove(cell, move.ability, Math.max(0, move.seconds), move.status, move.enemy, move.id);
        }
      }
      write(enemyLabel, choosing ? "Enemies · choosing next moves" : `Enemies · ${attackers.length} engaged`); enemyLabel.title = choosing ? "Enemies are choosing their next moves" : "Each icon shows one engaged enemy’s announced move";
      for (let i = 0; i < cells.length; i++) cells[i]!.dataset.current = String(combat.phase === "active" && Math.floor(combat.elapsedSeconds) === i);
      updateEditor();
      updatePreview();
      write(feedback, next.report);
    },
    dispose(): void { root.remove(); },
  };
}
