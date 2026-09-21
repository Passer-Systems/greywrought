import type { PartyCommand, PartyInviteView, PartyMemberView, PartyView } from "../game/multiplayer-types.js";
import { publicUrl } from "./public-url.js";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, host: HTMLElement): HTMLElementTagNameMap[K] {
  const child = document.createElement(tag); child.className = className; host.append(child); return child;
}
function text(node: HTMLElement, value: string): void { if (node.textContent !== value) node.textContent = value; }
function attribute(node: HTMLElement, name: string, value: string): void { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }

const styles = `
#party-panel { position:absolute; top:18px; left:18px; width:196px; max-width:calc(100vw - 36px); max-height:calc(100dvh - 360px); overflow:auto; z-index:21; color:#f4dda4; pointer-events:auto; }
#party-panel[hidden],#party-invite[hidden],#party-context-menu[hidden],#party-context-menu [hidden] { display:none; }
.party-heading { display:flex; align-items:center; justify-content:space-between; margin:0 0 5px; font:600 var(--ui-font-small,12px) Georgia,serif; text-shadow:0 1px 2px #000; }
.party-coordination,.party-return,.party-pings { margin:4px 0; color:#d8e7cf; font:11px/1.3 system-ui,sans-serif; }
.party-return,.party-pings { padding:5px; border:1px solid #74886a; background:#14231de8; }
.party-ping-button { width:100%; margin-top:5px; padding:5px; border:1px solid #928760; border-radius:3px; color:#f0dfae; background:#253d2b; cursor:pointer; }
.party-ping-button:disabled { opacity:.55; cursor:default; }
.party-members { display:grid; gap:5px; }
.party-member { display:flex; align-items:center; width:100%; min-height:52px; padding:3px; border:1px solid #8a886c; border-radius:3px; background:linear-gradient(#343c32eb,#111c18f5); color:#f4dda4; text-align:left; cursor:pointer; box-shadow:0 2px 4px #0009; }
.party-member[aria-pressed=true] { border-color:#f2d67c; box-shadow:inset 0 0 0 1px #85d467,0 0 6px #9fd26199; background:linear-gradient(#425737,#17281b); }
.party-member[aria-disabled=true] { opacity:.65; cursor:default; }
.party-member img { flex:0 0 42px; width:42px; height:42px; box-sizing:border-box; border-radius:50%; object-fit:cover; object-position:50% 18%; border:2px solid #9a8e66; box-shadow:0 1px 3px #000b; }
.party-member-copy { flex:1; min-width:0; padding-left:5px; }
.party-member-name { display:block; overflow-wrap:anywhere; font:600 var(--ui-font-small,12px)/1.1 Georgia,serif; }
.party-member-status { display:block; margin:2px 0; color:#c4ccb5; font:10px/1.15 system-ui,sans-serif; }
.party-member-health { position:relative; height:12px; border:1px solid #8b8960; background:#101b14; }
.party-member-fill { display:block; height:100%; background:linear-gradient(#7cc95e,#32782d); }
.party-member-value { position:absolute; inset:0; color:#fff; font:10px/11px system-ui,sans-serif; text-align:center; text-shadow:0 1px 2px #000,1px 0 2px #000; }
#party-invite,#party-context-menu { position:fixed; z-index:65; padding:10px; border:2px ridge #969078; border-radius:4px; background:#172019f7; color:#f4dda4; box-shadow:0 4px 18px #000b; font:var(--ui-font-small,12px)/1.4 system-ui,sans-serif; pointer-events:auto; }
#party-invite { top:18px; left:50%; transform:translateX(-50%); width:270px; max-width:calc(100vw - 40px); text-align:center; }
.party-invite-actions { display:flex; gap:8px; margin-top:8px; }
#party-context-menu { width:210px; max-width:calc(100vw - 36px); max-height:calc(100dvh - 36px); overflow:auto; }
.party-menu-name { display:block; margin-bottom:7px; overflow-wrap:anywhere; font:600 var(--ui-font-body,14px) Georgia,serif; }
.party-menu-note { margin:7px 0 0; color:#bdc5b3; }
#party-context-menu button,#party-invite button { flex:1; padding:6px 8px; border:1px solid #928760; border-radius:3px; background:linear-gradient(#3b4e37,#192618); color:#f0dfae; font:inherit; cursor:pointer; }
#party-context-menu button { display:block; width:100%; margin-top:5px; text-align:left; }
#party-context-menu button:disabled { color:#9ba294; border-color:#515c4c; cursor:default; }
#party-panel button:focus-visible,#party-invite button:focus-visible,#party-context-menu button:focus-visible { outline:2px solid #f0d486; outline-offset:-2px; }
@media(max-width:700px) { #party-panel { top:8px; left:8px; width:175px; max-height:calc(100dvh - 320px); } #party-invite { top:8px; left:auto; right:8px; transform:none; width:230px; max-width:calc(100vw - 207px); } }
@media(max-height:600px) { #party-panel { max-height:35dvh; } }
`;

export function createPartyPanel(host: HTMLElement, callbacks: {
  onSelect(id: string): void;
  onFollow(id: string): void;
  onCommand(command: PartyCommand): void;
}) {
  const style = element("style", "", host); style.textContent = styles;
  const panel = element("section", "", host); panel.id = "party-panel"; panel.hidden = true; panel.setAttribute("aria-label", "Party");
  const heading = element("div", "party-heading", panel);
  const members = element("div", "party-members", panel);
  const returning = element("div", "party-return", panel); returning.hidden = true; returning.setAttribute("aria-live", "polite");
  const pings = element("div", "party-pings", panel); pings.hidden = true; pings.setAttribute("aria-live", "polite");
  const invite = element("section", "", host); invite.id = "party-invite"; invite.hidden = true; invite.setAttribute("aria-label", "Party invitation");
  const inviteText = element("div", "", invite); inviteText.setAttribute("aria-live", "polite");
  const inviteActions = element("div", "party-invite-actions", invite);
  const menu = element("section", "", host); menu.id = "party-context-menu"; menu.hidden = true; menu.setAttribute("aria-label", "Player actions");
  const menuName = element("strong", "party-menu-name", menu);
  const listeners = new AbortController(), options = { signal: listeners.signal };
  let selfId = "", party: PartyView | null = null, activeInvite: PartyInviteView | null = null;
  let menuPlayer: { id: string; name: string } | null = null, menuX = 0, menuY = 0;
  let menuSignature = "";
  const frames = new Map<string, { root: HTMLButtonElement; portrait: HTMLImageElement; name: HTMLElement; status: HTMLElement; coordination: HTMLElement; fill: HTMLElement; value: HTMLElement; signature: string }>();
  function button(host: HTMLElement, label: string, command: string, action: () => void): HTMLButtonElement {
    const node = element("button", "", host); node.type = "button"; node.dataset.partyCommand = command; text(node, label);
    node.addEventListener("click", action, options); return node;
  }
  const pingButton = button(panel, "Ping my location", "ping", () => callbacks.onCommand({ type: "partyPing" }));
  pingButton.className = "party-ping-button"; pingButton.title = "Show your party where you are for 20 seconds. You can also type /ping.";
  function closeMenu(): boolean {
    const wasOpen = !menu.hidden; menu.hidden = true; menuPlayer = null; menuSignature = ""; return wasOpen;
  }
  function send(command: PartyCommand): void { closeMenu(); callbacks.onCommand(command); }
  button(inviteActions, "Accept", "accept", () => { if (activeInvite) callbacks.onCommand({ type: "partyAccept", inviteId: activeInvite.id }); });
  button(inviteActions, "Decline", "decline", () => { if (activeInvite) callbacks.onCommand({ type: "partyDecline", inviteId: activeInvite.id }); });
  const select = button(menu, "Select player", "select", () => {
    if (!menuPlayer) return;
    const id = menuPlayer.id; closeMenu(); callbacks.onSelect(id);
  });
  const follow = button(menu, "Follow", "follow", () => {
    if (!menuPlayer) return;
    const id = menuPlayer.id; closeMenu(); callbacks.onFollow(id);
  });
  const inviteButton = button(menu, "Invite to party", "invite", () => { if (menuPlayer) send({ type: "partyInvite", playerId: menuPlayer.id }); });
  const kick = button(menu, "Remove from party", "kick", () => { if (menuPlayer) send({ type: "partyKick", playerId: menuPlayer.id }); });
  const leave = button(menu, "Leave party", "leave", () => send({ type: "partyLeave" }));
  const note = element("p", "party-menu-note", menu);
  function positionMenu(): void {
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, menuX))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, menuY))}px`;
  }
  function renderMenu(): void {
    if (!menuPlayer) return;
    const member = party?.members.find(candidate => candidate.id === menuPlayer?.id);
    const own = menuPlayer.id === selfId, leader = party?.leaderId === selfId;
    const unavailable = member && (!member.online || !member.sameEncounter);
    const reason = party && !leader ? "Only the party leader can invite players." : party && party.members.length >= 5 ? "Your party is full (5 players)." : "";
    const signature = JSON.stringify([menuPlayer, !!member, own, leader, unavailable, reason, !!party]);
    if (signature === menuSignature) return;
    menuSignature = signature;
    text(menuName, member?.name ?? menuPlayer.name);
    select.disabled = !!unavailable;
    follow.hidden = own; follow.disabled = !!unavailable;
    text(select, !member?.online && member ? "Player offline" : unavailable ? "Player elsewhere" : "Select player");
    inviteButton.hidden = own || !!member; inviteButton.disabled = !!reason;
    kick.hidden = !member || own || !leader;
    leave.hidden = !own || !party;
    text(note, !inviteButton.hidden ? reason : ""); note.hidden = !note.textContent;
    positionMenu();
  }
  function openPlayerMenu(player: { id: string; name: string }, x: number, y: number): void {
    menuPlayer = player; menuX = x; menuY = y; menuSignature = ""; menu.hidden = false; renderMenu();
    (Array.from(menu.querySelectorAll("button")).find(button => !button.hidden && !button.disabled) ?? menu).focus({ preventScroll: true });
  }
  for (const region of [panel, invite, menu]) {
    region.addEventListener("pointerdown", event => event.stopPropagation(), options);
    region.addEventListener("click", event => event.stopPropagation(), options);
    region.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); }, options);
  }
  document.addEventListener("pointerdown", event => { if (!(event.target instanceof Node) || !menu.contains(event.target)) closeMenu(); }, { ...options, capture: true });
  window.addEventListener("resize", () => { if (!menu.hidden) positionMenu(); }, options);
  function createFrame(member: PartyMemberView) {
    const root = element("button", "party-member", members); root.type = "button"; root.dataset.partyMember = member.id;
    const portrait = element("img", "", root); portrait.alt = ""; portrait.draggable = false;
    const copy = element("span", "party-member-copy", root);
    const name = element("strong", "party-member-name", copy), status = element("span", "party-member-status", copy);
    const coordination = element("span", "party-coordination", copy); coordination.style.display = "block";
    const health = element("div", "party-member-health", copy);
    const fill = element("span", "party-member-fill", health), value = element("span", "party-member-value", health);
    root.addEventListener("click", () => {
      const current = party?.members.find(candidate => candidate.id === member.id);
      if (current?.online && current.sameEncounter) callbacks.onSelect(current.id);
    }, options);
    root.addEventListener("contextmenu", event => {
      event.preventDefault();
      const current = party?.members.find(candidate => candidate.id === member.id);
      if (current) openPlayerMenu(current, event.clientX, event.clientY);
    }, options);
    return { root, portrait, name, status, coordination, fill, value, signature: "" };
  }
  return {
    update(nextSelfId: string, nextParty: PartyView | null, invites: readonly PartyInviteView[], selectedPlayerId: string | null): void {
      selfId = nextSelfId; party = nextParty;
      panel.hidden = !party;
      text(heading, party ? `Party · ${party.members.length} / 5` : "Party");
      const pending = party?.members.filter(member => member.returnStatus === 'waiting') ?? [];
      returning.hidden = !party?.members.some(member => member.returnStatus !== null);
      text(returning, pending.length ? 'Return · waiting for ' + pending.map(member => member.name + (!member.online ? ' (offline)' : '')).join(', ') : 'Return · everyone confirmed');
      pings.hidden = !party?.pings.length;
      text(pings, party?.pings.map(ping => ping.name + ' pinged ' + ping.location.toLowerCase() + ' (' + Math.round(ping.position.x) + ', ' + Math.round(ping.position.z) + ')').join(' · ') ?? '');
      pingButton.disabled = !party?.members.find(member => member.id === selfId)?.online || Boolean(party?.members.some(member => member.returnStatus !== null));
      const currentIds = new Set(party?.members.map(member => member.id));
      for (const [id, frame] of frames) if (!currentIds.has(id)) { frame.root.remove(); frames.delete(id); }
      party?.members.forEach((member, index) => {
        let frame = frames.get(member.id);
        if (!frame) { frame = createFrame(member); frames.set(member.id, frame); }
        if (members.children[index] !== frame.root) members.insertBefore(frame.root, members.children[index] ?? null);
        const selected = selectedPlayerId === member.id, leader = party?.leaderId === member.id;
        const signature = JSON.stringify([member, selected, leader]);
        if (frame.signature === signature) return;
        frame.signature = signature;
        const className = member.archetype === "hunter" ? "Ranger" : member.archetype[0]!.toUpperCase() + member.archetype.slice(1);
        const status = !member.online ? "Offline" : !member.sameEncounter ? "Elsewhere" : member.health <= 0 ? "Dead" : className;
        text(frame.name, member.name);
        text(frame.status, `${status}${leader ? " · Leader" : ""}`);
        const ready = !member.combat || member.combat.phase === 'idle' ? '' : member.combat.phase === 'active' ? 'Acting' : member.combat.ready ? 'Ready' : 'Not ready';
        const target = !member.online || !member.sameEncounter ? '' : 'Target: ' + (member.target?.name ?? 'None');
        const returnStatus = member.returnStatus === 'confirmed' ? ' · Return confirmed' : member.returnStatus === 'waiting' ? ' · Return unconfirmed' : '';
        text(frame.coordination, [target, ready].filter(Boolean).join(' · ') + returnStatus);
        attribute(frame.portrait, "src", publicUrl(`assets/ui/characters/${member.archetype}.webp`));
        attribute(frame.root, "aria-pressed", String(selected));
        attribute(frame.root, "aria-disabled", String(!member.online || !member.sameEncounter));
        attribute(frame.root, "aria-label", `${member.name}, ${className}, ${status}${leader ? ", party leader" : ""}, ${Math.ceil(member.health)} of ${member.maximumHealth} health, ${target}, ${ready}${returnStatus}`);
        frame.root.title = `${member.name} · ${className}. Right-click for party actions.`;
        frame.fill.style.width = `${Math.max(0, Math.min(100, member.maximumHealth > 0 ? member.health / member.maximumHealth * 100 : 0))}%`;
        text(frame.value, `${Math.ceil(member.health)} / ${member.maximumHealth}`);
      });
      activeInvite = invites.find(candidate => candidate.expiresAtMillis > Date.now()) ?? null;
      invite.hidden = !activeInvite;
      text(inviteText, activeInvite ? `${activeInvite.inviterName} invited you to a party.` : "");
      renderMenu();
    },
    openPlayerMenu,
    closeMenu,
    dispose(): void { listeners.abort(); frames.clear(); panel.remove(); invite.remove(); menu.remove(); style.remove(); },
  };
}
