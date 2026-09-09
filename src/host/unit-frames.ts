import type { RemotePlayerView } from "../game/multiplayer-types.js";
import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";
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
.unit-frames { position:absolute; bottom:310px; height:66px; left:50%; transform:translateX(-50%); width:min(820px, calc(100% - 28px)); display:grid; grid-template-columns:minmax(0,250px) minmax(160px,320px) minmax(0,250px); align-items:start; pointer-events:none; color:#f4e5ba; font:var(--ui-font-small)/1.2 system-ui,sans-serif; filter:drop-shadow(0 2px 2px #000b); }
.unit-frame { position:relative; display:flex; align-items:center; height:66px; min-width:0; }
.unit-frame-player { grid-column:1; }
.unit-frame-target-group { grid-column:3; min-width:0; }
.unit-frame-portrait { z-index:1; flex:0 0 66px; width:66px; height:66px; border:3px solid #a69768; border-radius:50%; background:#203035; box-shadow:inset 0 0 0 2px #211d18,0 0 0 1px #252721; overflow:hidden; }
.unit-frame-image { display:block; width:100%; height:100%; object-fit:cover; }
.unit-frame-player .unit-frame-image,.unit-frame-tot .unit-frame-image { object-position:50% 18%; }
.unit-frame-bars { flex:1; min-width:0; margin-left:-5px; padding:3px 4px 3px 8px; border:2px solid #888579; border-radius:3px; background:linear-gradient(#393b36,#141b1c); box-shadow:0 0 0 1px #1a1815,inset 0 0 0 1px #b9ae7040; }
.unit-frame-name { display:block; height:17px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:center; font:600 var(--ui-font-body)/16px Georgia,serif; color:#f4dda4; text-shadow:0 1px 2px #000; }
.unit-frame-health { position:relative; height:14px; margin-top:1px; background:#14201a; border:1px solid #121612; box-shadow:0 0 0 1px #90855a; overflow:hidden; }
.unit-frame-fill { display:block; height:100%; background:linear-gradient(#72c650,#3d912b 50%,#256d27); }
.unit-frame-value { position:absolute; inset:0; text-align:center; color:#fff; text-shadow:0 1px 2px #000,1px 0 2px #000; font:600 var(--ui-font-tiny)/12px system-ui,sans-serif; }
.unit-frame-target { flex-direction:row-reverse; }
.unit-frame-target .unit-frame-bars { margin-left:0; margin-right:-5px; padding-left:4px; padding-right:8px; }
.unit-frame-target[data-hostile=true] .unit-frame-name { background:linear-gradient(#9f2927,#651a1e); color:#ffe0c2; }
.unit-frame-target[data-hostile=true] .unit-frame-fill { background:linear-gradient(#da5353,#ac3338 50%,#80202b); }
.unit-frame-target[data-hostile=false] .unit-frame-fill { background:linear-gradient(#e0ce51,#b19a2a 50%,#8e791d); }
.unit-frame-target[data-hostile=false] .unit-frame-name { color:#f8df73; }
.unit-frame-tot { margin-top:2px; margin-left:auto; width:150px; height:39px; }
.unit-frame-tot .unit-frame-portrait { flex-basis:37px; width:37px; height:37px; border-width:2px; }
.unit-frame-tot .unit-frame-bars { padding:2px 3px 2px 7px; border-width:1px; }
.unit-frame-tot .unit-frame-name { font-size:var(--ui-font-tiny); line-height:12px; height:12px; }
.unit-frame-tot .unit-frame-health { height:14px; }
.unit-frame-tot .unit-frame-value { font-size:var(--ui-font-tiny); line-height:12px; }
.unit-frame[hidden],.unit-frame-target-group[hidden] { display:none; }
@media(max-width:850px) { .unit-frames {bottom:456px;} }
@media(max-width:700px) { .unit-frames { width:calc(100% - 20px); grid-template-columns:minmax(0,1fr) minmax(70px,20vw) minmax(0,1fr); height:52px; } .unit-frame-portrait { flex-basis:48px; width:48px; height:48px; } .unit-frame { height:52px; } .unit-frame-name { font-size:var(--ui-font-tiny); } .unit-frame-tot { width:130px; height:37px; } }
`;

export function createUnitFrames(host: HTMLElement) {
  const style = node("style", "", host); style.textContent = styles;
  const root = node("div", "unit-frames", host);
  const player = makeFrame(root, "player-frame", "player");
  const targetGroup = node("div", "unit-frame-target-group", root); targetGroup.hidden = true;
  const target = makeFrame(targetGroup, "target-frame", "target");
  const targetOfTarget = makeFrame(targetGroup, "target-of-target-frame", "tot"); targetOfTarget.root.hidden = true;
  let disposed = false, portraits: ReadonlyMap<string, string> = new Map();
  let selectedId = "", archetype = "";
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
      const enemy = snapshot.threats.find(threat => threat.id === snapshot.selectedThreat && threat.active);
      targetGroup.hidden = !enemy;
      if (!enemy) { selectedId = ""; targetOfTarget.root.hidden = true; return; }
      if (selectedId !== enemy.id) {
        selectedId = enemy.id;
        const image = portraits.get(enemy.id);
        if (image) target.portrait.src = image; else target.portrait.removeAttribute("src");
      }
      health(target, enemy.name, enemy.health, enemy.maximumHealth, enemy.id);
      Object.assign(target.root.dataset, { hostile: String(enemy.disposition === "hostile" || enemy.aggro), aggro: String(enemy.aggro), disposition: enemy.disposition });
      const recipient = enemy.targetPlayerId && enemy.targetPlayerId !== character.id ? others.find(other => other.id === enemy.targetPlayerId) : {id:character.id,name:character.name,player:snapshot.player};
      const attackingPlayer = enemy.aggro && enemy.health > 0 && recipient && recipient.player.health > 0;
      targetOfTarget.root.hidden = !attackingPlayer;
      if (attackingPlayer && recipient) {
        targetOfTarget.portrait.src = publicUrl('assets/ui/characters/' + recipient.player.archetype + '.webp');
        health(targetOfTarget, recipient.name, recipient.player.health, recipient.player.maximumHealth, recipient.id);
      }
    },
    dispose(): void { if (disposed) return; disposed = true; root.remove(); style.remove(); },
  };
}
