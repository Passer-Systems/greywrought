import type { RemotePlayerView } from "../game/multiplayer-types.js";
import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";
import { createEnemyCastBar } from "./enemy-nameplates.js";
import { createUnitPortraits } from "./unit-portraits.js";

interface Frame {
  root: HTMLElement; portrait: HTMLImageElement; name: HTMLElement;
  fill: HTMLElement; value: HTMLElement;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, host: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; host.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function makeFrame(host: HTMLElement, id: string, kind: string): Frame {
  const root = node("section", `unit-frame unit-frame-${kind}`, host); root.id = id;
  const portraitMount = node("span", "unit-frame-portrait", root);
  const portrait = node("img", "unit-frame-image", portraitMount); portrait.alt = "";
  const bars = node("div", "unit-frame-bars", root);
  const name = node("strong", "unit-frame-name", bars);
  const health = node("div", "unit-frame-health", bars);
  const fill = node("span", "unit-frame-fill", health), value = node("span", "unit-frame-value", health);
  return { root, portrait, name, fill, value };
}
function health(frame: Frame, name: string, current: number, maximum: number, targetId: string): void {
  write(frame.name, name);
  write(frame.value, current <= 0 ? "Dead" : `${Math.ceil(current)} / ${maximum}`);
  frame.fill.style.width = `${Math.max(0, Math.min(100, current / maximum * 100))}%`;
  Object.assign(frame.root.dataset, { health: String(current), max: String(maximum), targetId });
  frame.root.setAttribute("aria-label", `${name}, ${current <= 0 ? "dead" : `${Math.ceil(current)} of ${maximum} health`}`);
}
const styles = `
.unit-frames { position:absolute; inset:0; pointer-events:none; color:#f4e5ba; font:var(--ui-font-small)/1.2 system-ui,sans-serif; filter:drop-shadow(0 2px 2px #000b); }
.unit-frame { position:relative; display:flex; align-items:center; height:66px; min-width:0; }
.unit-frame-player,.unit-frame-target-group { position:absolute; width:var(--unit-frame-width); }
.unit-frame-combat-status { position:absolute; top:calc(100% - 5px); right:3px; color:#c3c8bc; font:var(--ui-font-small)/1.2 system-ui,sans-serif; text-shadow:0 1px 2px #000,1px 0 2px #000; }
.unit-frame-player[data-in-combat=true] .unit-frame-combat-status { color:#ffc18f; }
.unit-frame-target-group { min-width:0; }
.unit-frames[data-locked=false] .unit-frame-player,.unit-frames[data-locked=false] .unit-frame-target-group { pointer-events:auto; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; }
.unit-frames[data-locked=false] .unit-frame-player::after,.unit-frames[data-locked=false] .unit-frame-target::after { content:""; position:absolute; inset:-4px; border:1px dashed #e1c781; border-radius:5px; pointer-events:none; }
.unit-frames .unit-frame-dragging { cursor:grabbing !important; }
.unit-frame-target[data-preview=true] .unit-frame-image { visibility:hidden; }
.unit-frame-settings { display:grid; gap:8px; margin:14px 0 0; padding:10px; border:1px solid #86734b; border-radius:8px; text-align:left; font-size:var(--ui-font-body); }
.unit-frame-settings label { display:flex; align-items:center; gap:8px; }
.unit-frame-settings small { line-height:1.4; }
#pause-panel > div { max-height:calc(100dvh - 24px); overflow-y:auto; }
.unit-frame-portrait { z-index:1; flex:0 0 49.5px; width:49.5px; height:49.5px; border:2px solid #a69768; border-radius:2px 0 0 2px; background:#203035; box-shadow:inset 0 0 0 2px #211d18,0 0 0 1px #252721; overflow:hidden; }
.unit-frame-image { display:block; width:100%; height:100%; object-fit:cover; }
.unit-frame-player .unit-frame-image,.unit-frame-tot .unit-frame-image { object-position:50% 18%; }
.unit-frame-bars { flex:1; min-width:0; height:49.5px; display:flex; flex-direction:column; justify-content:center; padding:3px 4px; border:2px solid #888579; border-left:0; border-radius:0 2px 2px 0; background:linear-gradient(#393b36,#141b1c); box-shadow:0 0 0 1px #1a1815,inset 0 0 0 1px #b9ae7040; }
.unit-frame-name { display:block; height:17px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:center; font:600 var(--ui-font-body)/16px Georgia,serif; color:#f4dda4; text-shadow:0 1px 2px #000; }
.unit-frame-health { position:relative; height:14px; margin-top:1px; background:#14201a; border:1px solid #121612; box-shadow:0 0 0 1px #90855a; overflow:hidden; }
.unit-frame-fill { display:block; height:100%; background:linear-gradient(#72c650,#3d912b 50%,#256d27); }
.unit-frame-value { position:absolute; inset:0; text-align:center; color:#fff; text-shadow:0 1px 2px #000,1px 0 2px #000; font:600 var(--ui-font-tiny)/12px system-ui,sans-serif; }
.unit-frame-target { flex-direction:row-reverse; }
.unit-frame-target .unit-frame-bars { border-left:2px solid #888579; border-right:0; border-radius:2px 0 0 2px; }
.unit-frame-target .unit-frame-portrait { border-radius:0 2px 2px 0; }
.unit-frame-target[data-hostile=true] .unit-frame-fill { background:linear-gradient(#da5353,#ac3338 50%,#80202b); }
.unit-frame-target[data-hostile=false] .unit-frame-fill { background:linear-gradient(#e0ce51,#b19a2a 50%,#8e791d); }
.unit-frame-tot { margin-top:24px; margin-left:auto; width:150px; height:39px; }
.unit-frame-tot .unit-frame-portrait { flex-basis:37px; width:37px; height:37px; border-width:2px; }
.unit-frame-tot .unit-frame-bars { height:37px; padding:2px 3px; border-width:1px; }
.unit-frame-tot .unit-frame-name { font-size:var(--ui-font-tiny); line-height:12px; height:12px; }
.unit-frame-tot .unit-frame-health { height:14px; }
.unit-frame-tot .unit-frame-value { font-size:var(--ui-font-tiny); line-height:12px; }
.unit-frame[hidden],.unit-frame-target-group[hidden] { display:none; }
@media(max-width:700px) { .unit-frame-portrait { flex-basis:36px; width:36px; height:36px; } .unit-frame-bars { height:36px; } .unit-frame { height:52px; } .unit-frame-name { font-size:var(--ui-font-tiny); } .unit-frame-tot { width:130px; height:37px; } }
`;

type FramePosition = { x: number; y: number };
type FrameSide = "player" | "target";
interface LayoutPreferences {
  locked: boolean;
  mirrored: boolean;
  positions: Record<FrameSide, FramePosition> | null;
}
const layoutStorageKey = "greywrought.adventure.unit-frames.v1";
function layoutPreferences(): LayoutPreferences {
  const defaults: LayoutPreferences = { locked: true, mirrored: true, positions: null };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(layoutStorageKey) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    const value = saved as Partial<LayoutPreferences>;
    const valid = (position: FramePosition | undefined) => position && Number.isFinite(position.x) && Number.isFinite(position.y)
      && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1;
    return {
      locked: typeof value.locked === "boolean" ? value.locked : true,
      mirrored: typeof value.mirrored === "boolean" ? value.mirrored : true,
      positions: value.positions && valid(value.positions.player) && valid(value.positions.target) ? value.positions : null,
    };
  } catch { return defaults; }
}

export function createUnitFrames(host: HTMLElement) {
  const style = node("style", "", host); style.textContent = styles;
  const root = node("div", "unit-frames", host);
  const player = makeFrame(root, "player-frame", "player");
  const combatStatus = node("span", "unit-frame-combat-status", player.root);
  combatStatus.id = "player-combat-status";
  const targetGroup = node("div", "unit-frame-target-group", root); targetGroup.hidden = true;
  const target = makeFrame(targetGroup, "target-frame", "target");
  const targetCast = createEnemyCastBar(target.root, "target-frame");
  const targetOfTarget = makeFrame(targetGroup, "target-of-target-frame", "tot"); targetOfTarget.root.hidden = true;
  let disposed = false, portraits: ReadonlyMap<string, string> = new Map();
  let selectedId = "", archetype = "";
  const prefs = layoutPreferences();
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const panel = document.createElement("fieldset");
  panel.className = "unit-frame-settings";
  panel.innerHTML = `<legend>Unit frames</legend>
    <label><input id="unit-frames-locked" type="checkbox"> Lock unit frames</label>
    <label><input id="unit-frames-mirrored" type="checkbox"> Mirror symmetrically</label>
    <small>Unlock, then hold the left mouse button on either frame to move it. Close this menu for more room.</small>
    <button id="unit-frames-reset" type="button">Reset frame defaults</button>`;
  document.querySelector("#pause-panel > div")?.append(panel);
  const locked = panel.querySelector<HTMLInputElement>("#unit-frames-locked")!;
  const mirrored = panel.querySelector<HTMLInputElement>("#unit-frames-mirrored")!;
  let drag: { side: FrameSide; element: HTMLElement; pointerId: number; dx: number; dy: number } | null = null;
  const placements: Record<FrameSide, FramePosition> = { player: { x: 0, y: 0 }, target: { x: 0, y: 0 } };
  function dimensions() {
    const width = window.innerWidth, height = window.innerHeight;
    const small = width <= 700;
    const slotWidth = small ? Math.min(250, (width - 20 - Math.max(70, width * 0.2)) / 2) : Math.min(250, (width - 188) / 2);
    const frameHeight = small ? 52 : 66;
    return { width, height, slotWidth, frameWidth: Math.max(1, slotWidth * 0.75), frameHeight, groupHeight: frameHeight + (small ? 61 : 63) };
  }
  function fit(position: FramePosition): FramePosition {
    const { width, height, frameWidth, groupHeight } = dimensions();
    const marginX = Math.min(8, Math.max(0, (width - frameWidth) / 2));
    const marginY = Math.min(8, Math.max(0, (height - groupHeight) / 2));
    return {
      x: Math.max(marginX, Math.min(width - frameWidth - marginX, position.x)),
      y: Math.max(marginY, Math.min(height - groupHeight - marginY, position.y)),
    };
  }
  function paintPositions(): void {
    const { frameWidth } = dimensions();
    root.style.setProperty("--unit-frame-width", `${frameWidth}px`);
    for (const side of ["player", "target"] as const) {
      const element = side === "player" ? player.root : targetGroup;
      element.style.left = `${placements[side].x}px`;
      element.style.top = `${placements[side].y}px`;
    }
  }
  function layout(): void {
    const { width, height, slotWidth, frameWidth, frameHeight } = dimensions();
    const slotSpan = width <= 700 ? width - 20 : Math.min(820, width - 28);
    const span = (slotSpan - slotWidth) * 0.9 * 0.95 + frameWidth;
    const defaultY = height - (294 * 0.9 * 1.05 + (width <= 850 ? 146 : 0)) - frameHeight;
    for (const side of ["player", "target"] as const) {
      const saved = prefs.positions?.[side];
      placements[side] = fit(saved ? { x: saved.x * width - frameWidth / 2, y: saved.y * height }
        : { x: side === "player" ? (width - span) / 2 : (width + span) / 2 - frameWidth, y: defaultY });
    }
    if (prefs.mirrored) placements.target = { x: width - placements.player.x - frameWidth, y: placements.player.y };
    paintPositions();
  }
  function rememberPositions(): void {
    const { width, height, frameWidth } = dimensions();
    prefs.positions = {
      player: { x: (placements.player.x + frameWidth / 2) / width, y: placements.player.y / height },
      target: { x: (placements.target.x + frameWidth / 2) / width, y: placements.target.y / height },
    };
  }
  function saveLayout(): void {
    try { localStorage.setItem(layoutStorageKey, JSON.stringify(prefs)); } catch { /* Positions still work for this visit when storage is unavailable. */ }
  }
  function preview(): void {
    targetGroup.hidden = !selectedId && prefs.locked;
    target.root.dataset.preview = String(!selectedId);
    if (selectedId) return;
    targetOfTarget.root.hidden = true;
    targetCast.root.hidden = true;
    write(target.name, "Target frame");
    write(target.value, "Hold to move");
    target.fill.style.width = "100%";
    target.root.setAttribute("aria-label", "Target frame preview. Hold the left mouse button to move.");
    delete target.root.dataset.targetId;
  }
  function syncSettings(): void {
    locked.checked = prefs.locked;
    mirrored.checked = prefs.mirrored;
    root.dataset.locked = String(prefs.locked);
    root.dataset.mirrored = String(prefs.mirrored);
    preview();
  }
  function endDrag(): void {
    if (!drag) return;
    const ended = drag;
    drag = null;
    ended.element.classList.remove("unit-frame-dragging");
    if (ended.element.hasPointerCapture(ended.pointerId)) ended.element.releasePointerCapture(ended.pointerId);
    saveLayout();
  }
  for (const side of ["player", "target"] as const) {
    const element = side === "player" ? player.root : targetGroup;
    element.addEventListener("pointerdown", event => {
      if (prefs.locked) return;
      event.preventDefault(); event.stopPropagation();
      if (event.button !== 0 || drag) return;
      drag = { side, element, pointerId: event.pointerId, dx: event.clientX - placements[side].x, dy: event.clientY - placements[side].y };
      element.classList.add("unit-frame-dragging");
      element.setPointerCapture(event.pointerId);
    }, options);
    element.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      if (!(event.buttons & 1)) { endDrag(); return; }
      placements[side] = fit({ x: event.clientX - drag.dx, y: event.clientY - drag.dy });
      if (prefs.mirrored) {
        const { width, frameWidth } = dimensions();
        placements[side === "player" ? "target" : "player"] = { x: width - placements[side].x - frameWidth, y: placements[side].y };
      }
      rememberPositions();
      paintPositions();
    }, options);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      element.addEventListener(type, event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault(); event.stopPropagation(); endDrag();
      }, options);
    }
    for (const type of ["click", "contextmenu", "dragstart"] as const) {
      element.addEventListener(type, event => { if (!prefs.locked) { event.preventDefault(); event.stopPropagation(); } }, options);
    }
  }
  locked.addEventListener("change", () => { endDrag(); prefs.locked = locked.checked; syncSettings(); saveLayout(); }, options);
  mirrored.addEventListener("change", () => {
    endDrag(); prefs.mirrored = mirrored.checked; layout();
    if (prefs.positions) rememberPositions();
    syncSettings(); saveLayout();
  }, options);
  panel.querySelector("#unit-frames-reset")!.addEventListener("click", () => {
    endDrag(); prefs.locked = true; prefs.mirrored = true; prefs.positions = null;
    layout(); syncSettings(); saveLayout();
  }, options);
  window.addEventListener("resize", () => { endDrag(); layout(); }, options);
  window.addEventListener("blur", endDrag, options);
  document.addEventListener("visibilitychange", () => { if (document.hidden) endDrag(); }, options);
  layout(); syncSettings();
  const ready = createUnitPortraits().then(images => {
    if (disposed) return;
    portraits = images;
    const image = portraits.get(selectedId); if (image) target.portrait.src = image;
  });
  return {
    ready,
    portrait(id: string) { return portraits.get(id); },
    update(character: LocalCharacter, snapshot: AdventureSnapshot, others: readonly RemotePlayerView[] = []): void {
      if (disposed) return;
      if (archetype !== character.archetype) {
        archetype = character.archetype;
        player.portrait.src = targetOfTarget.portrait.src = publicUrl(`assets/ui/characters/${archetype}.webp`);
      }
      health(player, character.name, snapshot.player.health, snapshot.player.maximumHealth, character.id);
      player.root.dataset.inCombat = String(snapshot.player.inCombat);
      write(combatStatus, snapshot.player.inCombat ? "In combat" : "Out of combat");
      const enemy = snapshot.threats.find(threat => threat.id === snapshot.selectedThreat && threat.active);
      if (!enemy) { selectedId = ""; preview(); return; }
      targetGroup.hidden = false;
      target.root.dataset.preview = "false";
      if (selectedId !== enemy.id) {
        selectedId = enemy.id;
        const image = portraits.get(enemy.id);
        if (image) target.portrait.src = image; else target.portrait.removeAttribute("src");
      }
      health(target, enemy.name, enemy.health, enemy.maximumHealth, enemy.id);
      targetCast.render(enemy, snapshot, { selfId: character.id, players: others });
      Object.assign(target.root.dataset, { hostile: String(enemy.disposition === "hostile" || enemy.aggro), aggro: String(enemy.aggro), disposition: enemy.disposition });
      const recipient = enemy.targetPlayerId && enemy.targetPlayerId !== character.id ? others.find(other => other.id === enemy.targetPlayerId) : {id:character.id,name:character.name,player:snapshot.player};
      const attackingPlayer = enemy.aggro && enemy.health > 0 && recipient && recipient.player.health > 0;
      targetOfTarget.root.hidden = !attackingPlayer;
      if (attackingPlayer && recipient) {
        targetOfTarget.portrait.src = publicUrl('assets/ui/characters/' + recipient.player.archetype + '.webp');
        health(targetOfTarget, recipient.name, recipient.player.health, recipient.player.maximumHealth, recipient.id);
      }
    },
    dispose(): void { if (disposed) return; disposed = true; endDrag(); listeners.abort(); panel.remove(); root.remove(); style.remove(); },
  };
}
