import type { AdventureSnapshot } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";

const itemTypes = [
  { id: "potions", name: "Health potion", icon: "health-potion-red" },
  { id: "cargo", name: "Frost cores", icon: "blue-gem" },
  { id: "carriedSalvage", name: "Forest salvage", icon: "leather-satchel" },
  { id: "carriedRelics", name: "Frost relic", icon: "purple-crystal" },
] as const;
type Item = typeof itemTypes[number];

export function createBagPanel(host: HTMLElement, callbacks: { onUsePotion(): void; onClose(): void }) {
  const style = document.createElement("style");
  style.textContent = `
    #bag-panel { position:absolute; z-index:28; right:18px; bottom:154px; width:278px; max-width:calc(100% - 24px); max-height:calc(100% - 174px); overflow:auto; padding:8px 10px 10px; border:5px ridge #78796b; border-radius:8px; color:#e5e0d1; background:repeating-linear-gradient(115deg,#171a19 0px,#171a19 2px,#191c1b 3px,#191c1b 5px); box-shadow:0 0 0 1px #171912,0 8px 28px #000b,inset 0 0 14px #000; font:12px Georgia,serif; pointer-events:auto; }
    #bag-panel[hidden], #bag-panel [hidden] { display:none; }
    #bag-panel header { position:relative; display:flex; align-items:center; justify-content:center; height:30px; margin-bottom:10px; border:3px ridge #6b6e66; border-radius:4px; background:linear-gradient(#252724,#090c0b); color:#e4ce7a; text-shadow:0 1px #000; }
    #bag-panel h2 { margin:0; font:bold 16px Georgia,serif; }
    #bag-close { position:absolute; right:-5px; top:-5px; display:grid; place-items:center; width:27px; height:27px; padding:0; border:3px ridge #aca374; border-radius:5px; background:linear-gradient(#9c281b,#4c0b06); color:#e7c864; font:bold 25px/1 Georgia,serif; text-shadow:1px 2px #300; }
    #bag-close:hover { background:#b53c25; }
    #bag-panel button { cursor:pointer; }
    #bag-panel button:focus-visible { outline:2px solid #ebcc7d; outline-offset:2px; }
    #bag-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; padding:5px; border:2px groove #626658; background:#080c0b; }
    #bag-panel [data-bag-slot] { position:relative; display:block; aspect-ratio:1; width:100%; min-width:0; padding:2px; border:2px ridge #747c70; border-radius:3px; background:radial-gradient(#222821,#090d0b); box-shadow:inset 0 0 6px #000; }
    #bag-panel [data-bag-slot]:disabled { border-color:#3f493d; cursor:default; }
    #bag-panel [data-bag-item]:hover, #bag-panel [data-bag-slot][aria-pressed="true"] { border-color:#e4c978; box-shadow:0 0 4px #c2ad6980,inset 0 0 5px #c2ad6940; }
    #bag-panel [data-bag-slot] img:not([hidden]) { display:block; width:100%; height:100%; object-fit:contain; }
    #bag-panel .bag-stack { position:absolute; bottom:0; right:2px; color:#fff; font:bold 14px/1 system-ui,sans-serif; text-shadow:-1px -1px #000,1px 1px #000,0 0 3px #000; }
    #bag-details { margin-top:9px; min-height:93px; padding:8px; border:1px solid #626658; background:#0b100dd9; }
    #bag-item-name { display:block; color:#ead9a6; font:14px Georgia,serif; }
    #bag-item-description { margin:5px 0 0; color:#aeb7a8; font:11px/1.4 system-ui,sans-serif; }
    #bag-use-potion { width:100%; margin:8px 0 0; padding:5px; border:2px ridge #847b59; border-radius:3px; background:linear-gradient(#3b4e37,#192618); color:#ede0b8; font:12px Georgia,serif; }
    #bag-use-potion:disabled { color:#939989; background:#20261f; cursor:default; }
    #bag-secured { margin:9px 0 0; padding-top:7px; border-top:1px solid #626658; color:#b2b8a8; font:11px/1.5 system-ui,sans-serif; }
    #bag-secured strong { display:block; color:#bfae78; font:11px Georgia,serif; }
    @media(max-width:700px) { #bag-panel { right:12px; bottom:120px; max-height:calc(100% - 140px); } }
  `;
  const panel = document.createElement("section");
  panel.id = "bag-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "bag-title");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.id = "bag-title"; title.textContent = "Backpack";
  const closeButton = document.createElement("button");
  closeButton.id = "bag-close"; closeButton.type = "button"; closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close backpack");
  header.append(title, closeButton);
  const grid = document.createElement("div");
  grid.id = "bag-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "Carried items");
  const details = document.createElement("section");
  details.id = "bag-details"; details.setAttribute("aria-live", "polite");
  const itemName = document.createElement("strong"); itemName.id = "bag-item-name";
  const description = document.createElement("p"); description.id = "bag-item-description";
  const usePotion = document.createElement("button");
  usePotion.id = "bag-use-potion"; usePotion.type = "button";
  details.append(itemName, description, usePotion);
  const secured = document.createElement("p"); secured.id = "bag-secured";
  const securedTitle = document.createElement("strong"); securedTitle.textContent = "Secured in Hearthstead";
  const securedValue = document.createElement("span"); secured.append(securedTitle, securedValue);
  panel.append(header, grid, details, secured);
  host.append(style, panel);
  let snapshot: AdventureSnapshot | null = null;
  let selected: Item["id"] | null = null;
  const slots = Array.from({ length: 16 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.bagSlot = String(index);
    button.setAttribute("aria-controls", "bag-details");
    const image = document.createElement("img"); image.alt = "";
    const count = document.createElement("span"); count.className = "bag-stack"; count.setAttribute("aria-hidden", "true");
    button.append(image, count); grid.append(button);
    const slot: { button: HTMLButtonElement; image: HTMLImageElement; count: HTMLSpanElement; item: Item | null } = { button, image, count, item: null };
    button.addEventListener("click", () => {
      if (!slot.item || !snapshot) return;
      selected = slot.item.id;
      update(snapshot);
    });
    return slot;
  });
  function setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }
  function update(next: AdventureSnapshot): void {
    snapshot = next;
    const carried = itemTypes.filter(item => next[item.id] > 0);
    if (!carried.some(item => item.id === selected)) selected = carried[0]?.id ?? null;
    slots.forEach((slot, index) => {
      const item = carried[index];
      slot.item = item ?? null;
      slot.button.disabled = !item;
      slot.button.setAttribute("aria-pressed", String(!!item && item.id === selected));
      slot.image.hidden = !item; slot.count.hidden = !item;
      if (item) {
        slot.button.dataset.bagItem = item.id;
        slot.button.dataset.quantity = String(next[item.id]);
        slot.button.setAttribute("aria-label", `${item.name} × ${next[item.id]}`);
        const src = publicUrl(`assets/ui/icons/items/${item.icon}.png`);
        if (slot.image.src !== src) slot.image.src = src;
        setText(slot.count, String(next[item.id]));
      } else {
        delete slot.button.dataset.bagItem;
        delete slot.button.dataset.quantity;
        slot.button.setAttribute("aria-label", `Empty slot ${index + 1}`);
      }
    });
    const item = carried.find(item => item.id === selected);
    setText(itemName, item ? `${item.name} × ${next[item.id]}` : "Your backpack is empty");
    const copy = !item ? "Gather frost cores, search fallen foes, or buy potions from Mara."
      : item.id === "potions" ? `Restores ${next.potionHealing} health. ${Math.ceil(next.player.health)} / ${next.player.maximumHealth} health.`
      : item.id === "carriedRelics" ? "A relic recovered in Frostwood. Return alive to Hearthstead to secure it."
      : item.id === "cargo" ? "Gathered in Frostwood. Return alive to Hearthstead to turn each core into a supply."
      : "Recovered from fallen foes. Return alive to Hearthstead to turn each salvage into a supply.";
    setText(description, copy);
    usePotion.hidden = selected !== "potions";
    usePotion.disabled = next.phase === "lost" || next.potions < 1 || next.player.health >= next.player.maximumHealth;
    setText(usePotion, next.player.health >= next.player.maximumHealth ? "Health full" : "Drink potion");
    setText(securedValue, `${next.supplies} supplies · ${next.bankedRelics} relics`);
  }
  const stopPointer = (event: Event): void => event.stopPropagation();
  panel.addEventListener("pointerdown", stopPointer);
  panel.addEventListener("click", stopPointer);
  usePotion.addEventListener("click", callbacks.onUsePotion);
  closeButton.addEventListener("click", callbacks.onClose);
  function close(): void { panel.hidden = true; }
  return {
    get isOpen(): boolean { return !panel.hidden; },
    open(next: AdventureSnapshot): void { update(next); panel.hidden = false; },
    close,
    update,
    dispose(): void {
      usePotion.removeEventListener("click", callbacks.onUsePotion);
      closeButton.removeEventListener("click", callbacks.onClose);
      panel.removeEventListener("pointerdown", stopPointer);
      panel.removeEventListener("click", stopPointer);
      panel.remove(); style.remove();
    },
  };
}
