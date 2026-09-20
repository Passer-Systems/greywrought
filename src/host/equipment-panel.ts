import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { CharacterArchetype, LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";
import { GEAR, gearName, isGearItem, type GearItemId, type GearSlot } from "../game/yard-content.js";

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
const classNames: Record<CharacterArchetype, string> = { warrior: "Warrior", mage: "Mage", hunter: "Hunter", alchemist: "Alchemist", artificer: "Artificer" };

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
  let activeDraggedGear: GearItemId | null = null;
  const starterName = (archetype: CharacterArchetype) => archetype === "mage" ? "Starter wand" : archetype === "hunter" ? "Starter bow" : archetype === "alchemist" ? "Starter reagent kit" : archetype === "artificer" ? "Starter rivet tool" : "Starter sword";
  const weaponIcon = (archetype: CharacterArchetype) => archetype === "mage" || archetype === "alchemist" ? "wand-bolt.svg" : archetype === "hunter" ? "bow-shot.svg" : archetype === "artificer" ? "lightning-bolt.png" : "sword-strike.png";

  function select(id: SlotId): void {
    selected = id;
    for (const [slotId, button] of buttons) button.setAttribute("aria-pressed", String(slotId === id));
    if (!snapshot) return;
    const signature = JSON.stringify([id, snapshot.phase, snapshot.player.inCombat, snapshot.player.archetype, snapshot.progression]);
    if (signature === detailSignature) return;
    detailSignature = signature;
    const label = slots.find(slot => slot[0] === id)![1];
    const archetype = snapshot.player.archetype;
    const owned = snapshot.progression.ownedGear.filter(gear => GEAR[gear].slot === id);
    details.replaceChildren();
    const heading = document.createElement("h3"); heading.textContent = label; details.append(heading);
    if (!owned.length) {
      const description = document.createElement("p");
      description.textContent = id === "mainhand" ? starterName(archetype) + ". Visit Tamsin for weapons or earn Rowan’s weapon." : id === "chest" ? "Visit Brann for armor or earn Mara’s coat." : id === "offhand" ? "Visit Sella for a shield." : "No item is equipped in this slot.";
      details.append(description);
    }
    for (const gearId of owned) {
      const equipped = snapshot.progression.equipment[GEAR[gearId].slot] === gearId;
      const name = document.createElement("strong"); name.textContent = gearName(gearId, archetype) + (equipped ? " · Equipped" : "");
      const description = document.createElement("p"); description.textContent = GEAR[gearId].description;
      const action = document.createElement("button"); action.type = "button";
      if (owned[0] === gearId) action.id = "equipment-toggle";
      action.textContent = equipped ? "Unequip" : "Equip";
      action.disabled = snapshot.phase === "lost"; action.dataset.gearItem = gearId;
      action.addEventListener("click", () => onEquip(GEAR[gearId].slot, equipped ? null : gearId));
      details.append(name, description, action);
    }
    root.dataset.selectedSlot = id;
  }

  const draggedGear = (event: DragEvent): GearItemId | null => {
    const value = event.dataTransfer?.getData("application/x-greywrought-gear");
    return isGearItem(value) ? value : null;
  };
  const clearDropHighlights = (): void => {
    for (const control of buttons.values()) {
      delete control.dataset.dropTarget;
      delete control.dataset.dropValid;
    }
  };
  const showCompatibleSlots = (event: Event): void => {
    const gear = (event as CustomEvent).detail as GearItemId;
    if (!isGearItem(gear)) return;
    activeDraggedGear = gear;
    clearDropHighlights();
    for (const [slotId, control] of buttons) {
      if (GEAR[gear]?.slot === slotId) { control.dataset.dropTarget = "true"; control.dataset.dropValid = "true"; }
    }
  };
  const endGearDrag = (): void => { activeDraggedGear = null; clearDropHighlights(); };
  document.addEventListener("greywrought-gear-dragstart", showCompatibleSlots);
  document.addEventListener("greywrought-gear-dragend", endGearDrag);

  for (const [id, label, column] of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "equipment-slot";
    button.dataset.equipmentSlot = id;
    button.addEventListener("dragover", event => {
      const gear = activeDraggedGear;
      if (!gear || GEAR[gear].slot !== id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      button.dataset.dropTarget = "true"; button.dataset.dropValid = "true";
    });
    button.addEventListener("drop", event => {
      event.preventDefault();
      const gear = draggedGear(event) ?? activeDraggedGear; clearDropHighlights(); activeDraggedGear = null;
      if (gear && GEAR[gear].slot === id && snapshot?.progression.ownedGear.includes(gear)) onEquip(id, gear);
    });
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
      if (!snapshot || snapshot.phase === "lost" || (id !== "chest" && id !== "mainhand" && id !== "offhand")) return;
      const equipped = snapshot.progression.equipment[id];
      const gearId = snapshot.progression.ownedGear.find(gear => GEAR[gear].slot === id);
      if (equipped || gearId) onEquip(id, equipped ? null : gearId!);
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
      const gearId = slotId === "chest" || slotId === "mainhand" || slotId === "offhand" ? snapshot.progression.equipment[slotId] : null;
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
    open(character: LocalCharacter, snapshot: AdventureSnapshot, focus = true): void {
      update(character, snapshot);
      if (root.open) return;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.show();
      document.getElementById("equipment-open")?.setAttribute("aria-expanded", "true");
      if (focus) buttons.get(selected)?.focus({ preventScroll: true });
    },
    close,
    update,
    dispose(): void {
      close();
      document.removeEventListener("greywrought-gear-dragstart", showCompatibleSlots);
      document.removeEventListener("greywrought-gear-dragend", endGearDrag);
      closeButton.removeEventListener("click", requestClose);
      root.removeEventListener("cancel", cancel);
      for (const button of buttons.values()) button.remove();
      buttons.clear();
    },
  };
}
