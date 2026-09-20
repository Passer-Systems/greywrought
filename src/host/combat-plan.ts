import type { AdventureSnapshot, CombatAction, CombatActionTiming, ThreatAbilityView, ThreatView } from "../game/adventure-types.js";
import { classAction } from "../game/class-kit.js";
import type { CombatPreview } from "./ground-telegraphs.js";
import { enemyResponse } from "./enemy-response.js";
import { publicUrl } from "./public-url.js";

const actions: Record<CombatAction, { name: string; icon: string }> = {
  bait: { name: "Move", icon: "mobility-boots" },
  strike: { name: "Attack", icon: "sword-strike" },
  brace: { name: "Defend", icon: "defensive-shield" },
};
const enemyArt: Record<string, string> = {
  "ember-beam": "lightning-bolt", fireball: "fire-spell", "ember-ward": "defensive-shield",
  kindle: "energy-burst", maul: "sword-strike", nest: "poison-vial",
  "echo-bite": "sword-strike", "cavern-slam": "frost-spell",
  warder: "nature-leaf", "ritual-guardian": "frost-spell",
};
type QueuedCombatAction = AdventureSnapshot["combat"]["queued"][number];
type ShownEnemyMove = { id: string; enemy: string; ability: ThreatAbilityView; seconds: number; status: string; targetId: string | null; target: string };
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; parent.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function art(parent: HTMLElement, icon: string): void {
  const image = node("img", "", parent); image.src = publicUrl("assets/ui/icons/" + (icon.startsWith("items/") ? icon : "spells/" + icon) + (icon.endsWith(".svg") ? "" : ".png")); image.alt = "";
}

export function createCombatPlan(host: HTMLElement, callbacks: {
  portrait: (id: string) => string | undefined;
  playerName: (id: string) => string | undefined;
  onRemove: (id: number) => void;
  onClear: () => void;
  onTiming: (timing: CombatActionTiming) => void;
  onAction: (action: CombatAction) => void;
  onReady: () => boolean | void;
  onAimMove: () => void;
  onPreview: (preview: CombatPreview | null) => void;
}) {
  const root = node("section", "combat-plan", host); root.id = "combat-plan"; root.hidden = true;
  root.setAttribute("aria-label", "Combat plan");
  const header = node("header", "combat-plan-heading", root);
  const phase = node("strong", "combat-plan-phase", header); phase.id = "combat-plan-phase";
  const resources = node("span", "combat-plan-resources", header);
  const move = node("button", "combat-plan-move-button", header); move.id = "combat-plan-aim-move"; move.type = "button"; move.textContent = "Move";
  move.title = "Choose or change your destination";
  move.addEventListener("click", callbacks.onAimMove);
  const clear = node("button", "combat-plan-clear", header); clear.type = "button"; clear.textContent = "Clear";
  clear.addEventListener("click", callbacks.onClear);
  const ready = node("button", "combat-plan-ready", header); ready.type = "button"; ready.textContent = "Ready (R)";
  ready.setAttribute("aria-keyshortcuts", "R");
  ready.title = "Begin this turn now (R)";
  ready.addEventListener("click", callbacks.onReady);
  const autoReadyLabel = node("label", "combat-plan-auto-ready", header);
  autoReadyLabel.title = "Ready automatically after choosing both movement and an action. Turn off to adjust action timing before starting.";
  const autoReady = node("input", "", autoReadyLabel); autoReady.type = "checkbox"; autoReady.id = "combat-plan-auto-ready";
  const autoReadyStorageKey = "greywrought/combat-auto-ready-v1";
  try { autoReady.checked = localStorage.getItem(autoReadyStorageKey) !== "false"; } catch { autoReady.checked = true; }
  node("span", "", autoReadyLabel).textContent = "Auto-ready";
  autoReady.addEventListener("change", () => {
    try { localStorage.setItem(autoReadyStorageKey, String(autoReady.checked)); } catch { /* The choice still applies for this visit. */ }
    scheduleAutoReady();
  });
  const danger = node("p", "combat-plan-danger", root); danger.id = "combat-plan-danger";
  danger.setAttribute("role", "status");
  const clock = node("div", "combat-plan-clock", root), clockFill = node("span", "", clock);
  const grid = node("div", "combat-plan-grid", root);
  const cells: HTMLElement[] = [], emptyLabels: HTMLElement[] = [];
  for (const [index, label] of ["Movement", "Action"].entries()) {
    const row = node("div", "combat-plan-row", grid); row.dataset.category = index === 0 ? "movement" : "action";
    node("strong", "combat-plan-category", row).textContent = label;
    const cell = node("div", "combat-plan-cell combat-plan-player", row); cells.push(cell);
    emptyLabels.push(node("span", "combat-plan-empty", cell));
    for (const kind of index === 0 ? ["bait"] as const : ["strike", "brace"] as const) {
      const edit = node("button", "combat-plan-edit", row); edit.type = "button";
      edit.dataset.action = kind; edit.textContent = actions[kind].name;
      edit.addEventListener("click", () => kind === "bait" ? callbacks.onAimMove() : callbacks.onAction(kind));
    }
    const remove = node("button", "combat-plan-remove", row); remove.type = "button"; remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const entry = snapshot?.combat.queued.find(entry => (entry.action === "bait") === (index === 0));
      if (editing() && entry) callbacks.onRemove(entry.id);
    });
  }
  const editor = node("div", "combat-plan-editor", root);
  node("span", "combat-plan-selection", editor).textContent = "Action timing";
  const timingButtons = (["before", "during", "after"] as const).map(timing => {
    const button = node("button", "combat-plan-timing", editor); button.type = "button";
    button.dataset.timing = timing; button.textContent = timing[0]!.toUpperCase() + timing.slice(1);
    button.addEventListener("click", () => { if (editing()) callbacks.onTiming(timing); }); return button;
  });
  const enemyLabel = node("strong", "combat-plan-enemy-heading", root);
  const enemyCells = [node("div", "combat-plan-cell combat-plan-enemy", root)];
  const inspect = node("div", "combat-plan-inspect", root);
  const inspectTitle = node("strong", "combat-plan-inspect-title", inspect);
  const forecastSummary = node("p", "combat-plan-forecast-summary", inspect);
  const inspectCopy = node("p", "combat-plan-inspect-copy", inspect);
  const unpin = node("button", "combat-plan-unpin", inspect); unpin.type = "button"; unpin.textContent = "Clear preview";
  unpin.addEventListener("click", () => { pinnedPreview = transientPreview = null; updatePreview(); });
  const buttons = new Map<number, HTMLButtonElement>();
  let selectedId: number | null = null, lastId: number | null = null;
  let snapshot: AdventureSnapshot | null = null, enemyKey = "";
  let pinnedPreview: CombatPreview | null = null, transientPreview: CombatPreview | null = null;
  let previousCycle = -1;
  let autoReadyScheduled = false, autoReadyGeneration = 0, lastAutoReadyPlan = "", disposed = false;
  function scheduleAutoReady(): void {
    if (autoReadyScheduled || disposed) return;
    autoReadyScheduled = true;
    const generation = autoReadyGeneration;
    queueMicrotask(() => {
      if (generation !== autoReadyGeneration || disposed) return;
      autoReadyScheduled = false;
      if (!autoReady.checked || !snapshot || snapshot.phase !== "expedition" || !editing()) return;
      const pending = snapshot.combat.queued.filter(entry => entry.status === "pending");
      if (!pending.some(entry => entry.action === "bait") || !pending.some(entry => entry.action !== "bait")) return;
      const plan = JSON.stringify([snapshot.combat.cycle, pending.map(entry => [entry.id, entry.action, entry.timing, entry.destination, entry.targetId])]);
      if (plan === lastAutoReadyPlan) return;
      lastAutoReadyPlan = plan;
      if (callbacks.onReady() === false) lastAutoReadyPlan = "";
    });
  }
  function updatePreview(): void {
    const preview = editing() ? transientPreview ?? pinnedPreview : null;
    callbacks.onPreview(preview);
    inspect.hidden = !editing() || !preview;
    unpin.hidden = !pinnedPreview;
    let title = "Turn their attacks against them";
    let copy = "";
    if (preview && snapshot) {
      if (preview.kind === "enemy") {
        const threat = snapshot.threats.find(threat => threat.id === preview.threatId);
        const ability = threat?.windowAction?.ability;
        if (threat && ability) {
          title = threat.name + " · " + ability.name + " → " + enemyTarget(threat, ability);
          copy = ability.description + " " + enemyResponse(ability.id);
        }
      } else {
        const move = snapshot.combat.queued.find(move => move.id === preview.queueId);
        if (move) { title = actionLabel(move.action) + " → " + moveTarget(move); copy = String(move.action) === "equip" ? "Change equipment." : classAction(snapshot.player.archetype, move.action).description; }
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
  function moveTarget(move: QueuedCombatAction): string {
    if (move.targetId) return snapshot?.threats.find(threat => threat.id === move.targetId)?.name ?? "Unavailable target";
    return move.destination ? `Tile ${move.destination.x}, ${move.destination.z}` : "Self";
  }
  function enemyTarget(threat: ThreatView, ability: ThreatAbilityView): string {
    if (ability.damage <= 0) return "Self";
    if (ability.id === "foreman-pulse") return "Nearby players";
    const id = threat.targetPlayerId ?? (snapshot?.combat.forecast?.playerId === "solo" ? "solo" : null);
    return id === "solo" ? "You" : id ? callbacks.playerName(id) ?? "Another player" : "No target";
  }
  function editing(): boolean { return snapshot?.combat.phase === "preparation" && !snapshot.combat.ready; }
  function updateEditor(): void {
    if (!snapshot) return;
    const movement = snapshot.combat.queued.find(entry => entry.action === "bait");
    const action = snapshot.combat.queued.find(entry => entry.action !== "bait");
    editor.hidden = !movement || !action;
    for (const button of timingButtons) {
      const unavailable = button.dataset.timing === "during" && action && classAction(snapshot.player.archetype, action.action).movementProfile === "stationary";
      button.disabled = !editing() || Boolean(unavailable);
      button.title = unavailable ? "This attack needs you to stand still" : button.textContent + " movement";
      button.setAttribute("aria-pressed", String(action?.timing === button.dataset.timing));
    }
    for (const [index, row] of [...grid.children].entries()) {
      const entry = index === 0 ? movement : action;
      emptyLabels[index]!.hidden = Boolean(entry);
      write(emptyLabels[index]!, index === 0 ? "Stay" : "None");
      for (const button of row.querySelectorAll<HTMLButtonElement>(".combat-plan-edit")) {
        const kind = button.dataset.action as CombatAction;
        const available = snapshot.combat.availableStamina + (entry?.cost ?? 0);
        button.disabled = !editing() || available < (classAction(snapshot.player.archetype, kind).cost ?? 1) || kind === "strike" && !snapshot.threats.some(threat => threat.id === snapshot!.selectedThreat && threat.active && threat.health > 0);
      }
      row.querySelector<HTMLButtonElement>(".combat-plan-remove")!.disabled = !editing() || !entry;
    }
  }
  function enemyMove(cell: HTMLElement, ability: ThreatAbilityView, seconds: number, status: string, enemyName: string, threatId: string, targetId: string | null, target: string): void {
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
    node("span", "combat-plan-enemy-target", words).textContent = "→ " + target;
    icon.dataset.targetId = targetId ?? ""; icon.dataset.targetSelf = String(target === "You");
    const detail = enemyName + " · " + ability.name + " → " + target + " · " + seconds.toFixed(1) + "s · " + status + "\n" + ability.description;
    icon.title = detail; icon.setAttribute("aria-label", detail);
    icon.dataset.abilityId = ability.id; icon.dataset.offset = String(seconds);
    icon.dataset.status = status;
    node("span", "combat-plan-damage", actionArt).textContent = status === "resolved" ? "✓" : ability.damage ? String(ability.damage) : "";
  }
  return {
    reset(): void { autoReadyGeneration++; autoReadyScheduled = false; lastAutoReadyPlan = ""; selectedId = lastId = null; snapshot = null; enemyKey = ""; pinnedPreview = transientPreview = null; previousCycle = -1; callbacks.onPreview(null); },
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
      write(phase, combat.phase === "idle" ? "Opening plan · enter range to begin" : choosing ? "Enemies choose · momentarily" : combat.phase === "preparation" ? "Planning · " + Math.ceil(combat.remainingSeconds) + "s" : "Playing turn");
      write(resources, combat.availableStamina + " stamina");
      move.disabled = !editing() || combat.availableStamina + (combat.queued.find(entry => entry.action === "bait")?.cost ?? 0) < 1;
      clockFill.style.width = (combat.phase === "idle" ? 0 : 100 * combat.elapsedSeconds / (combat.elapsedSeconds + combat.remainingSeconds)) + "%";
      clear.disabled = !editing() || !combat.queued.some(entry => entry.status === "pending");
      ready.hidden = combat.phase !== "preparation";
      ready.disabled = combat.phase !== "preparation" || combat.ready;
      write(ready, combat.ready ? "Ready ✓" : "Ready (R)");
      ready.title = combat.ready ? "Waiting for the other players or the timer" : "Begin this turn now (R)";
      const newest = combat.queued.reduce<QueuedCombatAction | undefined>((latest, move) => !latest || move.id > latest.id ? move : latest, undefined);
      if (newest && newest.id !== lastId) { selectedId = lastId = newest.id; }
      if (!combat.queued.some(entry => entry.id === selectedId)) selectedId = newest?.id ?? null;
      root.dataset.selectedId = String(selectedId ?? "");
      for (const [id, button] of buttons) if (!combat.queued.some(entry => entry.id === id)) { button.remove(); buttons.delete(id); }
      for (const move of combat.queued) {
        let button = buttons.get(move.id);
        const cell = cells[move.action === "bait" ? 0 : 1];
        if (!cell) continue;
        if (!button) {
          button = node("button", "combat-plan-move", cell); button.type = "button";
          button.dataset.queueId = String(move.id); art(button, String(move.action) === "equip" ? "defensive-shield" : actions[move.action].icon);
          node("span", "combat-plan-move-time", button);
          node("span", "combat-plan-move-label", button);
          node("span", "combat-plan-move-target", button);
          const cost = node("span", "combat-plan-move-cost", button);
          cost.textContent = String(move.cost); cost.title = move.cost + " stamina";
          inspectControl(button, { kind: "move", queueId: move.id });
          button.addEventListener("click", () => {
            pinnedPreview = { kind: "move", queueId: move.id }; transientPreview = null; updatePreview();
            selectedId = move.id; root.dataset.selectedId = String(move.id);
            for (const [id, control] of buttons) control.setAttribute("aria-pressed", String(id === selectedId));
            updateEditor();
          });
          buttons.set(move.id, button);
        }
        const ranged = next.player.archetype !== "warrior" && move.action === "strike";
        const moveName = actionLabel(move.action);
        const moveIcon = String(move.action) === "equip" ? "defensive-shield.png" : ranged ? (next.player.archetype === "mage" ? "wand-bolt.svg" : "bow-shot.svg") : actions[move.action].icon + ".png";
        const moveImage = button.querySelector<HTMLImageElement>("img");
        if (moveImage && !moveImage.src.endsWith("/" + moveIcon)) moveImage.src = publicUrl("assets/ui/icons/" + (moveIcon.startsWith("items/") ? "" : "spells/") + moveIcon);
        if (button.parentElement !== cell) cell.append(button);
        button.dataset.status = move.status; button.dataset.queuedAction = move.action; button.dataset.offset = String(move.offsetSeconds);

        button.setAttribute("aria-pressed", String(move.id === selectedId));
        const target = moveTarget(move);
        const label = moveName + " → " + target + " at " + move.offsetSeconds.toFixed(1) + "s · " + move.cost + " stamina · " + move.status + (move.reason ? ": " + move.reason : "");
        write(button.querySelector<HTMLElement>(".combat-plan-move-label")!, moveName);
        write(button.querySelector<HTMLElement>(".combat-plan-move-target")!, "→ " + target);
        button.dataset.targetId = move.targetId ?? "";
        button.title = label; button.setAttribute("aria-label", label);
        write(button.querySelector<HTMLElement>(".combat-plan-move-time")!, move.status === "executed" ? "✓" : move.status === "failed" ? "×" : move.offsetSeconds.toFixed(1) + "s");
      }
      const shown: ShownEnemyMove[] = choosing ? [] : attackers.flatMap<ShownEnemyMove>(threat => {
        if (threat.joinsNextWindow && combat.phase === "active") return [];
        if (threat.windowAction) return [{ id: threat.id, enemy: threat.name, ability: threat.windowAction.ability, seconds: threat.windowAction.offsetSeconds, status: threat.windowAction.status, targetId: threat.targetPlayerId ?? null, target: enemyTarget(threat, threat.windowAction.ability) }];
        return threat.forecast.slice(0, 1).map(move => ({ id: threat.id, enemy: threat.name, ability: move.ability, seconds: 0, status: move.status, targetId: threat.targetPlayerId ?? null, target: enemyTarget(threat, move.ability) }));
      });
      const key = JSON.stringify([combat.phase, shown.map(move => Boolean(callbacks.portrait(move.id))), attackers.map(threat => [threat.id, threat.joinsNextWindow]), shown.map(move => [move.enemy, move.ability.id, move.seconds, move.ability.damage, move.status, move.targetId, move.target])]);
      if (key !== enemyKey) {
        enemyKey = key;
        for (const cell of enemyCells) cell.replaceChildren();
        for (const move of shown) {
          const cell = enemyCells[0];
          if (cell) enemyMove(cell, move.ability, Math.max(0, move.seconds), move.status, move.enemy, move.id, move.targetId, move.target);
        }
      }
      write(enemyLabel, choosing ? "Enemies · choosing next moves" : `Enemies · ${attackers.length} engaged`); enemyLabel.title = choosing ? "Enemies are choosing their next moves" : "Each icon shows one engaged enemy’s announced move";
      updateEditor();
      updatePreview();
      scheduleAutoReady();
    },
    dispose(): void { disposed = true; autoReadyGeneration++; root.remove(); },
  };
}
