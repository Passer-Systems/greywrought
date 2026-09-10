import { COMBAT_RULES } from "../game/adventure.js";
import { classAction, classKit } from "../game/class-kit.js";
import type { AdventureAction, AdventureSnapshot } from "../game/adventure-types.js";
import {
  archiveFallenCharacter, characterProfileStorageKey, decodeCharacterProfile, encodeCharacterProfile,
  normalizedCharacterName, normalizedDisplayName,
  type CharacterArchetype, type LocalCharacter, type LocalProfile,
} from "./character-profile.js";
import { createAdventureWorld, type AdventureWorld } from "./adventure-world.js";
import { createAdventureAudio } from "./adventure-audio.js";
import { createEnemyNameplates } from "./enemy-nameplates.js";
import { createEquipmentPanel } from "./equipment-panel.js";
import { createCorpseLoot } from "./corpse-loot.js";
import { createBagPanel } from "./bag-panel.js";
import { createChatLog } from "./chat-log.js";
import { createUnitFrames } from "./unit-frames.js";
import { createInnPanel } from "./inn-panel.js";
import { createLorebook } from "./lorebook.js";
import { createShopPanel } from "./shop-panel.js";
import { createTradePanel } from "./trade-panel.js";
import { createQuestLog } from "./quest-log.js";
import { createQuestRewardNotice } from "./quest-reward-notice.js";
import { updateQuestTracker } from "./quest-tracker.js";
import { connectAdventure, type NetworkAdventure } from "./network-adventure.js";
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
const equipment = createEquipmentPanel(element("equipment-panel"), closeEquipment, (slot, item) => {
  if (running?.ready && !paused) running.game.equip(slot, item);
});
const corpseLoot = createCorpseLoot(element("adventure-hud"), {
  onTake: () => { pulse("takeLoot"); running?.world.canvas.focus(); },
  onClose: () => { pulse("closeLoot"); running?.world.canvas.focus(); },
});
const bags = createBagPanel(element("adventure-hud"), {
  onUsePotion: () => pulse("drinkPotion"),
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
const chatLog = createChatLog(element("adventure-hud"), text => running?.game.sendChat(text));
const unitFrames = createUnitFrames(element("adventure-hud"));
const hudSize = new ResizeObserver(entries => {
  const entry = entries[0];
  if (entry) document.body.style.setProperty("--combat-hud-height", entry.contentRect.height + "px");
});
hudSize.observe(element("adventure-actions").parentElement!);
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
  const allowed = new Set(defaults.filter((action): action is AdventureAction => action !== null));
  const parsed = Array.isArray(saved) ? saved.map(value => typeof value === "string" && allowed.has(value as AdventureAction) ? value as AdventureAction : null) : [];
  const order: ActionBarEntry[] = [];
  for (const action of parsed) if (action === null || !order.includes(action)) order.push(action);
  for (const action of defaults) if (action === null ? order.filter(item => item === null).length < defaults.filter(item => item === null).length : !order.includes(action)) order.push(action);
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
    if (!(event instanceof DragEvent) || !dragged) return;
    const target = (event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null);
    if (!target || target === dragged) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    for (const control of actionBarControls()) control.classList.toggle("action-drag-over", control === target);
  });
  listen(bar, "drop", event => {
    if (!(event instanceof DragEvent) || !dragged) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!target || target === dragged) return;
    event.preventDefault();
    const from = Number(dragged.dataset.actionSlot);
    const to = Number(target.dataset.actionSlot);
    if (Number.isInteger(from) && Number.isInteger(to) && from !== to) {
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
  hunter: { name: "Hunter", copy: "A patient trailfinder who reads the forest and knows when to return home." },
  alchemist: { name: "Alchemist", copy: "A field chemist who turns scarce reagents into healing, acid, and volatile power." },
  artificer: { name: "Artificer", copy: "A works engineer who answers danger with a rivet tool, plated wards, and overclocked machinery." },
};
const keyActions: Readonly<Record<string, AdventureAction>> = {
  KeyW: "forward", KeyS: "backward", KeyA: "left", KeyD: "right", Space: "jump",
  KeyG: "gather", KeyR: "ritual",
  KeyF: "interact", KeyT: "rest", Tab: "target",
};
const actionBarKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"] as const;
const actionBarLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="] as const;
type ActionBarEntry = AdventureAction | null;
let actionBarOrder: ActionBarEntry[] = [];
let actionBarArchetype: CharacterArchetype | null = null;
let suppressActionClickUntil = 0;
const resumeKey = "greywrought/adventure-active-character";
interface RunningAdventure {
  readonly character: LocalCharacter;
  readonly game: NetworkAdventure;
  readonly world: AdventureWorld;
  readonly unbind: Array<() => void>;
  saveClock: number;
  ready: boolean;
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
function pressAction(action: AdventureAction): void {
  if ((action === "disengage" || action === "bloodRage") && !running?.game.snapshot.progression.unlockedActions.includes(action)) return;
  running?.game.setAction(action, true);
}
function pulse(action: AdventureAction): void {
  if (!running?.ready || (paused && action !== "closeLoot" && action !== "closeShop")) return;
  pressAction(action);
  running.game.setAction(action, false);
}
function release(): void {
  if (running) {
    for (const action of new Set([...Object.values(keyActions), ...actionBarOrder.filter((action): action is AdventureAction => action !== null)])) running.game.setAction(action, false);
    running.game.setMouseForward(false);
  }
  keys.clear();
}
function save(_force = false): void {
  if (!running?.ready) return;
  element("connection-status").hidden = running.game.online;
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
  const selected = selectedCharacter();
  document.body.dataset.rosterTab = rosterTab;
  for (const tab of ["active", "rip"] as const) button(`entry-roster-${tab}`).setAttribute("aria-pressed", String(rosterTab === tab));
  text("entry-roster-title", rosterTab === "rip" ? "The yard remembers" : "Choose a character");
  text("entry-creator-profile", profile?.displayName ?? "");
  text("entry-roster-profile", profile?.displayName ?? "");
  text("entry-creator-class", classes[draft].name);
  text("entry-lore-title", classes[draft].name);
  text("entry-lore-copy", classes[draft].copy);
  text("entry-lore-kit", "Attack · Block · Earn new abilities");
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
  questRewards.reset();
  stopFrames();
  release();
  save(true);
  equipment.close();
  closeBags();
  closeLorebook();
  closeQuestLog();
  chatLog.reset();
  if (running) audio.update(running.game.snapshot, true);
  audio.reset();
  try { sessionStorage.removeItem(resumeKey); } catch { /* A disabled session store cannot retain an active character. */ }
  if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running.game.close(); running = null; }
  paused = false;
  lastEncounterState = '';
  route = "roster";
  element("pause-panel").hidden = true;
  element("shop-panel").hidden = true;
  element("death-panel").hidden = true;
  renderEntry();
}
function syncEncounter(): void {
  if (!running?.ready || route !== "world") return;
  const { game, world, character } = running;
  if (game.snapshot.phase === 'lost') { showFallenCharacter(character); return; }
  const state = `${game.online}:${game.session.id}:${game.session.mode}:${game.inputEnabled}:${backgrounded}`;
  const changed = state !== lastEncounterState;
  lastEncounterState = state;
  const wasPaused = paused;
  paused = backgrounded || !game.inputEnabled;
  if (paused && !wasPaused) { release(); world.clearHover(); }
  document.body.dataset.gamePaused = String(paused);
  document.body.dataset.encounterMode = game.session.mode;
  document.body.dataset.encounterId = game.session.id;
  document.body.dataset.canRejoin = String(game.session.canRejoin);
  if (changed) {
    stopFrames();
    element('pause-panel').hidden = game.online && (game.inputEnabled || game.pendingTransition === 'rejoin');
    button('pause-open').setAttribute('aria-expanded', String(!element('pause-panel').hidden));
    world.updatePlayers(game.players.filter(player => player.id !== character.id));
    world.updateChat(game.chat, character.id);
    world.render(game.snapshot, 0, game.renderPlayer, paused ? undefined : game.serverTime, game.connectionRevision);
    renderHud(game.snapshot);
    nameplates?.render(game.snapshot, world, { selfId: character.id, players: game.players });
    audio.update(game.snapshot, paused);
    if (!paused) world.canvas.focus();
  }
  const waiting = game.online && !game.inputEnabled && game.session.mode !== 'paused';
  text('pause-title', !game.online ? 'Connection lost' : game.pendingTransition === 'resume' ? 'Resuming encounter…' : waiting ? 'Pausing encounter…' : game.session.mode === 'paused' ? 'Paused encounter' : 'Private encounter');
  text('pause-copy', !game.online
    ? 'Reconnecting… Your encounter pauses when the connection loss is detected. It will stay paused when you return.'
    : waiting ? 'Saving your encounter while the world continues.'
    : 'This is your private copy of the encounter. The rest of the world continues without you.');
  text('pause-rejoin-hint', game.session.canRejoin ? 'Out of combat. Resume your encounter to rejoin the main world from the top bar.' : 'In combat. Finish the encounter before rejoining the main world.');
  button('pause-resume').disabled = !game.online || game.session.mode !== 'paused' || game.pendingTransition !== null;
  button('encounter-rejoin').disabled = !game.online || !game.session.canRejoin || game.pendingTransition !== null;
  button('encounter-pause').disabled = game.pendingTransition !== null;
  element('encounter-status').hidden = game.session.mode === 'shared' || !game.online || !element('pause-panel').hidden;
  text('encounter-title', game.session.mode === 'paused' ? 'Paused encounter' : 'Private encounter');
  text('encounter-pause', game.session.mode === 'paused' ? 'Resume…' : 'Pause');
  text('encounter-detail', game.session.canRejoin ? 'Out of combat · ready to rejoin' : 'In combat · no rewards');
  save(true);
  scheduleFrame();
}
function setBackgrounded(value: boolean): void {
  backgrounded = value;
  if (value && running?.ready) release();
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
  if (value) { selectMenuTab(tab); release(); running.game.pause(); syncEncounter(); }
  element("pause-panel").hidden = !value;
  button("pause-open").setAttribute("aria-expanded", String(value));
  if (!value) running.world.canvas.focus();
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
function mapPosition(target: HTMLElement, x: number, z: number): void {
  target.style.left = `${50 - x * 2.5}%`;
  target.style.top = `${94 - (z + 12) * 1.53}%`;
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
const serverClockFormat = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
let displayedServerMinute = -1;
function renderHud(snapshot: AdventureSnapshot): void {
  const wallTime = running?.game.serverWallTimeMillis;
  const minute = running?.game.online && typeof wallTime === 'number' && Number.isFinite(wallTime) ? Math.floor(wallTime / 60_000) : -1;
  if (minute !== displayedServerMinute) {
    displayedServerMinute = minute;
    const clock = element('map-clock');
    clock.textContent = minute < 0 ? '--:--' : serverClockFormat.format(minute * 60_000);
    if (minute < 0) clock.removeAttribute('datetime');
    else clock.setAttribute('datetime', new Date(minute * 60_000).toISOString());
  }
  const { player } = snapshot;
  loadActionBarOrder(player.archetype);
  const data = document.body.dataset;
  data.gamePhase = snapshot.phase;
  data.gamePlayerX = String(player.position.x); data.gamePlayerY = String(player.position.y); data.gamePlayerZ = String(player.position.z);
  data.gamePlayerVitality = String(player.health); data.gameSupplies = String(snapshot.supplies);
  data.gameCargo = String(snapshot.cargo); data.gamePotions = String(snapshot.potions);
  data.gameCarriedSalvage = String(snapshot.carriedSalvage);
  data.gamePaused = String(paused);
  data.gameBankedRelics = String(snapshot.bankedRelics); data.gameSelectedThreat = snapshot.selectedThreat;
  data.gameActionCooldown = String(player.actionCooldown); data.gameGuardSeconds = String(player.guardSeconds);
  data.gameBlock = String(player.block); data.gameManeuver = player.maneuver;
  data.gameManeuverSeconds = String(player.maneuverSeconds);
  data.gameStamina = String(player.stamina); data.gameBloodRage = String(player.bloodRage); data.gameInCombat = String(player.inCombat);
  data.gameAutoAttack = String(snapshot.combat.autoAttack);
  data.gameAutoAttackRemaining = String(snapshot.combat.autoAttackRemainingSeconds);
  data.gameGlobalCooldown = String(snapshot.combat.globalCooldown);
  const stamina = element("combat-stamina");
  stamina.setAttribute("aria-valuenow", String(player.stamina));
  stamina.setAttribute("aria-valuemin", "0"); stamina.setAttribute("aria-valuemax", String(player.maximumStamina));
  stamina.title = "Stamina " + player.stamina + " / " + player.maximumStamina;
  element("combat-stamina-fill").style.width = (100 * player.stamina / player.maximumStamina) + "%";
  data.archetype = player.archetype;
  text("adventure-zone", (snapshot.phase === "town" ? `${YARD.settlement} · safe haven` : snapshot.phase === "lost" ? "Journey ended" : YARD.region) + ` · Level ${snapshot.progression.level}`);
  if (running) unitFrames.update(running.character, snapshot, running.game.players);
  const sharedChat = running?.game.chat.map(entry => ({ id: -entry.id, channel: "chat" as const, text: entry.name + ": " + entry.text })) ?? [];
  chatLog.update([...snapshot.log, ...sharedChat]);
  data.gameOnline = String(running?.game.online ?? false);
  data.gameRemotePlayers = JSON.stringify(running?.game.players ?? []);
  inn.update(snapshot, snapshot.innOpen);
  shop.update(snapshot);
  trade.update(snapshot);
  const selected = snapshot.threats.find(threat => threat.id === snapshot.selectedThreat);
  for (const [action, label] of [
    ["strike", "strike-ready"], ["brace", "block-ready"], ["disengage", "disengage-ready"], ["bloodRage", "rage-ready"],
  ] as const) {
    const spec = classAction(player.archetype, action);
    const auto = action === "strike";
    const cost = auto ? 0 : spec.cost ?? COMBAT_RULES[action].cost;
    const living = snapshot.phase !== "lost";
    const available = auto || action === "disengage" ? snapshot.phase === "expedition" && selected?.active && selected.health > 0
      : action === "bloodRage" ? player.inCombat : living;
    const availableStamina = player.stamina;
    const cooldown = auto ? snapshot.combat.autoAttackRemainingSeconds : snapshot.combat.globalCooldown;
    const cooldownDuration = auto ? 1.5 : snapshot.combat.globalCooldownDuration;
    const control = document.querySelector<HTMLButtonElement>('.adventure-actions [data-action="' + action + '"]');
    const unlocked = snapshot.progression.unlockedActions.includes(action);
    if (control) {
      control.setAttribute("aria-label", !unlocked ? `Locked ability · ${spec.name}` : spec.name);
      const art = control.querySelector<HTMLImageElement>(".action-art img");
      if (art) { const source = publicUrl(spec.icon); if (art.src !== source) art.src = source; }
      const heading = control.querySelector<HTMLElement>(".action-tooltip strong");
      if (heading) heading.textContent = spec.name;
      const copy = control.querySelector<HTMLElement>(".action-tooltip span:last-child");
      if (copy) {
        const recovery = snapshot.combat.globalCooldownDuration;
        const power = classAction(player.archetype, "bloodRage").powerDamagePerStack ?? COMBAT_RULES.bloodRage.damagePerStack;
        const effect = action === "strike" || action === "disengage"
          ? ((spec.damage ?? COMBAT_RULES[action].damage) + snapshot.progression.attackBonus + player.bloodRage * power) + " damage · " + (spec.range ?? COMBAT_RULES[action].range) + "m reach. "
          : action === "brace"
            ? (spec.block ?? COMBAT_RULES.brace.block) + " block for " + COMBAT_RULES.brace.duration + "s. " + (spec.heal ? "Restores " + spec.heal + " health in combat. " : "")
            : "+" + power + " damage per " + classKit(player.archetype).powerStackName + "; maximum 3 stacks. " + (player.archetype === "hunter" ? "" : "Each stack drains 1 health every 5s. ") + "Lose one stack every 2s outside combat. ";
        copy.textContent = effect + (auto ? "Repeats every 1.5 seconds while in range. Press again to stop. " : recovery + "s recovery. ") + spec.description;
      }
      control.classList.toggle("action-locked", !unlocked);
      control.disabled = !unlocked || !available || availableStamina < cost;
      control.style.setProperty("--recovery", String(Math.min(1, cooldown / Math.max(.001, cooldownDuration))));
      if (auto) {
        control.dataset.autoActive = String(snapshot.combat.autoAttack);
        control.setAttribute("aria-pressed", String(snapshot.combat.autoAttack));
      }
      control.dataset.range = available ? playerRange(snapshot, action).state : "none";
    }
    const detail = !unlocked ? action === "disengage" ? "Complete A Name on the Roll to unlock" : "Complete Clock Out to unlock" : !available ? action === "bloodRage" ? "Requires combat" : "Select a living enemy beyond the gate" : auto ? snapshot.combat.autoAttack ? "Auto attack on · press to stop" : "Start auto attack" : availableStamina < cost ? "Need " + cost + " stamina" : cooldown > .001 ? "Ready in " + cooldown.toFixed(1) + "s" : cost + " stamina";
    const range = available ? playerRange(snapshot, action) : null;
    text(label, detail + (range?.text ? " · " + range.text : ""));
  }
  const recovery = element("player-action-bar");
  recovery.hidden = player.actionCooldown <= 0.001 || (player.currentAction !== "gather" && player.currentAction !== "ritual");
  if (!recovery.hidden) {
    const actionControl = player.currentAction ? document.querySelector<HTMLButtonElement>('.adventure-actions [data-action="' + player.currentAction + '"]') : null;
    const art = actionControl?.querySelector<HTMLImageElement>(".action-art img");
    const icon = element("player-action-icon") as HTMLImageElement;
    const source = art?.src ?? publicUrl("assets/ui/icons/spells/sword-strike.png");
    if (icon.src !== source) icon.src = source;
    const gathering = player.currentAction === "gather";
    const label = gathering ? "Gathering" : "Awakening the engine";
    const progress = player.actionDuration - player.actionCooldown;
    text("player-action-name", label);
    text("player-action-time", progress.toFixed(1) + " / " + player.actionDuration.toFixed(1));
    element("player-action-fill").style.width = (100 * progress / Math.max(.001, player.actionDuration)) + "%";
    recovery.setAttribute("role", "progressbar"); recovery.setAttribute("aria-label", label);
    recovery.setAttribute("aria-valuenow", String(progress)); recovery.setAttribute("aria-valuemin", "0"); recovery.setAttribute("aria-valuemax", String(player.actionDuration));
  }
  const potion = document.querySelector<HTMLButtonElement>('.adventure-actions [data-action="drinkPotion"]');
  if (potion) {
    potion.disabled = snapshot.potions <= 0 || player.health >= player.maximumHealth || snapshot.phase === "lost";
    potion.style.setProperty("--recovery", String(snapshot.combat.globalCooldown / Math.max(.001, snapshot.combat.globalCooldownDuration)));
  }
  text("potion-count", `${snapshot.potions} carried · heals ${snapshot.potionHealing}`);
  text("potion-stack", String(snapshot.potions));
  corpseLoot.update(snapshot);
  bags.update(snapshot);
  if (equipment.isOpen && running) equipment.update(running.character, snapshot);
  updateQuestTracker(snapshot);
  questLog.update(snapshot);
  questRewards.update(snapshot);
  mapPosition(element("map-player"), player.position.x, player.position.z);
  element("map-player").style.transform = `translate(-50%, -50%) rotate(${-Math.atan2(player.cameraForward.x, player.cameraForward.z)}rad)`;
  for (const threat of snapshot.threats) {
    const marker = markers.get(threat.id);
    if (!marker) continue;
    Object.assign(marker.dataset, { phase: threat.phase, health: String(threat.health), remaining: String(threat.remainingSeconds), x: String(threat.position.x), z: String(threat.position.z), damage: String(threat.damage), reach: String(threat.reach), actionSequence: String(threat.actionSequence), disposition: threat.disposition, aggro: String(threat.aggro), hostile: String(threat.disposition === "hostile" || threat.aggro), worldX: String(threat.position.x), worldZ: String(threat.position.z) });
    mapPosition(marker, threat.position.x, threat.position.z);
    marker.classList.toggle("selected", threat.selected);
    marker.classList.toggle("cleared", threat.phase === "cleared");
    marker.classList.toggle("dormant", !threat.active);
  }
  element("death-panel").hidden = snapshot.phase !== "lost";
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
    if (!(event instanceof PointerEvent) || paused || !app.ready || event.button > 2) return;
    event.preventDefault();
    app.world.clearHover();
    canvas.focus();
    buttons = event.buttons;
    lastX = event.clientX; lastY = event.clientY; dragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
    if (buttons & 2) steerCharacter();
    app.game.setMouseForward((buttons & 3) === 3);
  }, app.unbind);
  listen(canvas, "pointermove", (event) => {
    if (!(event instanceof PointerEvent) || paused || !app.ready) return;
    // A mouse chord changes buttons through pointermove, without another pointerdown.
    buttons = event.buttons;
    app.game.setMouseForward((buttons & 3) === 3);
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
    app.game.setMouseForward((buttons & 3) === 3 && !paused);
    if ((event.button === 0 || event.button === 2) && buttons === 0 && dragDistance < 5 && !paused && app.ready) {
      const picked = app.world.pick(event.clientX, event.clientY);
      if (picked?.kind === "resource" && event.button === 0) pulse("gather");
      else if (picked?.kind === "npc" && event.button === 0) app.game.interactNpc(picked.id);
      else if (picked?.kind === "threat") {
        if (app.game.snapshot.loot.some(item => item.sourceId === picked.id && item.available)) app.game.openLoot(picked.id);
        else if (event.button === 0) app.game.selectTarget(picked.id);
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
  try {
    const game = await connectAdventure(character);
    if (game.snapshot.phase === "lost") { game.close(); showFallenCharacter(character); return; }
    audio.reset();
    const world = createAdventureWorld(element("world-wrap"), game.snapshot);
    world.updateChat(game.chat, character.id);
    const app: RunningAdventure = { character, game, world, unbind: [], saveClock: 0, ready: false };
    running = app;
    bindWorld(app);
    await world.ready;
    if (!alive || running !== app) { world.dispose(); return; }
    if (app.game.snapshot.phase === "lost") { showFallenCharacter(character); return; }
    world.render(game.snapshot, 0, game.renderPlayer, game.serverTime, game.connectionRevision);
    app.ready = true;
    lastTime = 0;
    const forward = world.forward(); game.setCameraForward(forward.x, forward.z);
    makeEnemyInterface(game.snapshot);
    route = "world";
    backgrounded = document.hidden || !document.hasFocus();
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
click("pause-resume", () => running?.game.resume());
click("encounter-rejoin", () => running?.game.rejoin());
click("encounter-pause", () => setMenuOpen(true));
click("return-roster", returnToRoster);
click("death-roster", returnToRoster);
for (const target of [element("map-threats"), element("enemy-intents")]) listen(target, "click", (event) => {
  if (!(event.target instanceof Element) || !running?.ready || paused) return;
  const id = event.target.closest<HTMLElement>("[data-enemy-id]")?.dataset.enemyId;
  if (id) { running.game.selectTarget(id); running.world.canvas.focus(); }
});
for (const control of document.querySelectorAll<HTMLElement>("[data-action]")) listen(control, "click", () => {
  if (performance.now() < suppressActionClickUntil) return;
  const action = control.dataset.action;
  if (action && ["strike", "disengage", "brace", "bloodRage", "jab", "guard", "drinkPotion", "gather", "ritual", "interact", "rest"].includes(action)) pulse(action as AdventureAction);
});
bindActionBar();
listen(window, "keydown", (event) => {
  if (event.isTrusted) void audio.unlock();
  if (!(event instanceof KeyboardEvent)) return;
  if (route === "roster" && pendingDeleteId !== null && event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) cancelDelete();
    return;
  }
  if (route !== "world") return;
  if (event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(event.target.type))) return;
  if (event.code === "Enter") { event.preventDefault(); release(); chatLog.focusInput(); return; }
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
      else if (running?.game.snapshot.shopOpen) pulse("closeShop");
      else if (running?.game.snapshot.innOpen) pulse("closeInn");
      else setMenuOpen(true);
    }
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
listen(window, "blur", () => setBackgrounded(true));
listen(window, "focus", () => { if (!document.hidden) setBackgrounded(false); });
listen(document, "visibilitychange", () => setBackgrounded(document.hidden || !document.hasFocus()));
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
  audio.update(snapshot, route !== "world");
  running.world.updatePlayers(running.game.players.filter(player => player.id !== running!.character.id));
  running.world.updateChat(running.game.chat, running.character.id);
  running.world.render(snapshot, delta, running.game.renderPlayer, running.game.serverTime, running.game.connectionRevision);
  if (now + 0.5 >= nextHudTime) {
    renderHud(snapshot);
    nextHudTime = Math.max(nextHudTime + 50, now);
  }
  nameplates?.render(snapshot, running.world, { selfId: running.character.id, players: running.game.players });
  running.saveClock += delta;
  if (running.saveClock >= 1) { running.saveClock = 0; save(); }
  scheduleFrame();
}
window.__GREYWROUGHT_TEARDOWN__ = () => {
  if (!alive) return;
  release(); save(true); alive = false; cancelAnimationFrame(frame);
  for (const remove of removers) remove();
  audio.dispose();
  equipment.dispose();
  corpseLoot.dispose();
  bags.dispose();
  chatLog.dispose();
  unitFrames.dispose();
  inn.dispose();
  shop.dispose();
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
try {
  const resumeId = sessionStorage.getItem(resumeKey);
  const character = profile?.characters.find((candidate) => candidate.id === resumeId);
  if (character) void enterWorld(character);
} catch { /* A fresh manual entry does not require session storage. */ }
