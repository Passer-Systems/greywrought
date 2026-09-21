import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import { QUESTS, type QuestView, type QuestDefinition } from "../game/yard-content.js";
import { NAMEPLATE_DISTANCE } from "./nameplate-range.js";

type Disposition = "player" | "friendly" | "neutral" | "hostile";
type QuestMarker = "available" | "active" | "ready";
interface PlayerNameOptions {
  readonly health: number;
  readonly maximumHealth: number;
  readonly selected: boolean;
  readonly party: boolean;
  readonly onContextMenu: (x: number, y: number) => void;
}

export function npcQuestMarker(quests: readonly QuestView[], giver: QuestDefinition["giver"]): QuestMarker | null {
  const states = quests.filter(view => QUESTS.some(quest => quest.id === view.id && quest.giver === giver));
  const priority: readonly QuestMarker[] = ["ready", "active", "available"];
  return priority.find(status => states.some(quest => quest.status === status)) ?? null;
}

export function createOverheadNames(host: HTMLElement, camera: PerspectiveCamera, player: Object3D) {
  const style = document.createElement("style");
  style.textContent = `
    [data-overhead-names] { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:4; }
    [data-overhead-name] { position:absolute; width:max-content; max-width:240px; white-space:nowrap; font:600 14px/20px system-ui,sans-serif; text-align:center; transform:translate(-50%,calc(-100% - 4px)); color:#9cefa9; -webkit-text-stroke:3px #10191e; paint-order:stroke fill; text-shadow:0 2px 3px #000; }
    [data-quest-marker] { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); font:800 29px/34px system-ui,sans-serif; color:#ffd878; -webkit-text-stroke:4px #24251f; paint-order:stroke fill; }
    [data-quest-marker="active"] { color:#a9afb1; }
    [data-overhead-name][data-disposition="player"] { color:#bac5ff; }
    [data-overhead-name][data-player-name] { min-width:96px; padding:4px 10px 6px; border:1px solid #8094ac77; border-radius:4px; background:#121e29bc; -webkit-text-stroke:0; font-size:13px; line-height:18px; }
    [data-overhead-name][data-player-name]:hover, [data-overhead-name][data-player-name]:focus-visible { border-color:#d0e4ff; outline:1px solid #d0e4ff; }
    [data-overhead-name][data-party="true"] { color:#adf6ba; border-color:#77bd8399; }
    [data-overhead-name][data-selected="true"] { border-color:#a2f2b4; box-shadow:0 0 0 2px #79d98b88; }
    .overhead-player-health { display:block; height:4px; margin-top:2px; background:#0a100e; border:1px solid #192c20; }
    .overhead-player-health::before { content:""; display:block; width:var(--unit-health); height:100%; background:#69bb78; }
    [data-overhead-name][data-disposition="neutral"] { color:#ffe28a; }
    [data-overhead-name][data-disposition="hostile"] { color:#ff9690; }
  `;
  const root = document.createElement("div");
  root.dataset.overheadNames = "";
  root.setAttribute("aria-hidden", "true");
  host.append(style, root);
  const names = new Map<string, HTMLDivElement>();
  const suppressed = new Set<string>();
  const present = new Set<string>();
  const anchor = new Vector3();
  const playerPosition = new Vector3();
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "600 14px system-ui";
  const widths = new Map<string, number>();
  const creatures: { element: HTMLDivElement; x: number; y: number; width: number }[] = [];
  let viewportWidth = 0, viewportHeight = 0;
  return {
    begin() {
      // Read the viewport before changing any labels, once for the whole frame.
      viewportWidth = host.clientWidth; viewportHeight = host.clientHeight;
      player.getWorldPosition(playerPosition);
      present.clear(); creatures.length = 0;
    },
    show(id: string, name: string, actor: Object3D, height: number, disposition: Disposition, alive = true, quest: QuestMarker | null = null, onActivate?: () => void, playerName?: PlayerNameOptions) {
      present.add(id);
      let element = names.get(id);
      if (!element) {
        element = document.createElement("div");
        element.dataset.overheadName = id;
        if (onActivate) {
          root.removeAttribute("aria-hidden");
          element.setAttribute("role", "button"); element.tabIndex = 0; element.style.pointerEvents = "auto"; element.style.cursor = "pointer";
          element.addEventListener("pointerdown", event => event.stopPropagation());
          element.addEventListener("click", event => { event.stopPropagation(); onActivate(); });
          element.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onActivate(); } });
          if (playerName) element.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); playerName.onContextMenu(event.clientX, event.clientY); });
        }
        names.set(id, element); root.append(element);
      }
      if (element.dataset.label !== name || element.dataset.quest !== (quest ?? "")) {
        element.textContent = name;
        element.dataset.label = name; element.dataset.quest = quest ?? "";
        if (quest) {
          const marker = document.createElement("span"); marker.dataset.questMarker = quest;
          marker.textContent = quest === "available" ? "!" : "?"; element.append(marker);
        }
        if (playerName) {
          const health = document.createElement("span"); health.className = "overhead-player-health"; health.setAttribute("aria-hidden", "true"); element.append(health);
        }
      }
      if (playerName) {
        element.dataset.playerName = "true";
        element.dataset.selected = String(playerName.selected); element.dataset.party = String(playerName.party);
        element.style.setProperty("--unit-health", `${Math.max(0, Math.min(100, playerName.health / Math.max(1, playerName.maximumHealth) * 100))}%`);
        element.setAttribute("aria-label", `${name}, ${Math.ceil(playerName.health)} of ${playerName.maximumHealth} health. Select player; right-click for party options.`);
      }
      element.dataset.disposition = disposition;
      if (!name || !alive || !actor.visible || suppressed.has(id)) { element.hidden = true; return; }
      actor.getWorldPosition(anchor);
      if (Math.hypot(anchor.x-playerPosition.x, anchor.z-playerPosition.z) > NAMEPLATE_DISTANCE) { element.hidden = true; return; }
      anchor.y += height; anchor.project(camera);
      if (anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > 1 || Math.abs(anchor.y) > 1) { element.hidden = true; return; }
      const x = (anchor.x + 1) * viewportWidth / 2;
      const y = (1 - anchor.y) * viewportHeight / 2;
      element.style.left = `${x}px`; element.style.top = `${y}px`;
      element.hidden = y < (quest ? 58 : 24);
      if (!element.hidden && (id.startsWith("threat:") || playerName)) {
        if (!widths.has(name)) widths.set(name, Math.min(240, Math.max(playerName ? 96 : 0, measure.measureText(name).width + (playerName ? 20 : 0))));
        creatures.push({ element, x, y, width: widths.get(name)! });
      }
    },
    suppress(id: string, value: boolean) {
      if (value) suppressed.add(id); else suppressed.delete(id);
      const element = names.get(id);
      if (element && value) element.hidden = true;
    },
    end() {
      const placed: typeof creatures = [];
      for (const name of creatures.sort((a, b) => b.y - a.y)) {
        for (const previous of placed) {
          const spacing = name.element.dataset.playerName || previous.element.dataset.playerName ? 38 : 22;
          if (Math.abs(name.x - previous.x) < (name.width + previous.width) / 2 + 6 && Math.abs(name.y - previous.y) < spacing) name.y = previous.y - spacing;
        }
        name.element.style.top = `${name.y}px`;
        name.element.hidden = name.y < 24;
        placed.push(name);
      }
      for (const [id, element] of names) if (!present.has(id)) { element.remove(); names.delete(id); suppressed.delete(id); }
    },
    dispose() { root.remove(); style.remove(); names.clear(); suppressed.clear(); },
  };
}
