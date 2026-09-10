import type { AdventureSnapshot } from "../game/adventure-types.js";
import { QUESTS, GEAR, gearName, type QuestId, type QuestOperation } from "../game/yard-content.js";

export type QuestCallback = (id: QuestId, operation: QuestOperation) => void;

export function createNpcQuests(
  host: HTMLElement,
  giver: "mara" | "inn",
  onQuest: QuestCallback,
  service: { readonly label: string; readonly element: HTMLElement },
) {
  const panel = document.createElement("div");
  panel.className = "npc-quests";
  const style = document.createElement("style");
  style.textContent = `.npc-quests [hidden] { display:none !important; }
    .npc-quest-menu { display:grid; gap:7px; padding:0 0 12px; }
    .npc-quest-menu button { width:100%; text-align:left; }
    .npc-quest-menu [data-quest-status="completed"] { color:#bdc1aa; }
    .npc-quest-actions { display:flex; gap:8px; margin:10px 0; }
    .npc-quest-service { margin:0 -12px; }
    .npc-quest-greeting { padding:5px 0; }
    .npc-quests [data-quest-detail] { border-bottom:0; }
  `;
  const content = document.createElement("div");
  service.element.classList.add("npc-quest-service");
  service.element.hidden = true;
  panel.append(style, content, service.element);
  host.append(panel);
  let signature = "";
  let selected: QuestId | "menu" | "service" = "menu";
  let snapshot: AdventureSnapshot | null = null;
  let completedHere: QuestId | null = null;
  let pendingTurnIn: QuestId | null = null;
  const definitions = QUESTS.filter(q => q.giver === giver);
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text: string, className = ""): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag); element.textContent = text; element.className = className; parent.append(element); return element;
  }
  function button(parent: HTMLElement, text: string): HTMLButtonElement {
    const control = node("button", parent, text); control.type = "button"; return control;
  }
  function render(): void {
    if (!snapshot) return;
    const next = JSON.stringify([snapshot.quests, snapshot.player.archetype, selected, completedHere]);
    if (next === signature) return;
    signature = next;
    content.replaceChildren();
    panel.dataset.npcView = selected === "menu" || selected === "service" ? selected : "quest";
    service.element.hidden = selected !== "service";
    if (selected === "menu") {
      const recent = [...definitions].reverse().find(q => snapshot!.quests.some(view => view.id === q.id && view.status === "completed"));
      const greeting = recent?.after ?? (giver === "mara"
        ? "Come closer. The people upstairs need warmth, and I need someone willing to go beyond the gate."
        : "Come in out of the cold. Mara is tending the people upstairs. Speak with her if you can lend a hand.");
      node("p", content, greeting, "npc-quest-greeting");
      const menu = node("div", content, "", "npc-quest-menu");
      for (const definition of definitions) {
        const view = snapshot.quests.find(q => q.id === definition.id)!;
        if (view.status === "locked") continue;
        const marker = view.status === "available" ? "!" : view.status === "ready" ? "?" : view.status === "completed" ? "✓" : "•";
        const control = button(menu, `${marker} ${definition.title}`);
        control.dataset.questId = view.id; control.dataset.questSelect = view.id; control.dataset.questStatus = view.status;
        control.setAttribute("aria-label", `${definition.title} · ${view.status === "available" ? "Available quest" : view.status === "ready" ? "Ready to complete" : view.status === "completed" ? "Completed" : "In progress"}`);
      }
      button(menu, service.label).dataset.npcService = giver;
      return;
    }
    if (selected === "service") {
      const actions = node("div", content, "", "npc-quest-actions");
      button(actions, "‹ Back").dataset.npcBack = "";
      return;
    }
    const definition = definitions.find(q => q.id === selected)!;
    const view = snapshot.quests.find(q => q.id === selected)!;
    const article = node("section", content, ""); article.dataset.questId = view.id; article.dataset.questStatus = view.status; article.dataset.questDetail = view.id;
    node("h3", article, definition.title);
    node("p", article, view.status === "available" ? definition.offer : view.status === "completed" ? completedHere === view.id ? definition.completion : definition.after : definition.underway);
    if (view.status !== "completed" || completedHere === view.id) {
      if (view.status !== "completed") node("p", article, `${definition.objective} · ${view.progress} / ${view.required}`, "npc-quest-objective");
      const earned = definition.reward;
      const facts = [earned.gear ? `${gearName(earned.gear, snapshot.player.archetype)} (${GEAR[earned.gear].damageReduction ? "2 armor" : "+3 attack damage"})` : "", earned.potions ? `${earned.potions} potions` : "", earned.supplies ? `${earned.supplies} supplies` : "", earned.level > 1 ? `Level ${earned.level}` : "", earned.ability === "disengage" ? "Disengage · key 3" : earned.ability === "bloodRage" ? "Blood Rage · key 4" : ""].filter(Boolean);
      node("p", article, (view.status === "completed" ? "Received: " : "Rewards: ") + facts.join(" · "), "npc-quest-rewards");
    }
    const actions = node("div", article, "", "npc-quest-actions");
    if (view.status === "available" || view.status === "ready") {
      const action = button(actions, view.status === "available" ? "Accept quest" : "Complete quest");
      action.dataset.questId = view.id;
      action.dataset.questOperation = view.status === "available" ? "accept" : "turnIn";
      action.disabled = view.status === "available" ? !view.canAccept : !view.canTurnIn;
    }
    button(actions, "‹ Back").dataset.npcBack = "";
  }
  const choose = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>("button");
    if (!control || control.disabled) return;
    if (control.dataset.questOperation) {
      const id = control.dataset.questId as QuestId;
      const operation = control.dataset.questOperation as QuestOperation;
      if (operation === "turnIn") pendingTurnIn = id;
      onQuest(id, operation);
      return;
    }
    if (control.hasAttribute("data-npc-back")) selected = "menu";
    else if (control.hasAttribute("data-npc-service")) selected = "service";
    else if (control.dataset.questSelect) selected = control.dataset.questSelect as QuestId;
    else return;
    render();
    host.closest<HTMLElement>("#shop-panel, #inn-panel")?.scrollTo(0, 0);
    (selected === "service" ? service.element : content).querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  };
  panel.addEventListener("click", choose);
  return {
    update(next: AdventureSnapshot, open: boolean): void {
      snapshot = next;
      // Barter temporarily hides Mara's window; returning from it retains her stock.
      if (!open && !(giver === "mara" && next.trade)) { selected = "menu"; completedHere = null; pendingTurnIn = null; }
      if (pendingTurnIn && next.quests.some(q => q.id === pendingTurnIn && q.status === "completed")) {
        completedHere = pendingTurnIn; pendingTurnIn = null;
      }
      render();
    },
    dispose(): void { panel.removeEventListener("click", choose); panel.remove(); },
  };
}
