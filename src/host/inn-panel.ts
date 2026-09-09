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
      #inn-panel { position:absolute; top:26%; left:50%; transform:translateX(-50%); z-index:45; box-sizing:border-box; width:min(320px,calc(100% - 24px)); padding:18px; border:1px solid #b99b64; border-radius:5px; background:#17282bf5; color:#f5e6c8; box-shadow:0 8px 30px #0008; pointer-events:auto; font:13px/1.5 system-ui,sans-serif; }
      #inn-panel[hidden] { display:none; }
      #inn-panel h2 { margin:2px 28px 0 0; color:#ffe0a4; font:700 21px/1.2 Georgia,serif; }
      #inn-panel p { margin:10px 0; }
      #inn-panel .inn-host { margin:4px 0 12px; color:#d4b887; font-size:12px; }
      #inn-panel .inn-health { color:#c8dfd7; font-size:12px; }
      #inn-panel button { color:#ffe6b8; border:1px solid #b99b64; border-radius:3px; background:#594832; padding:10px 12px; font:600 13px system-ui,sans-serif; cursor:pointer; }
      #inn-panel button:hover { background:#756043; }
      #inn-panel button:focus-visible { outline:2px solid #ffe1a1; outline-offset:3px; }
      #inn-close { position:absolute; top:10px; right:10px; width:28px; height:28px; padding:0!important; font-size:20px!important; background:none!important; }
      #inn-rest { width:100%; }
      #inn-panel .inn-price { display:block; text-align:center; margin-top:5px; color:#d4b887; font-size:11px; }
    </style>
    <button id="inn-close" type="button" aria-label="Close inn">×</button>
    <h2 id="inn-title">The Wayfarer’s Rest</h2>
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
