import type { AdventureSnapshot } from "../game/adventure-types.js";
import { QUESTS, GEAR, gearName, type QuestId, type QuestOperation } from "../game/yard-content.js";

export type QuestCallback = (id: QuestId, operation: QuestOperation) => void;

export function createNpcQuests(host: HTMLElement, giver: "mara" | "inn", onQuest: QuestCallback) {
  const panel = document.createElement("div");
  panel.className = "npc-quests";
  host.append(panel);
  let signature = "";
  let completedHere: QuestId | null = null;
  let pendingTurnIn: QuestId | null = null;
  const choose = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>("button[data-quest-operation]");
    if (!control || control.disabled) return;
    const id = control.dataset.questId as QuestId;
    const operation = control.dataset.questOperation as QuestOperation;
    if (operation === "turnIn") pendingTurnIn = id;
    onQuest(id, operation);
  };
  panel.addEventListener("click", choose);
  return {
    update(snapshot: AdventureSnapshot, open: boolean): void {
      if (!open) { completedHere = null; pendingTurnIn = null; }
      if (pendingTurnIn && snapshot.quests.some(q => q.id === pendingTurnIn && q.status === "completed")) {
        completedHere = pendingTurnIn; pendingTurnIn = null;
      }
      const next = JSON.stringify([snapshot.quests, snapshot.player.archetype, completedHere]);
      if (next === signature) return;
      signature = next;
      panel.replaceChildren();
      const definitions = QUESTS.filter(q => q.giver === giver);
      const visible = definitions.filter(q => snapshot.quests.find(view => view.id === q.id)?.status !== "locked");
      if (!visible.length) {
        const welcome = document.createElement("p");
        welcome.textContent = "Mara is tending the people upstairs. Speak with her first; she needs steady hands.";
        panel.append(welcome);
      }
      for (const definition of visible) {
        const view = snapshot.quests.find(q => q.id === definition.id)!;
        const article = document.createElement("section"); article.dataset.questId = view.id; article.dataset.questStatus = view.status;
        const heading = document.createElement("h3");
        heading.textContent = `${view.status === "available" ? "!" : view.status === "ready" ? "?" : view.status === "completed" ? "✓" : "•"} ${definition.title}`;
        const story = document.createElement("p");
        story.textContent = view.status === "available" ? definition.offer : view.status === "completed" ? completedHere === view.id ? definition.completion : definition.after : definition.underway;
        article.append(heading, story);
        if (view.status !== "completed" || completedHere === view.id) {
          const objective = document.createElement("p"); objective.className = "npc-quest-objective";
          objective.textContent = `${definition.objective} · ${view.progress} / ${view.required}`;
          const reward = document.createElement("p"); reward.className = "npc-quest-rewards";
          const earned = definition.reward;
          const facts = [earned.gear ? `${gearName(earned.gear, snapshot.player.archetype)} (${GEAR[earned.gear].damageReduction ? "2 armor" : "+3 attack damage"})` : "", earned.potions ? `${earned.potions} potions` : "", earned.supplies ? `${earned.supplies} supplies` : "", earned.level > 1 ? `Level ${earned.level}` : "", earned.ability === "disengage" ? "Disengage · key 3" : earned.ability === "bloodRage" ? "Blood Rage · key 4" : ""].filter(Boolean);
          reward.textContent = (view.status === "completed" ? "Received: " : "Rewards: ") + facts.join(" · ");
          if (view.status !== "completed") article.append(objective);
          article.append(reward);
          if (view.status === "available" || view.status === "ready") {
            const action = document.createElement("button"); action.type = "button";
            action.dataset.questId = view.id;
            action.dataset.questOperation = view.status === "available" ? "accept" : "turnIn";
            action.textContent = view.status === "available" ? "Accept quest" : "Complete quest";
            action.disabled = view.status === "available" ? !view.canAccept : !view.canTurnIn;
            article.append(action);
          }
        }
        panel.append(article);
      }
    },
    dispose(): void { panel.removeEventListener("click", choose); panel.remove(); },
  };
}
