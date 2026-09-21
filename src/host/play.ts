import { AttackAutocast } from "./attack-autocast.js";
import { usableItems, usableItem, usableItemDragType } from "./usable-items.js";
import { createWorldMap } from "./world-map.js";
import { regionAt, settlementAt } from "../game/world-regions.js";
import { createMinimap } from "./minimap.js";
import { setAttribute, setDataset, setText } from "./dom-updates.js";
import { createGearShop } from "./gear-shop.js";
import { createAppControls } from './app-controls.js';
import { COMBAT_RULES, createAdventure } from "../game/adventure.js";
import { classAction, classKit, SPRINT_COST } from "../game/class-kit.js";
import type { AdventureAction, AdventureSnapshot, Position } from "../game/adventure-types.js";
import { COMBAT_TURN } from "../game/combat-turn.js";
import { COMBAT_CELL_SIZE, combatRouteDistance } from "../game/combat-grid.js";
import {
  archiveFallenCharacter, characterProfileStorageKey, decodeCharacterProfile, encodeCharacterProfile,
  normalizedCharacterName, normalizedDisplayName,
  type CharacterArchetype, type LocalCharacter, type LocalProfile,
} from "./character-profile.js";
import { createBellrunnerPanel } from "./bellrunner.js";
import { createAdventureWorld, type AdventureWorld } from "./adventure-world.js";
import { createAdventureAudio } from "./adventure-audio.js";
import { createEnemyNameplates } from "./enemy-nameplates.js";
import { createEquipmentPanel } from "./equipment-panel.js";
import { createCorpseLoot } from "./corpse-loot.js";
import { createBagPanel } from "./bag-panel.js";
import { createChatLog } from "./chat-log.js";
import { newAttackerTarget, type UnitSelection } from "./unit-selection.js";
import { createUnitFrames } from "./unit-frames.js";
import { createPartyPanel } from "./party-panel.js";
import { createBankPanel } from "./bank-panel.js";
import { createInnPanel } from "./inn-panel.js";
import { createLorebook } from "./lorebook.js";
import { createShopPanel } from "./shop-panel.js";
import { createTradePanel } from "./trade-panel.js";
import { createCombatPlan } from "./combat-plan.js";
import { createQuestLog } from "./quest-log.js";
import { createQuestRewardNotice } from "./quest-reward-notice.js";
import { updateQuestTracker } from "./quest-tracker.js";
import { connectAdventure, readCharacterNames, type NetworkAdventure } from "./network-adventure.js";
import { publicUrl } from "./public-url.js";
import { playerRange } from "./combat-range.js";
import { YARD, type QuestId, type QuestOperation } from "../game/yard-content.js";

declare global { interface Window { __GREYWROUGHT_TEARDOWN__?: () => void; } }

window.__GREYWROUGHT_TEARDOWN__?.();
document.title = `Greywrought — ${YARD.region}`;
document.querySelector<HTMLMetaElement>('meta[property="og:title"]')!.content = document.title;
document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = `Prepare in ${YARD.settlement}, investigate the missing crew, and end the last shift.`;
for (const node of document.querySelectorAll<HTMLElement>("[data-yard-name]")) {
  const key = node.dataset.yardName as keyof typeof YARD;
  node.textContent = YARD[key];
}
for (const [id, label] of [["hearthstead", `${YARD.settlement} · safe`], ["forest-gate", YARD.gate], ["frost-cores", YARD.resource], ["ritual-site", YARD.works], ["inn", YARD.inn]]) {
  const marker = document.querySelector<HTMLElement>(`[data-map-place="${id}"]`)!;
  marker.title = label!; marker.setAttribute("aria-label", label!);
}
document.querySelector(".adventure-map")!.setAttribute("aria-label", `North-up ${YARD.region} map`);
element("entry-realm-copy").textContent = `Prepare in ${YARD.settlement}, find the missing crew, and bring their names home. Each character has one life.`;
const audio = createAdventureAudio();
const appControls = createAppControls(element("character-select"), element("pause-settings"));
const equipment = createEquipmentPanel(element("equipment-panel"), closeEquipment, (slot, item) => {
  if (running?.ready && !paused) running.game.equip(slot, item);
});
const corpseLoot = createCorpseLoot(element("adventure-hud"), {
  onTake: () => { pulse("takeLoot"); running?.world.canvas.focus(); },
  onClose: () => { pulse("closeLoot"); running?.world.canvas.focus(); },
});
const bags = createBagPanel(element("adventure-hud"), {
  onUsePotion: () => pulse("drinkPotion"),
  onUseHearthstone: () => { pulse("hearthstone"); closeBags(); },
  onEquip: (slot, item) => { if (running?.ready && !paused) running.game.equip(slot, item); },
  onOpenEquipment: () => {
    if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
    equipment.open(running.character, running.game.snapshot, false);
  },
  onClose: closeBags,
});
const questLog = createQuestLog(element("adventure-hud"), closeQuestLog);
const questRewards = createQuestRewardNotice(element("adventure-hud"), {
  onEquip: (slot, item) => { if (running?.ready && !paused) running.game.equip(slot, item); },
});
const lorebook = createLorebook(element("adventure-hud"), closeLorebook, id => unitFrames.portrait(id));
const chatLog = createChatLog(element("adventure-hud"), text => {
  if (text.trim().toLowerCase() === '/autorun') { running?.game.toggleAutorun(); return; }
  const match = /^\/follow(?:\s+(.*))?$/i.exec(text.trim());
  if (!match) { running?.game.sendChat(text); return; }
  const name = match[1]?.trim().toLowerCase();
  const target = name ? running?.game.players.find(player => player.name.toLowerCase() === name)?.id ?? null
    : running?.selection?.kind === 'player' ? running.selection.id : null;
  running?.game.followPlayer(target);
});
const unitFrames = createUnitFrames(element("adventure-hud"));
const partyPanel = createPartyPanel(element("adventure-hud"), {
  onSelect: id => { selectPlayerTarget(id); running?.world.canvas.focus(); },
  onFollow: id => { running?.game.followPlayer(id); running?.world.canvas.focus(); },
  onCommand: command => { if (running?.ready) running.game.partyCommand(command); },
});
const combatPlan = createCombatPlan(element("combat-plan-mount"), {
  portrait: id => unitFrames.portrait(id),
  playerName: id => running?.character.id === id ? "You" : running?.game.players.find(player => player.id === id)?.name,
  onRemove: id => { if (running?.ready && !paused && !moveSubmitting) { if (running.game.snapshot.combat.queued.find(entry => entry.id === id)?.action !== "bait") running.autocast.suppress(running.game.snapshot, running.game.session.id); setBaitAiming(false); running.game.removeQueuedAction(id); combatPlan.update(running.game.snapshot); } },
  onClear: () => { if (running?.ready && !paused && !moveSubmitting) { running.autocast.suppress(running.game.snapshot, running.game.session.id); setBaitAiming(false); running.game.clearQueuedActions(); combatPlan.update(running.game.snapshot); } },
  onTiming: timing => { if (running?.ready && !paused) { running.game.setActionTiming(timing); combatPlan.update(running.game.snapshot); } },
  onAction: action => pulse(action),
  onReady: readyCombat,
  onAimMove: () => pulse("bait"),
  onSprint: active => { if (running?.ready && !paused && !moveSubmitting) { running.game.setSprint(active); combatPlan.update(running.game.snapshot); updateMoveRoute(); } },
  onUndoMove: undoMove,
  onWaitMove: () => { if (baitAiming && !moveSubmitting) { moveWaitTicks = (moveWaitTicks + 1) % (COMBAT_TURN.maxWaitTicks + 1); updateMoveRoute(); } },
  onFinishMove: () => { void finishMove(); },
  onPreview: preview => running?.world.setCombatPreview(preview),
});
function readyCombat(): boolean {
  if (!running?.ready || paused) return false;
  if (baitAiming) { void finishMove(() => { running?.game.readyCombat(); }); return false; }
  running.game.readyCombat(); combatPlan.update(running.game.snapshot);
  return true;
}
const hudSize = new ResizeObserver(() => {
  unitFrames.layout();
});
hudSize.observe(element("combat-plan-mount").parentElement!);
const bank = createBankPanel(element("adventure-hud"), {
  onTransfer: (operation, kind, quantity) => {
    if (!running?.ready || paused) return;
    running.game.bankTransfer(operation, kind, quantity);
  },
  onClose: () => { pulse("closeBank"); running?.world.canvas.focus(); },
});
const bellrunner = createBellrunnerPanel(element("adventure-hud"), destination => { if (running?.ready && !paused) running.game.fly(destination); }, () => { pulse("closeShop"); running?.world.canvas.focus(); });
const inn = createInnPanel(element("adventure-hud"), {
  onQuest: submitQuest,
  onRest: () => pulse("rest"),
  onClose: () => { pulse("closeInn"); running?.world.canvas.focus(); },
});
void unitFrames.ready.catch(cause => console.error("Unit portraits failed to load", cause));
const shop = createShopPanel(element("adventure-hud"), {
  onQuest: submitQuest,
  onBuyPotion: () => pulse("buyPotion"),
  onTrade: () => pulse("openTrade"),
  onClose: () => { pulse("closeShop"); running?.world.canvas.focus(); },
});
const gearShop = createGearShop(element("adventure-hud"), element("experience-mount"), {
  onBuy: (vendor, item) => { if (running?.ready && !paused) running.game.buyGear(vendor, item); },
  onClose: () => { pulse("closeShop"); running?.world.canvas.focus(); },
});
const trade = createTradePanel(element("adventure-hud"), {
  onOffer: (kind, quantity) => {
    if (!running?.ready || paused) return;
    running.game.setTradeOffer(kind, quantity);
    trade.update(running.game.snapshot);
  },
  onAccept: () => { pulse("acceptTrade"); save(); },
  onClose: () => { pulse("closeTrade"); running?.world.canvas.focus(); },
});
void shop.ready.catch(cause => console.error("Merchant portrait failed to load", cause));

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element ${id}`);
  return found;
}
function submitQuest(id: QuestId, operation: QuestOperation): void {
  if (running?.ready && !paused) running.game.quest(id, operation);
}
function button(id: string): HTMLButtonElement {
  const found = element(id);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Expected button ${id}`);
  return found;
}
function input(id: string): HTMLInputElement {
  const found = element(id);
  if (!(found instanceof HTMLInputElement)) throw new Error(`Expected input ${id}`);
  return found;
}
function actionBar(): HTMLElement { return element("adventure-actions"); }
function actionBarStorageKey(archetype: CharacterArchetype): string { return `greywrought/action-bar/${archetype}`; }
function actionBarControls(): HTMLButtonElement[] {
  return [...actionBar().querySelectorAll<HTMLButtonElement>(":scope > button")];
}
function normalActionBarOrder(): ActionBarEntry[] {
  return actionBarControls().map(control => control.dataset.action as AdventureAction | undefined ?? null);
}
let authoredActionBarOrder: ActionBarEntry[] | null = null;
function loadActionBarOrder(archetype: CharacterArchetype): void {
  if (actionBarArchetype === archetype && actionBarOrder.length) return;
  const defaults = authoredActionBarOrder ?? (authoredActionBarOrder = normalActionBarOrder());
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(actionBarStorageKey(archetype)) ?? "null"); } catch { /* Use the authored order when storage is unavailable. */ }
  const allowed = new Set<AdventureAction>([...usableItems.map(item => item.action), ...defaults.filter((action): action is AdventureAction => action !== null)]);
  const parsed = Array.isArray(saved) ? saved.slice(0, defaults.length).map(value => typeof value === "string" && allowed.has(value as AdventureAction) ? value as AdventureAction : null) : [];
  const order: ActionBarEntry[] = [];
  for (const action of parsed) order.push(action !== null && order.includes(action) ? null : action);
  for (const action of defaults) if (action !== null && !order.includes(action)) {
    const empty = order.indexOf(null);
    if (empty >= 0) order[empty] = action;
    else if (order.length < defaults.length) order.push(action);
    else {
      let optional = order.length - 1;
      while (optional >= 0 && defaults.includes(order[optional]!)) optional--;
      if (optional >= 0) order[optional] = action;
    }
  }
  while (order.length < defaults.length) order.push(null);
  actionBarOrder = order.slice(0, defaults.length);
  actionBarArchetype = archetype;
  applyActionBarOrder();
}
function persistActionBarOrder(): void {
  if (!actionBarArchetype) return;
  try { localStorage.setItem(actionBarStorageKey(actionBarArchetype), JSON.stringify(actionBarOrder)); } catch { /* The bar still works for this session. */ }
}
function applyActionBarOrder(): void {
  const controls = actionBarControls();
  for (const item of usableItems) {
    let control = controls.find(control => control.dataset.action === item.action);
    if (actionBarOrder.includes(item.action) && !control) {
      control = controls.find(control => !control.dataset.action)!;
      control.dataset.action = item.action;
      control.classList.remove("action-empty");
      control.draggable = true;
      control.setAttribute("aria-describedby", `tip-${item.id}`);
      control.innerHTML = `<kbd></kbd><span class="action-art"><img src="${publicUrl(`assets/ui/icons/${item.icon}`)}" alt="" draggable="false" />${item.stackable ? '<span class="action-quantity" aria-hidden="true"></span>' : ""}</span><span class="action-tooltip" id="${`tip-${item.id}`}" role="tooltip"><strong>${item.name}</strong><small></small><span></span></span>`;
    } else if (control && !actionBarOrder.includes(item.action)) {
      delete control.dataset.action;
      control.classList.add("action-empty");
      control.draggable = false;
      control.disabled = false;
      control.removeAttribute("aria-describedby");
      control.innerHTML = '<kbd></kbd><span class="action-art"></span>';
    }
  }
  const byAction = new Map<string, HTMLButtonElement>();
  const empties: HTMLButtonElement[] = [];
  for (const control of controls) {
    if (control.dataset.action) byAction.set(control.dataset.action, control);
    else empties.push(control);
  }
  for (const [index, action] of actionBarOrder.entries()) {
    const control = action ? byAction.get(action) : empties.shift();
    if (!control) continue;
    control.dataset.actionSlot = String(index);
    control.querySelector("kbd")!.textContent = actionBarLabels[index] ?? "";
    if (action === null) control.setAttribute("aria-label", `Empty action slot ${actionBarLabels[index]}`);
    actionBar().append(control);
  }
}
function actionForBarCode(code: string): AdventureAction | null {
  const index = actionBarKeys.indexOf(code as typeof actionBarKeys[number]);
  if (index < 0) return null;
  return actionBarOrder[index] ?? null;
}
function resetActionBarDragState(): void {
  for (const control of actionBarControls()) control.classList.remove("action-dragging", "action-drag-over");
}
function bindActionBar(): void {
  const bar = actionBar();
  for (const control of actionBarControls()) {
    control.draggable = Boolean(control.dataset.action);
    for (const image of control.querySelectorAll<HTMLImageElement>("img")) image.draggable = false;
    if (!control.dataset.action) control.disabled = false;
  }
  let dragged: HTMLButtonElement | null = null;
  listen(bar, "click", event => {
    if (performance.now() < suppressActionClickUntil || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>("button");
    if (control?.dataset.action && !control.disabled) pulse(control.dataset.action as AdventureAction);
  });
  listen(bar, "contextmenu", event => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>("button[data-action=strike]");
    if (!control || !bar.contains(control) || !running?.ready || menuOpen()) return;
    event.preventDefault();
    running.autocast.toggle(); renderHud(running.game.snapshot);
  });
  listen(bar, "dragstart", event => {
    if (!(event instanceof DragEvent) || !(event.target instanceof Element)) return;
    const source = event.target.closest<HTMLButtonElement>("button");
    if (!source || !bar.contains(source) || !source.dataset.action) return;
    dragged = source;
    event.dataTransfer?.setData("text/plain", source.dataset.action);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    source.classList.add("action-dragging");
  });
  listen(bar, "dragover", event => {
    if (!(event instanceof DragEvent) || (!dragged && !event.dataTransfer?.types.includes(usableItemDragType))) return;
    const target = (event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null);
    if (!target || target === dragged) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    for (const control of actionBarControls()) control.classList.toggle("action-drag-over", control === target);
  });
  listen(bar, "drop", event => {
    if (!(event instanceof DragEvent) || (!dragged && !event.dataTransfer?.types.includes(usableItemDragType))) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!target || target === dragged) return;
    event.preventDefault();
    const bagAction = usableItem(event.dataTransfer?.getData(usableItemDragType))?.action ?? null;
    if (!dragged && !bagAction) return;
    const from = dragged ? Number(dragged.dataset.actionSlot) : actionBarOrder.indexOf(bagAction);
    const to = Number(target.dataset.actionSlot);
    if (from < 0 && Number.isInteger(to)) {
      const empty = actionBarOrder.indexOf(null);
      if (empty < 0) return;
      actionBarOrder[empty] = actionBarOrder[to] ?? null;
      actionBarOrder[to] = bagAction;
      applyActionBarOrder();
      persistActionBarOrder();
      suppressActionClickUntil = performance.now() + 250;
    } else if (Number.isInteger(from) && Number.isInteger(to) && from !== to) {
      const source = actionBarOrder[from] ?? null;
      actionBarOrder[from] = actionBarOrder[to] ?? null;
      actionBarOrder[to] = source;
      applyActionBarOrder();
      persistActionBarOrder();
      suppressActionClickUntil = performance.now() + 250;
    }
    dragged = null;
    resetActionBarDragState();
  });
  listen(bar, "dragend", () => { dragged = null; resetActionBarDragState(); });
}
function text(id: string, value: string): void {
  const target = element(id);
  if (target.textContent !== value) target.textContent = value;
}
const classes: Record<CharacterArchetype, { name: string; copy: string }> = {
  warrior: { name: "Warrior", copy: "A steadfast wayfarer who meets the forest with courage and a ready blade." },
  mage: { name: "Mage", copy: "A curious seeker drawn to the old mysteries sleeping beneath the frost." },
  hunter: { name: "Ranger", copy: "A patient trailfinder who reads the forest and knows when to return home." },
  alchemist: { name: "Alchemist", copy: "A field chemist who turns scarce reagents into healing, acid, and volatile power." },
  artificer: { name: "Artificer", copy: "A works engineer who answers danger with a rivet tool, plated wards, and overclocked machinery." },
};
const keyActions: Readonly<Record<string, AdventureAction>> = {
  KeyW: "forward", KeyS: "backward", KeyA: "left", KeyD: "right", Space: "jump", ControlLeft: "dive", ControlRight: "dive",
  KeyG: "gather", KeyR: "ritual",
  KeyF: "interact", KeyT: "rest", Tab: "target",
};
const actionBarKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"] as const;
const actionBarLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="] as const;
type ActionBarEntry = AdventureAction | null;
let actionBarOrder: ActionBarEntry[] = [];
let actionBarArchetype: CharacterArchetype | null = null;
let suppressActionClickUntil = 0;
let baitAiming = false;
let moveAimError = "";
let moveRoute: Position[] = [];
let moveWaitTicks = 0;
let moveSubmitting = false;
let moveRevision = 0;
let moveContext = "";
const resumeKey = "greywrought/adventure-active-character";
interface RunningAdventure {
  readonly character: LocalCharacter;
  readonly game: NetworkAdventure;
  readonly world: AdventureWorld;
  readonly autocast: AttackAutocast;
  readonly unbind: Array<() => void>;
  saveClock: number;
  ready: boolean;
  selection: UnitSelection;
  lastEnemyTarget: string;
  attackers: Set<string>;
}
const removers: Array<() => void> = [];
const keys = new Set<string>();
let nameplates: ReturnType<typeof createEnemyNameplates> | null = null;
const markers = new Map<string, HTMLButtonElement>();
let running: RunningAdventure | null = null;
let alive = true;
let frame = 0;
let lastTime = 0;
let nextFrameTime = 0;
let nextHudTime = 0;
const frameInterval = 1000 / 60;
let paused = false;
let aggroRangesVisible = false;
let helpRangesVisible = false;
let backgrounded = false;
let lastEncounterState = '';
let entering = false;
let profile: LocalProfile | null = null;
let profileBlocked = false;
let route: "account" | "creator" | "roster" | "world" = "account";
let draft: CharacterArchetype = "warrior";
let pendingDeleteId: string | null = null;
let rosterTab: "active" | "rip" = "active";
let selectedMemorialId: string | null = null;

function listen(target: EventTarget, type: string, handler: EventListener, local = removers, capture = false): void {
  target.addEventListener(type, handler, capture);
  local.push(() => target.removeEventListener(type, handler, capture));
}
function click(id: string, handler: () => void): void { listen(element(id), "click", handler); }
function combatExecutionLocked(): boolean {
  const snapshot = running?.game.snapshot;
  return Boolean(snapshot?.player.inCombat && snapshot.combat.phase === "active");
}
function setBaitAiming(value: boolean): void {
  if (value === baitAiming) return;
  baitAiming = value;
  moveAimError = "";
  moveSubmitting = false;
  moveRevision++;
  const queued = value ? running?.game.snapshot.combat.queued.find(entry => entry.action === "bait") : null;
  moveRoute = queued?.destination ? [...queued.via, queued.destination] : [];
  moveWaitTicks = queued?.waitTicks ?? 0;
  moveContext = value ? currentMoveContext() : "";
  running?.world.setMoveAiming(value);
  updateMoveRoute();
  document.body.dataset.baitAiming = String(value);
  element("bait-aim-hint").hidden = !value;
}
function currentMoveContext(): string {
  return running ? `${running.character.id}:${running.game.connectionRevision}:${running.game.snapshot.combat.cycle}` : "";
}
function updateMoveRoute(): void {
  running?.world.setMoveRoute(moveRoute, moveWaitTicks);
  const snapshot = running?.game.snapshot;
  const used = snapshot ? combatRouteDistance(snapshot.player.position, moveRoute) / COMBAT_CELL_SIZE : 0;
  const total = snapshot ? snapshot.player.movementTiles : 0;
  combatPlan.setRouteEditing(baitAiming, used, total, moveRoute.length, moveSubmitting, moveWaitTicks);
  if (running) running.world.canvas.dataset.moveRoute = JSON.stringify(moveRoute);
}
function undoMove(): void {
  if (!baitAiming || moveSubmitting) return;
  moveRoute = moveRoute.slice(0, -1); moveAimError = ""; updateMoveRoute();
  running?.world.canvas.focus();
}
async function finishMove(after?: () => void): Promise<void> {
  const app = running, destination = moveRoute.at(-1);
  if (!baitAiming || moveSubmitting || !app?.ready || paused) return;
  if (!destination) { setBaitAiming(false); after?.(); return; }
  moveSubmitting = true; updateMoveRoute();
  const revision = moveRevision;
  const accepted = await app.game.submitBait(destination, moveRoute.slice(0, -1), moveWaitTicks);
  if (revision !== moveRevision || running !== app || currentMoveContext() !== moveContext) return;
  if (!accepted) {
    moveSubmitting = false;
    const combat = app.game.snapshot.combat;
    moveAimError = combat.availableStamina + (combat.queued.find(entry => entry.action === "bait")?.cost ?? 0) < (combat.sprinting ? SPRINT_COST : 0)
      ? "Not enough Energy to Sprint. Change your action or turn Sprint off."
      : "That route is no longer clear. Undo the last stop and choose another tile.";
    updateMoveRoute(); return;
  }
  combatPlan.update(app.game.snapshot);
  setBaitAiming(false);
  after?.();
  app.world.canvas.focus();
}
function menuOpen(): boolean { return !element("pause-panel").hidden; }
function pressAction(action: AdventureAction): void {
  if (running?.game.session.mode === "viewing") return;
  if (menuOpen()) return;
  if ((action === "strike" || action === "special" && running && classAction(running.game.snapshot.player.archetype, action).target === "unit") && running?.selection?.kind !== "enemy") return;
  if (action === "target" && running) running.selection = { kind: "enemy", id: running.game.snapshot.selectedThreat };
  if (action === "bait") {
    if (moveSubmitting) return;
    const snapshot = running?.game.snapshot;
    if (snapshot?.combat.phase === "preparation" && !snapshot.combat.ready && snapshot.combat.availableStamina + (snapshot.combat.queued.find(entry => entry.action === "bait")?.cost ?? 0) >= (snapshot.combat.sprinting ? SPRINT_COST : 0)) setBaitAiming(!baitAiming);
    return;
  }
  if ((action === "strike" || action === "brace" || action === "special") && running) running.autocast.suppress(running.game.snapshot, running.game.session.id);
  if ((action === "strike" || action === "brace" || action === "special") && baitAiming) {
    void finishMove(() => { running?.game.setAction(action, true); running?.game.setAction(action, false); });
    return;
  }
  if (combatExecutionLocked() && ["forward", "backward", "left", "right", "jump", "dive", "strike", "brace", "special", "drinkPotion"].includes(action)) return;
  running?.game.setAction(action, true);
}
function pulse(action: AdventureAction): void {
  if (!running?.ready || (paused && action !== "closeLoot" && action !== "closeShop")) return;
  pressAction(action);
  running.game.setAction(action, false);
}
function release(): void {
  setBaitAiming(false);
  if (running) {
    for (const action of new Set<AdventureAction>([...Object.values(keyActions), "strike", "brace", "bait", "special"])) running.game.setAction(action, false);
    running.game.setMouseForward(false);
  }
  keys.clear();
}
function toggleAggroRanges(kind: "direct" | "help" = "direct"): void {
  if (kind === "direct") aggroRangesVisible = !aggroRangesVisible;
  else helpRangesVisible = !helpRangesVisible;
  button('aggro-ranges-toggle').setAttribute('aria-pressed', String(aggroRangesVisible));
  text('aggro-ranges-state', aggroRangesVisible ? 'On' : 'Off');
  button('help-ranges-toggle').setAttribute('aria-pressed', String(helpRangesVisible));
  text('help-ranges-state', helpRangesVisible ? 'On' : 'Off');
  element('aggro-direct-legend').hidden = !aggroRangesVisible;
  element('aggro-help-legend').hidden = !helpRangesVisible;
  element('aggro-ranges-legend').hidden = !aggroRangesVisible && !helpRangesVisible;
  document.body.dataset.helpRangesVisible = String(helpRangesVisible);
  document.body.dataset.aggroRangesVisible = String(aggroRangesVisible);
  if (running) {
    const { world, game } = running;
    world.setAggroRangesVisible(aggroRangesVisible);
    world.setHelpRangesVisible(helpRangesVisible);
    if (paused) world.render(game.snapshot, 0, game.renderPlayer, undefined, game.connectionRevision, game.serverWallTimeMillis, game.rainIntensity);
  }
}
function save(_force = false): void {
  if (!running?.ready) return;
  element("connection-status").hidden = running.game.online;
  text('connection-status', running.game.reconnecting ? 'Reconnecting…' : 'Connection lost · reconnecting…');
  document.body.dataset.gamePersistence = running.game.online ? "server" : "disconnected";
}

function persistProfile(): void {
  if (!profile || profileBlocked) return;
  try { localStorage.setItem(characterProfileStorageKey, encodeCharacterProfile(profile)); }
  catch (cause: unknown) { text("entry-roster-feedback", "Your character could not be saved in this browser."); console.error("Profile save failed", cause); }
}
function selectedCharacter(): LocalCharacter | null {
  const characters = rosterCharacters();
  const id = rosterTab === "rip" ? selectedMemorialId : profile?.selectedCharacterId;
  return characters.find((character) => character.id === id) ?? characters[0] ?? null;
}
function rosterCharacters(): readonly LocalCharacter[] {
  return profile?.characters.filter((character) => (character.fallenAtMillis !== undefined) === (rosterTab === "rip")) ?? [];
}
function showFallenCharacter(character: LocalCharacter): void {
  if (!profile) return;
  profile = archiveFallenCharacter(profile, character.id, Date.now());
  rosterTab = "rip";
  selectedMemorialId = character.id;
  pendingDeleteId = null;
  text("entry-roster-feedback", `${character.name} has fallen. Their memory rests here.`);
  persistProfile();
  returnToRoster();
}
function avatar(prefix: string, archetype: CharacterArchetype): void {
  element(`${prefix}-avatar`).dataset.avatarArchetype = archetype;
  const portrait = element(`${prefix}-portrait`);
  if (portrait instanceof HTMLImageElement) portrait.src = publicUrl(`assets/ui/characters/${archetype}.webp`);
}
function renderEntry(): void {
  document.body.dataset.entryRoute = route;
  element("character-select").hidden = route === "world";
  element("adventure-hud").hidden = route !== "world";
  for (const view of ["account", "creator", "roster"]) element(`entry-${view}`).hidden = route !== view;
  if (route === "world") return;
  worldMap.close();
  const selected = selectedCharacter();
  document.body.dataset.rosterTab = rosterTab;
  for (const tab of ["active", "rip"] as const) button(`entry-roster-${tab}`).setAttribute("aria-pressed", String(rosterTab === tab));
  text("entry-roster-title", rosterTab === "rip" ? "The yard remembers" : "Choose a character");
  text("entry-creator-profile", profile?.displayName ?? "");
  text("entry-roster-profile", profile?.displayName ?? "");
  text("entry-creator-class", classes[draft].name);
  text("entry-lore-title", classes[draft].name);
  text("entry-lore-copy", classes[draft].copy);
  text("entry-lore-kit", `Movement ${classKit(draft).movementTiles} · ${classKit(draft).movementTiles} tiles per turn · Attack · Defend · ${classAction(draft, "special").name}`);
  text("entry-creator-preview-name", normalizedCharacterName(input("entry-character-name").value) ?? "Unnamed Adventurer");
  avatar("entry-creator", draft);
  for (const choice of document.querySelectorAll<HTMLElement>("[data-entry-archetype]")) choice.setAttribute("aria-pressed", String(choice.dataset.entryArchetype === draft));
  const list = element("entry-roster-list");
  list.replaceChildren();
  const characters = rosterCharacters();
  for (const character of characters) {
    const item = document.createElement("li");
    item.className = "entry-roster-item";
    const choose = document.createElement("button");
    choose.type = "button";
    choose.dataset.characterId = character.id;
    choose.setAttribute("aria-pressed", String(character.id === selected?.id));
    const emblem = document.createElement("span");
    emblem.className = "entry-roster-emblem";
    emblem.textContent = classes[character.archetype].name.slice(0, 1);
    const copy = document.createElement("span");
    copy.className = "entry-roster-copy";
    const name = document.createElement("strong");
    name.textContent = character.name;
    const description = document.createElement("span");
    description.textContent = `${classes[character.archetype].name}${character.fallenAtMillis !== undefined ? " · Fallen" : ""}`;
    copy.append(name, description);
    choose.append(emblem, copy);
    item.append(choose);
    list.append(item);
  }
  element("entry-roster-empty").hidden = characters.length > 0;
  text("entry-roster-empty", rosterTab === "rip" ? "No fallen adventurers." : "Create a character to begin a new journey.");
  text("entry-roster-count", rosterTab === "rip" ? String(characters.length) : `${characters.length} / 8`);
  button("entry-enter-world").hidden = rosterTab === "rip";
  button("entry-enter-world").disabled = entering || selected === null || selected.fallenAtMillis !== undefined;
  const deleteButton = button("entry-delete-character");
  element("entry-roster-delete").hidden = selected === null;
  deleteButton.disabled = entering || selected === null || pendingDeleteId !== null;
  const confirm = element("entry-delete-confirm");
  confirm.hidden = pendingDeleteId === null;
  const pending = profile?.characters.find((character) => character.id === pendingDeleteId);
  text("entry-delete-copy", pending ? `Delete ${pending.name}? This removes their journey from this browser.` : "");
  element("entry-roster-avatar").hidden = selected === null;
  if (selected) {
    avatar("entry-roster", selected.archetype);
    text("entry-roster-class", classes[selected.archetype].name);
    text("entry-roster-name", selected.name);
    text("entry-roster-summary", selected.fallenAtMillis !== undefined ? "Rest in peace · Your journey is remembered" : `One life · ${YARD.region}`);
  } else {
    text("entry-roster-class", "");
    text("entry-roster-name", rosterTab === "rip" ? "The yard remembers" : "A new journey awaits");
    text("entry-roster-summary", "");
  }
}
function requestDeleteSelected(): void {
  const selected = selectedCharacter();
  if (!selected || entering) return;
  pendingDeleteId = selected.id;
  text("entry-roster-feedback", "");
  renderEntry();
  button("entry-delete-cancel").focus();
}
function cancelDelete(): void {
  pendingDeleteId = null;
  renderEntry();
}
function deletePendingCharacter(): void {
  if (!profile || !pendingDeleteId || entering) return;
  const id = pendingDeleteId;
  const deleted = profile.characters.find((character) => character.id === id);
  if (!deleted) { pendingDeleteId = null; renderEntry(); return; }
  try { localStorage.removeItem(`greywrought/adventure-v1/${id}`); } catch (cause: unknown) { console.error("Character journey removal failed", cause); }
  try { if (sessionStorage.getItem(resumeKey) === id) sessionStorage.removeItem(resumeKey); } catch { /* Session storage may be unavailable. */ }
  const characters = profile.characters.filter((character) => character.id !== id);
  const next = characters.find((character) => character.id === profile?.selectedCharacterId && character.fallenAtMillis === undefined)
    ?? characters.find((character) => character.fallenAtMillis === undefined);
  profile = { ...profile, characters, selectedCharacterId: next?.id ?? null, savedAtMillis: Date.now() };
  pendingDeleteId = null;
  persistProfile();
  text("entry-roster-feedback", `${deleted.name} was deleted.`);
  route = characters.length ? "roster" : "creator";
  renderEntry();
}
function returnToRoster(): void {
  worldMap.close();
  questRewards.reset();
  stopFrames();
  release();
  save(true);
  equipment.close();
  closeBags();
  closeLorebook();
  combatPlan.reset();
  closeQuestLog();
  chatLog.reset();
  partyPanel.closeMenu();
  partyPanel.update("", null, [], null);
  if (running) audio.update(running.game.snapshot, true, running.game.serverWallTimeMillis, running.game.rainIntensity);
  audio.reset();
  try { sessionStorage.removeItem(resumeKey); } catch { /* A disabled session store cannot retain an active character. */ }
  if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running.game.close(); running = null; }
  paused = false;
  lastEncounterState = '';
  route = "roster";
  element("pause-panel").hidden = true;
  element("bank-panel").hidden = true;
  element("shop-panel").hidden = true; gearShop.reset();
  element("death-panel").hidden = true;
  renderEntry();
}
function syncEncounter(): void {
  if (!running?.ready || route !== "world") return;
  const { game, world, character } = running;
  updateParty();
  world.setPartyMembers(game.party?.members.map(member => member.id) ?? []);
  world.setPartyPings(game.party?.pings ?? []);
  if (game.snapshot.phase === 'lost') { showFallenCharacter(character); return; }
  const state = `${game.online}:${game.reconnecting}:${game.session.id}:${game.session.mode}:${game.inputEnabled}:${game.pendingTransition}:${backgrounded}`;
  const changed = state !== lastEncounterState;
  lastEncounterState = state;
  const wasPaused = paused;
  const viewing = game.online && game.session.mode === "viewing";
  paused = backgrounded || (!game.inputEnabled && !viewing);
  world.setReturnPreview(viewing ? game.session.returnPlan : null);
  if (paused && !wasPaused) { release(); world.clearHover(); }
  document.body.dataset.gamePaused = String(paused);
  document.body.dataset.encounterMode = game.session.mode;
  element('aggro-ranges-private').hidden = game.session.mode === 'shared';
  document.body.dataset.encounterId = game.session.id;
  document.body.dataset.canRejoin = String(game.session.canRejoin);
  if (changed) {
    stopFrames();
    if (viewing) {
      release(); world.clearHover(); running.selection = null;
      closeBags(); closeEquipment(); worldMap.close();
      element('pause-panel').hidden = true;
    } else if (!game.reconnecting && (!game.online || (!game.inputEnabled && game.pendingTransition !== 'rejoin'))) element('pause-panel').hidden = false;
    else if (wasPaused || game.reconnecting) element('pause-panel').hidden = true;
    button('pause-open').setAttribute('aria-expanded', String(!element('pause-panel').hidden));
    world.updatePlayers(game.players.filter(player => player.id !== character.id));
    world.updateChat(game.chat, character.id);
    world.render(game.snapshot, 0, game.renderPlayer, paused ? undefined : game.serverTime, game.connectionRevision, game.serverWallTimeMillis, game.rainIntensity);
    renderHud(game.snapshot);
    nameplates?.render(selectedSnapshot(game.snapshot), world, { selfId: character.id, players: game.players });
    audio.update(game.snapshot, paused, game.serverWallTimeMillis, game.rainIntensity);
    if (!paused && !menuOpen()) world.canvas.focus();
  }
  const grouped = (game.party?.members.length ?? 0) > 1;
  const waiting = game.online && !game.inputEnabled && game.session.mode !== 'paused' && !viewing;
  text('pause-title', viewing ? 'Viewing main world' : !game.online ? 'Connection lost' : game.pendingTransition === 'resume' ? 'Resuming encounter…' : waiting ? 'Pausing encounter…' : game.session.mode === 'paused' ? 'Paused encounter' : game.session.mode === 'shared' ? 'Shared world' : 'Private encounter');
  text('pause-copy', viewing ? 'Choose a nearby spot to return. The world keeps moving while you decide.' : !game.online
    ? 'Reconnecting… your encounter pauses after five seconds away.'
    : waiting ? grouped ? 'Pausing for your party…' : 'Saving your encounter…'
    : game.session.mode === 'shared' ? grouped ? 'Your party is in the shared world.' : 'You are in the shared world.'
    : game.session.mode === 'paused' ? grouped ? 'Your party’s encounter is paused.' : 'Your private encounter is paused.'
    : grouped ? 'Your party shares this private encounter.' : 'Your private encounter is active.');
  element('pause-private-warning').hidden = game.session.mode === 'shared' || viewing;
  button('pause-action').disabled = !game.online || !game.inputEnabled;
  element('pause-action').hidden = game.session.mode === 'paused' || viewing;
  element('pause-resume').hidden = game.session.mode !== 'paused';
  text('pause-toggle-label', game.session.mode === 'paused' ? 'Resume' : 'Pause');
  text('pause-toggle-tooltip', game.session.mode === 'paused' ? 'Resume' : 'Pause');
  element('pause-toggle-pause-icon').hidden = game.session.mode === 'paused';
  element('pause-toggle-play-icon').hidden = game.session.mode !== 'paused';
  button('pause-toggle').setAttribute('aria-label', game.session.mode === 'paused' ? 'Resume encounter' : 'Pause encounter');
  button('pause-toggle').disabled = !game.online || game.pendingTransition !== null || viewing;
  button('pause-resume').disabled = !game.online || game.session.mode !== 'paused' || game.pendingTransition !== null;
  button('encounter-rejoin').disabled = !game.online || !game.session.canRejoin || game.pendingTransition !== null || Boolean(game.session.returnPlan?.confirmed);
  button('encounter-pause').disabled = game.pendingTransition !== null;
  element('encounter-status').hidden = game.session.mode === 'shared' || !game.online || !element('pause-panel').hidden;
  const plan = game.session.returnPlan;
  element('encounter-status').dataset.viewing = String(viewing);
  element('encounter-pause').hidden = viewing;
  text('encounter-rejoin', viewing ? plan?.confirmed ? 'Waiting for party' : 'Return here' : 'Rejoin world');
  text('encounter-title', viewing ? 'Viewing main world' : game.session.mode === 'paused' ? 'Paused encounter' : 'Private encounter');
  text('encounter-pause', game.session.mode === 'paused' ? 'Resume…' : 'Pause');
  text('encounter-detail', viewing ? `Returning in ${Math.ceil(plan?.remainingSeconds ?? 0)}s · ${plan?.confirmed ? 'Spot confirmed' : 'Choose a nearby spot'}` : game.session.canRejoin ? 'Ready to rejoin' : 'In combat · no rewards');
  const dangerous = Boolean(plan?.spots.some(spot => spot.dangerous && Math.hypot(spot.position.x - plan.destination.x, spot.position.z - plan.destination.z) < .25));
  element('return-spot-status').hidden = !viewing;
  element('return-spot-status').dataset.dangerous = String(dangerous);
  text('return-spot-status', dangerous ? 'Enemies nearby · returning here may start combat' : 'Click a glowing spot · R to return here');
  save(true);
  scheduleFrame();
}
function setBackgrounded(value: boolean): void {
  backgrounded = value;
  if (value && running?.ready) { running.game.stopAutorun(); release(); }
  syncEncounter();
}
function selectMenuTab(tab: "encounter" | "settings"): void {
  for (const name of ["encounter", "settings"] as const) {
    const selected = name === tab;
    element(`pause-${name}`).hidden = !selected;
    button(`pause-tab-${name}`).setAttribute("aria-selected", String(selected));
    button(`pause-tab-${name}`).tabIndex = selected ? 0 : -1;
  }
}
function setMenuOpen(value: boolean, tab: "encounter" | "settings" = "encounter"): void {
  if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
  if (value) { selectMenuTab(tab); release(); running.world.clearHover(); }
  element("pause-panel").hidden = !value;
  button("pause-open").setAttribute("aria-expanded", String(value));
  if (!value) running.world.canvas.focus();
  else button(`pause-tab-${tab}`).focus();
  syncEncounter();
  save(true);
}
function closeEquipment(): void {
  if (!equipment.isOpen) return;
  equipment.close();
  running?.world.canvas.focus();
}
function toggleEquipment(): void {
  if (equipment.isOpen) { closeEquipment(); return; }
  if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
  equipment.open(running.character, running.game.snapshot);
}
function closeBags(): void {
  bags.close();
  button("bag-open").setAttribute("aria-expanded", "false");
  running?.world.canvas.focus();
}
function toggleBags(): void {
  if (bags.isOpen) { closeBags(); return; }
  if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
  bags.open(running.game.snapshot, running.character.id);
  button("bag-open").setAttribute("aria-expanded", "true");
}
function closeQuestLog(): void {
  questLog.close();
  button("quest-log-open").setAttribute("aria-expanded", "false");
  running?.world.canvas.focus();
}
function toggleQuestLog(): void {
  if (questLog.isOpen()) { closeQuestLog(); return; }
  if (!running?.ready || route !== "world") return;
  closeLorebook();
  questLog.open(running.game.snapshot);
  button("quest-log-open").setAttribute("aria-expanded", "true");
}
function closeLorebook(): void {
  lorebook.close();
  button("lorebook-open").setAttribute("aria-expanded", "false");
  running?.world.canvas.focus();
}
function toggleLorebook(): void {
  if (lorebook.isOpen) { closeLorebook(); return; }
  if (!running?.ready || route !== "world") return;
  closeQuestLog();
  lorebook.open(running.game.snapshot.selectedThreat);
  button("lorebook-open").setAttribute("aria-expanded", "true");
}
const worldMap = createWorldMap(element("adventure-hud"), button("world-map-open"), () => setBaitAiming(false), () => running?.world.canvas.focus());
click("world-map-open", () => { if (running?.ready && route === "world" && !menuOpen()) worldMap.toggle(); });
removers.push(() => worldMap.dispose());
const minimap = createMinimap(element("map-terrain") as HTMLCanvasElement);
const mapParty = new Map<string, HTMLElement>();
let mapCenter = { x: 0, z: -8 };
function mapPosition(target: HTMLElement, x: number, z: number): void {
  target.style.left = `${50 - (x - mapCenter.x) * 100 / minimap.span}%`;
  target.style.top = `${50 - (z - mapCenter.z) * 100 / minimap.span}%`;
}
function makeEnemyInterface(snapshot: AdventureSnapshot): void {
  for (const place of snapshot.places) {
    const marker = document.querySelector<HTMLElement>(`[data-map-place="${place.id}"]`);
    if (marker) mapPosition(marker, place.position.x, place.position.z);
  }
  element("map-threats").replaceChildren();
  nameplates = createEnemyNameplates(element("enemy-intents"), snapshot);
  markers.clear();
  snapshot.threats.forEach(threat => {
    const marker = document.createElement("button");
    marker.className = "map-enemy";
    marker.dataset.enemyId = threat.id;
    marker.title = threat.name;
    marker.setAttribute("aria-label", `Target ${threat.name}`);
    element("map-threats").append(marker);
    markers.set(threat.id, marker);
  });
}
function selectedSnapshot(snapshot: AdventureSnapshot): AdventureSnapshot {
  const app = running; if (!app) return snapshot;
  if (app.lastEnemyTarget !== snapshot.selectedThreat && app.selection?.kind === "enemy") app.selection = { kind: "enemy", id: snapshot.selectedThreat };
  app.lastEnemyTarget = snapshot.selectedThreat;
  if (app.selection?.kind === "enemy" && !snapshot.threats.some(threat => threat.id === app.selection!.id && (threat.health > 0 ? threat.active : threat.corpseVisible))) app.selection = null;
  if (app.selection?.kind === "player" && app.selection.id !== app.character.id && !app.game.players.some(player => player.id === app.selection!.id)) app.selection = null;
  const attacker = newAttackerTarget(snapshot.threats, app.selection, app.character.id, app.attackers);
  app.attackers = new Set(snapshot.threats.filter(threat => threat.active && threat.health > 0 && threat.aggro && threat.targetPlayerId === app.character.id).map(threat => threat.id));
  if (attacker) {
    app.selection = { kind: "enemy", id: attacker };
    if (snapshot.selectedThreat !== attacker) app.game.selectTarget(attacker);
  }
  const enemyId = app.selection?.kind === "enemy" ? app.selection.id : "";
  app.world.setSelectedUnit(app.selection);
  setDataset(document.body.dataset, { selectedUnit: JSON.stringify(app.selection) });
  return enemyId === snapshot.selectedThreat ? snapshot : { ...snapshot, selectedThreat: enemyId, threats: snapshot.threats.map(threat => ({ ...threat, selected: threat.id === enemyId })) };
}
function selectPlayerTarget(id: string): void {
  const app = running;
  if (!app?.ready || paused || menuOpen() || id !== app.character.id && !app.game.players.some(player => player.id === id)) return;
  app.selection = { kind: "player", id }; app.game.setAction("strike", false);
  setBaitAiming(false); renderHud(app.game.snapshot);
}
function updateParty(): void {
  if (!running) return;
  partyPanel.update(running.character.id, running.game.party, running.game.partyInvites,
    running.selection?.kind === "player" ? running.selection.id : null);
}
function openPlayerMenu(id: string, x: number, y: number): void {
  if (!running?.ready || route !== "world") return;
  const player = id === running.character.id ? running.character
    : running.game.players.find(player => player.id === id) ?? running.game.party?.members.find(member => member.id === id);
  if (!player) return;
  selectPlayerTarget(id);
  partyPanel.openPlayerMenu(player, x, y);
}
function selectEnemyTarget(id: string): void {
  if (!running?.ready) return;
  running.selection = { kind: "enemy", id }; running.game.selectTarget(id); renderHud(running.game.snapshot);
}
function clearUnitTarget(): void {
  if (!running) return;
  running.selection = null;
  running.game.setAction("strike", false);
  renderHud(running.game.snapshot);
}
function renderHud(snapshot: AdventureSnapshot): void {
  snapshot = selectedSnapshot(snapshot);
  if (running?.ready && !paused && !menuOpen() && running.game.inputEnabled && !baitAiming && !moveSubmitting) {
    const partyIds = running.game.party?.members.filter(member => member.online && member.sameEncounter).map(member => member.id) ?? [];
    const target = running.autocast.takeTarget(snapshot, running.game.session.id, partyIds);
    if (target) {
      running.selection = { kind: "enemy", id: target };
      if (running.game.snapshot.selectedThreat !== target) running.game.selectTarget(target);
      running.game.setAction("strike", true); running.game.setAction("strike", false);
    }
  }
  updateParty();
  const { player } = snapshot;
  loadActionBarOrder(player.archetype);
  const data = document.body.dataset;
  setDataset(data, {
    gamePhase: snapshot.phase,
    gamePlayerX: String(player.position.x),
    gamePlayerY: String(player.position.y),
    gamePlayerZ: String(player.position.z),
    gamePlayerVitality: String(player.health),
    gameSupplies: String(snapshot.supplies),
    gameCargo: String(snapshot.cargo),
    gamePotions: String(snapshot.potions),
    gameCarriedSalvage: String(snapshot.carriedSalvage),
    gamePaused: String(paused),
    gameCoins: String(snapshot.coins),
    gameExperience: String(snapshot.progression.experience),
    gameLevel: String(snapshot.progression.level),
    gameBankedRelics: String(snapshot.bankedRelics),
    gameSelectedThreat: snapshot.selectedThreat,
    gameActionCooldown: String(player.actionCooldown),
    gameGuardSeconds: String(player.guardSeconds),
    gameBlock: String(player.block),
    gameManeuver: player.maneuver,
    gameManeuverSeconds: String(player.maneuverSeconds),
    gameStamina: String(player.stamina),
    gameInCombat: String(player.inCombat),
    gamePlayerSitting: String(player.sitting),
    gamePlayerEmote: JSON.stringify(player.emote),
    gameCombatPhase: snapshot.combat.phase,
    gameCombatRemaining: String(snapshot.combat.remainingSeconds),
  });
  setDataset(data, { archetype: player.archetype });
  if (baitAiming) updateMoveRoute();
  text("bait-aim-hint", moveAimError || "Green tiles: next stop · Enter: done · Backspace: undo · Esc: cancel");
  const settlement = settlementAt(player.position.x, player.position.z);
  text("adventure-zone", (snapshot.phase === "town" ? `${settlement?.name ?? YARD.settlement} · safe haven` : snapshot.phase === "lost" ? "Journey ended" : regionAt(player.position.x,player.position.z).name) + ` · Level ${snapshot.progression.level}`);
  if (running) unitFrames.update(running.character, snapshot, running.game.players, running.selection?.kind === "player" ? running.selection.id === running.character.id ? { id: running.character.id, name: running.character.name, player: snapshot.player } : running.game.players.find(player => player.id === running!.selection!.id) : undefined);
  if (snapshot.combat.phase !== "preparation" || snapshot.combat.ready || baitAiming && (!running?.game.online || currentMoveContext() !== moveContext)) setBaitAiming(false);
  combatPlan.update(snapshot);
  setDataset(data, { gameCombatPlan: String(!element("combat-plan").hidden) });
  const sharedChat = running?.game.chat.map(entry => ({ id: -entry.id, channel: "chat" as const, party: !!entry.partyId, text: entry.partyId ? `[Party] ${entry.name}: ${entry.text}` : entry.kind === 'loot' ? `${entry.name} ${entry.text}` : entry.kind === 'emote' ? `* ${entry.name} ${entry.text}` : entry.name + ": " + entry.text })) ?? [];
  chatLog.update([...snapshot.log, ...sharedChat]);
  setDataset(data, { gameOnline: String(running?.game.online ?? false) });
  setDataset(data, { autorunning: String(running?.game.autorunning ?? false) });
  setDataset(data, { gameRemotePlayers: JSON.stringify(running?.game.players ?? []) });
  bank.update(snapshot);
  inn.update(snapshot, snapshot.innOpen);
  bellrunner.update(snapshot);
  data.gameFlight = JSON.stringify(snapshot.player.flight ?? null);
  shop.update(snapshot); gearShop.update(snapshot);
  trade.update(snapshot);
  const selected = snapshot.threats.find(threat => threat.id === snapshot.selectedThreat);
  for (const action of ["strike", "brace", "bait", "special"] as const) {
    const spec = classAction(player.archetype, action);
    const cost = action === "bait" && snapshot.combat.sprinting ? SPRINT_COST : spec.cost ?? 0;
    const targeted = action === "strike" || spec.target === "unit";
    const planning = snapshot.combat.phase === "preparation";
    const available = targeted ? Boolean(selected?.active && selected.health > 0) : player.inCombat;
    const range = playerRange(snapshot, action);
    const control = document.querySelector<HTMLButtonElement>('.adventure-actions [data-action="' + action + '"]')!;
    const reserved = snapshot.combat.queued.find(entry => (entry.action === "bait") === (action === "bait"))?.cost ?? 0;
    const availableStamina = snapshot.combat.availableStamina + reserved;
    const disabled = running?.game.session.mode === "viewing" || !available || !(planning || action === "strike" && snapshot.combat.phase === "idle") || snapshot.combat.ready || availableStamina < cost || targeted && range.state !== "in" && !(planning && selected?.aggro);
    if (control.disabled !== disabled) control.disabled = disabled;
    const autocast = action === "strike" && Boolean(running?.autocast.enabled);
    setAttribute(control, "aria-label", spec.name + (autocast ? " · Autocast on" : ""));
    if (action === "strike") setDataset(control.dataset, { autocast: String(autocast) });
    setAttribute(control, "aria-pressed", String(action === "bait" && baitAiming));
    const openingStrike = action === "strike" && snapshot.combat.openingStrikeAvailable;
    setDataset(control.dataset, { range: range.state, openingStrike: String(openingStrike) });
    control.classList.toggle("action-in-range", targeted && range.state === "in" && !snapshot.combat.ready && snapshot.combat.phase !== "active");
    setText(control.querySelector<HTMLElement>(".action-tooltip strong")!, spec.name);
    setText(control.querySelector<HTMLElement>(".action-tooltip span:last-child")!, (cost ? cost + " Energy. " : "Free. ") + spec.description + (action === "strike" ? autocast ? " Autocast on: queue Attack once each turn. Right-click to turn off. Your chosen action and timing stay yours." : " Right-click to autocast: queue Attack once each turn in combat." : "") + (openingStrike ? " Attack before you are detected to land an opening hit before the first turn." : ""));
    const art = control.querySelector<HTMLImageElement>(".action-art img")!;
    const source = publicUrl(spec.icon); if (art.getAttribute("src") !== source) art.src = source;
    const detail = !available ? targeted ? "Select a living enemy" : "Available in combat" : action === "special" && !player.inCombat ? "Available in combat" : snapshot.combat.ready ? "Ready · waiting for the turn" : availableStamina < cost ? "Need " + cost + " Energy" : openingStrike ? "Opening strike · hit first" : action === "bait" ? "Click a highlighted tile to plan your movement" : cost ? "Plan · " + cost + " Energy" : "Free";
    text(action + "-ready", detail + (range.text ? " · " + range.text : ""));
  }
  for (const item of usableItems) {
    const control = actionBar().querySelector<HTMLButtonElement>(`[data-action="${item.action}"]`);
    if (!control) continue;
    const quantity = item.quantity(snapshot);
    control.disabled = running?.game.session.mode === "viewing" || !item.available(snapshot);
    setAttribute(control, "aria-label", item.name + (item.stackable ? ` × ${quantity}` : ""));
    if (item.stackable) {
      setDataset(control.dataset, { quantity: String(quantity) });
      setText(control.querySelector<HTMLElement>(".action-quantity")!, String(quantity));
    }
    setText(control.querySelector<HTMLElement>(".action-tooltip small")!, item.label(snapshot));
    setText(control.querySelector<HTMLElement>(".action-tooltip span:last-child")!, item.description(snapshot));
  }
  const recovery = element("player-action-bar");
  const recoveryHidden = player.actionCooldown <= 0.001 || (player.currentAction !== "gather" && player.currentAction !== "ritual" && player.currentAction !== "hearthstone");
  if (recovery.hidden !== recoveryHidden) recovery.hidden = recoveryHidden;
  if (!recovery.hidden) {
    const actionControl = player.currentAction ? document.querySelector<HTMLButtonElement>('.adventure-actions [data-action="' + player.currentAction + '"]') : null;
    const art = actionControl?.querySelector<HTMLImageElement>(".action-art img");
    const icon = element("player-action-icon") as HTMLImageElement;
    const source = player.currentAction === "hearthstone" ? publicUrl("assets/ui/icons/spells/earth-stone.png") : art?.src ?? publicUrl("assets/ui/icons/spells/sword-strike.png");
    if (icon.src !== source) icon.src = source;
    const gathering = player.currentAction === "gather";
    const label = gathering ? "Gathering" : player.currentAction === "hearthstone" ? "Returning to Nine-Bell Yard" : "Awakening the engine";
    const progress = player.actionDuration - player.actionCooldown;
    text("player-action-name", label);
    text("player-action-time", progress.toFixed(1) + " / " + player.actionDuration.toFixed(1));
    element("player-action-fill").style.width = (100 * progress / Math.max(.001, player.actionDuration)) + "%";
    setAttribute(recovery, "role", "progressbar"); setAttribute(recovery, "aria-label", label);
    setAttribute(recovery, "aria-valuenow", String(progress)); setAttribute(recovery, "aria-valuemin", "0"); setAttribute(recovery, "aria-valuemax", String(player.actionDuration));
  }
  corpseLoot.update(snapshot);
  bags.update(snapshot);
  if (equipment.isOpen && running) equipment.update(running.character, snapshot);
  updateQuestTracker(snapshot);
  questLog.update(snapshot);
  questRewards.update(snapshot);
  mapCenter = player.position;
  minimap.update(mapCenter.x, mapCenter.z);
  const mapMembers = running?.game.players.filter(remote => running?.game.party?.members.some(member => member.id === remote.id && member.online && member.sameEncounter)) ?? [];
  worldMap.update(player, mapMembers, running?.game.party?.pings ?? []);
  for (const [id, marker] of mapParty) if (!mapMembers.some(member => member.id === id)) { marker.remove(); mapParty.delete(id); }
  for (const member of mapMembers) {
    let marker = mapParty.get(member.id);
    if (!marker) {
      marker = document.createElement('div'); marker.className = 'map-party'; marker.dataset.playerId = member.id;
      marker.innerHTML = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 2 22 25 12 20 2 25Z" fill="#5dc6f1" stroke="#102f45" stroke-width="2"/><path d="M12 5 12 19 5 22Z" fill="#d0f1ff"/></svg>';
      marker.setAttribute('role', 'img'); element('map-field').append(marker); mapParty.set(member.id, marker);
    }
    const dx = member.player.position.x - mapCenter.x, dz = member.player.position.z - mapCenter.z;
    const scale = Math.max(1, Math.abs(dx) / (minimap.span * .44), Math.abs(dz) / (minimap.span * .44));
    mapPosition(marker, mapCenter.x + dx / scale, mapCenter.z + dz / scale);
    const direction = scale > 1 ? { x: dx, z: dz } : member.player.cameraForward;
    marker.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-direction.x, direction.z)}rad)`;
    setDataset(marker.dataset, { edge: String(scale > 1) });
    setAttribute(marker, 'aria-label', member.name + (scale > 1 ? ' · beyond map' : ''));
  }
  for (const place of snapshot.places) {
    const marker = document.querySelector<HTMLElement>(`[data-map-place="${place.id}"]`);
    if (marker) mapPosition(marker, place.position.x, place.position.z);
  }
  mapPosition(element("map-player"), player.position.x, player.position.z);
  element("map-player").style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-player.cameraForward.x, player.cameraForward.z)}rad)`;
  for (const threat of snapshot.threats) {
    const marker = markers.get(threat.id);
    if (!marker) continue;
    setDataset(marker.dataset, { phase: threat.phase, health: String(threat.health), remaining: String(threat.remainingSeconds), x: String(threat.position.x), z: String(threat.position.z), damage: String(threat.damage), reach: String(threat.reach), actionSequence: String(threat.actionSequence), disposition: threat.disposition, aggro: String(threat.aggro), hostile: String(threat.disposition === "hostile" || threat.aggro), worldX: String(threat.position.x), worldZ: String(threat.position.z) });
    mapPosition(marker, threat.position.x, threat.position.z);
    marker.classList.toggle("selected", threat.selected);
    marker.classList.toggle("cleared", threat.phase === "cleared");
    marker.classList.toggle("dormant", !threat.active);
  }
  const deathPanel = element("death-panel");
  if (deathPanel.hidden !== (snapshot.phase !== "lost")) deathPanel.hidden = snapshot.phase !== "lost";
}
function bindWorld(app: RunningAdventure): void {
  const { canvas } = app.world;
  let buttons = 0;
  let lastX = 0; let lastY = 0; let dragDistance = 0;
  const steerCharacter = () => {
    const direction = app.world.forward();
    app.game.setCameraForward(direction.x, direction.z);
  };
  listen(canvas, "pointerdown", (event) => {
    if (!(event instanceof PointerEvent) || paused || menuOpen() || !app.ready || event.button > 2) return;
    event.preventDefault();
    app.world.clearHover();
    canvas.focus();
    buttons = event.buttons;
    lastX = event.clientX; lastY = event.clientY; dragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
    if (buttons & 2) steerCharacter();
    app.game.setMouseForward((buttons & 3) === 3 && !combatExecutionLocked());
  }, app.unbind);
  listen(canvas, "pointermove", (event) => {
    if (!(event instanceof PointerEvent) || paused || menuOpen() || !app.ready) return;
    // A mouse chord changes buttons through pointermove, without another pointerdown.
    buttons = event.buttons;
    app.game.setMouseForward((buttons & 3) === 3 && !combatExecutionLocked());
    if (buttons === 0) { app.world.hover(event.clientX, event.clientY); return; }
    app.world.clearHover();
    const dx = event.clientX - lastX; const dy = event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    app.world.orbit(dx, dy);
    if ((buttons & 2) || ((buttons & 1) && !event.altKey)) steerCharacter();
  }, app.unbind);
  listen(canvas, "pointerup", (event) => {
    if (!(event instanceof PointerEvent)) return;
    buttons = event.buttons;
    app.game.setMouseForward((buttons & 3) === 3 && !paused && !menuOpen() && !combatExecutionLocked());
    if ((event.button === 0 || event.button === 2) && buttons === 0 && dragDistance < 5 && !paused && !menuOpen() && app.ready) {
      if (app.game.session.mode === "viewing") {
        if (event.button === 0) {
          const destination = app.world.pickReturnSpot(event.clientX, event.clientY);
          if (destination) app.game.selectReturnSpot(destination);
        }
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        return;
      }
      if (baitAiming) {
        if (moveSubmitting) return;
        if (event.button === 0) {
          const destination = app.world.pickGround(event.clientX, event.clientY);
          if (destination && app.world.canMoveTo(destination)) {
            moveRoute = [...moveRoute, destination]; moveAimError = ""; updateMoveRoute();
          } else {
            moveAimError = "That tile is blocked or out of reach. Choose one of the highlighted tiles · Esc cancels";
          }
        } else setBaitAiming(false);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        return;
      }
      const picked = app.world.pick(event.clientX, event.clientY);
      if (picked?.kind === "resource" && event.button === 0) pulse("gather");
      else if (picked?.kind === "npc" && event.button === 0) app.game.interactNpc(picked.id);
      else if (picked?.kind === "chest") {
        if (app.game.snapshot.loot.some(item => item.sourceId === picked.id && item.available)) app.game.openLoot(picked.id);
      }
      else if (picked?.kind === "player") {
        if (event.button === 0) selectPlayerTarget(picked.id);
        else if (event.button === 2) openPlayerMenu(picked.id, event.clientX, event.clientY);
      }
      else if (picked?.kind === "threat") {
        if (event.button === 0) selectEnemyTarget(picked.id);
        if (app.game.snapshot.loot.some(item => item.sourceId === picked.id && item.available)) app.game.openLoot(picked.id);
      }
    }
    if (buttons === 0 && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (buttons === 0 && !paused) app.world.hover(event.clientX, event.clientY);
  }, app.unbind);
  const resetMouse = () => { buttons = 0; app.game.setMouseForward(false); app.world.clearHover(); };
  listen(canvas, "pointerleave", () => app.world.clearHover(), app.unbind);
  listen(canvas, "lostpointercapture", (event) => {
    resetMouse();
    if (event instanceof PointerEvent && event.buttons === 0 && !paused) app.world.hover(event.clientX, event.clientY);
  }, app.unbind);
  listen(canvas, "pointercancel", resetMouse, app.unbind);
  listen(window, "blur", resetMouse, app.unbind);
  listen(canvas, "contextmenu", (event) => event.preventDefault(), app.unbind);
  listen(canvas, "wheel", (event) => { if (event instanceof WheelEvent) { event.preventDefault(); app.world.zoom(event.deltaY); } }, app.unbind);
}
async function enterWorld(character: LocalCharacter): Promise<void> {
  questRewards.reset();
  if (entering || running) return;
  if (character.fallenAtMillis !== undefined) { showFallenCharacter(character); return; }
  entering = true;
  renderEntry();
  text("entry-enter-world", "Preparing your journey…");
  text("entry-roster-feedback", `Loading ${YARD.settlement} and your adventurer…`);
  let preparingWorld: AdventureWorld | null = null;
  try {
    audio.reset();
    // Prepare the scene before joining: loading must not expose an adventurer
    // to combat or hold up their connection's heartbeat.
    const world = preparingWorld = createAdventureWorld(element("world-wrap"), createAdventure({ archetype: character.archetype }).snapshot, id => { if (!paused) running?.game.interactNpc(id); }, (destination, via, waitTicks) => running?.game.previewBait(destination, via, waitTicks) ?? Promise.resolve(null), { selfId: character.id, get selfName() { return character.name; }, showSelfName: () => appControls.showOwnName, onSelect: selectPlayerTarget, onContextMenu: openPlayerMenu }, preview => combatPlan.setMovementPreview(preview));
    await world.ready;
    if (!alive) { world.dispose(); return; }
    const game = await connectAdventure(character, current => {
      character = current;
      if (profile && profile.characters.some(saved => saved.id === current.id && saved.name !== current.name)) {
        profile = { ...profile, characters: profile.characters.map(saved => saved.id === current.id ? { ...saved, name: current.name } : saved), savedAtMillis: Date.now() };
        persistProfile();
      }
      document.body.dataset.characterName = current.name;
    });
    if (game.snapshot.phase === "lost") { world.dispose(); game.close(); showFallenCharacter(character); return; }
    world.setAggroRangesVisible(aggroRangesVisible);
    world.setHelpRangesVisible(helpRangesVisible);
    world.updateChat(game.chat, character.id);
    const app: RunningAdventure = { get character() { return character; }, game, world, autocast: new AttackAutocast(character.id, localStorage), unbind: [], saveClock: 0, ready: false, selection: null, lastEnemyTarget: game.snapshot.selectedThreat, attackers: new Set() };
    running = app;
    preparingWorld = null;
    bindWorld(app);
    if (!alive || running !== app) { world.dispose(); return; }
    if (app.game.snapshot.phase === "lost") { showFallenCharacter(character); return; }
    minimap.setAtlas(world.minimap);
    world.render(game.snapshot, 0, game.renderPlayer, game.serverTime, game.connectionRevision, game.serverWallTimeMillis, game.rainIntensity);
    app.ready = true;
    lastTime = 0;
    const forward = world.forward(); game.setCameraForward(forward.x, forward.z);
    makeEnemyInterface(game.snapshot);
    route = "world";
    backgrounded = document.hidden;
    paused = false;
    lastEncounterState = '';
    app.unbind.push(game.subscribe(syncEncounter));
    renderEntry();
    renderHud(game.snapshot);
    text("entry-roster-feedback", "");
    document.body.dataset.characterName = character.name;
    try { sessionStorage.setItem(resumeKey, character.id); } catch { /* Manual entry remains available without session storage. */ }
    world.canvas.focus();
    save(true);
    syncEncounter();
  } catch (cause: unknown) {
    preparingWorld?.dispose();
    if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running.game.close(); running = null; }
    text("entry-roster-feedback", "Your journey could not be opened. Existing saved progress has been kept. Reload to try again.");
    console.error("Adventure entry failed", cause);
    document.body.dataset.gameLoadState = "failed";
  } finally {
    entering = false;
    text("entry-enter-world", "Enter World");
    if (route !== "world") renderEntry();
  }
}

listen(element("entry-account-form"), "submit", (event) => {
  event.preventDefault();
  if (profileBlocked) return;
  const displayName = normalizedDisplayName(input("entry-display-name").value);
  if (!displayName) { text("entry-account-feedback", "Use a display name between 2 and 24 characters."); return; }
  profile = { version: 1, displayName, characters: [], selectedCharacterId: null, savedAtMillis: Date.now() };
  persistProfile(); route = "creator"; renderEntry();
});
listen(element("entry-character-form"), "submit", (event) => {
  event.preventDefault();
  if (!profile) return;
  const name = normalizedCharacterName(input("entry-character-name").value);
  if (!name) { text("entry-character-feedback", "Use 2–18 letters, spaces, apostrophes, or hyphens."); return; }
  if (profile.characters.filter((character) => character.fallenAtMillis === undefined).length >= 8) { text("entry-character-feedback", "Your roster is full."); return; }
  if (profile.characters.some((character) => character.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { text("entry-character-feedback", "Choose a different character name."); return; }
  const character: LocalCharacter = { id: crypto.randomUUID(), name, archetype: draft, createdAtMillis: Date.now() };
  profile = { ...profile, characters: [...profile.characters, character], selectedCharacterId: character.id, savedAtMillis: Date.now() };
  persistProfile(); rosterTab = "active"; route = "roster"; input("entry-character-name").value = ""; renderEntry();
});
listen(input("entry-character-name"), "input", () => renderEntry());
for (const choice of document.querySelectorAll<HTMLElement>("[data-entry-archetype]")) listen(choice, "click", () => {
  const value = choice.dataset.entryArchetype;
  if (value === "warrior" || value === "mage" || value === "hunter" || value === "alchemist" || value === "artificer") { draft = value; renderEntry(); }
});
listen(element("entry-roster-list"), "click", (event) => {
  if (!(event.target instanceof Element) || !profile || entering) return;
  const id = event.target.closest<HTMLElement>("[data-character-id]")?.dataset.characterId;
  if (!id || !rosterCharacters().some((character) => character.id === id)) return;
  if (rosterTab === "rip") selectedMemorialId = id;
  else { profile = { ...profile, selectedCharacterId: id, savedAtMillis: Date.now() }; persistProfile(); }
  pendingDeleteId = null;
  renderEntry();
});
for (const tab of ["active", "rip"] as const) click(`entry-roster-${tab}`, () => {
  if (entering) return;
  rosterTab = tab;
  pendingDeleteId = null;
  text("entry-roster-feedback", "");
  renderEntry();
});
click("entry-delete-character", requestDeleteSelected);
click("entry-delete-cancel", cancelDelete);
click("entry-delete-accept", deletePendingCharacter);
click("entry-creator-back", () => { route = profile?.characters.length ? "roster" : "account"; renderEntry(); });
click("entry-change-character", () => { if (!entering) { route = "creator"; renderEntry(); } });
click("entry-enter-world", () => { const character = selectedCharacter(); if (character) void enterWorld(character); });
click("pause-open", () => setMenuOpen(element("pause-panel").hidden, "settings"));
click("pause-close", () => setMenuOpen(false));
click("aggro-ranges-toggle", () => toggleAggroRanges());
click("help-ranges-toggle", () => toggleAggroRanges("help"));
for (const tab of ["encounter", "settings"] as const) {
  click(`pause-tab-${tab}`, () => selectMenuTab(tab));
  listen(button(`pause-tab-${tab}`), "keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "encounter" : event.key === "End" ? "settings" : tab === "encounter" ? "settings" : "encounter";
    selectMenuTab(next);
    button(`pause-tab-${next}`).focus();
  });
}
click("equipment-open", toggleEquipment);
click("bag-open", toggleBags);
click("lorebook-open", toggleLorebook);
click("quest-log-open", toggleQuestLog);
function togglePause(): void {
  if (!running?.ready) return;
  if (running.game.session.mode === 'paused') running.game.resume();
  else { setMenuOpen(true); running.game.pause(); }
  syncEncounter();
}
click("pause-toggle", togglePause);
click("pause-action", togglePause);
click("pause-resume", () => running?.game.resume());
click("encounter-rejoin", () => running?.game.rejoin());
click("encounter-pause", togglePause);
click("return-roster", returnToRoster);
click("death-roster", returnToRoster);
for (const target of [element("map-threats"), element("enemy-intents")]) listen(target, "click", (event) => {
  if (!(event.target instanceof Element) || !running?.ready || paused) return;
  const id = event.target.closest<HTMLElement>("[data-enemy-id]")?.dataset.enemyId;
  if (id) { selectEnemyTarget(id); running.world.canvas.focus(); }
});
for (const control of document.querySelectorAll<HTMLElement>("[data-action]:not(#adventure-actions > button):not(.combat-plan-edit)")) listen(control, "click", () => {
  if (performance.now() < suppressActionClickUntil) return;
  const action = control.dataset.action;
  if (action && ["strike", "brace", "bait", "special", "gather", "ritual", "interact", "rest"].includes(action)) pulse(action as AdventureAction);
});
bindActionBar();
listen(window, "click", (event) => {
  if (menuOpen() && event.target instanceof Element && !event.target.closest('#pause-panel, #pause-open, #pause-toggle, #party-panel, #party-invite, #party-context-menu')) { event.preventDefault(); event.stopImmediatePropagation(); }
}, removers, true);
listen(window, "keydown", (event) => {
  if (event.isTrusted) void audio.unlock();
  if (!(event instanceof KeyboardEvent)) return;
  if (route === "roster" && pendingDeleteId !== null && event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) cancelDelete();
    return;
  }
  if (route !== "world") return;
  if (worldMap.isOpen) {
    if (event.code === "Escape" || event.code === "KeyM") { event.preventDefault(); if (!event.repeat) worldMap.close(); return; }
    if (event.code !== "Backquote" && !["forward", "backward", "left", "right", "jump", "dive"].includes(keyActions[event.code] ?? "")) return;
  }
  if (event.code === "Escape" && partyPanel.closeMenu()) { event.preventDefault(); return; }
  if (event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(event.target.type))) return;
  if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
  if (menuOpen() && event.code !== "Escape" && event.code !== "KeyH" && event.code !== "KeyV") return;
  if (event.code === "KeyM" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); if (!event.repeat && running?.ready) worldMap.toggle(); return; }
  if (baitAiming && (event.code === "Enter" || event.code === "Backspace")) {
    event.preventDefault();
    if (!event.repeat) { if (event.code === "Enter") void finishMove(); else undoMove(); }
    return;
  }
  if (event.code === "Enter") { event.preventDefault(); release(); chatLog.focusInput(); return; }
  if (event.code === "Backquote" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (!event.repeat && running?.ready) running.game.toggleAutorun();
    return;
  }
  if ((event.code === "KeyH" || event.code === "KeyV") && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) toggleAggroRanges(event.code === "KeyV" ? "help" : "direct");
    return;
  }
  if (event.code === "KeyC") {
    event.preventDefault();
    if (!event.repeat) toggleEquipment();
    return;
  }
  if (event.code === "KeyL") {
    event.preventDefault();
    if (!event.repeat) toggleQuestLog();
    return;
  }
  if (event.code === "KeyJ") {
    event.preventDefault();
    if (!event.repeat) toggleLorebook();
    return;
  }
  if (event.code === "KeyB") {
    event.preventDefault();
    if (!event.repeat) toggleBags();
    return;
  }
  if (event.code === "Escape" && running?.game.snapshot.player.currentAction === "gather") { event.preventDefault(); if (!event.repeat) pulse("cancelGather"); return; }
  if (event.code === "Escape" && running?.game.snapshot.player.currentAction === "hearthstone") { event.preventDefault(); if (!event.repeat) pulse("cancelHearthstone"); return; }
  if (event.code === "Escape" && baitAiming) { event.preventDefault(); setBaitAiming(false); return; }
  if (event.code === "Escape" && questLog.isOpen()) { event.preventDefault(); closeQuestLog(); return; }
  if (event.code === "Escape" && lorebook.isOpen) { event.preventDefault(); closeLorebook(); return; }
  if (event.code === "Escape" && equipment.isOpen) { event.preventDefault(); closeEquipment(); return; }
  if (event.code === "Escape" && bags.isOpen) { event.preventDefault(); closeBags(); return; }
  if (event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) {
      if (!element("pause-panel").hidden) setMenuOpen(false);
      else if (running?.game.snapshot.lootOpenId) pulse("closeLoot");
      else if (running?.game.snapshot.trade) pulse("closeTrade");
      else if ((running?.game.snapshot.shopOpen || running?.game.snapshot.vendorOpen)) pulse("closeShop");
      else if (running?.game.snapshot.bankOpen) pulse("closeBank");
      else if (running?.game.snapshot.innOpen) pulse("closeInn");
      else if (bellrunner.open) bellrunner.close();
      else if (running?.selection) clearUnitTarget();
      else setMenuOpen(true);
    }
    return;
  }
  if (event.code === "KeyR" && running?.game.session.mode === "viewing") {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) running.game.rejoin();
    return;
  }
  if (event.code === "KeyR" && running?.game.snapshot.player.inCombat) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat && running.game.snapshot.combat.phase === "preparation") readyCombat();
    return;
  }
  const action = actionForBarCode(event.code) ?? keyActions[event.code];
  if (!action || paused || !running?.ready) return;
  event.preventDefault();
  if (keys.has(event.code)) return;
  keys.add(event.code);
  pressAction(action);
});
listen(window, "keyup", (event) => {
  if (!(event instanceof KeyboardEvent)) return;
  keys.delete(event.code);
  const action = actionForBarCode(event.code) ?? keyActions[event.code];
  if (action && ![...keys].some((key) => keyActions[key] === action)) running?.game.setAction(action, false);
}, removers, true);
listen(element("chat-log-input"), "focus", () => release());
listen(window, "blur", () => { running?.game.stopAutorun(); release(); });
listen(window, "focus", () => { if (!document.hidden) setBackgrounded(false); });
listen(document, "visibilitychange", () => setBackgrounded(document.hidden));
listen(window, "pagehide", () => { release(); running?.game.pause(); save(true); });
listen(window, "beforeunload", () => { release(); running?.game.pause(); save(true); });
listen(window, "pointerdown", (event) => { if (event.isTrusted) void audio.unlock(); });

function stopFrames(): void {
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
  nextFrameTime = 0;
  nextHudTime = 0;
}
function scheduleFrame(): void {
  if (!frame && alive && running?.ready && !paused && !document.hidden) frame = requestAnimationFrame(tick);
}
function tick(now: number): void {
  frame = 0;
  if (!alive || !running?.ready || paused || document.hidden) return;
  // Keep a deadline separate from elapsed simulation time so 60 Hz jitter does not halve the frame rate.
  if (now + 0.5 < nextFrameTime) { scheduleFrame(); return; }
  nextFrameTime = Math.max(nextFrameTime + frameInterval, now);
  const delta = lastTime === 0 ? 0 : (now - lastTime) / 1000;
  lastTime = now;
  running.game.advance(delta);
  const snapshot = running.game.snapshot;
  if (snapshot.phase === "lost") { showFallenCharacter(running.character); return; }
  audio.update(snapshot, route !== "world", running.game.serverWallTimeMillis, running.game.rainIntensity);
  running.world.updatePlayers(running.game.players.filter(player => player.id !== running!.character.id));
  running.world.updateChat(running.game.chat, running.character.id);
  selectedSnapshot(snapshot);
  running.world.render(snapshot, delta, running.game.renderPlayer, running.game.serverTime, running.game.connectionRevision, running.game.serverWallTimeMillis, running.game.rainIntensity);
  if (now + 0.5 >= nextHudTime) {
    renderHud(snapshot);
    nextHudTime = Math.max(nextHudTime + 50, now);
  }
  nameplates?.render(selectedSnapshot(snapshot), running.world, { selfId: running.character.id, players: running.game.players });
  running.saveClock += delta;
  if (running.saveClock >= 1) { running.saveClock = 0; save(); }
  scheduleFrame();
}
window.__GREYWROUGHT_TEARDOWN__ = () => {
  if (!alive) return;
  release(); save(true); alive = false; cancelAnimationFrame(frame);
  for (const remove of removers) remove();
  audio.dispose();
  appControls.dispose();
  equipment.dispose();
  corpseLoot.dispose();
  bags.dispose();
  chatLog.dispose();
  unitFrames.dispose();
  partyPanel.dispose();
  combatPlan.dispose();
  bank.dispose();
  inn.dispose();
  bellrunner.dispose();
  shop.dispose(); gearShop.dispose();
  trade.dispose();
  lorebook.dispose();
  questLog.dispose();
  questRewards.dispose();
  hudSize.disconnect();
  if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running.game.close(); running = null; }
};
try {
  const decoded = decodeCharacterProfile(localStorage.getItem(characterProfileStorageKey));
  if (decoded.kind === "ready") { profile = decoded.profile; route = profile.characters.length ? "roster" : "creator"; }
  else if (decoded.kind !== "empty") {
    profileBlocked = true;
    text("entry-account-feedback", "Your saved profile could not be read. It has been kept unchanged. Open this game in another browser profile to start a new journey.");
    input("entry-display-name").disabled = true;
  }
} catch (cause: unknown) { text("entry-account-feedback", "Browser storage is unavailable. Enable local storage to keep your journey."); console.error("Profile storage unavailable", cause); }
renderEntry();
if (profile && !profileBlocked) void readCharacterNames(profile.characters).then(characters => {
  if (!alive || !profile) return;
  const names = new Map(characters.map(character => [character.id, character.name]));
  if (!profile.characters.some(character => names.has(character.id) && names.get(character.id) !== character.name)) return;
  profile = { ...profile, characters: profile.characters.map(character => {
    const name = names.get(character.id);
    return name ? { ...character, name } : character;
  }), savedAtMillis: Date.now() };
  persistProfile();
  renderEntry();
}).catch(cause => console.error("Character names could not be refreshed", cause));
try {
  const resumeId = sessionStorage.getItem(resumeKey);
  const character = profile?.characters.find((candidate) => candidate.id === resumeId);
  if (character) void enterWorld(character);
} catch { /* A fresh manual entry does not require session storage. */ }
