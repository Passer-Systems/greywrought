import type { AdventureGame, AdventureSnapshot } from '../game/adventure-types.js';
import type { LocalCharacter } from './character-profile.js';
import type { ClientWorldMessage, RemotePlayerView, ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';
import { LocalMovement, isLocomotionAction } from './local-movement.js';

export interface NetworkAdventure extends AdventureGame {
  readonly renderPlayer: AdventureSnapshot['player'];
  readonly serverTime: number;
  readonly serverWallTimeMillis: number;
  readonly online: boolean;
  readonly connectionRevision: number;
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
  let prediction: LocalMovement;
  let serverTime = 0, serverWallTimeMillis = 0, lastMovementAt = 0;
  let players: readonly RemotePlayerView[] = [], chat: readonly SharedChatMessage[] = [];
  let sequence = 0, closed = false, online = false, connectionRevision = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let cameraX = NaN, cameraZ = NaN;
  let pendingCamera = false, lastCameraAt = 0;
  let readyResolve: () => void, readyReject: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const timeout = setTimeout(() => { if (!snapshot) { close(); readyReject(new Error('The world could not be reached.')); } }, 15000);
  function close(): void { closed = true; online = false; clearTimeout(timeout); clearTimeout(reconnect); socket?.close(); }
  function send(command: WorldCommand): void {
    if (!online || socket.readyState !== WebSocket.OPEN) return;
    const message: ClientWorldMessage = { type: 'command', sequence: ++sequence, command };
    socket.send(JSON.stringify(message));
  }
  function flushCamera(): void {
    if (!pendingCamera || !online) return;
    send({type:'camera',x:cameraX,z:cameraZ});
    pendingCamera = false; lastCameraAt = performance.now();
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
        serverTime = message.serverTime;
        serverWallTimeMillis = message.serverWallTimeMillis;
        if (!online) { prediction = new LocalMovement(snapshot, message.movement); connectionRevision++; }
        prediction.reconcile(snapshot, message.movement, serverTime);
        online = true; clearTimeout(timeout); readyResolve();
      } else if (message.type === 'error') {
        if (!snapshot) { close(); readyReject(new Error(message.text)); }
        else snapshot = {...snapshot,report:message.text};
      }
    };
    socket.onclose = () => {
      online = false; pendingCamera = Number.isFinite(cameraX) && Number.isFinite(cameraZ);
      if (!closed) reconnect = setTimeout(open, 1000);
    };
  }
  open(); await ready;
  return {
    get snapshot() { return snapshot; },
    get renderPlayer() { return prediction.player; },
    get serverTime() { return serverTime; },
    get serverWallTimeMillis() { return serverWallTimeMillis; },
    get online() { return online; },
    get connectionRevision() { return connectionRevision; },
    get players() { return players; },
    get chat() { return chat; },
    advance(seconds) {
      if (!online) return;
      prediction.advance(seconds);
      const now = performance.now();
      if (now - lastMovementAt >= 50) {
        const frames = prediction.takeOutgoing();
        if (frames.length) send({type:'movement',frames});
        lastMovementAt = now;
      }
      if (now - lastCameraAt >= 50) flushCamera();
    },
    setAction(action, pressed) {
      if (isLocomotionAction(action)) { prediction.setAction(action, pressed); return; }
      if (pressed) flushCamera(); send({type:'action',action,pressed});
    },
    setMouseForward(active) { prediction.setMouseForward(active); },
    setCameraForward(x,z) { prediction.setCameraForward(x,z); if (x!==cameraX || z!==cameraZ) { cameraX=x;cameraZ=z;pendingCamera=true; } },
    selectTarget(id) { send({type:'target',id}); },
    openLoot(id) { send({type:'loot',id}); },
    setTradeOffer(kind,quantity) { send({type:'trade',kind,quantity}); },
    interactNpc(id) { send({type:"interactNpc",id}); },
    quest(id, operation) { send({type:"quest",id,operation}); },
    equip(slot, item) { send({type:"equip",slot,item}); },
    save() { throw new Error('Shared journeys are saved by the world.'); },
    sendChat(text) { send({type:'chat',text}); },
    close,
  };
}
