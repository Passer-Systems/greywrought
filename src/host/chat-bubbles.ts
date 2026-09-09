import { Vector3, type Object3D, type PerspectiveCamera, type Scene } from "three";
import type { SharedChatMessage } from "../game/multiplayer-types.js";

const HOLD_MS = 5_000;
const FADE_MS = 500;

export function createChatBubbleFeed() {
  let highwater: number | undefined;
  const speakers = new Map<string, { message: SharedChatMessage; receivedAt: number }>();
  return {
    update(messages: readonly SharedChatMessage[], now: number): void {
      const previous = highwater;
      highwater = Math.max(highwater ?? 0, ...messages.map(message => message.id));
      // The first snapshot is history, including messages saved before this visit.
      if (previous === undefined) return;
      for (const message of messages) {
        if (message.id > previous && message.speakerId !== null) {
          speakers.set(message.speakerId, { message, receivedAt: now });
        }
      }
    },
    visible(now: number) {
      for (const [id, bubble] of speakers) if (now - bubble.receivedAt >= HOLD_MS + FADE_MS) speakers.delete(id);
      return [...speakers].map(([speakerId, bubble]) => ({
        speakerId, message: bubble.message,
        opacity: Math.min(1, Math.max(0, (HOLD_MS + FADE_MS - (now - bubble.receivedAt)) / FADE_MS)),
      }));
    },
  };
}

export function createChatBubbles(host: HTMLElement, scene: Scene, camera: PerspectiveCamera, localPlayer: Object3D) {
  const feed = createChatBubbleFeed();
  const style = document.createElement("style");
  style.textContent = `
    [data-chat-bubbles] { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:8; }
    [data-chat-bubble] { position:absolute; box-sizing:border-box; width:max-content; max-width:min(240px,calc(100% - 24px)); padding:8px 12px; border:2px solid #55442d; border-radius:14px; background:#fff3d5; color:#30291e; box-shadow:0 2px 5px #0006; font:var(--ui-font-prominent,14px)/1.35 system-ui,sans-serif; text-align:center; overflow-wrap:anywhere; white-space:pre-wrap; transform:translate(-50%,calc(-100% - 10px)); pointer-events:none; }
    [data-chat-bubble]::after { content:""; position:absolute; left:calc(50% - 6px); bottom:-8px; width:11px; height:11px; background:#fff3d5; border-right:2px solid #55442d; border-bottom:2px solid #55442d; transform:rotate(45deg); }
  `;
  const root = document.createElement("div");
  root.dataset.chatBubbles = "";
  root.setAttribute("aria-hidden", "true");
  host.append(style, root);
  const elements = new Map<string, HTMLDivElement>();
  const anchor = new Vector3();
  const localPosition = new Vector3();
  let localId = "";
  return {
    update(messages: readonly SharedChatMessage[], localPlayerId: string): void {
      localId = localPlayerId;
      feed.update(messages, performance.now());
    },
    render(): void {
      const active = feed.visible(performance.now());
      const present = new Set(active.map(bubble => bubble.speakerId));
      for (const [id, element] of elements) if (!present.has(id)) { element.remove(); elements.delete(id); }
      if (!active.length) return;
      const actors = new Map<string, Object3D>([[localId, localPlayer]]);
      for (const actor of scene.children) if (typeof actor.userData.playerId === "string") actors.set(actor.userData.playerId, actor);
      localPlayer.getWorldPosition(localPosition);
      for (const bubble of active) {
        let element = elements.get(bubble.speakerId);
        if (!element) {
          element = document.createElement("div");
          element.className = "speech-bubble";
          element.dataset.chatBubble = "";
          element.dataset.speakerId = bubble.speakerId;
          elements.set(bubble.speakerId, element);
          root.append(element);
        }
        if (element.dataset.messageId !== String(bubble.message.id)) {
          element.dataset.messageId = String(bubble.message.id);
          element.textContent = bubble.message.text;
        }
        element.style.opacity = String(bubble.opacity);
        const actor = actors.get(bubble.speakerId);
        element.hidden = true;
        if (!actor || !actor.visible) continue;
        actor.getWorldPosition(anchor);
        if (anchor.distanceToSquared(localPosition) > 30 * 30) continue;
        anchor.y += 2.35;
        anchor.project(camera);
        if (anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > 1 || Math.abs(anchor.y) > 1) continue;
        element.style.left = `${(anchor.x + 1) * host.clientWidth / 2}px`;
        element.style.top = `${(1 - anchor.y) * host.clientHeight / 2}px`;
        element.hidden = false;
      }
    },
    dispose(): void { root.remove(); style.remove(); elements.clear(); },
  };
}
