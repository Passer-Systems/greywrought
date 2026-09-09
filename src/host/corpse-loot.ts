import type { AdventureSnapshot } from "../game/adventure-types.js";

export interface CorpseLoot {
  update(snapshot: AdventureSnapshot): void;
  dispose(): void;
}

export function createCorpseLoot(host: HTMLElement, callbacks: { onTake(): void; onClose(): void }): CorpseLoot {
  const style = document.createElement("style");
  style.textContent = `
    #loot-window { position:absolute; z-index:24; left:50%; top:56%; transform:translate(-50%,-50%); width:min(284px,calc(100% - 28px)); padding:12px; border:1px solid #b99a5e; border-radius:6px; color:#f9ecd2; background:#16201ef5; box-shadow:0 8px 24px #0008; font:14px Georgia,serif; }
    #loot-window[hidden], #corpse-loot-prompt[hidden] { display:none; }
    #loot-window header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    #loot-close { border:0; background:transparent; color:#efddb5; padding:0 5px; font-size:23px; cursor:pointer; }
    #loot-item { display:flex; align-items:center; gap:12px; width:100%; text-align:left; border:1px solid #8d774c; border-radius:4px; padding:10px; background:#354638; color:#fff0cb; cursor:pointer; }
    #loot-item:hover, #loot-item:focus-visible { background:#4d624a; outline:2px solid #dbc289; }
    #loot-item-icon { font-size:28px; color:#ffe09a; }
    #loot-item strong, #loot-item small { display:block; }
    #loot-item small { margin-top:4px; color:#cfddc8; font-size:12px; }
    #loot-window p { margin:10px 0 0; font:12px/1.45 system-ui,sans-serif; color:#d0c8b8; }
    #corpse-loot-prompt { position:absolute; z-index:18; bottom:160px; left:50%; transform:translateX(-50%); border:1px solid #b99a5e; border-radius:4px; padding:7px 12px; color:#ffe8ae; background:#15211ded; font:14px Georgia,serif; pointer-events:none; white-space:nowrap; }
  `;
  const panel = document.createElement("section");
  panel.id = "loot-window";
  panel.setAttribute("aria-label", "Corpse loot");
  panel.hidden = true;
  const header = document.createElement("header");
  const title = document.createElement("strong");
  const close = document.createElement("button");
  close.id = "loot-close"; close.type = "button"; close.textContent = "×";
  close.setAttribute("aria-label", "Close loot window");
  header.append(title, close);
  const take = document.createElement("button");
  take.id = "loot-item"; take.type = "button";
  const icon = document.createElement("span");
  icon.id = "loot-item-icon"; icon.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  const name = document.createElement("strong"); name.id = "loot-item-name";
  const category = document.createElement("small"); category.id = "loot-item-category";
  copy.append(name, category); take.append(icon, copy);
  const hint = document.createElement("p");
  hint.textContent = "Click the item to take it. Return alive to keep it.";
  panel.append(header, take, hint);
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
        name.textContent = `${loot.itemName} ×${loot.quantity}`;
        icon.textContent = loot.kind === "relic" ? "✧" : "◈";
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
