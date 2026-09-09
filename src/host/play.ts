import { createAdventure } from "../game/adventure.js";
import type { AdventureAction, AdventureGame, AdventureSnapshot } from "../game/adventure-types.js";
import {
  characterProfileStorageKey, decodeCharacterProfile, encodeCharacterProfile,
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
import { createShopPanel } from "./shop-panel.js";
import { publicUrl } from "./public-url.js";

declare global { interface Window { __GREYWROUGHT_TEARDOWN__?: () => void; } }

window.__GREYWROUGHT_TEARDOWN__?.();
const audio = createAdventureAudio();
const equipment = createEquipmentPanel(element("equipment-panel"), closeEquipment);
const corpseLoot = createCorpseLoot(element("adventure-hud"), {
  onTake: () => { pulse("takeLoot"); running?.world.canvas.focus(); },
  onClose: () => { pulse("closeLoot"); running?.world.canvas.focus(); },
});
const bags = createBagPanel(element("adventure-hud"), {
  onUsePotion: () => pulse("drinkPotion"),
  onClose: closeBags,
});
const chatLog = createChatLog(element("adventure-hud"));
const unitFrames = createUnitFrames(element("adventure-hud"));
const inn = createInnPanel(element("adventure-hud"), {
  onRest: () => pulse("rest"),
  onClose: () => { pulse("closeInn"); running?.world.canvas.focus(); },
});
void unitFrames.ready.catch(cause => console.error("Unit portraits failed to load", cause));
const shop = createShopPanel(element("adventure-hud"), {
  onBuyPotion: () => pulse("buyPotion"),
  onClose: () => { pulse("closeShop"); running?.world.canvas.focus(); },
});
void shop.ready.catch(cause => console.error("Merchant portrait failed to load", cause));

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element ${id}`);
  return found;
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
function text(id: string, value: string): void {
  const target = element(id);
  if (target.textContent !== value) target.textContent = value;
}
const classes: Record<CharacterArchetype, { name: string; copy: string }> = {
  warrior: { name: "Warrior", copy: "A steadfast wayfarer who meets the forest with courage and a ready blade." },
  mage: { name: "Mage", copy: "A curious seeker drawn to the old mysteries sleeping beneath the frost." },
  hunter: { name: "Hunter", copy: "A patient trailfinder who reads the forest and knows when to return home." },
};
const keyActions: Readonly<Record<string, AdventureAction>> = {
  KeyW: "forward", KeyS: "backward", KeyA: "left", KeyD: "right", Space: "jump",
  Digit1: "strike", KeyE: "brace", KeyG: "gather", KeyR: "ritual",
  KeyF: "interact", KeyH: "drinkPotion", KeyT: "rest", Tab: "target",
};
const resumeKey = "greywrought/adventure-active-character";
interface RunningAdventure {
  readonly character: LocalCharacter;
  readonly game: AdventureGame;
  readonly world: AdventureWorld;
  readonly unbind: Array<() => void>;
  readonly saveKey: string;
  lastSave: string;
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
let paused = false;
let entering = false;
let profile: LocalProfile | null = null;
let profileBlocked = false;
let route: "account" | "creator" | "roster" | "world" = "account";
let draft: CharacterArchetype = "warrior";

function listen(target: EventTarget, type: string, handler: EventListener, local = removers): void {
  target.addEventListener(type, handler);
  local.push(() => target.removeEventListener(type, handler));
}
function click(id: string, handler: () => void): void { listen(element(id), "click", handler); }
function pulse(action: AdventureAction): void {
  if (!running?.ready || (paused && action !== "closeLoot" && action !== "closeShop")) return;
  running.game.setAction(action, true);
  running.game.setAction(action, false);
}
function release(): void {
  if (running) {
    for (const action of new Set(Object.values(keyActions))) running.game.setAction(action, false);
    running.game.setMouseForward(false);
  }
  keys.clear();
}
function save(force = false): void {
  const app = running;
  if (!app?.ready) return;
  try {
    const source = app.game.save();
    if (source !== app.lastSave || force) {
      localStorage.setItem(app.saveKey, source);
      app.lastSave = source;
      text("save-status", "Journey saved");
      document.body.dataset.gamePersistence = "saved";
    }
  } catch (cause: unknown) {
    text("save-status", "Could not save your journey in this browser");
    document.body.dataset.gamePersistence = "unavailable";
    console.error("Adventure save failed", cause);
  }
}
function persistProfile(): void {
  if (!profile || profileBlocked) return;
  try { localStorage.setItem(characterProfileStorageKey, encodeCharacterProfile(profile)); }
  catch (cause: unknown) { text("entry-roster-feedback", "Your character could not be saved in this browser."); console.error("Profile save failed", cause); }
}
function selectedCharacter(): LocalCharacter | null {
  return profile?.characters.find((character) => character.id === profile?.selectedCharacterId) ?? profile?.characters[0] ?? null;
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
  text("entry-creator-profile", profile?.displayName ?? "");
  text("entry-roster-profile", profile?.displayName ?? "");
  text("entry-creator-class", classes[draft].name);
  text("entry-lore-title", classes[draft].name);
  text("entry-lore-copy", classes[draft].copy);
  text("entry-lore-kit", "Strike · Brace · Explore");
  text("entry-creator-preview-name", normalizedCharacterName(input("entry-character-name").value) ?? "Unnamed Adventurer");
  avatar("entry-creator", draft);
  for (const choice of document.querySelectorAll<HTMLElement>("[data-entry-archetype]")) choice.setAttribute("aria-pressed", String(choice.dataset.entryArchetype === draft));
  const list = element("entry-roster-list");
  list.replaceChildren();
  for (const character of profile?.characters ?? []) {
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
    description.textContent = classes[character.archetype].name;
    copy.append(name, description);
    choose.append(emblem, copy);
    item.append(choose);
    list.append(item);
  }
  text("entry-roster-count", `${profile?.characters.length ?? 0} / 8`);
  button("entry-enter-world").disabled = entering || selected === null;
  if (selected) {
    avatar("entry-roster", selected.archetype);
    text("entry-roster-class", classes[selected.archetype].name);
    text("entry-roster-name", selected.name);
    text("entry-roster-summary", "One life · One journey into Frostwood");
  }
}
function returnToRoster(): void {
  release();
  save(true);
  equipment.close();
  closeBags();
  chatLog.reset();
  if (running) audio.update(running.game.snapshot, true);
  audio.reset();
  try { sessionStorage.removeItem(resumeKey); } catch { /* A disabled session store cannot retain an active character. */ }
  if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running = null; }
  paused = false;
  route = "roster";
  element("pause-panel").hidden = true;
  element("shop-panel").hidden = true;
  element("death-panel").hidden = true;
  renderEntry();
}
function setPaused(value: boolean): void {
  if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
  if (value) release();
  paused = value;
  lastTime = 0;
  document.body.dataset.gamePaused = String(paused);
  save(true);
}
function setMenuOpen(value: boolean): void {
  if (!running?.ready || route !== "world" || running.game.snapshot.phase === "lost") return;
  element("pause-panel").hidden = !value;
  if (!value) running.world.canvas.focus();
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
  bags.open(running.game.snapshot);
  button("bag-open").setAttribute("aria-expanded", "true");
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
  snapshot.threats.forEach((threat, index) => {
    const marker = document.createElement("button");
    marker.className = "map-enemy";
    marker.dataset.enemyId = threat.id;
    marker.textContent = String(index + 1);
    marker.title = threat.name;
    marker.setAttribute("aria-label", `Target ${threat.name}`);
    const caption = document.createElement("span");
    caption.textContent = threat.name;
    marker.append(caption);
    element("map-threats").append(marker);
    markers.set(threat.id, marker);
  });
}
function renderHud(snapshot: AdventureSnapshot): void {
  const { player } = snapshot;
  const data = document.body.dataset;
  data.gamePhase = snapshot.phase;
  data.gamePlayerX = String(player.position.x); data.gamePlayerY = String(player.position.y); data.gamePlayerZ = String(player.position.z);
  data.gamePlayerVitality = String(player.health); data.gameSupplies = String(snapshot.supplies);
  data.gameCargo = String(snapshot.cargo); data.gamePotions = String(snapshot.potions);
  data.gameCarriedSalvage = String(snapshot.carriedSalvage);
  data.gamePaused = String(paused);
  data.gameBankedRelics = String(snapshot.bankedRelics); data.gameSelectedThreat = snapshot.selectedThreat;
  data.gameActionCooldown = String(player.actionCooldown); data.gameGuardSeconds = String(player.guardSeconds);
  data.archetype = player.archetype;
  text("adventure-zone", snapshot.phase === "town" ? "Hearthstead · safe haven" : snapshot.phase === "lost" ? "Journey ended" : "Frostwood");
  if (running) unitFrames.update(running.character, snapshot);
  chatLog.update(snapshot.log);
  inn.update(snapshot, snapshot.innOpen);
  shop.update(snapshot);
  text("strike-ready", player.actionCooldown > 0 ? `${player.actionCooldown.toFixed(1)}s` : "Ready");
  text("potion-count", `${snapshot.potions} carried · heals ${snapshot.potionHealing}`);
  text("cargo-summary", `Carried: ${snapshot.cargo} cores · ${snapshot.carriedSalvage} salvage · ${snapshot.carriedRelics} relics\nSecured: ${snapshot.supplies} supplies · ${snapshot.bankedRelics} relics`);
  const nearbyLoot = snapshot.loot.some(item => item.available && item.reachable);
  const nearbyInn = snapshot.phase === "town" && snapshot.places.some(place => place.kind === "inn" && Math.hypot(place.position.x-player.position.x,place.position.z-player.position.z) <= 2.5);
  text("interact-label", nearbyLoot ? "Loot" : "Talk");
  text("interact-detail", nearbyLoot ? "Search remains" : nearbyInn ? "Rowan · Innkeeper" : "Mara's shop");
  corpseLoot.update(snapshot);
  bags.update(snapshot);
  if (equipment.isOpen && running) equipment.update(running.character, snapshot);
  text("route-objective", snapshot.phase === "town" ? "Prepare, then follow the road north" : snapshot.carriedRelics > 0 ? "Bring the grove relic home" : snapshot.cargo > 0 ? "Return with your cores, or press deeper" : "Find frost cores in the first clearing");
  text("route-detail", snapshot.phase === "town" ? "Mara sells potions. Rowan offers rest at the inn beside the square." : `Follow the road south to Hearthstead to secure what you carry. Forest alertness: ${snapshot.presence.toFixed(0)}.`);
  element("rest-button").hidden = !nearbyInn;
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
  if (running) nameplates?.render(snapshot, running.world);
  element("death-panel").hidden = snapshot.phase !== "lost";
}
function bindWorld(app: RunningAdventure): void {
  const { canvas } = app.world;
  let buttons = 0;
  let lastX = 0; let lastY = 0; let dragDistance = 0;
  listen(canvas, "pointerdown", (event) => {
    if (!(event instanceof PointerEvent) || paused || !app.ready || event.button > 2) return;
    event.preventDefault();
    canvas.focus();
    buttons = event.buttons;
    lastX = event.clientX; lastY = event.clientY; dragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
    app.game.setMouseForward((buttons & 3) === 3);
  }, app.unbind);
  listen(canvas, "pointermove", (event) => {
    if (!(event instanceof PointerEvent) || paused || !app.ready) return;
    // A mouse chord changes buttons through pointermove, without another pointerdown.
    buttons = event.buttons;
    app.game.setMouseForward((buttons & 3) === 3);
    if (buttons === 0) return;
    const dx = event.clientX - lastX; const dy = event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    app.world.orbit(dx, dy);
    const direction = app.world.forward(); app.game.setCameraForward(direction.x, direction.z);
  }, app.unbind);
  listen(canvas, "pointerup", (event) => {
    if (!(event instanceof PointerEvent)) return;
    buttons = event.buttons;
    app.game.setMouseForward((buttons & 3) === 3 && !paused);
    if ((event.button === 0 || event.button === 2) && buttons === 0 && dragDistance < 5 && !paused && app.ready) {
      const selected = app.world.pick(event.clientX, event.clientY);
      if (selected && app.game.snapshot.loot.some(item => item.sourceId === selected && item.available)) app.game.openLoot(selected);
      else if (selected && event.button === 0) app.game.selectTarget(selected);
    }
    if (buttons === 0 && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, app.unbind);
  const resetMouse = () => { buttons = 0; app.game.setMouseForward(false); };
  listen(canvas, "lostpointercapture", resetMouse, app.unbind);
  listen(canvas, "pointercancel", resetMouse, app.unbind);
  listen(window, "blur", resetMouse, app.unbind);
  listen(canvas, "contextmenu", (event) => event.preventDefault(), app.unbind);
  listen(canvas, "wheel", (event) => { if (event instanceof WheelEvent) { event.preventDefault(); app.world.zoom(event.deltaY); } }, app.unbind);
}
async function enterWorld(character: LocalCharacter): Promise<void> {
  if (entering || running) return;
  entering = true;
  renderEntry();
  text("entry-enter-world", "Preparing your journey…");
  text("entry-roster-feedback", "Loading the forest and your adventurer…");
  const saveKey = `greywrought/adventure-v1/${character.id}`;
  try {
    const stored = localStorage.getItem(saveKey);
    const game: AdventureGame = createAdventure(stored === null ? { archetype: character.archetype } : { archetype: character.archetype, save: stored });
    audio.reset();
    const world = createAdventureWorld(element("world-wrap"), game.snapshot);
    const app: RunningAdventure = { character, game, world, unbind: [], saveKey, lastSave: stored ?? "", saveClock: 0, ready: false };
    running = app;
    bindWorld(app);
    await world.ready;
    if (!alive || running !== app) { world.dispose(); return; }
    world.render(game.snapshot, 0);
    app.ready = true;
    lastTime = 0;
    const forward = world.forward(); game.setCameraForward(forward.x, forward.z);
    makeEnemyInterface(game.snapshot);
    route = "world";
    paused = false;
    renderEntry();
    renderHud(game.snapshot);
    text("entry-roster-feedback", "");
    document.body.dataset.characterName = character.name;
    try { sessionStorage.setItem(resumeKey, character.id); } catch { /* Manual entry remains available without session storage. */ }
    world.canvas.focus();
    save(true);
  } catch (cause: unknown) {
    if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running = null; }
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
  if (profile.characters.length >= 8) { text("entry-character-feedback", "Your roster is full."); return; }
  if (profile.characters.some((character) => character.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { text("entry-character-feedback", "Choose a different character name."); return; }
  const character: LocalCharacter = { id: crypto.randomUUID(), name, archetype: draft, createdAtMillis: Date.now() };
  profile = { ...profile, characters: [...profile.characters, character], selectedCharacterId: character.id, savedAtMillis: Date.now() };
  persistProfile(); route = "roster"; input("entry-character-name").value = ""; renderEntry();
});
listen(input("entry-character-name"), "input", () => renderEntry());
for (const choice of document.querySelectorAll<HTMLElement>("[data-entry-archetype]")) listen(choice, "click", () => {
  const value = choice.dataset.entryArchetype;
  if (value === "warrior" || value === "mage" || value === "hunter") { draft = value; renderEntry(); }
});
listen(element("entry-roster-list"), "click", (event) => {
  if (!(event.target instanceof Element) || !profile || entering) return;
  const id = event.target.closest<HTMLElement>("[data-character-id]")?.dataset.characterId;
  if (!id || !profile.characters.some((character) => character.id === id)) return;
  profile = { ...profile, selectedCharacterId: id, savedAtMillis: Date.now() }; persistProfile(); renderEntry();
});
click("entry-creator-back", () => { route = profile?.characters.length ? "roster" : "account"; renderEntry(); });
click("entry-change-character", () => { if (!entering) { route = "creator"; renderEntry(); } });
click("entry-enter-world", () => { const character = selectedCharacter(); if (character) void enterWorld(character); });
click("pause-open", () => setMenuOpen(element("pause-panel").hidden));
click("equipment-open", toggleEquipment);
click("bag-open", toggleBags);
click("pause-resume", () => setMenuOpen(false));
click("return-roster", returnToRoster);
click("death-roster", returnToRoster);
for (const target of [element("map-threats"), element("enemy-intents")]) listen(target, "click", (event) => {
  if (!(event.target instanceof Element) || !running?.ready || paused) return;
  const id = event.target.closest<HTMLElement>("[data-enemy-id]")?.dataset.enemyId;
  if (id) { running.game.selectTarget(id); running.world.canvas.focus(); }
});
for (const control of document.querySelectorAll<HTMLElement>("[data-action]")) listen(control, "click", () => {
  const action = control.dataset.action;
  if (action && ["strike", "brace", "drinkPotion", "gather", "ritual", "interact", "rest"].includes(action)) pulse(action as AdventureAction);
});
listen(window, "keydown", (event) => {
  if (event.isTrusted) void audio.unlock();
  if (!(event instanceof KeyboardEvent) || route !== "world") return;
  if (event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(event.target.type))) return;
  if (event.code === "KeyC") {
    event.preventDefault();
    if (!event.repeat) toggleEquipment();
    return;
  }
  if (event.code === "KeyB") {
    event.preventDefault();
    if (!event.repeat) toggleBags();
    return;
  }
  if (event.code === "Escape" && equipment.isOpen) { event.preventDefault(); closeEquipment(); return; }
  if (event.code === "Escape" && bags.isOpen) { event.preventDefault(); closeBags(); return; }
  if (event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) {
      if (!element("pause-panel").hidden) setMenuOpen(false);
      else if (running?.game.snapshot.lootOpenId) pulse("closeLoot");
      else if (running?.game.snapshot.shopOpen) pulse("closeShop");
      else if (running?.game.snapshot.innOpen) pulse("closeInn");
      else setMenuOpen(true);
    }
    return;
  }
  const action = keyActions[event.code];
  if (!action || paused || !running?.ready) return;
  event.preventDefault();
  if (keys.has(event.code)) return;
  keys.add(event.code);
  running.game.setAction(action, true);
});
listen(window, "keyup", (event) => {
  if (!(event instanceof KeyboardEvent)) return;
  keys.delete(event.code);
  const action = keyActions[event.code];
  if (action && ![...keys].some((key) => keyActions[key] === action)) running?.game.setAction(action, false);
});
listen(window, "blur", () => { release(); if (running?.ready) setPaused(true); });
listen(window, "focus", () => { if (!document.hidden) setPaused(false); });
listen(document, "visibilitychange", () => { setPaused(document.hidden || !document.hasFocus()); });
listen(window, "pagehide", () => { release(); save(true); });
listen(window, "beforeunload", () => { release(); save(true); });
listen(window, "pointerdown", (event) => { if (event.isTrusted) void audio.unlock(); });

function tick(now: number): void {
  if (!alive) return;
  const delta = lastTime === 0 ? 0 : (now - lastTime) / 1000;
  lastTime = now;
  if (running?.ready) {
    if (!paused && !document.hidden) running.game.advance(delta);
    const snapshot = running.game.snapshot;
    audio.update(snapshot, paused || route !== "world");
    running.world.render(snapshot, paused ? 0 : delta);
    renderHud(snapshot);
    running.saveClock += delta;
    if (running.saveClock >= 1) { running.saveClock = 0; save(); }
  }
  frame = requestAnimationFrame(tick);
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
  if (running) { for (const remove of running.unbind) remove(); running.world.dispose(); running = null; }
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
frame = requestAnimationFrame(tick);
try {
  const resumeId = sessionStorage.getItem(resumeKey);
  const character = profile?.characters.find((candidate) => candidate.id === resumeId);
  if (character) void enterWorld(character);
} catch { /* A fresh manual entry does not require session storage. */ }
