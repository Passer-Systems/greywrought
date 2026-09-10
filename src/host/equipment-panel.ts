import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { CharacterArchetype, LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";
import { GEAR, gearName, type GearItemId, type GearSlot } from "../game/yard-content.js";

const slots = [
  ["head", "Head", "left"], ["neck", "Neck", "left"],
  ["shoulders", "Shoulders", "left"], ["back", "Back", "left"],
  ["chest", "Chest", "left"], ["shirt", "Shirt", "left"],
  ["tabard", "Tabard", "left"], ["wrist", "Wrist", "left"],
  ["hands", "Hands", "right"], ["waist", "Waist", "right"],
  ["legs", "Legs", "right"], ["feet", "Feet", "right"],
  ["ring1", "Ring 1", "right"], ["ring2", "Ring 2", "right"],
  ["trinket1", "Trinket 1", "right"], ["trinket2", "Trinket 2", "right"],
  ["mainhand", "Main hand", "weapons"], ["offhand", "Off hand", "weapons"],
  ["ranged", "Ranged / Relic", "weapons"],
] as const;
type SlotId = typeof slots[number][0];
const classNames: Record<CharacterArchetype, string> = { warrior: "Warrior", mage: "Mage", hunter: "Hunter" };

export function createEquipmentPanel(element: HTMLElement, onClose: () => void, onEquip: (slot: GearSlot, item: GearItemId | null) => void) {
  if (!(element instanceof HTMLDialogElement)) throw new Error("Equipment panel must be a dialog");
  const root = element;
  function find<T extends Element>(selector: string, type: { new(...args: never[]): T }): T {
    const found = root.querySelector(selector);
    if (!(found instanceof type)) throw new Error(`Missing equipment element ${selector}`);
    return found;
  }
  const name = find("#equipment-name", HTMLElement);
  const summary = find("#equipment-summary", HTMLElement);
  const portrait = find("#equipment-portrait", HTMLImageElement);
  const details = find("#equipment-details", HTMLElement);
  const closeButton = find("#equipment-close", HTMLButtonElement);
  const buttons = new Map<SlotId, HTMLButtonElement>();
  let selected: SlotId = "mainhand";
  let previousFocus: HTMLElement | null = null;
  let portraitClass: CharacterArchetype | null = null;
  let snapshot: AdventureSnapshot | null = null;
  let detailSignature = "";
  const starterName = (archetype: CharacterArchetype) => archetype === "mage" ? "Starter wand" : archetype === "hunter" ? "Starter bow" : "Starter sword";
  const weaponIcon = (archetype: CharacterArchetype) => archetype === "mage" ? "wand-bolt.svg" : archetype === "hunter" ? "bow-shot.svg" : "sword-strike.png";

  function select(id: SlotId): void {
    selected = id;
    for (const [slotId, button] of buttons) button.setAttribute("aria-pressed", String(slotId === id));
    if (!snapshot) return;
    const signature = JSON.stringify([id, snapshot.phase, snapshot.combat.phase, snapshot.player.archetype, snapshot.progression]);
    if (signature === detailSignature) return;
    detailSignature = signature;
    const label = slots.find(slot => slot[0] === id)![1];
    const archetype = snapshot.player.archetype;
    const gearId: GearItemId | null = id === "chest" ? "insulated-coat" : id === "mainhand" ? "yard-weapon" : null;
    const owned = gearId && snapshot.progression.ownedGear.includes(gearId);
    const equipped = gearId && snapshot.progression.equipment[GEAR[gearId].slot] === gearId;
    details.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = owned ? gearName(gearId, archetype) : id === "mainhand" ? starterName(archetype) : label;
    const kind = document.createElement("span");
    kind.className = "equipment-detail-kind";
    kind.textContent = `${label} · ${owned ? equipped ? "Equipped" : "Owned · Not equipped" : id === "mainhand" ? "Starter weapon" : "Empty"}`;
    const description = document.createElement("p");
    description.textContent = owned ? GEAR[gearId].description : id === "mainhand"
      ? "Your first weapon. Complete Rowan’s task to earn a working weapon with 3 extra attack damage."
      : id === "chest" ? "Complete Mara’s task to earn the Line Inspector’s Coat, with 2 armor."
      : "No item is equipped in this slot.";
    details.append(kind, heading, description);
    if (owned) {
      const action = document.createElement("button"); action.type = "button"; action.id = "equipment-toggle";
      action.textContent = (equipped ? "Unequip" : "Equip") + (snapshot.phase === "expedition" && (snapshot.combat.phase !== "idle" || snapshot.player.inCombat) ? " · 1 turn · 0 stamina" : "");
      action.disabled = snapshot.phase === "lost";
      action.dataset.gearItem = gearId;
      action.addEventListener("click", () => onEquip(GEAR[gearId].slot, equipped ? null : gearId));
      details.append(action);
    }
    root.dataset.selectedSlot = id;
  }

  for (const [id, label, column] of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "equipment-slot";
    button.dataset.equipmentSlot = id;
    button.setAttribute("aria-controls", "equipment-details");
    const mark = document.createElement("span");
    mark.className = "equipment-slot-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "◇";
    const caption = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = label;
    const item = document.createElement("small");
    item.textContent = "Empty";
    caption.append(title, item);
    button.append(mark, caption);
    button.addEventListener("click", () => select(id));
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (!snapshot || snapshot.phase === "lost" || (id !== "chest" && id !== "mainhand")) return;
      const gearId = id === "chest" ? "insulated-coat" : "yard-weapon";
      if (snapshot.progression.ownedGear.includes(gearId)) onEquip(id, snapshot.progression.equipment[id] === gearId ? null : gearId);
    });
    find(`[data-equipment-column="${column}"]`, HTMLElement).append(button);
    buttons.set(id, button);
  }
  const requestClose = () => onClose();
  const cancel = (event: Event) => { event.preventDefault(); onClose(); };
  closeButton.addEventListener("click", requestClose);
  root.addEventListener("cancel", cancel);
  select(selected);

  function update(character: LocalCharacter, next: AdventureSnapshot): void {
    snapshot = next;
    if (name.textContent !== character.name) name.textContent = character.name;
    const weaponBonus = snapshot.progression.equipment.mainhand ? GEAR[snapshot.progression.equipment.mainhand].attackBonus : 0;
    const levelBonus = snapshot.progression.attackBonus - weaponBonus;
    const value = `Level ${snapshot.progression.level} ${classNames[character.archetype]} · ${Math.ceil(snapshot.player.health)} / ${snapshot.player.maximumHealth} health · +${levelBonus} level damage · +${weaponBonus} weapon damage · ${snapshot.progression.damageReduction} armor`;
    if (summary.textContent !== value) summary.textContent = value;
    if (portraitClass !== character.archetype) {
      portraitClass = character.archetype;
      portrait.src = publicUrl(`assets/ui/characters/${character.archetype}.webp`);
      portrait.alt = `${classNames[character.archetype]} portrait`;
    }
    for (const [slotId, control] of buttons) {
      const gearId = slotId === "chest" || slotId === "mainhand" ? snapshot.progression.equipment[slotId] : null;
      const caption = gearId ? gearName(gearId, character.archetype) : slotId === "mainhand" ? starterName(character.archetype) : "Empty";
      const small = control.querySelector("small")!;
      if (small.textContent !== caption) small.textContent = caption;
      const icon = slotId === "mainhand" ? `spells/${weaponIcon(character.archetype)}` : gearId ? GEAR[gearId].icon + ".png" : "";
      if (control.dataset.icon !== icon) {
        control.dataset.icon = icon;
        const mark = control.querySelector(".equipment-slot-mark")!;
        mark.replaceChildren();
        if (icon) { const image = document.createElement("img"); image.src = publicUrl("assets/ui/icons/" + icon); image.alt = ""; mark.append(image); }
        else mark.textContent = "◇";
      }
      control.dataset.equipped = String(!!gearId);
    }
    select(selected);
  }
  function close(): void {
    if (!root.open) return;
    root.close();
    document.getElementById("equipment-open")?.setAttribute("aria-expanded", "false");
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  return {
    get isOpen(): boolean { return root.open; },
    open(character: LocalCharacter, snapshot: AdventureSnapshot): void {
      update(character, snapshot);
      if (root.open) return;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.show();
      document.getElementById("equipment-open")?.setAttribute("aria-expanded", "true");
      buttons.get(selected)?.focus({ preventScroll: true });
    },
    close,
    update,
    dispose(): void {
      close();
      closeButton.removeEventListener("click", requestClose);
      root.removeEventListener("cancel", cancel);
      for (const button of buttons.values()) button.remove();
      buttons.clear();
    },
  };
}
