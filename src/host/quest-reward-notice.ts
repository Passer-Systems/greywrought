import type { AdventureSnapshot } from "../game/adventure-types.js";
import { GEAR, QUESTS, gearName, type GearItemId, type GearSlot, type QuestId } from "../game/yard-content.js";
import { classAction } from "../game/class-kit.js";

/**
 * A small, transient reward card shown once when a quest is turned in.
 * It deliberately observes the authoritative snapshot rather than owning reward
 * state, so reconnecting to an already completed quest cannot replay the card.
 */
export interface QuestRewardNotice {
  update(snapshot: AdventureSnapshot): void;
  /** Clear transition history when the local player changes character. */
  reset(): void;
  dispose(): void;
}

export interface QuestRewardNoticeOptions {
  readonly onEquip: (slot: GearSlot, item: GearItemId) => void;
  readonly onDismiss?: () => void;
}

function rewardLine(snapshot: AdventureSnapshot, questId: QuestId): string[] {
  const reward = QUESTS.find(quest => quest.id === questId)!.reward;
  const lines: string[] = [];
  if (reward.gear) lines.push(gearName(reward.gear, snapshot.player.archetype));
  if (reward.potions) lines.push(`${reward.potions} healing potion${reward.potions === 1 ? "" : "s"}`);
  if (reward.supplies) lines.push(`${reward.supplies} supplies`);
  if (reward.level > 1) lines.push(`Level ${reward.level}`);
  if (reward.ability) lines.push(`${classAction(snapshot.player.archetype, reward.ability).name} · key ${reward.ability === "disengage" ? "3" : "4"}`);
  return lines;
}

export function createQuestRewardNotice(host: HTMLElement, options: QuestRewardNoticeOptions): QuestRewardNotice {
  const panel = document.createElement("section");
  panel.className = "quest-reward-notice";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  panel.setAttribute("role", "status");
  panel.innerHTML = `
    <div class="quest-reward-notice-heading"><span class="quest-reward-notice-kicker">Quest complete</span><button type="button" class="quest-reward-notice-close" aria-label="Dismiss reward">×</button></div>
    <h2 class="quest-reward-notice-title"></h2>
    <p class="quest-reward-notice-copy"></p>
    <div class="quest-reward-notice-items"></div>
    <div class="quest-reward-notice-actions"></div>`;
  host.append(panel);
  const style = document.createElement("style");
  style.textContent = `
    .quest-reward-notice { position:fixed; left:50%; bottom:calc(var(--combat-hud-height, 112px) + 18px); z-index:24; width:min(340px,calc(100vw - 28px)); transform:translateX(-50%); padding:11px 13px 12px; color:#eee2c8; border:1px solid #9d8255; border-radius:4px; background:linear-gradient(145deg,#282318f2,#11150ff5); box-shadow:0 8px 28px #000b, inset 0 1px #e7c47755; font:var(--ui-font-body)/1.35 system-ui,sans-serif; }
    .quest-reward-notice[hidden] { display:none; }
    .quest-reward-notice-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .quest-reward-notice-kicker { color:#e5bf5e; text-transform:uppercase; letter-spacing:.1em; font-size:var(--ui-font-tiny); font-weight:700; }
    .quest-reward-notice-close { width:24px; height:24px; padding:0; border:0; color:#cfc4ad; background:transparent; font-size:20px; line-height:1; cursor:pointer; }
    .quest-reward-notice-title { margin:2px 0 5px; color:#fff1c6; font:700 var(--ui-font-prominent)/1.2 Georgia,serif; }
    .quest-reward-notice-copy { margin:0 0 7px; color:#c7c0ad; }
    .quest-reward-notice-items { display:flex; flex-wrap:wrap; gap:5px; margin:6px 0 10px; }
    .quest-reward-notice-item { display:inline-flex; align-items:center; padding:3px 7px; border:1px solid #65573c; border-radius:3px; color:#dfd0a9; background:#0d100ccc; font-size:var(--ui-font-small); }
    .quest-reward-notice-actions { display:flex; gap:7px; justify-content:flex-end; }
    .quest-reward-notice-actions button { padding:5px 10px; border:1px solid #a5864e; border-radius:3px; color:#f7e4ae; background:#40351f; cursor:pointer; font:600 var(--ui-font-small) system-ui,sans-serif; }
    .quest-reward-notice-actions button:hover { background:#5b4929; }
  `;
  host.append(style);
  const title = panel.querySelector<HTMLElement>(".quest-reward-notice-title")!;
  const copy = panel.querySelector<HTMLElement>(".quest-reward-notice-copy")!;
  const items = panel.querySelector<HTMLElement>(".quest-reward-notice-items")!;
  const actions = panel.querySelector<HTMLElement>(".quest-reward-notice-actions")!;
  let initialized = false;
  let seen = new Map<QuestId, string>();
  let activeGear: { slot: GearSlot; item: GearItemId } | null = null;
  let activeQuest: QuestId | null = null;

  const dismiss = () => {
    panel.hidden = true;
    activeGear = null;
    activeQuest = null;
    options.onDismiss?.();
  };
  panel.querySelector<HTMLButtonElement>(".quest-reward-notice-close")!.addEventListener("click", dismiss);

  function show(snapshot: AdventureSnapshot, questId: QuestId): void {
    const definition = QUESTS.find(quest => quest.id === questId)!;
    const reward = definition.reward;
    activeQuest = questId;
    title.textContent = definition.title;
    copy.textContent = reward.gear ? `Received from ${definition.giverName}. Add it to your loadout before you leave.` : `Received from ${definition.giverName}.`;
    items.replaceChildren();
    for (const line of rewardLine(snapshot, questId)) {
      const item = document.createElement("span"); item.className = "quest-reward-notice-item"; item.textContent = line; items.append(item);
    }
    actions.replaceChildren();
    activeGear = reward.gear ? { slot: GEAR[reward.gear].slot, item: reward.gear } : null;
    if (activeGear && snapshot.progression.equipment[activeGear.slot] !== activeGear.item) {
      const equip = document.createElement("button"); equip.type = "button"; equip.textContent = `Equip ${gearName(activeGear.item, snapshot.player.archetype)}`;
      equip.addEventListener("click", () => {
        if (!activeGear) return;
        options.onEquip(activeGear.slot, activeGear.item);
        // The server may reject an equip while the player is changing state.
        // Keep the control available instead of trapping the player behind a
        // permanently disabled button; the next snapshot will confirm success.
        equip.textContent = "Equip requested";
        window.setTimeout(() => { if (!equip.isConnected || panel.hidden) return; equip.textContent = `Equip ${gearName(activeGear!.item, snapshot.player.archetype)}`; }, 700);
      });
      actions.append(equip);
    }
    const done = document.createElement("button"); done.type = "button"; done.textContent = "Dismiss"; done.addEventListener("click", dismiss); actions.append(done);
    panel.hidden = false;
  }

  return {
    update(snapshot) {
      const current = new Map(snapshot.quests.map(view => [view.id, view.status]));
      if (!initialized) { seen = current; initialized = true; return; }
      const completed = snapshot.quests.find(view => view.status === "completed" && seen.get(view.id) !== "completed");
      seen = current;
      if (completed) show(snapshot, completed.id);
      else if (activeQuest && snapshot.progression.equipment[activeGear?.slot ?? "chest"] === activeGear?.item) dismiss();
    },
    reset() {
      initialized = false;
      seen = new Map();
      panel.hidden = true;
      activeGear = null;
      activeQuest = null;
    },
    dispose() { panel.remove(); style.remove(); },
  };
}
