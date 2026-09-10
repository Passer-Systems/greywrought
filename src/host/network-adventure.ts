import type { AdventureGame, AdventureSnapshot, EncounterSession } from '../game/adventure-types.js';
import type { LocalCharacter } from './character-profile.js';
import type { ClientWorldMessage, RemotePlayerView, ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';
import { LocalMovement, isLocomotionAction } from './local-movement.js';

export interface NetworkAdventure extends AdventureGame {
  readonly renderPlayer: AdventureSnapshot['player'];
  readonly serverTime: number;
  readonly serverWallTimeMillis: number;
  readonly online: boolean;
  readonly connectionRevision: number;
  readonly session: EncounterSession;
  readonly inputEnabled: boolean;
  readonly players: readonly RemotePlayerView[];
  readonly chat: readonly SharedChatMessage[];
  sendChat(text: string): void;
  pause(): void;
  resume(): void;
  rejoin(): void;
  subscribe(listener: () => void): () => void;
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
  let session: EncounterSession;
  let prediction: LocalMovement;
  let serverTime = 0, serverWallTimeMillis = 0, lastMovementAt = 0;
  let players: readonly RemotePlayerView[] = [], chat: readonly SharedChatMessage[] = [];
  let sequence = 0, closed = false, online = false, connectionRevision = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let cameraX = NaN, cameraZ = NaN;
  let pendingCamera = false, lastCameraAt = 0;
  let pauseRequest: number | null = null, lastStateAt = performance.now();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const inputEnabled = () => online && session.mode !== 'paused' && pauseRequest === null;
  let readyResolve: () => void, readyReject: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const timeout = setTimeout(() => { if (!snapshot) { close(); readyReject(new Error('The world could not be reached.')); } }, 15000);
  const heartbeat = setInterval(() => {
    if (!online) return;
    if (performance.now() - lastStateAt > 5000) { online = false; notify(); socket.close(); }
    else send({type:'heartbeat'});
  }, 1000);
  function close(): void {
    if (online) send({type:'pause'});
    closed = true; online = false; clearTimeout(timeout); clearTimeout(reconnect); clearInterval(heartbeat); socket?.close();
  }
  function send(command: WorldCommand): number | null {
    if (!online || socket.readyState !== WebSocket.OPEN) return null;
    const message: ClientWorldMessage = { type: 'command', sequence: ++sequence, command };
    socket.send(JSON.stringify(message));
    return message.sequence;
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
        if (!message.session) {
          close(); readyReject(new Error('The world is being updated. Reload to reconnect.')); return;
        }
        const changed = !online || session?.id !== message.session.id || session?.mode !== message.session.mode;
        session = message.session;
        if (session.mode === 'paused') pauseRequest = null;
        snapshot = message.snapshot; players = message.players; chat = message.chat;
        serverTime = message.serverTime;
        serverWallTimeMillis = message.serverWallTimeMillis;
        lastStateAt = performance.now();
        if (changed) { prediction = new LocalMovement(snapshot, message.movement); connectionRevision++; }
        prediction.reconcile(snapshot, message.movement, serverTime);
        online = true; clearTimeout(timeout); readyResolve();
        notify();
      } else if (message.type === 'result' && message.sequence === pauseRequest && !message.accepted) {
        pauseRequest = null; notify();
      } else if (message.type === 'error') {
        if (!snapshot) { close(); readyReject(new Error(message.text)); }
        else snapshot = {...snapshot,report:message.text};
      }
    };
    socket.onclose = () => {
      online = false; pauseRequest = null; pendingCamera = false; notify();
      if (!closed) reconnect = setTimeout(open, 1000);
    };
  }
  open(); await ready;
  return {
    get snapshot() { return snapshot; },
    get renderPlayer() { return inputEnabled() ? prediction.player : snapshot.player; },
    get serverTime() { return serverTime; },
    get serverWallTimeMillis() { return serverWallTimeMillis; },
    get online() { return online; },
    get connectionRevision() { return connectionRevision; },
    get session() { return session; },
    get inputEnabled() { return inputEnabled(); },
    get players() { return players; },
    get chat() { return chat; },
    advance(seconds) {
      if (!inputEnabled()) return;
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
      if (pressed && !inputEnabled()) return;
      if (isLocomotionAction(action)) { prediction.setAction(action, pressed); return; }
      if (pressed) flushCamera(); send({type:'action',action,pressed});
    },
    setMouseForward(active) { prediction.setMouseForward(active && inputEnabled()); },
    setCameraForward(x,z) { prediction.setCameraForward(x,z); if (x!==cameraX || z!==cameraZ) { cameraX=x;cameraZ=z;pendingCamera=true; } },
    selectTarget(id) { send({type:'target',id}); },
    openLoot(id) { if (inputEnabled()) send({type:'loot',id}); },
    setTradeOffer(kind,quantity) { if (inputEnabled()) send({type:'trade',kind,quantity}); },
    interactNpc(id) { if (inputEnabled()) send({type:"interactNpc",id}); },
    quest(id, operation) { if (inputEnabled()) send({type:"quest",id,operation}); },
    equip(slot, item) { if (inputEnabled()) send({type:"equip",slot,item}); },
    save() { throw new Error('Shared journeys are saved by the world.'); },
    sendChat(text) { send({type:'chat',text}); },
    pause() {
      if (!inputEnabled()) return;
      pauseRequest = send({type:'pause'}); notify();
    },
    resume() { if (online && session.mode === 'paused') send({type:'resume'}); },
    rejoin() { if (online && session.canRejoin) send({type:'rejoin'}); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close,
  };
}
