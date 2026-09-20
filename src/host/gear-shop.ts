import type { AdventureSnapshot } from "../game/adventure-types.js";
import { VENDORS, type VendorId } from "../game/economy.js";
import { GEAR, gearName, type GearItemId } from "../game/yard-content.js";
import { publicUrl } from "./public-url.js";

export function createGearShop(host: HTMLElement, callbacks: { onBuy(vendor: VendorId, item: GearItemId): void; onClose(): void }) {
  const style = document.createElement("style");
  style.textContent = `
    #gear-shop { position:absolute; z-index:26; left:50%; top:28%; transform:translateX(-50%); width:min(340px,calc(100% - 30px)); border:3px ridge #858273; border-radius:5px; background:#18231eef; color:#e7dfc9; box-shadow:0 8px 28px #000b; pointer-events:auto; }
    #gear-shop[hidden] { display:none; }
    #gear-shop .gear-offer { padding:18px; }
    #gear-shop img { float:left; width:48px; height:48px; margin:0 12px 12px 0; border:1px solid #c5ac68; }
    #gear-shop h3 { margin:0; color:#e3ce91; }
    #gear-shop p { line-height:1.5; }
    #gear-buy { width:100%; padding:9px; background:#354b30; color:#f3e2b0; border:2px ridge #a69567; cursor:pointer; }
    #gear-buy:disabled { opacity:.6; cursor:default; }
    #experience-hud { position:absolute; left:22px; top:156px; width:248px; max-width:38vw; color:#f1e7cb; font:12px/1.5 system-ui,sans-serif; text-shadow:0 1px 3px #000; pointer-events:none; z-index:6; }
    #experience-hud progress { display:block; width:100%; height:10px; accent-color:#c5a3fa; }
    #experience-hud progress::-webkit-progress-bar { background:#1a1429; border:1px solid #92809e; }
    #experience-hud progress::-webkit-progress-value { background:linear-gradient(90deg,#7252a3,#c7a0ef); }
    #experience-hud output { display:block; min-height:20px; color:#ffe39a; font-weight:700; }
    @media(max-width:700px) { #experience-hud { left:12px; top:132px; width:190px; } }
  `;
  const panel = document.createElement("section"); panel.id = "gear-shop"; panel.hidden = true; panel.setAttribute("aria-label", "Equipment shop");
  panel.innerHTML = `<header class="rpg-window-header"><strong id="gear-shop-title" class="rpg-window-title"></strong><button type="button" class="rpg-window-close" id="gear-shop-close" aria-label="Close equipment shop">×</button></header><div class="gear-offer"><img id="gear-shop-icon" alt=""><h3 id="gear-shop-name"></h3><p id="gear-shop-description"></p><p id="gear-shop-balance"></p><button id="gear-buy" type="button"></button></div>`;
  const hud = document.createElement("section"); hud.id = "experience-hud"; hud.setAttribute("aria-label", "Experience and coins");
  hud.innerHTML = `<span id="experience-label"></span><progress id="experience-bar" aria-label="Experience to next level" value="0" max="100"></progress><span id="coin-balance"></span><output id="level-up-notice" aria-live="polite"></output>`;
  host.append(style, panel, hud);
  const title = panel.querySelector<HTMLElement>("#gear-shop-title")!, name = panel.querySelector<HTMLElement>("#gear-shop-name")!, description = panel.querySelector<HTMLElement>("#gear-shop-description")!, balance = panel.querySelector<HTMLElement>("#gear-shop-balance")!, icon = panel.querySelector<HTMLImageElement>("#gear-shop-icon")!, buy = panel.querySelector<HTMLButtonElement>("#gear-buy")!, close = panel.querySelector<HTMLButtonElement>("#gear-shop-close")!;
  const label = hud.querySelector<HTMLElement>("#experience-label")!, bar = hud.querySelector<HTMLProgressElement>("#experience-bar")!, coins = hud.querySelector<HTMLElement>("#coin-balance")!, notice = hud.querySelector<HTMLOutputElement>("#level-up-notice")!;
  const text = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
  let current: typeof VENDORS[number] | undefined, previousLevel: number | undefined, noticeUntil = 0;
  const purchase = () => { if (current) callbacks.onBuy(current.id, current.item); };
  const stop = (event: Event) => event.stopPropagation();
  panel.addEventListener("pointerdown", stop); panel.addEventListener("click", stop);
  buy.addEventListener("click", purchase); close.addEventListener("click", callbacks.onClose);
  return {
    reset() { previousLevel = undefined; noticeUntil = 0; panel.hidden = true; },
    update(snapshot: AdventureSnapshot) {
      const p = snapshot.progression;
      text(label, `Level ${p.level} · ${p.levelExperience} / ${p.nextLevelExperience} XP`);
      bar.max = p.nextLevelExperience; bar.value = p.levelExperience;
      text(coins, `${snapshot.coins} coins`);
      if (previousLevel !== undefined && p.level > previousLevel) { text(notice, `Level up! Level ${p.level}`); noticeUntil = performance.now() + 5000; }
      previousLevel = p.level;
      if (performance.now() > noticeUntil) text(notice, "");
      current = VENDORS.find(v => v.id === snapshot.vendorOpen); panel.hidden = !current;
      if (!current) return;
      panel.dataset.vendor = current.id;
      text(title, `${current.name} · ${current.trade}`); text(name, gearName(current.item, snapshot.player.archetype));
      text(description, GEAR[current.item].description); text(balance, `Your purse: ${snapshot.coins} coins`);
      const src = publicUrl(`assets/ui/icons/${GEAR[current.item].icon}.png`); if (icon.getAttribute("src") !== src) icon.src = src;
      const owned = p.ownedGear.includes(current.item); buy.disabled = owned || snapshot.coins < current.price;
      text(buy, owned ? "Owned · Equip from your bags" : snapshot.coins < current.price ? `Need ${current.price} coins` : `Buy · ${current.price} coins`);
    },
    dispose() { buy.removeEventListener("click", purchase); close.removeEventListener("click", callbacks.onClose); panel.remove(); hud.remove(); style.remove(); },
  };
}
