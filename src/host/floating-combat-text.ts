import type { CombatFeedback } from "../game/adventure-types.js";

const LIFETIME_MS = 1400;
const MAX_VISIBLE = 24;
interface FloatingHit {
  readonly event: CombatFeedback;
  readonly born: number;
  readonly lane: number;
  readonly element: HTMLSpanElement;
}

export function createFloatingCombatText(host: HTMLElement) {
  const root = document.createElement("div");
  root.className = "floating-combat-text";
  root.setAttribute("aria-hidden", "true");
  host.append(root);
  let highwater: number | undefined;
  let connection: number | undefined;
  let lastUpdate = 0;
  const active: FloatingHit[] = [];
  const clear = () => { for (const hit of active) hit.element.remove(); active.length = 0; };
  return {
    update(events: readonly CombatFeedback[], now: number, revision: number): void {
      const latest = events.at(-1)?.id ?? 0;
      // Entry, reconnect and returning from a suspended tab must not replay history.
      if (highwater === undefined || connection !== revision || latest < highwater || now - lastUpdate > 500) {
        highwater = latest; connection = revision; lastUpdate = now; clear(); return;
      }
      lastUpdate = now;
      for (const event of events) {
        if (event.id <= highwater) continue;
        const element = document.createElement("span");
        element.className = "floating-combat-hit";
        element.dataset.kind = event.kind;
        element.dataset.target = event.targetId ?? "player";
        element.dataset.eventId = String(event.id);
        element.dataset.self = String(event.targetId === null);
        element.textContent = event.kind === "miss" ? "Miss" : event.kind === "heal" ? "+" + event.amount
          : event.kind === "block" ? event.amount + " Blocked" : (event.targetId === null ? "−" : "") + event.amount;
        const lane = active.filter(hit => hit.event.targetId === event.targetId && now - hit.born < 350).length;
        active.push({ event, born: now, lane, element }); root.append(element);
        if (active.length > MAX_VISIBLE) active.shift()!.element.remove();
      }
      highwater = latest;
    },
    render(now: number, project: (targetId: string | null) => { x: number; y: number } | null): void {
      for (let index = active.length - 1; index >= 0; index--) {
        const hit = active[index]!, age = (now - hit.born) / LIFETIME_MS;
        if (age >= 1) { hit.element.remove(); active.splice(index, 1); continue; }
        const anchor = project(hit.event.targetId);
        hit.element.hidden = anchor === null;
        if (!anchor) continue;
        const self = hit.event.targetId === null;
        const side = self ? hit.event.kind === "heal" ? 1 : -1 : 1;
        const x = anchor.x + side * (self ? 68 : 42) + (hit.lane % 2) * 18 * side;
        const y = anchor.y - age * 52 + hit.lane * 24;
        const scale = 1 + .14 * Math.max(0, 1 - age * 7);
        hit.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
        hit.element.style.opacity = String(Math.min(1, (1 - age) / .3));
      }
    },
    dispose(): void { clear(); root.remove(); },
  };
}
