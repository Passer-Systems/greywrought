import type { AdventureSnapshot } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";

export interface CorpseLoot {
  update(snapshot: AdventureSnapshot): void;
  dispose(): void;
}

export function createCorpseLoot(host: HTMLElement, callbacks: { onTake(): void; onClose(): void }): CorpseLoot {
  const style = document.createElement("style");
  style.textContent = `
    #loot-window { position:absolute; z-index:24; left:50%; top:52%; transform:translate(-50%,-50%); display:grid; grid-template-rows:27px 1fr auto; width:min(236px,calc(100% - 28px)); min-height:282px; padding:0; border:3px ridge #78796b; border-radius:5px; color:#e5e0d1; background:repeating-linear-gradient(115deg,#171a19 0px,#171a19 2px,#191c1b 3px,#191c1b 5px); box-shadow:0 0 0 1px #171912,0 8px 28px #000b,inset 0 0 14px #000; font:14px Georgia,serif; pointer-events:auto; }
    #loot-window[hidden], #corpse-loot-prompt[hidden] { display:none; }
    #loot-source-name { position:absolute; bottom:calc(100% + 9px); left:0; max-width:100%; color:#ddd6bc; text-shadow:0 2px 3px #000,1px 0 #000; font:16px Georgia,serif; white-space:nowrap; }
    #loot-window header { --window-emblem-space:58px; }
    #loot-skull { position:absolute; left:-9px; top:-14px; width:68px; height:68px; display:grid; place-items:center; border:5px ridge #9b9265; border-radius:50%; background:radial-gradient(#252c24,#020503); color:#cbcbb8; font:47px/1 Georgia,serif; text-shadow:2px 2px #000; box-shadow:0 2px 6px #000; }
    #loot-item { align-self:start; display:flex; align-items:center; gap:9px; width:calc(100% - 20px); margin:32px 10px 10px; min-height:49px; text-align:left; border:1px solid #666c62; border-radius:3px; padding:3px; background:linear-gradient(90deg,#31383199,#101412bb); color:#e1dfd5; cursor:pointer; }
    #loot-item:hover, #loot-item:focus-visible { background:#3a423799; outline:1px solid #c2ad69; }
    #loot-item-icon { position:relative; width:42px; height:42px; flex:0 0 42px; border:2px ridge #8695ab; background:#10151c; }
    #loot-item-icon img { display:block; width:100%; height:100%; object-fit:cover; }
    #loot-item-quantity { position:absolute; right:1px; bottom:-2px; color:white; font:bold 14px system-ui; text-shadow:-1px -1px #000,1px 1px #000,0 0 3px #000; }
    #loot-item strong, #loot-item small { display:block; }
    #loot-item strong { font:14px/1.25 Georgia,serif; }
    #loot-item small { margin-top:4px; color:#9eaaa0; font:10px system-ui; }
    #loot-window p { margin:10px; text-align:center; font:10px/1.45 system-ui,sans-serif; color:#8b9288; }
    #corpse-loot-prompt { position:absolute; z-index:18; bottom:160px; left:50%; transform:translateX(-50%); border:1px solid #b99a5e; border-radius:4px; padding:7px 12px; color:#ffe8ae; background:#15211ded; font:14px Georgia,serif; pointer-events:none; white-space:nowrap; }
  `;
  const panel = document.createElement("section");
  panel.id = "loot-window";
  panel.setAttribute("aria-label", "Corpse loot");
  panel.hidden = true;
  const header = document.createElement("header");
  header.className = "rpg-window-header";
  const title = document.createElement("strong");
  title.id = "loot-source-name";
  const skull = document.createElement("span");
  skull.id = "loot-skull"; skull.textContent = "☠"; skull.setAttribute("aria-hidden", "true");
  const heading = document.createElement("span"); heading.textContent = "Items";
  heading.className = "rpg-window-title";
  const close = document.createElement("button");
  close.id = "loot-close"; close.type = "button"; close.textContent = "×";
  close.className = "rpg-window-close";
  close.setAttribute("aria-label", "Close loot window");
  header.append(skull, heading, close);
  const take = document.createElement("button");
  take.id = "loot-item"; take.type = "button";
  const icon = document.createElement("span");
  icon.id = "loot-item-icon"; icon.setAttribute("aria-hidden", "true");
  const itemImage = document.createElement("img"); itemImage.alt = "";
  const quantity = document.createElement("span"); quantity.id = "loot-item-quantity";
  icon.append(itemImage, quantity);
  const copy = document.createElement("span");
  const name = document.createElement("strong"); name.id = "loot-item-name";
  const category = document.createElement("small"); category.id = "loot-item-category";
  copy.append(name, category); take.append(icon, copy);
  const hint = document.createElement("p");
  hint.textContent = "Click to take · Return alive to keep";
  panel.append(title, header, take, hint);
  const prompt = document.createElement("div");
  prompt.id = "corpse-loot-prompt"; prompt.hidden = true;
  const stopPointer = (event: Event): void => event.stopPropagation();
  panel.addEventListener("pointerdown", stopPointer);
  panel.addEventListener("click", stopPointer);
  take.addEventListener("click", callbacks.onTake);
  close.addEventListener("click", callbacks.onClose);
  host.append(style, panel, prompt);
  return {
    update(snapshot) {
      const loot = snapshot.loot.find(item => item.sourceId === snapshot.lootOpenId && item.available && item.reachable);
      panel.hidden = !loot;
      if (loot) {
        panel.dataset.lootSource = loot.sourceId;
        panel.dataset.lootQuantity = String(loot.quantity);
        title.textContent = loot.sourceName;
        name.textContent = loot.itemName;
        quantity.textContent = String(loot.quantity);
        const itemSrc = publicUrl(`assets/ui/icons/items/${loot.kind === "relic" ? "blue-gem" : "leather-satchel"}.png`);
        if (itemImage.getAttribute("src") !== itemSrc) itemImage.src = itemSrc;
        category.textContent = loot.kind === "relic" ? "Relic · carry home" : `${loot.quantity} supply on safe return`;
      } else {
        delete panel.dataset.lootSource; delete panel.dataset.lootQuantity;
      }
      const player = snapshot.player.position;
      const nearest = snapshot.loot.filter(item => item.available && item.reachable)
        .sort((a, b) => Math.hypot(a.position.x - player.x, a.position.z - player.z) - Math.hypot(b.position.x - player.x, b.position.z - player.z))[0];
      prompt.hidden = !!loot || !nearest;
      if (nearest) prompt.textContent = `F · Search ${nearest.sourceName}`;
    },
    dispose() {
      take.removeEventListener("click", callbacks.onTake);
      close.removeEventListener("click", callbacks.onClose);
      panel.removeEventListener("pointerdown", stopPointer);
      panel.removeEventListener("click", stopPointer);
      panel.remove(); prompt.remove(); style.remove();
    },
  };
}
