import type { AdventureSnapshot } from "../game/adventure-types.js";
import { QUESTS, GEAR, gearName, type QuestId, type QuestStatus } from "../game/yard-content.js";
import { classAction } from "../game/class-kit.js";

/** A read-only journal of accepted, completed, and currently available quests. */
export interface QuestLog {
  readonly isOpen: () => boolean;
  open(snapshot: AdventureSnapshot): void;
  update(snapshot: AdventureSnapshot): void;
  close(): void;
  dispose(): void;
}

const statusLabel: Record<QuestStatus, string> = {
  locked: "Locked", available: "Available", active: "In progress", ready: "Ready to turn in", completed: "Completed",
};

function rewardText(snapshot: AdventureSnapshot, id: QuestId): string {
  const definition = QUESTS.find(quest => quest.id === id)!;
  const reward = definition.reward;
  const parts = [
    reward.gear ? gearName(reward.gear, snapshot.player.archetype) : "",
    reward.potions ? `${reward.potions} healing potion${reward.potions === 1 ? "" : "s"}` : "",
    reward.supplies ? `${reward.supplies} supplies` : "",
    reward.level > 1 ? `Level ${reward.level}` : "",
    reward.ability ? `${classAction(snapshot.player.archetype, reward.ability).name} (${reward.ability === "disengage" ? "3" : "4"})` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No reward listed";
}

export function createQuestLog(host: HTMLElement, onClose: () => void): QuestLog {
  const panel = document.createElement("section");
  panel.id = "quest-log-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "quest-log-title");
  panel.innerHTML = `
    <header class="rpg-window-header"><h2 id="quest-log-title" class="rpg-window-title">Quest Log</h2><button id="quest-log-close" class="rpg-window-close" type="button" aria-label="Close quest log">×</button></header>
    <div class="quest-log-body"><nav class="quest-log-list" aria-label="Quests"></nav><article class="quest-log-detail" aria-live="polite"></article></div>`;
  host.append(panel);
  const list = panel.querySelector<HTMLElement>(".quest-log-list")!;
  const detail = panel.querySelector<HTMLElement>(".quest-log-detail")!;
  panel.querySelector<HTMLButtonElement>("#quest-log-close")!.addEventListener("click", onClose);
  let snapshot: AdventureSnapshot | null = null;
  let selected: QuestId | null = null;
  let signature = "";

  const renderDetail = () => {
    if (!snapshot || !selected) return;
    const definition = QUESTS.find(quest => quest.id === selected);
    const view = snapshot.quests.find(quest => quest.id === selected);
    if (!definition || !view || view.status === "locked") return;
    detail.replaceChildren();
    const heading = document.createElement("h3"); heading.textContent = definition.title;
    const meta = document.createElement("p"); meta.className = "quest-log-meta";
    meta.textContent = `${definition.giverName} · ${statusLabel[view.status]}`;
    const story = document.createElement("p");
    story.textContent = view.status === "available" ? definition.offer : view.status === "completed" ? definition.after : definition.offer;
    const objective = document.createElement("p"); objective.className = "quest-log-objective";
    objective.textContent = `${definition.objective} (${Math.min(view.progress, view.required)} / ${view.required})`;
    const reward = document.createElement("div"); reward.className = "quest-log-reward";
    reward.innerHTML = `<strong>Rewards</strong><span>${rewardText(snapshot, selected)}</span>`;
    detail.append(heading, meta, story, objective, reward);
    if (definition.reward.gear) {
      const gear = definition.reward.gear;
      const equipped = snapshot.progression.equipment[GEAR[gear].slot] === gear;
      const hint = document.createElement("p"); hint.className = "quest-log-hint";
      hint.textContent = equipped ? `${gearName(gear, snapshot.player.archetype)} is equipped.` : `Equip ${gearName(gear, snapshot.player.archetype)} from your Backpack (B) or Character (C).`;
      detail.append(hint);
    }
    if (view.status === "available") {
      const hint = document.createElement("p"); hint.className = "quest-log-hint"; hint.textContent = `Speak with ${definition.giverName} to accept this quest.`; detail.append(hint);
    } else if (view.status === "ready") {
      const hint = document.createElement("p"); hint.className = "quest-log-hint ready"; hint.textContent = `Return to ${definition.giverName} to turn in this quest.`; detail.append(hint);
    }
  };

  const render = () => {
    if (!snapshot) return;
    const visible = QUESTS.filter(definition => snapshot!.quests.some(view => view.id === definition.id && view.status !== "locked"));
    const nextSelected = selected && visible.some(definition => definition.id === selected) ? selected : visible[0]?.id ?? null;
    selected = nextSelected;
    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p"); empty.className = "quest-log-empty"; empty.textContent = "No quests recorded yet. Speak with Mara or Rowan to begin."; list.append(empty);
      detail.replaceChildren(); return;
    }
    for (const definition of visible) {
      const view = snapshot.quests.find(quest => quest.id === definition.id)!;
      const entry = document.createElement("button"); entry.type = "button"; entry.className = "quest-log-entry"; entry.dataset.questId = definition.id;
      entry.setAttribute("aria-pressed", String(definition.id === selected));
      const mark = view.status === "available" ? "!" : view.status === "ready" ? "?" : view.status === "completed" ? "✓" : "";
      entry.innerHTML = `<span class="quest-log-mark">${mark}</span><span class="quest-log-entry-copy"><strong>${definition.title}</strong><small>${definition.giverName} · ${statusLabel[view.status]}</small></span>`;
      entry.addEventListener("click", () => { selected = definition.id; for (const button of list.querySelectorAll<HTMLButtonElement>(".quest-log-entry")) button.setAttribute("aria-pressed", String(button === entry)); renderDetail(); });
      list.append(entry);
    }
    renderDetail();
  };
  return {
    isOpen: () => !panel.hidden,
    open(next) { snapshot = next; panel.hidden = false; signature = ""; render(); },
    update(next) { snapshot = next; const nextSignature = JSON.stringify([next.quests, next.progression.level, next.player.archetype]); if (nextSignature !== signature) { signature = nextSignature; if (!panel.hidden) render(); } },
    close() { panel.hidden = true; },
    dispose() { panel.querySelector<HTMLButtonElement>("#quest-log-close")!.removeEventListener("click", onClose); panel.remove(); },
  };
}
