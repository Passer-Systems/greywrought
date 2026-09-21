import type { RemotePlayerView } from "../game/multiplayer-types.js";
import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";
import { createEnemyCastBar } from "./enemy-nameplates.js";
import { createUnitPortraits } from "./unit-portraits.js";

interface Frame {
  root: HTMLElement; portrait: HTMLImageElement; name: HTMLElement; level: HTMLElement;
  fill: HTMLElement; value: HTMLElement; stamina: HTMLElement; staminaFill: HTMLElement;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, host: HTMLElement): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; host.append(element); return element;
}
function write(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
function makeFrame(host: HTMLElement, id: string, kind: string): Frame {
  const root = node("section", `unit-frame unit-frame-${kind}`, host); root.id = id;
  const portraitMount = node("span", "unit-frame-portrait", root);
  const portrait = node("img", "unit-frame-image", portraitMount); portrait.alt = "";
  const level = node("span", "unit-frame-level", root); level.hidden = true;
  const bars = node("div", "unit-frame-bars", root);
  const name = node("strong", "unit-frame-name", bars);
  const health = node("div", "unit-frame-health", bars);
  const fill = node("span", "unit-frame-fill", health), value = node("span", "unit-frame-value", health);
  const stamina = node("div", "unit-frame-stamina", bars); stamina.hidden = true;
  stamina.setAttribute("role", "meter"); stamina.setAttribute("aria-label", "Energy");
  const staminaFill = node("span", "unit-frame-stamina-fill", stamina);
  return { root, portrait, name, level, fill, value, stamina, staminaFill };
}
function health(frame: Frame, name: string, current: number, maximum: number, targetId: string, level?: number): void {
  frame.level.hidden = level === undefined;
  if (level !== undefined) { write(frame.level, String(level)); frame.level.setAttribute("aria-label", "Level " + level); }
  write(frame.name, name);
  write(frame.value, current <= 0 ? "Dead" : `${Math.ceil(current)} / ${maximum}`);
  frame.fill.style.width = `${Math.max(0, Math.min(100, current / maximum * 100))}%`;
  Object.assign(frame.root.dataset, { health: String(current), max: String(maximum), targetId });
  frame.root.setAttribute("aria-label", `${name}, ${current <= 0 ? "dead" : `${Math.ceil(current)} of ${maximum} health`}`);
}
function stamina(frame: Frame, player?: AdventureSnapshot["player"]): void {
  frame.stamina.hidden = !player;
  if (!player) return;
  frame.staminaFill.style.width = Math.max(0, Math.min(100, player.stamina / player.maximumStamina * 100)) + "%";
  frame.stamina.setAttribute("aria-valuemin", "0");
  frame.stamina.setAttribute("aria-valuemax", String(player.maximumStamina));
  frame.stamina.setAttribute("aria-valuenow", String(player.stamina));
  frame.stamina.title = "Energy " + player.stamina + " / " + player.maximumStamina;
}
const styles = `
.unit-frames { position:absolute; inset:0; pointer-events:none; color:#f4e5ba; font:var(--ui-font-small)/1.2 system-ui,sans-serif; filter:drop-shadow(0 2px 2px #000b); }
.unit-frame { position:relative; display:flex; align-items:center; height:92px; min-width:0; }
.unit-frame-player,.unit-frame-target-group { position:absolute; width:var(--unit-frame-width); }
.unit-frame-combat-status { position:absolute; z-index:4; left:0; bottom:0; width:30px; height:30px; display:grid; place-items:center; background:#211719; border:2px solid #8e7845; border-radius:50%; color:#dc7370; box-shadow:0 0 3px #210808; }
.unit-frame-rest-status { color:#d9c986; font:600 16px/1 Georgia,serif; letter-spacing:-1px; }
.unit-frame-rest-status sup { font-size:11px; }
.unit-frame-combat-status[hidden] { display:none; }
.unit-frame-combat-status svg { width:22px; height:22px; animation:combat-swords-pulse 2.8s ease-in-out infinite; }
@keyframes combat-swords-pulse { 0%,100% { color:#cf7e77; opacity:.85; } 50% { color:#ed7770; opacity:1; } }
@media(prefers-reduced-motion:reduce) { .unit-frame-combat-status svg { animation:none; } }
.unit-frame-target-group { min-width:0; }
.unit-frames[data-locked=false] .unit-frame-player,.unit-frames[data-locked=false] .unit-frame-target-group { pointer-events:auto; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; }
.unit-frames[data-locked=false] .unit-frame-player::after,.unit-frames[data-locked=false] .unit-frame-target::after { content:""; position:absolute; inset:-4px; border:1px dashed #e1c781; border-radius:5px; pointer-events:none; }
.unit-frames .unit-frame-dragging { cursor:grabbing !important; }
.unit-frame-target[data-preview=true] .unit-frame-image { visibility:hidden; }
.unit-frame-settings { display:grid; gap:8px; margin:14px 0 0; padding:10px; border:1px solid #86734b; border-radius:8px; text-align:left; font-size:var(--ui-font-body); }
.unit-frame-settings label { display:flex; align-items:center; gap:8px; }
.unit-frame-settings small { line-height:1.4; }
#pause-panel > div { max-height:calc(100dvh - 24px); overflow-y:auto; }
.unit-frame-portrait { position:relative; z-index:2; box-sizing:border-box; flex:0 0 82px; width:82px; height:82px; border:4px solid #9b8245; border-radius:50%; background:#111711; box-shadow:inset 0 0 0 2px #15160f,0 0 0 1px #28251b,0 1px 2px #000; overflow:hidden; }
.unit-frame-image { display:block; width:100%; height:100%; object-fit:cover; }
.unit-frame-player .unit-frame-image,.unit-frame-tot .unit-frame-image { object-position:50% 18%; }
.unit-frame-level { position:absolute; z-index:3; left:-4px; bottom:0; box-sizing:border-box; display:grid; place-items:center; width:34px; height:34px; border:2px solid #a08a54; border-radius:50%; background:#141812; box-shadow:0 0 0 1px #292419,inset 0 0 0 1px #37372a; color:#f5e6b8; font:500 20px/1 Georgia,serif; text-shadow:0 1px 2px #000; }
.unit-frame-level[hidden] { display:none; }
.unit-frame-bars { position:relative; z-index:1; flex:1; min-width:0; display:flex; flex-direction:column; margin-left:-14px; padding:0; transform:translateY(4px); }
.unit-frame-name { display:block; height:19px; padding-left:16px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:left; font:600 var(--ui-font-body)/18px Georgia,serif; color:#e7dd9d; text-shadow:0 1px 2px #000,1px 0 2px #000; }
.unit-frame-health { position:relative; height:26px; background:#182314; border:2px solid #595b42; border-radius:0 4px 0 0; box-shadow:0 0 0 1px #10150f,inset 0 0 0 1px #131c0e; overflow:hidden; }
.unit-frame-fill { display:block; height:100%; background:linear-gradient(#87ff26 0%,#64ed0d 20%,#56d807 85%,#43ae05); }
.unit-frame-value { position:absolute; inset:0 0 0 12px; display:grid; place-items:center; color:#fff; text-shadow:0 1px 2px #000,1px 0 2px #000; font:600 var(--ui-font-tiny)/1 system-ui,sans-serif; }
.unit-frame-stamina { height:10px; margin-top:0; background:#101b2c; border:2px solid #595b42; border-top:0; border-radius:0 0 4px 0; box-shadow:0 1px 0 1px #10150f; overflow:hidden; }
.unit-frame-stamina-fill { display:block; height:100%; background:linear-gradient(#287fe6,#1560c8 55%,#1053ac); transition:width .1s linear; }
.unit-frame-stamina[hidden] { display:none; }
.unit-frame-target { flex-direction:row-reverse; }
.unit-frame-target .unit-frame-bars { margin-left:0; margin-right:-14px; }
.unit-frame-target .unit-frame-level { left:auto; right:-4px; }
.unit-frame-target .unit-frame-name { padding-left:0; padding-right:16px; text-align:right; }
.unit-frame-target .unit-frame-health { border-radius:4px 0 0 0; }
.unit-frame-target .unit-frame-stamina { border-radius:0 0 0 4px; }
.unit-frame-target .unit-frame-value { inset:0 12px 0 0; }
.unit-frame-target[data-hostile=true] .unit-frame-name { color:#ffbc8c; }
.unit-frame-target[data-kind=player] .unit-frame-image { object-position:50% 18%; }
.unit-frame-tot { margin-top:24px; margin-left:auto; width:150px; height:47px; }
.unit-frame-tot .unit-frame-portrait { flex-basis:43px; width:43px; height:43px; border-width:2px; }
.unit-frame-tot .unit-frame-bars { margin-left:-8px; transform:none; }
.unit-frame-tot .unit-frame-name { padding-left:10px; font-size:var(--ui-font-tiny); line-height:12px; height:12px; }
.unit-frame-tot .unit-frame-health { height:14px; border-width:1px; }
.unit-frame-tot .unit-frame-stamina { height:5px; border-width:1px; border-top:0; }
.unit-frame-tot .unit-frame-level { width:20px; height:20px; font-size:12px; left:-2px; }
.unit-frame-tot .unit-frame-value { font-size:var(--ui-font-tiny); line-height:12px; }
.unit-frame[hidden],.unit-frame-target-group[hidden] { display:none; }
@media(max-width:700px) { .unit-frame-portrait { flex-basis:58px; width:58px; height:58px; border-width:3px; } .unit-frame { height:70px; } .unit-frame-level { width:26px; height:26px; font-size:16px; } .unit-frame-name { font-size:var(--ui-font-tiny); } .unit-frame-health { height:20px; } .unit-frame-stamina { height:7px; } .unit-frame-tot { width:130px; height:47px; } }
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
  combatStatus.hidden = true; combatStatus.setAttribute('role','img'); combatStatus.setAttribute('aria-label','In combat'); combatStatus.title = 'In combat';
  combatStatus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="#30191a" stroke-width=".6"><path d="M3 2l4 1 10 13-2 2L3 6zM12 16l2-2 6 5-2 2zM16 20l2-2 4 3-2 2z"/><path d="M21 2l-4 1L7 16l2 2L21 6zM12 16l-2-2-6 5 2 2zM8 20l-2-2-4 3 2 2z"/></g></svg>';
  const restingStatus = node('span','unit-frame-combat-status unit-frame-rest-status',player.root);
  restingStatus.id='player-rest-status';restingStatus.hidden=true;restingStatus.title='Resting in town';
  restingStatus.setAttribute('role','img');restingStatus.setAttribute('aria-label','Resting');restingStatus.innerHTML='<span aria-hidden="true">z<sup>zz</sup></span>';
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
  document.querySelector("#pause-settings")?.append(panel);
  const locked = panel.querySelector<HTMLInputElement>("#unit-frames-locked")!;
  const mirrored = panel.querySelector<HTMLInputElement>("#unit-frames-mirrored")!;
  let drag: { side: FrameSide; element: HTMLElement; pointerId: number; dx: number; dy: number } | null = null;
  const placements: Record<FrameSide, FramePosition> = { player: { x: 0, y: 0 }, target: { x: 0, y: 0 } };
  function dimensions() {
    const width = window.innerWidth, height = window.innerHeight;
    const small = width <= 700;
    const slotWidth = small ? Math.min(280, (width - 20 - Math.max(70, width * 0.2)) / 2) : Math.min(280, (width - 188) / 2);
    const frameHeight = small ? 70 : 92;
    return { width, height, slotWidth, frameWidth: Math.max(1, slotWidth), frameHeight, groupHeight: frameHeight + 71 };
  }
  function fit(position: FramePosition): FramePosition {
    const { width, height, frameWidth, groupHeight } = dimensions();
    const marginX = Math.min(8, Math.max(0, (width - frameWidth) / 2));
    const marginY = Math.min(8, Math.max(0, (height - groupHeight) / 2));
    const x = Math.max(marginX, Math.min(width - frameWidth - marginX, position.x));
    let y = Math.max(marginY, Math.min(height - groupHeight - marginY, position.y));
    const plan = host.querySelector<HTMLElement>("#combat-plan");
    if (plan && !plan.hidden) {
      const bounds = plan.getBoundingClientRect();
      if (x < bounds.right && x + frameWidth > bounds.left && y < bounds.bottom && y + groupHeight + 12 > bounds.top) {
        y = Math.max(marginY, bounds.top - groupHeight - 12);
      }
    }
    return { x, y };
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
    const { width, height, slotWidth, frameWidth, frameHeight, groupHeight } = dimensions();
    const slotSpan = width <= 700 ? width - 20 : Math.min(820, width - 28);
    const span = (slotSpan - slotWidth) * 0.9 * 0.95 + frameWidth;
    const plan = host.querySelector<HTMLElement>("#combat-plan");
    const planTop = plan && !plan.hidden ? plan.getBoundingClientRect().top : height;
    const defaultY = Math.min(height - (294 * 0.9 * 1.05 + (width <= 850 ? 146 : 0)) - frameHeight, planTop - groupHeight - 12);
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
    stamina(target); target.level.hidden = true;
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
    layout,
    portrait(id: string) { return portraits.get(id); },
    update(character: LocalCharacter, snapshot: AdventureSnapshot, others: readonly RemotePlayerView[] = [], friendly?: RemotePlayerView): void {
      if (disposed) return;
      if (archetype !== character.archetype) {
        archetype = character.archetype;
        player.portrait.src = targetOfTarget.portrait.src = publicUrl(`assets/ui/characters/${archetype}.webp`);
      }
      health(player, character.name, snapshot.player.health, snapshot.player.maximumHealth, character.id, snapshot.progression.level);
      stamina(player, snapshot.player);
      player.root.dataset.inCombat = String(snapshot.player.inCombat);
      combatStatus.hidden = !snapshot.player.inCombat;
      restingStatus.hidden = snapshot.player.inCombat || snapshot.phase !== "town" || snapshot.player.health <= 0;
      player.level.hidden = snapshot.player.inCombat || !restingStatus.hidden;
      if (friendly) {
        selectedId = "player:" + friendly.id; targetGroup.hidden = false;
        target.root.dataset.preview = "false"; target.root.dataset.kind = "player";
        Object.assign(target.root.dataset, { hostile: "false", aggro: "false", disposition: "friendly", archetype: friendly.player.archetype });
        const image = publicUrl("assets/ui/characters/" + friendly.player.archetype + ".webp");
        if (target.portrait.getAttribute("src") !== image) target.portrait.src = image;
        health(target, friendly.name, friendly.player.health, friendly.player.maximumHealth, friendly.id, friendly.player.level);
        stamina(target, friendly.player);
        targetCast.root.hidden = true; targetOfTarget.root.hidden = true;
        return;
      }
      stamina(target);
      target.root.dataset.kind = "enemy"; delete target.root.dataset.archetype;
      const enemy = snapshot.threats.find(threat => threat.id === snapshot.selectedThreat && (threat.health > 0 ? threat.active : threat.corpseVisible));
      if (!enemy) { selectedId = ""; preview(); return; }
      targetGroup.hidden = false;
      target.root.dataset.preview = "false";
      if (selectedId !== enemy.id) {
        selectedId = enemy.id;
        const image = portraits.get(enemy.id);
        if (image) target.portrait.src = image; else target.portrait.removeAttribute("src");
      }
      health(target, enemy.name, enemy.health, enemy.maximumHealth, enemy.id, enemy.level);
      targetCast.render(enemy, snapshot, { selfId: character.id, players: others });
      Object.assign(target.root.dataset, { hostile: String(enemy.disposition === "hostile" || enemy.aggro), aggro: String(enemy.aggro), disposition: enemy.disposition });
      const recipient = enemy.targetPlayerId && enemy.targetPlayerId !== character.id ? others.find(other => other.id === enemy.targetPlayerId) : {id:character.id,name:character.name,player:snapshot.player};
      const attackingPlayer = enemy.aggro && enemy.health > 0 && recipient && recipient.player.health > 0;
      targetOfTarget.root.hidden = !attackingPlayer;
      if (attackingPlayer && recipient) {
        targetOfTarget.portrait.src = publicUrl('assets/ui/characters/' + recipient.player.archetype + '.webp');
        health(targetOfTarget, recipient.name, recipient.player.health, recipient.player.maximumHealth, recipient.id, recipient.player.level);
        stamina(targetOfTarget, recipient.player);
      }
    },
    dispose(): void { if (disposed) return; disposed = true; endDrag(); listeners.abort(); panel.remove(); root.remove(); style.remove(); },
  };
}
