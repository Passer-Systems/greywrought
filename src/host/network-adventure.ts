import type { AdventureGame, AdventureSnapshot } from '../game/adventure-types.js';
import type { LocalCharacter } from './character-profile.js';
import type { ClientWorldMessage, RemotePlayerView, ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';

export interface NetworkAdventure extends AdventureGame {
  readonly online: boolean;
  readonly players: readonly RemotePlayerView[];
  readonly chat: readonly SharedChatMessage[];
  sendChat(text: string): void;
  close(): void;
}
export async function connectAdventure(character: LocalCharacter): Promise<NetworkAdventure> {
  const tokenKey = 'greywrought/world-token';
  let token = localStorage.getItem(tokenKey);
  if (!token) { token = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem(tokenKey, token); }
  const configured = document.querySelector<HTMLMetaElement>('meta[name=greywrought-world]')?.content;
  const url = new URL(configured ?? '/world', location.href);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  let socket: WebSocket;
  let snapshot: AdventureSnapshot;
  let players: readonly RemotePlayerView[] = [], chat: readonly SharedChatMessage[] = [];
  let sequence = 0, closed = false, online = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let cameraX = NaN, cameraZ = NaN;
  let readyResolve: () => void, readyReject: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const timeout = setTimeout(() => { if (!snapshot) { close(); readyReject(new Error('The world could not be reached.')); } }, 15000);
  function close(): void { closed = true; online = false; clearTimeout(timeout); clearTimeout(reconnect); socket?.close(); }
  function send(command: WorldCommand): void {
    if (!online || socket.readyState !== WebSocket.OPEN) return;
    const message: ClientWorldMessage = { type: 'command', sequence: ++sequence, command };
    socket.send(JSON.stringify(message));
  }
  function open(): void {
    socket = new WebSocket(url);
    socket.onopen = () => {
      const message: ClientWorldMessage = {type:'join',token:token!,character};
      socket.send(JSON.stringify(message));
    };
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as ServerWorldMessage;
      if (message.type === 'state') {
        snapshot = message.snapshot; players = message.players; chat = message.chat;
        online = true; clearTimeout(timeout); readyResolve();
      } else if (message.type === 'error') {
        if (!snapshot) { close(); readyReject(new Error(message.text)); }
        else snapshot = {...snapshot,report:message.text};
      }
    };
    socket.onclose = () => {
      online = false; cameraX = cameraZ = NaN;
      if (!closed) reconnect = setTimeout(open, 1000);
    };
  }
  open(); await ready;
  return {
    get snapshot() { return snapshot; },
    get online() { return online; },
    get players() { return players; },
    get chat() { return chat; },
    advance() {},
    setAction(action, pressed) { send({type:'action',action,pressed}); },
    setMouseForward(active) { send({type:'mouseForward',active}); },
    setCameraForward(x,z) { if (x!==cameraX || z!==cameraZ) { cameraX=x;cameraZ=z;send({type:'camera',x,z}); } },
    selectTarget(id) { send({type:'target',id}); },
    setQueuedDelay(id, seconds) { send({type:'delay',id,seconds}); },
    moveQueuedAction(id, seconds) { send({type:'move',id,seconds}); },
    replaceQueuedAction(id, action) { send({type:'replace',id,action});return online; },
    removeQueuedAction(id) { send({type:'remove',id}); },
    clearQueuedActions() { send({type:'clear'}); },
    openLoot(id) { send({type:'loot',id}); },
    setTradeOffer(kind,quantity) { send({type:'trade',kind,quantity}); },
    save() { throw new Error('Shared journeys are saved by the world.'); },
    sendChat(text) { send({type:'chat',text}); },
    close,
  };
}
