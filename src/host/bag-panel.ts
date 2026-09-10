import type { AdventureSnapshot } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";
import { GEAR, YARD, gearName, type GearSlot, type GearItemId } from "../game/yard-content.js";

const itemTypes = [
  { id: "potions", name: "Health potion", icon: "items/health-potion-red.png" },
  { id: "cargo", name: YARD.resource, icon: "items/blue-gem.png" },
  { id: "carriedSalvage", name: "Yard salvage", icon: "items/leather-satchel.png" },
  { id: "carriedRelics", name: "Last Shift Roll", icon: "items/purple-crystal.png" },
  { id: "insulated-coat", name: GEAR["insulated-coat"].name, icon: GEAR["insulated-coat"].icon + ".png" },
  { id: "yard-weapon", name: GEAR["yard-weapon"].name, icon: GEAR["yard-weapon"].icon + ".png" },
] as const;
type Item = typeof itemTypes[number];

export function createBagPanel(host: HTMLElement, callbacks: { onUsePotion(): void; onEquip(slot: GearSlot, item: GearItemId): void; onOpenEquipment?(item: GearItemId): void; onClose(): void }) {
  const style = document.createElement("style");
  style.textContent = `
    #bag-panel { position:absolute; z-index:28; right:18px; bottom:154px; width:calc(4 * var(--ui-slot-size) + 5 * var(--ui-slot-gap) + 6px); max-width:calc(100% - 24px); max-height:calc(100% - 174px); overflow:auto; padding:0; border:3px ridge #78796b; border-radius:5px; color:#e5e0d1; background:repeating-linear-gradient(115deg,#171a19 0px,#171a19 2px,#191c1b 3px,#191c1b 5px); box-shadow:0 0 0 1px #171912,0 8px 28px #000b,inset 0 0 14px #000; font:var(--ui-font-body) Georgia,serif; pointer-events:auto; }
    #bag-panel[hidden], #bag-panel [hidden] { display:none; }
    #bag-panel button { cursor:pointer; }
    #bag-panel button:focus-visible { outline:2px solid #ebcc7d; outline-offset:2px; }
    #bag-grid { display:grid; grid-template-columns:repeat(4,var(--ui-slot-size)); gap:var(--ui-slot-gap); margin:var(--ui-slot-gap); padding:0; border:0; }
    #bag-panel [data-bag-slot] { position:relative; display:block; width:var(--ui-slot-size); height:var(--ui-slot-size); min-width:0; padding:0; border:1px solid #b6aa87; border-radius:0; background:radial-gradient(#222821,#090d0b); box-shadow:inset 0 0 6px #000; }
    #bag-panel [data-bag-slot]:disabled { border-color:#3f493d; cursor:default; }
    #bag-panel [data-bag-item]:hover, #bag-panel [data-bag-slot][aria-pressed="true"] { border-color:#e4c978; box-shadow:0 0 4px #c2ad6980,inset 0 0 5px #c2ad6940; }
    #bag-panel [data-bag-slot][draggable="true"] { cursor:grab; }
    #bag-panel [data-bag-slot][draggable="true"]:active { cursor:grabbing; }
    #bag-panel [data-bag-slot] img { -webkit-user-drag:none; user-select:none; }
    #bag-panel [data-bag-slot][data-drop-target="true"] { border-color:#e0bd77; box-shadow:0 0 0 2px #e0bd7780,inset 0 0 9px #c5a85466; }
    #bag-panel [data-bag-slot] img:not([hidden]) { display:block; width:100%; height:100%; object-fit:contain; }
    #bag-panel .bag-stack { position:absolute; bottom:0; right:2px; color:#fff; font:bold var(--ui-font-prominent)/1 system-ui,sans-serif; text-shadow:-1px -1px #000,1px 1px #000,0 0 3px #000; }
    #bag-details { position:fixed; z-index:60; width:250px; max-width:calc(100vw - 16px); padding:10px 12px; border:2px ridge #96968d; border-radius:4px; background:#151812f5; box-shadow:0 4px 18px #0009; color:#e7e1cb; pointer-events:auto; }
    #bag-details[hidden] { display:none; }
    #bag-item-name { display:block; color:#ead9a6; font:var(--ui-font-prominent) Georgia,serif; }
    #bag-item-description { margin:5px 0 0; color:#aeb7a8; font:var(--ui-font-small)/1.4 system-ui,sans-serif; }
    #bag-use-potion { width:100%; margin:8px 0 0; padding:5px; border:2px ridge #847b59; border-radius:3px; background:linear-gradient(#3b4e37,#192618); color:#ede0b8; font:var(--ui-font-body) Georgia,serif; }
    #bag-use-potion:disabled { color:#939989; background:#20261f; cursor:default; }
    #bag-secured { margin:9px 10px 10px; padding-top:7px; border-top:1px solid #626658; color:#b2b8a8; font:var(--ui-font-small)/1.5 system-ui,sans-serif; }
    #bag-secured strong { display:block; color:#bfae78; font:var(--ui-font-small) Georgia,serif; }
    @media(max-width:700px) { #bag-panel { right:12px; bottom:120px; max-height:calc(100% - 140px); } }
  `;
  const panel = document.createElement("section");
  panel.id = "bag-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "bag-title");
  const header = document.createElement("header");
  header.className = "rpg-window-header";
  const title = document.createElement("h2");
  title.id = "bag-title"; title.textContent = "Backpack";
  title.className = "rpg-window-title";
  const closeButton = document.createElement("button");
  closeButton.id = "bag-close"; closeButton.type = "button"; closeButton.textContent = "×";
  closeButton.className = "rpg-window-close";
  closeButton.setAttribute("aria-label", "Close backpack");
  header.append(title, closeButton);
  const grid = document.createElement("div");
  grid.id = "bag-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "Carried items");
  const details = document.createElement("section");
  details.id = "bag-details"; details.hidden = true; details.setAttribute("aria-live", "polite");
  const itemName = document.createElement("strong"); itemName.id = "bag-item-name";
  const description = document.createElement("p"); description.id = "bag-item-description";
  const usePotion = document.createElement("button");
  usePotion.id = "bag-use-potion"; usePotion.type = "button";
  details.append(itemName, description, usePotion);
  const secured = document.createElement("p"); secured.id = "bag-secured";
  const securedTitle = document.createElement("strong"); securedTitle.textContent = `Secured in ${YARD.settlement}`;
  const securedValue = document.createElement("span"); secured.append(securedTitle, securedValue);
  panel.append(header, grid, secured);
  host.append(style, panel, details);
  let snapshot: AdventureSnapshot | null = null;
  let characterKey = "default";
  let bagOrder: Array<Item["id"] | null> = Array(16).fill(null);
  let dragIndex: number | null = null;
  const layoutKey = () => `greywrought/bag-layout-v1/${characterKey}`;
  const loadLayout = (): void => {
    bagOrder = Array(16).fill(null);
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey()) ?? "null");
      if (Array.isArray(saved)) saved.slice(0, 16).forEach((id, index) => { if (itemTypes.some(item => item.id === id)) bagOrder[index] = id; });
    } catch { /* Use the default empty layout when storage is unavailable. */ }
  };
  const saveLayout = (): void => { try { localStorage.setItem(layoutKey(), JSON.stringify(bagOrder)); } catch { /* The layout still works for this session. */ } };
  let selected: Item["id"] | null = null;
  let pinned = false;
  const slots = Array.from({ length: 16 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.bagSlot = String(index);
    button.addEventListener("dragstart", event => {
      if (!slot.item) { event.preventDefault(); return; }
      dragIndex = index;
      details.hidden = true; pinned = false;
      event.dataTransfer?.setData("application/x-greywrought-bag-item", slot.item.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      if (slot.item.id === "insulated-coat" || slot.item.id === "yard-weapon") {
        event.dataTransfer?.setData("application/x-greywrought-gear", slot.item.id);
        callbacks.onOpenEquipment?.(slot.item.id);
        document.dispatchEvent(new CustomEvent("greywrought-gear-dragstart", { detail: slot.item.id }));
      }
    });
    button.addEventListener("dragover", event => { if (dragIndex !== null) { event.preventDefault(); button.dataset.dropTarget = "true"; } });
    button.addEventListener("dragleave", () => { delete button.dataset.dropTarget; });
    button.addEventListener("drop", event => {
      event.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        const from = bagOrder[dragIndex] ?? null;
        const to = bagOrder[index] ?? null;
        bagOrder[dragIndex] = to;
        bagOrder[index] = from;
        saveLayout(); if (snapshot) update(snapshot);
      }
      dragIndex = null;
      document.dispatchEvent(new CustomEvent("greywrought-gear-dragend"));
      slots.forEach(slot => delete slot.button.dataset.dropTarget);
    });
    button.addEventListener("dragend", () => { dragIndex = null; document.dispatchEvent(new CustomEvent("greywrought-gear-dragend")); slots.forEach(slot => delete slot.button.dataset.dropTarget); });
    button.setAttribute("aria-controls", "bag-details");
    const image = document.createElement("img"); image.alt = "";
    const count = document.createElement("span"); count.className = "bag-stack"; count.setAttribute("aria-hidden", "true");
    button.append(image, count); grid.append(button);
    const slot: { button: HTMLButtonElement; image: HTMLImageElement; count: HTMLSpanElement; item: Item | null } = { button, image, count, item: null };
    button.addEventListener("click", () => {
      if (!slot.item || !snapshot) return;
      pinned = true;
      selected = slot.item.id;
      details.hidden = false;
      update(snapshot);
    });
    button.addEventListener("pointerenter", () => {
      if (!slot.item || !snapshot) return;
      selected = slot.item.id; details.hidden = false; update(snapshot);
    });
    button.addEventListener("focus", () => {
      if (!slot.item || !snapshot) return;
      selected = slot.item.id; pinned = true; details.hidden = false; update(snapshot);
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (slot.item?.id === "potions") callbacks.onUsePotion();
      else if (slot.item?.id === "insulated-coat" || slot.item?.id === "yard-weapon") callbacks.onEquip(GEAR[slot.item.id].slot, slot.item.id);
    });
    return slot;
  });
  function setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }
  function update(next: AdventureSnapshot): void {
    snapshot = next;
    const quantity = (item: Item) => item.id === "insulated-coat" || item.id === "yard-weapon"
      ? Number(next.progression.ownedGear.includes(item.id) && next.progression.equipment[GEAR[item.id].slot] !== item.id)
      : next[item.id];
    const label = (item: Item) => item.id === "insulated-coat" || item.id === "yard-weapon" ? gearName(item.id, next.player.archetype) : item.name;
    const carried = itemTypes.filter(item => quantity(item) > 0);
    const known = new Set(carried.map(item => item.id));
    bagOrder = bagOrder.map(id => id && known.has(id) ? id : null);
    for (const item of carried) if (!bagOrder.includes(item.id)) {
      const empty = bagOrder.indexOf(null);
      if (empty >= 0) bagOrder[empty] = item.id;
    }
    if (!carried.some(item => item.id === selected)) {
      selected = carried[0]?.id ?? null;
      details.hidden = true;
      pinned = false;
    }
    slots.forEach((slot, index) => {
      const item = carried.find(candidate => candidate.id === bagOrder[index]);
      slot.item = item ?? null;
      slot.button.disabled = false;
      slot.button.setAttribute("aria-disabled", String(!item));
      slot.button.setAttribute("aria-pressed", String(!!item && item.id === selected));
      slot.image.hidden = !item; slot.count.hidden = !item;
      if (item) {
        slot.button.dataset.bagItem = item.id;
        slot.button.draggable = true;
        slot.image.draggable = false;
        slot.button.dataset.quantity = String(quantity(item));
        slot.button.setAttribute("aria-label", `${label(item)} × ${quantity(item)}`);
        const icon = item.id === "yard-weapon" ? next.player.archetype === "mage" || next.player.archetype === "alchemist" ? "spells/wand-bolt.svg" : next.player.archetype === "hunter" ? "spells/bow-shot.svg" : next.player.archetype === "artificer" ? "spells/lightning-bolt.png" : item.icon : item.icon;
        const src = publicUrl(`assets/ui/icons/${icon}`);
        if (slot.image.src !== src) slot.image.src = src;
        setText(slot.count, String(quantity(item)));
      } else {
        delete slot.button.dataset.bagItem;
        slot.button.draggable = false;
        slot.image.draggable = false;
        delete slot.button.dataset.quantity;
        slot.button.setAttribute("aria-label", `Empty slot ${index + 1}`);
      }
    });
    const item = carried.find(item => item.id === selected);
    details.style.pointerEvents = item?.id === "potions" && pinned ? "auto" : "none";
    setText(itemName, item ? `${label(item)} × ${quantity(item)}` : "Your backpack is empty");
    const copy = !item ? "Gather coolant crystals, search fallen foes, or buy potions from Mara."
      : item.id === "potions" ? `Restores ${next.potionHealing} health. ${Math.ceil(next.player.health)} / ${next.player.maximumHealth} health.`
      : item.id === "insulated-coat" || item.id === "yard-weapon" ? `${GEAR[item.id].description} Right-click to equip. Changing gear in combat takes one turn and costs no stamina.`
      : item.id === "carriedRelics" ? "Recovered from Foreman Nine. Bring it to Rowan and complete Clock Out."
      : item.id === "cargo" ? "Three are kept for Mara while her task is active. Other crystals become supplies on entering town. Carry six straight to the engine for its offering."
      : `Recovered from fallen foes. Return alive to ${YARD.settlement} to turn each salvage into a supply.`;
    setText(description, copy);
    usePotion.hidden = selected !== "potions";
    usePotion.disabled = next.phase === "lost" || next.potions < 1 || next.player.health >= next.player.maximumHealth;
    setText(usePotion, next.player.health >= next.player.maximumHealth ? "Health full" : "Drink potion");
    setText(securedValue, `${next.supplies} supplies${next.quests.some(q => q.id === "last-shift" && q.status === "completed") ? " · Last Shift Roll delivered" : ""}`);
    if (!details.hidden) {
      const slot = slots.find(slot => slot.item?.id === selected);
      if (!slot || panel.hidden) details.hidden = true;
      else {
        const box = slot.button.getBoundingClientRect();
        details.style.left = `${Math.max(8,Math.min(innerWidth-details.offsetWidth-8,box.left-details.offsetWidth-10))}px`;
        details.style.top = `${Math.max(8,Math.min(innerHeight-details.offsetHeight-8,box.top-20))}px`;
      }
    }
  }
  const stopPointer = (event: Event): void => event.stopPropagation();
  panel.addEventListener("pointerdown", stopPointer);
  panel.addEventListener("click", stopPointer);
  usePotion.addEventListener("click", callbacks.onUsePotion);
  closeButton.addEventListener("click", callbacks.onClose);
  panel.addEventListener("pointerleave", event => { if (!pinned && !(event.relatedTarget instanceof Node && details.contains(event.relatedTarget))) details.hidden = true; });
  details.addEventListener("pointerleave", () => { if(!pinned) details.hidden = true; });
  function close(): void { panel.hidden = true; details.hidden = true; pinned = false; }
  return {
    get isOpen(): boolean { return !panel.hidden; },
    open(next: AdventureSnapshot, key = "default"): void { characterKey = key; loadLayout(); details.hidden = true; pinned = false; update(next); panel.hidden = false; },
    close,
    update,
    dispose(): void {
      usePotion.removeEventListener("click", callbacks.onUsePotion);
      closeButton.removeEventListener("click", callbacks.onClose);
      panel.removeEventListener("pointerdown", stopPointer);
      panel.removeEventListener("click", stopPointer);
      panel.remove(); details.remove(); style.remove();
    },
  };
}
