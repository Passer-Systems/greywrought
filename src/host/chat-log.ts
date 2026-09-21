import type { AdventureLogEntry } from "../game/adventure-types.js";

type ChatLogEntry = AdventureLogEntry & { readonly party?: boolean };

type Channel = AdventureLogEntry["channel"];
interface ScrollPosition { following: boolean; entryId: string | null; offset: number; }
interface Geometry { x: number; y: number; width: number; height: number; }
const layoutKey = "greywrought/chat-layout-v1";

export function createChatLog(host: HTMLElement, onSend?: (text: string) => void) {
  const style = document.createElement("style");
  style.textContent = `
    #chat-log { position:absolute; z-index:15; left:8px; bottom:8px; width:min(340px,calc(100% - 16px)); height:160px; display:flex; flex-direction:column; color:#e0d8bd; pointer-events:auto; font:var(--ui-font-body)/1.45 system-ui,sans-serif; text-shadow:0 1px 2px #000; }
    #chat-log-tabs { display:flex; flex:0 0 25px; align-items:end; gap:3px; padding-left:5px; cursor:grab; user-select:none; touch-action:none; }
    #chat-log [data-log-tab] { padding:3px 11px 4px; border:1px solid #8d815c88; border-bottom:0; border-radius:4px 4px 0 0; color:#b8a270; background:#101510b3; font:var(--ui-font-body) Georgia,serif; white-space:nowrap; }
    #chat-log [data-log-tab][aria-selected="true"] { color:#f1d18b; background:#1b2118e3; border-color:#b3a16d99; }
    #chat-log [data-log-tab]:hover { color:#ffe6ad; background:#293024db; }
    #chat-log [data-log-tab]:focus-visible, #chat-log-messages:focus-visible { outline:1px solid #e4c780; outline-offset:-2px; }
    #chat-log-messages { position:relative; flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; overflow-anchor:none; scrollbar-width:thin; scrollbar-color:#77745580 transparent; padding:7px 9px; border:1px solid #78806355; border-radius:3px; background:linear-gradient(90deg,#080f0acf,#0d140dab); box-shadow:inset 0 1px 6px #0005; }
    #chat-log [data-log-entry] { margin:0 0 3px; overflow-wrap:anywhere; }
    #chat-log .log-chat { color:#dfd5ab; }
    #chat-log .log-party { color:#70b7ff; }
    #chat-log .log-combat { color:#e1b794; }
    #chat-log-compose { display:flex; align-items:center; flex:0 0 30px; min-height:0; border:1px solid #78806388; border-radius:3px; background:#0d1815e8; }
    #chat-log-compose[hidden] { display:none; }
    #chat-log-prefix { padding-left:9px; color:#70b7ff; white-space:nowrap; }
    #chat-log-input { box-sizing:border-box; min-width:0; width:100%; height:100%; border:0; border-radius:3px; background:transparent; padding:5px 9px; color:#f3e6c7; font:var(--ui-font-body) system-ui,sans-serif; }
    #chat-log-compose[data-channel="party"] #chat-log-input, #chat-log-compose[data-channel="party"] #chat-log-input::placeholder { color:#70b7ff; }
    #chat-log-resize { position:absolute; right:0; bottom:0; width:16px; height:16px; padding:0; border:0; background:transparent; cursor:nwse-resize; touch-action:none; }
    #chat-log-resize::after { content:""; position:absolute; right:3px; bottom:3px; width:8px; height:8px; background:repeating-linear-gradient(135deg,transparent 0 3px,#b8a270aa 3px 4px); clip-path:polygon(100% 0,100% 100%,0 100%); }
    #chat-log-resize:focus-visible { outline:1px solid #e4c780; }
    #chat-log-input { padding-right:20px; }
    #chat-log[data-adjusting="move"] #chat-log-tabs { cursor:grabbing; }
    #chat-log-input:focus { outline:1px solid #e4c780; }
    #chat-log-input::placeholder { color:#c1bea6; }
    @media(max-width:700px) { #chat-log { width:min(310px,calc(100% - 16px)); height:140px; } }
  `;
  const root = document.createElement("section");
  root.id = "chat-log";
  root.setAttribute("aria-label", "Chat and combat log");
  const tabList = document.createElement("div");
  tabList.id = "chat-log-tabs";
  tabList.setAttribute("role", "tablist"); tabList.setAttribute("aria-label", "Message channel");
  const view = document.createElement("div");
  view.id = "chat-log-messages";
  view.tabIndex = 0;
  view.setAttribute("role", "tabpanel");
  view.setAttribute("aria-live", "polite");
  view.setAttribute("aria-relevant", "additions");
  let selected: Channel = "chat";
  let entries: readonly ChatLogEntry[] = [];
  const positions: Record<Channel, ScrollPosition> = {
    chat: { following: true, entryId: null, offset: 0 },
    combat: { following: true, entryId: null, offset: 0 },
  };
  const tabs = new Map<Channel, HTMLButtonElement>();
  const compose = document.createElement("div");
  compose.id = "chat-log-compose"; compose.hidden = !onSend;
  const prefix = document.createElement("span");
  prefix.id = "chat-log-prefix"; prefix.textContent = "[Party]"; prefix.hidden = true;
  let sendChannel: "say" | "party" = "say";
  const input = document.createElement("input");
  input.id = "chat-log-input"; input.type = "text"; input.maxLength = 280;
  input.placeholder = "Enter to chat · /p for party"; input.setAttribute("aria-label", "Chat message; /p for party");
  input.autocomplete = "off";
  input.setAttribute("autocorrect", "off");
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-lpignore", "true");
  compose.append(prefix, input);
  function setSendChannel(channel: "say" | "party"): void {
    sendChannel = channel;
    compose.dataset.channel = channel;
    prefix.hidden = channel !== "party";
    input.placeholder = channel === "party" ? "Message your party · /s to say" : "Enter to chat · /p for party";
    input.setAttribute("aria-label", channel === "party" ? "Party message; /s to say" : "Chat message; /p for party");
  }
  function takeChannelCommand(text: string): string {
    const match = /^\/(p|party|s|say)(?:\s+([\s\S]*))?$/i.exec(text);
    if (!match) return text;
    setSendChannel(["p", "party"].includes(match[1]!.toLowerCase()) ? "party" : "say");
    return match[2]?.trim() ?? "";
  }
  const onInput = (): void => {
    if (/^\/(p|party|s|say)\s/i.test(input.value)) input.value = takeChannelCommand(input.value);
  };
  input.addEventListener("input", onInput);
  const onInputKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); input.blur(); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const original = input.value.trim().slice(0, 280);
      const text = takeChannelCommand(original);
      if (text && onSend) {
        onSend(sendChannel === "party" && !text.startsWith("/") ? `/p ${text}` : text);
        select("chat");
      }
      input.value = "";
      if (text || !original) input.blur();
    }
  };
  input.addEventListener("keydown", onInputKey);
  const stopKeys = (event: Event): void => event.stopPropagation();
  input.addEventListener("keyup", stopKeys);
  input.addEventListener("keypress", stopKeys);

  function remember(): void {
    const top = view.getBoundingClientRect().top;
    const firstVisible = Array.from(view.children).find(row => row.getBoundingClientRect().bottom > top);
    positions[selected] = {
      following: view.scrollHeight - view.clientHeight - view.scrollTop < 5,
      entryId: firstVisible instanceof HTMLElement ? firstVisible.dataset.logEntry ?? null : null,
      offset: firstVisible ? firstVisible.getBoundingClientRect().top - top : 0,
    };
  }
  function render(): void {
    const rows = entries.filter(entry => entry.channel === selected).map(entry => {
      const row = document.createElement("p");
      row.dataset.logEntry = String(entry.id);
      row.className = entry.party ? "log-chat log-party" : `log-${entry.channel}`;
      row.textContent = entry.text;
      return row;
    });
    view.replaceChildren(...rows);
    for (const [channel, tab] of tabs) {
      tab.setAttribute("aria-selected", String(channel === selected));
      tab.tabIndex = channel === selected ? 0 : -1;
    }
    view.setAttribute("aria-labelledby", `chat-log-tab-${selected}`);
    root.dataset.logChannel = selected;
    restoreScroll();
  }
  function restoreScroll(): void {
    const position = positions[selected];
    if (position.following) view.scrollTop = view.scrollHeight;
    else {
      const anchor = Array.from(view.children).find(row => (row as HTMLElement).dataset.logEntry === position.entryId);
      if (anchor) view.scrollTop += anchor.getBoundingClientRect().top - view.getBoundingClientRect().top - position.offset;
      else view.scrollTop = 0;
    }
  }
  function select(channel: Channel): void {
    if (selected === channel) return;
    remember(); selected = channel; render();
  }
  for (const channel of ["chat", "combat"] as const) {
    const tab = document.createElement("button");
    tab.type = "button"; tab.id = `chat-log-tab-${channel}`; tab.dataset.logTab = channel;
    tab.textContent = channel === "chat" ? "Chat" : "Combat Log";
    tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", view.id);
    tab.addEventListener("click", () => select(channel));
    tabs.set(channel, tab); tabList.append(tab);
  }
  const onTabKey = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "chat" : event.key === "End" ? "combat" : selected === "chat" ? "combat" : "chat";
    select(next); tabs.get(next)?.focus();
  };
  const stopPointer = (event: Event): void => event.stopPropagation();
  root.addEventListener("pointerdown", stopPointer);
  root.addEventListener("click", stopPointer);
  root.addEventListener("wheel", stopPointer, { passive: true });
  tabList.addEventListener("keydown", onTabKey);
  const resize = document.createElement("button"); resize.id = "chat-log-resize"; resize.type = "button";
  resize.setAttribute("aria-label", "Resize chat log");
  root.append(tabList, view, compose, resize); host.append(style, root);
  const events = new AbortController(), options = { signal: events.signal };
  let geometry: Geometry | null = null;
  let gesture: { kind: "move" | "resize"; pointerId: number; x: number; y: number; start: Geometry; active: boolean } | null = null;
  let suppressClick = false;
  function bounds(value: Geometry): Geometry {
    const availableWidth = Math.max(1, innerWidth - 16), availableHeight = Math.max(1, innerHeight - 16);
    const width = Math.max(Math.min(240, availableWidth), Math.min(value.width, 720, availableWidth));
    const height = Math.max(Math.min(120, availableHeight), Math.min(value.height, 560, availableHeight));
    return { x: Math.max(8, Math.min(value.x, innerWidth - width - 8)), y: Math.max(8, Math.min(value.y, innerHeight - height - 8)), width, height };
  }
  function currentGeometry(): Geometry {
    const rect = root.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  function applyGeometry(value: Geometry): void {
    remember(); geometry = bounds(value);
    Object.assign(root.style, { position: "fixed", left: geometry.x + "px", top: geometry.y + "px", bottom: "auto", width: geometry.width + "px", height: geometry.height + "px" });
    restoreScroll();
  }
  function saveGeometry(): void {
    try { localStorage.setItem(layoutKey, JSON.stringify(geometry)); } catch { /* Layout remains usable without browser storage. */ }
  }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(layoutKey) ?? "null");
    if (saved && typeof saved === "object" && ["x", "y", "width", "height"].every(key => typeof Reflect.get(saved, key) === "number" && Number.isFinite(Reflect.get(saved, key)))) applyGeometry(saved as Geometry);
  } catch { /* Use the default layout when stored preferences are unavailable. */ }
  function begin(event: PointerEvent, kind: "move" | "resize"): void {
    if (event.button !== 0 || gesture) return;
    suppressClick = false;
    gesture = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: currentGeometry(), active: false };
  }
  tabList.addEventListener("pointerdown", event => begin(event, "move"), options);
  resize.addEventListener("pointerdown", event => { event.preventDefault(); begin(event, "resize"); }, options);
  window.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.active && Math.hypot(dx, dy) < 4) return;
    event.preventDefault();
    if (!gesture.active) { gesture.active = true; root.setPointerCapture(event.pointerId); root.dataset.adjusting = gesture.kind; }
    const start = gesture.start;
    applyGeometry(gesture.kind === "move" ? { ...start, x: start.x + dx, y: start.y + dy }
      : { ...start, width: Math.min(start.width + dx, innerWidth - start.x - 8), height: Math.min(start.height + dy, innerHeight - start.y - 8) });
  }, options);
  function finish(event?: PointerEvent): void {
    if (!gesture || event && event.pointerId !== gesture.pointerId) return;
    const ended = gesture; gesture = null;
    delete root.dataset.adjusting;
    if (root.hasPointerCapture(ended.pointerId)) root.releasePointerCapture(ended.pointerId);
    if (ended.active) { suppressClick = true; saveGeometry(); }
  }
  window.addEventListener("pointerup", finish, options);
  window.addEventListener("pointercancel", finish, options);
  root.addEventListener("lostpointercapture", finish, options);
  root.addEventListener("click", event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; } }, { ...options, capture: true });
  resize.addEventListener("keydown", event => {
    const changes: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    const delta = changes[event.key]; if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const current = currentGeometry(); applyGeometry({ ...current, width: current.width + delta[0], height: current.height + delta[1] }); saveGeometry();
  }, options);
  window.addEventListener("resize", () => { finish(); if (geometry) { applyGeometry(geometry); saveGeometry(); } }, options);
  render();
  return {
    focusInput(): void { if (onSend) { select("chat"); input.focus(); } },
    update(next: readonly ChatLogEntry[]): void {
      const bounded = next.slice(-200);
      if (bounded.length === entries.length && bounded.every((entry, index) => {
        const previous = entries[index];
        return previous?.id === entry.id && previous.channel === entry.channel && previous.text === entry.text && previous.party === entry.party;
      })) return;
      remember(); entries = bounded; render();
    },
    reset(): void {
      input.value = "";
      setSendChannel("say");
      entries = []; selected = "chat";
      positions.chat = { following: true, entryId: null, offset: 0 };
      positions.combat = { following: true, entryId: null, offset: 0 };
      render();
    },
    dispose(): void {
      finish(); events.abort();
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onInputKey);
      input.removeEventListener("keyup", stopKeys);
      input.removeEventListener("keypress", stopKeys);
      root.removeEventListener("pointerdown", stopPointer);
      root.removeEventListener("click", stopPointer);
      root.removeEventListener("wheel", stopPointer);
      tabList.removeEventListener("keydown", onTabKey);
      root.remove(); style.remove();
    },
  };
}
