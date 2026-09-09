import type { AdventureSnapshot } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";
import { createUnitPortraits } from "./unit-portraits.js";

export function createShopPanel(host: HTMLElement, callbacks: { onBuyPotion(): void; onClose(): void }) {
  const panel = document.createElement("section");
  panel.id = "shop-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "shop-title");
  panel.innerHTML = `<style>
    #shop-panel { position:absolute; z-index:44; left:22px; top:22%; width:min(380px,calc(100% - 44px)); padding:0; border:3px ridge #79796f; border-radius:5px; background:linear-gradient(110deg,#242721,#111713 70%); color:#ddd3b9; pointer-events:auto; font:12px/1.45 system-ui; box-shadow:0 8px 25px #0009,inset 0 0 16px #000; }
    #shop-panel[hidden] { display:none; }
    #shop-panel header { --window-emblem-space:60px; }
    #shop-portrait { position:absolute; width:70px; height:70px; left:-9px; top:-14px; border:4px ridge #a4935f; border-radius:50%; background:#263732; object-fit:cover; }
    #shop-panel .shop-stock { display:grid; grid-template-columns:1fr 1fr; gap:8px; min-height:205px; margin:32px 10px 0; align-content:start; }
    #shop-buy-potion { display:grid; grid-template-columns:44px 1fr; gap:7px; padding:5px; min-width:0; text-align:left; border:1px solid #6c6e5e; border-radius:3px; background:#0c140fcc; color:#e9dfc6; cursor:pointer; font:12px/1.35 system-ui; }
    #shop-buy-potion:hover { background:#293425; border-color:#c6b36d; }
    #shop-buy-potion:disabled { opacity:.55; cursor:default; }
    #shop-buy-potion img { width:44px;height:44px;border:2px ridge #948669;border-radius:3px; }
    #shop-buy-potion strong { font-weight:500; } #shop-buy-potion small {display:block;margin-top:4px;color:#e7ce87;}
    #shop-offer { margin:0 10px 12px; font-size:11px;color:#b9c2ad; }
    #shop-panel footer { border-top:2px ridge #676d5e; padding:7px; text-align:right; color:#e6d59b; background:#0c130eb0; }
    #shop-panel .shop-tab { width:92px; margin:0 0 -24px; padding:3px; background:linear-gradient(#413b26,#1b2118); border:2px ridge #897d57;border-radius:0 0 5px 5px;color:#e8d18b;text-align:center;font:13px Georgia; }
    #shop-panel button:focus-visible {outline:2px solid #efd286;outline-offset:2px;}
  </style><header class="rpg-window-header"><img id="shop-portrait" alt="Mara, the apothecary" /><h2 id="shop-title" class="rpg-window-title">Mara</h2><button id="shop-close" class="rpg-window-close" type="button" aria-label="Close shop">×</button></header><div class="shop-stock"><button id="shop-buy-potion" type="button"><img alt="" /><span><strong>Health potion</strong><small></small></span></button></div><p id="shop-offer"></p><footer></footer><div class="shop-tab">Merchant</div>`;
  const buy = panel.querySelector<HTMLButtonElement>("#shop-buy-potion")!;
  buy.querySelector("img")!.src = publicUrl("assets/ui/icons/items/health-potion-red.png");
  const price = buy.querySelector("small")!, offer = panel.querySelector<HTMLElement>("#shop-offer")!, total = panel.querySelector("footer")!;
  const close = panel.querySelector<HTMLButtonElement>("#shop-close")!;
  buy.addEventListener("click", callbacks.onBuyPotion); close.addEventListener("click", callbacks.onClose);
  host.append(panel);
  let disposed = false;
  const ready = createUnitPortraits([["mara", "Cleric"]]).then(images => {
    if (disposed) return;
    const portrait = images.get("mara"); if (portrait) panel.querySelector<HTMLImageElement>("#shop-portrait")!.src = portrait;
  });
  return {
    ready,
    update(snapshot: AdventureSnapshot): void {
      panel.hidden = !snapshot.shopOpen;
      buy.disabled = snapshot.supplies < snapshot.potionPrice;
      const cost = `${snapshot.potionPrice} supplies`;
      if(price.textContent !== cost) price.textContent = cost;
      const description = `Restores ${snapshot.potionHealing} health · ${snapshot.potions} in your bags`;
      if(offer.textContent !== description) offer.textContent = description;
      const supplies = `${snapshot.supplies} supplies`;
      if(total.textContent !== supplies) total.textContent = supplies;
      buy.setAttribute("aria-label", `Buy health potion for ${cost}`);
    },
    dispose(): void { disposed=true; buy.removeEventListener("click",callbacks.onBuyPotion);close.removeEventListener("click",callbacks.onClose);panel.remove(); },
  };
}
