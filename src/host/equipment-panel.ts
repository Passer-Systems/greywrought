import type { AdventureSnapshot } from "../game/adventure-types.js";
import type { CharacterArchetype, LocalCharacter } from "./character-profile.js";
import { publicUrl } from "./public-url.js";

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

export function createEquipmentPanel(element: HTMLElement, onClose: () => void) {
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

  function select(id: SlotId): void {
    selected = id;
    for (const [slotId, button] of buttons) button.setAttribute("aria-pressed", String(slotId === id));
    const label = slots.find(slot => slot[0] === id)![1];
    details.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = id === "mainhand" ? "Starter sword" : label;
    const kind = document.createElement("span");
    kind.className = "equipment-detail-kind";
    kind.textContent = id === "mainhand" ? "Main hand · Starter appearance" : `${label} · Empty`;
    const description = document.createElement("p");
    description.textContent = id === "mainhand"
      ? "The blade your adventurer carries into Frostwood. Weapons cannot be changed yet."
      : "No separate item is equipped in this slot. Your starter outfit is part of your appearance; collecting and changing gear is not available yet.";
    details.append(kind, heading, description);
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
    if (id === "mainhand") {
      const icon = document.createElement("img");
      icon.src = publicUrl("assets/ui/icons/spells/sword-strike.png");
      icon.alt = "";
      mark.append(icon);
    } else mark.textContent = "◇";
    const caption = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = label;
    const item = document.createElement("small");
    item.textContent = id === "mainhand" ? "Starter sword" : "Empty";
    caption.append(title, item);
    button.append(mark, caption);
    button.addEventListener("click", () => select(id));
    find(`[data-equipment-column="${column}"]`, HTMLElement).append(button);
    buttons.set(id, button);
  }
  const requestClose = () => onClose();
  const cancel = (event: Event) => { event.preventDefault(); onClose(); };
  closeButton.addEventListener("click", requestClose);
  root.addEventListener("cancel", cancel);
  select(selected);

  function update(character: LocalCharacter, snapshot: AdventureSnapshot): void {
    if (name.textContent !== character.name) name.textContent = character.name;
    const value = `${classNames[character.archetype]} · ${Math.ceil(snapshot.player.health)} / ${snapshot.player.maximumHealth} health`;
    if (summary.textContent !== value) summary.textContent = value;
    if (portraitClass !== character.archetype) {
      portraitClass = character.archetype;
      portrait.src = publicUrl(`assets/ui/characters/${character.archetype}.webp`);
      portrait.alt = `${classNames[character.archetype]} portrait`;
    }
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
