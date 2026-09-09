import type { AdventureLogEntry } from "../game/adventure-types.js";

type Channel = AdventureLogEntry["channel"];
interface ScrollPosition { following: boolean; entryId: string | null; offset: number; }

export function createChatLog(host: HTMLElement, onSend?: (text: string) => void) {
  const style = document.createElement("style");
  style.textContent = `
    #chat-log { position:absolute; z-index:15; left:8px; bottom:8px; width:min(340px,calc(100% - 16px)); height:160px; display:flex; flex-direction:column; color:#e0d8bd; pointer-events:auto; font:var(--ui-font-body)/1.45 system-ui,sans-serif; text-shadow:0 1px 2px #000; }
    #chat-log-tabs { display:flex; flex:0 0 25px; align-items:end; gap:3px; padding-left:5px; }
    #chat-log [data-log-tab] { padding:3px 11px 4px; border:1px solid #8d815c88; border-bottom:0; border-radius:4px 4px 0 0; color:#b8a270; background:#101510b3; font:var(--ui-font-body) Georgia,serif; white-space:nowrap; }
    #chat-log [data-log-tab][aria-selected="true"] { color:#f1d18b; background:#1b2118e3; border-color:#b3a16d99; }
    #chat-log [data-log-tab]:hover { color:#ffe6ad; background:#293024db; }
    #chat-log [data-log-tab]:focus-visible, #chat-log-messages:focus-visible { outline:1px solid #e4c780; outline-offset:-2px; }
    #chat-log-messages { position:relative; flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; overflow-anchor:none; scrollbar-width:thin; scrollbar-color:#77745580 transparent; padding:7px 9px; border:1px solid #78806355; border-radius:3px; background:linear-gradient(90deg,#080f0acf,#0d140dab); box-shadow:inset 0 1px 6px #0005; }
    #chat-log [data-log-entry] { margin:0 0 3px; overflow-wrap:anywhere; }
    #chat-log .log-chat { color:#dfd5ab; }
    #chat-log .log-combat { color:#e1b794; }
    #chat-log-input { box-sizing:border-box; flex:0 0 30px; width:100%; border:1px solid #78806388; border-radius:3px; background:#0d1815e8; padding:5px 9px; color:#f3e6c7; font:var(--ui-font-body) system-ui,sans-serif; }
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
  let entries: readonly AdventureLogEntry[] = [];
  const positions: Record<Channel, ScrollPosition> = {
    chat: { following: true, entryId: null, offset: 0 },
    combat: { following: true, entryId: null, offset: 0 },
  };
  const tabs = new Map<Channel, HTMLButtonElement>();
  const input = document.createElement("input");
  input.id = "chat-log-input"; input.type = "text"; input.maxLength = 280;
  input.placeholder = "Enter to chat"; input.setAttribute("aria-label", "Message everyone");
  input.autocomplete = "off";
  input.hidden = !onSend;
  const onInputKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); input.blur(); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const text = input.value.trim().slice(0, 280);
      if (text && onSend) { onSend(text); input.value = ""; select("chat"); }
      input.blur();
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
    const position = positions[selected];
    const rows = entries.filter(entry => entry.channel === selected).map(entry => {
      const row = document.createElement("p");
      row.dataset.logEntry = String(entry.id);
      row.className = `log-${entry.channel}`;
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
    if (position.following) view.scrollTop = view.scrollHeight;
    else {
      const anchor = rows.find(row => row.dataset.logEntry === position.entryId);
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
  root.append(tabList, view, input); host.append(style, root);
  render();
  return {
    focusInput(): void { if (onSend) { select("chat"); input.focus(); } },
    update(next: readonly AdventureLogEntry[]): void {
      const bounded = next.slice(-200);
      if (bounded.length === entries.length && bounded.every((entry, index) => {
        const previous = entries[index];
        return previous?.id === entry.id && previous.channel === entry.channel && previous.text === entry.text;
      })) return;
      remember(); entries = bounded; render();
    },
    reset(): void {
      input.value = "";
      entries = []; selected = "chat";
      positions.chat = { following: true, entryId: null, offset: 0 };
      positions.combat = { following: true, entryId: null, offset: 0 };
      render();
    },
    dispose(): void {
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
