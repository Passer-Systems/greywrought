import { YARD } from "../game/yard-content.js";
import { getMonsterLore } from "../game/adventure.js";
import type { MonsterLoreEntry, ThreatAbilityView } from "../game/adventure-types.js";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, host: HTMLElement, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; element.textContent = text; host.append(element); return element;
}

export function createLorebook(host: HTMLElement, onClose: () => void, portrait: (id: string) => string | undefined) {
  const panel = node("section", host); panel.id = "lorebook-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "lorebook-title");
  const header = node("header", panel, "rpg-window-header");
  node("h2", header, "rpg-window-title", `${YARD.region} Lorebook`).id = "lorebook-title";
  const close = node("button", header, "rpg-window-close", "×"); close.type = "button"; close.id = "lorebook-close"; close.setAttribute("aria-label", "Close lorebook");
  const layout = node("div", panel, "lorebook-layout");
  const nav = node("nav", layout, "lorebook-index"); nav.setAttribute("aria-label", "Monsters");
  const article = node("article", layout, "lorebook-entry"); article.id = "lorebook-entry"; article.tabIndex = 0;
  const entries = getMonsterLore();
  let selected = "";
  function ability(view: ThreatAbilityView, parent: HTMLElement): void {
    const row = node("section", parent, "lorebook-ability"); row.dataset.loreAbility = view.id;
    node("h4", row, "", view.name);
    const facts = [view.damage > 0 ? view.damage + " damage" : "Power / defense", view.range > 0 ? view.range + " m range" : "Self"];
    node("p", row, "lorebook-facts", facts.join(" · "));
    node("p", row, "", view.description);
  }
  function show(entry: MonsterLoreEntry): void {
    selected = entry.id; panel.dataset.monsterId = selected;
    for (const tab of nav.querySelectorAll<HTMLButtonElement>("button")) tab.setAttribute("aria-current", String(tab.dataset.monsterId === selected));
    article.replaceChildren(); article.scrollTop = 0;
    const heading = node("div", article, "lorebook-heading");
    const url = portrait(selected);
    if (url) { const img = node("img", heading); img.src = url; img.alt = entry.name; }
    const title = node("div", heading);
    node("h3", title, "", entry.name);
    node("p", title, "lorebook-facts", entry.health + " health · " + (entry.disposition === "hostile" ? "Aggressive" : "Neutral until attacked"));
    node("p", article, "lorebook-description", entry.description);
    node("h3", article, "lorebook-section-title", "On engagement");
    node("p", article, "lorebook-opener", entry.opener);
    node("h3", article, "lorebook-section-title", "Abilities");
    const abilities = node("div", article, "lorebook-abilities");
    for (const view of entry.abilities) ability(view, abilities);
    node("h3", article, "lorebook-section-title", "Move sequences & variations");
    for (const sequence of entry.sequences) {
      const row = node("section", article, "lorebook-sequence"); row.dataset.loreSequence = sequence.name;
      node("h4", row, "", sequence.name + (sequence.probability === undefined ? "" : " · " + Math.round(sequence.probability * 100) + "%"));
      const steps = node("ol", row, "lorebook-steps");
      sequence.abilityIds.forEach((id, index) => {
        const view = entry.abilities.find(ability => ability.id === id);
        const step = node("li", steps);
        const time = sequence.offsetsSeconds[index];
        node("span", step, "lorebook-time", time === undefined ? "" : "+" + time + "s");
        node("span", step, "", view?.name ?? id);
      });
      node("p", row, "", sequence.description);
    }
    node("h3", article, "lorebook-section-title", "How to respond");
    node("p", article, "lorebook-strategy", entry.strategy);
    node("p", article, "lorebook-footer", "The yard keeps moving while you read. J or Esc closes the book.");
  }
  for (const entry of entries) {
    const tab = node("button", nav, "", entry.name); tab.type = "button"; tab.dataset.monsterId = entry.id;
  }
  const choose = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const id = event.target.closest<HTMLButtonElement>("button[data-monster-id]")?.dataset.monsterId;
    const entry = entries.find(entry => entry.id === id); if (entry) show(entry);
  };
  nav.addEventListener("click", choose); close.addEventListener("click", onClose);
  return {
    get isOpen() { return !panel.hidden; },
    open(id: string) { const entry = entries.find(entry => entry.id === id) ?? entries[0]; if (entry) show(entry); panel.hidden = false; },
    close() { panel.hidden = true; },
    dispose() { nav.removeEventListener("click", choose); close.removeEventListener("click", onClose); panel.remove(); },
  };
}
