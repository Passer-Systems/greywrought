import type { AdventureSnapshot } from "../game/adventure-types.js";

export interface InnPanel {
  update(snapshot: AdventureSnapshot, open: boolean): void;
  dispose(): void;
}

export function createInnPanel(
  host: HTMLElement,
  callbacks: { readonly onRest: () => void; readonly onClose: () => void },
): InnPanel {
  const panel = document.createElement("section");
  panel.id = "inn-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "inn-title");
  panel.innerHTML = `
    <style>
      #inn-panel { position:absolute; top:26%; left:50%; transform:translateX(-50%); z-index:45; box-sizing:border-box; width:min(320px,calc(100% - 24px)); padding:0 0 14px; border:3px ridge #79796f; border-radius:5px; background:#17201bf5; color:#f5e6c8; box-shadow:0 8px 30px #0008; pointer-events:auto; font:13px/1.5 system-ui,sans-serif; }
      #inn-panel[hidden] { display:none; }
      #inn-panel p { margin:10px 14px; }
      #inn-panel .inn-host { margin:12px 14px; color:#d4b887; font-size:12px; }
      #inn-panel .inn-health { color:#c8dfd7; font-size:12px; }
      #inn-rest { color:#ffe6b8; border:2px ridge #938561; border-radius:3px; background:#594832; padding:10px 12px; font:600 13px system-ui,sans-serif; cursor:pointer; }
      #inn-rest:hover { background:#756043; }
      #inn-panel button:focus-visible { outline:2px solid #ffe1a1; outline-offset:3px; }
      #inn-rest { width:calc(100% - 28px); margin:0 14px; }
      #inn-panel .inn-price { display:block; text-align:center; margin-top:5px; color:#d4b887; font-size:11px; }
    </style>
    <header class="rpg-window-header"><h2 id="inn-title" class="rpg-window-title">The Wayfarer’s Rest</h2><button id="inn-close" class="rpg-window-close" type="button" aria-label="Close inn">×</button></header>
    <p class="inn-host">Rowan · Innkeeper</p>
    <p>Come in out of the cold. There’s a warm bed waiting for you.</p>
    <p class="inn-health"></p>
    <button id="inn-rest" type="button">Rest · Restore health</button>
    <span class="inn-price">No charge</span>
  `;
  const rest = panel.querySelector<HTMLButtonElement>("#inn-rest")!;
  const close = panel.querySelector<HTMLButtonElement>("#inn-close")!;
  const health = panel.querySelector<HTMLElement>(".inn-health")!;
  rest.addEventListener("click", callbacks.onRest);
  close.addEventListener("click", callbacks.onClose);
  host.append(panel);
  return {
    update(snapshot, open) {
      panel.hidden = !open;
      health.textContent = `Health ${Math.ceil(snapshot.player.health)} / ${snapshot.player.maximumHealth}`;
    },
    dispose() {
      rest.removeEventListener("click", callbacks.onRest);
      close.removeEventListener("click", callbacks.onClose);
      panel.remove();
    },
  };
}
