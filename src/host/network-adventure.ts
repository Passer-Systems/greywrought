import type { AdventureGame, AdventureSnapshot, CombatForecast, EncounterSession, Position } from '../game/adventure-types.js';
import type { LocalCharacter } from './character-profile.js';
import type { PartyCommand, PartyView, PartyInviteView, ClientWorldMessage, RemotePlayerView, ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';
import { LocalMovement, isLocomotionAction } from './local-movement.js';
import { PlayerFollow } from './player-follow.js';
import { DISCONNECT_GRACE_MS, DEPARTURE_CLOSE_CODE } from '../game/multiplayer-types.js';

export interface NetworkAdventure extends AdventureGame {
  readonly renderPlayer: AdventureSnapshot['player'];
  readonly serverTime: number;
  readonly serverWallTimeMillis: number;
  readonly online: boolean;
  readonly reconnecting: boolean;
  readonly connectionRevision: number;
  readonly session: EncounterSession;
  readonly inputEnabled: boolean;
  readonly pendingTransition: 'resume' | 'rejoin' | null;
  readonly players: readonly RemotePlayerView[];
  readonly chat: readonly SharedChatMessage[];
  readonly party: PartyView | null;
  readonly partyInvites: readonly PartyInviteView[];
  partyCommand(command: PartyCommand): void;
  sendChat(text: string): void;
  followPlayer(id: string | null): void;
  readonly autorunning: boolean;
  toggleAutorun(): void;
  stopAutorun(): void;
  pause(): void;
  resume(): void;
  rejoin(): void;
  selectReturnSpot(destination: Position): boolean;
  submitBait(destination: Position, via?: readonly Position[]): Promise<boolean>;
  subscribe(listener: () => void): () => void;
  close(): void;
}
export async function connectAdventure(character: LocalCharacter, onCharacter?: (character: LocalCharacter) => void): Promise<NetworkAdventure> {
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
  let party: PartyView | null = null;
  let partyInvites: readonly PartyInviteView[] = [];
  const notices: SharedChatMessage[] = [];
  const follow = new PlayerFollow();
  function stopFollowing() { follow.stop(); prediction?.setFollowDestination(null); }
  let noticeId = -1_000_000_000;
  const previews = new Map<number, (forecast: CombatForecast | null) => void>();
  function clearPreviews() { for (const resolve of previews.values()) resolve(null); previews.clear(); }
  const submissions = new Map<number, (accepted: boolean) => void>();
  function clearSubmissions() { for (const resolve of submissions.values()) resolve(false); submissions.clear(); }
  let sequence = 0, closed = false, online = false, connectionRevision = 0;
  let reconnecting = false;
  let disconnectGrace: ReturnType<typeof setTimeout> | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let socketGeneration = 0;
  let cameraX = NaN, cameraZ = NaN;
  let pendingCamera = false, lastCameraAt = 0;
  let pauseRequest: number | null = null;
  let transitionRequest: number | null = null;
  let pendingTransition: 'resume' | 'rejoin' | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const inputEnabled = () => online && session.mode !== 'paused' && session.mode !== 'viewing' && pauseRequest === null && transitionRequest === null;
  let readyResolve: () => void, readyReject: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let handshakeTimeout: ReturnType<typeof setTimeout> | undefined;
  let livenessTimeout: ReturnType<typeof setTimeout> | undefined;
  const timeout = setTimeout(() => { if (!snapshot) { close(); readyReject(new Error('The world could not be reached.')); } }, 15000);
  function close(): void {
    if (online) send({type:'pause'});
    clearPreviews(); clearSubmissions();
    closed = true; online = false; socketGeneration++; clearTimeout(timeout); clearTimeout(handshakeTimeout); clearTimeout(livenessTimeout); clearTimeout(reconnect); clearTimeout(disconnectGrace); reconnecting = false; socket?.close(DEPARTURE_CLOSE_CODE, 'Leaving world');
  }
  function send(command: WorldCommand): number | null {
    if (!online || socket.readyState !== WebSocket.OPEN) return null;
    if (session.mode === 'viewing' && !['returnSpot', 'rejoin', 'chat', 'camera'].includes(command.type) && !command.type.startsWith('party')) return null;
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
    if (closed) return;
    clearTimeout(reconnect); reconnect = undefined;
    const generation = ++socketGeneration;
    const current = new WebSocket(url);
    socket = current;
    function disconnected(): void {
      if (closed || generation !== socketGeneration) return;
      stopFollowing();
      prediction?.setAutorun(false);
      socketGeneration++;
      clearTimeout(handshakeTimeout); handshakeTimeout = undefined;
      clearTimeout(livenessTimeout); livenessTimeout = undefined;
      clearPreviews(); clearSubmissions();
      if (online) {
        reconnecting = true;
        disconnectGrace = setTimeout(() => { reconnecting = false; disconnectGrace = undefined; notify(); }, DISCONNECT_GRACE_MS);
      }
      online = false; pauseRequest = null; transitionRequest = null; pendingTransition = null; pendingCamera = false;
      current.close();
      reconnect = setTimeout(open, 1000);
      notify();
    }
    handshakeTimeout = setTimeout(disconnected, 15000);
    current.onopen = () => {
      if (closed || generation !== socketGeneration) { current.close(); return; }
      const message: ClientWorldMessage = {type:'join',token:token!,character};
      current.send(JSON.stringify(message));
    };
    current.onmessage = event => {
      if (closed || generation !== socketGeneration) return;
      const message = JSON.parse(String(event.data)) as ServerWorldMessage;
      if (message.type === 'joined') {
        character = message.character;
        onCharacter?.(character);
      }
      if (message.type === 'result' && submissions.has(message.sequence)) {
        submissions.get(message.sequence)!(message.accepted); submissions.delete(message.sequence);
      }
      if (message.type === 'movePreview') {
        previews.get(message.sequence)?.(message.forecast); previews.delete(message.sequence);
      } else if (message.type === 'result' && !message.accepted && previews.has(message.sequence)) {
        previews.get(message.sequence)!(null); previews.delete(message.sequence);
      } else if (message.type === 'state') {
        if (!message.session) {
          close(); readyReject(new Error('The world is being updated. Reload to reconnect.')); return;
        }
        const changed = !online || session?.id !== message.session.id || session?.mode !== message.session.mode;
        session = message.session;
        if (session.mode === 'paused') pauseRequest = null;
        snapshot = message.snapshot; players = message.players; chat = message.chat; party = message.party; partyInvites = message.partyInvites;
        serverTime = message.serverTime;
        serverWallTimeMillis = message.serverWallTimeMillis;
        clearTimeout(handshakeTimeout); handshakeTimeout = undefined;
        clearTimeout(livenessTimeout);
        livenessTimeout = setTimeout(function checkLiveness() {
          if (closed || generation !== socketGeneration || !online) return;
          if (document.hidden) { livenessTimeout = setTimeout(checkLiveness, 1000); return; }
          disconnected();
        }, 3000);
        if (changed) { stopFollowing(); prediction = new LocalMovement(snapshot, message.movement); connectionRevision++; transitionRequest = null; pendingTransition = null; }
        if (session.mode === 'viewing' && (changed || session.returnPlan?.confirmed)) { transitionRequest = null; pendingTransition = null; }
        prediction.reconcile(snapshot, message.movement, serverTime);
        online = true; reconnecting = false; clearTimeout(disconnectGrace); disconnectGrace = undefined; clearTimeout(timeout); readyResolve();
        notify();
      } else if (message.type === 'result' && message.sequence === pauseRequest && !message.accepted) {
        pauseRequest = null; notify();
      } else if (message.type === 'result' && message.sequence === transitionRequest && !message.accepted) {
        transitionRequest = null; pendingTransition = null; notify();
      } else if (message.type === 'error') {
        if (!snapshot) { close(); readyReject(new Error(message.text)); }
        else {
          snapshot = {...snapshot,report:message.text};
          notices.push({id:noticeId--,speakerId:null,name:'Notice',text:message.text});
          if (notices.length > 20) notices.shift();
          notify();
        }
      }
    };
    current.onclose = disconnected;
  }
  open(); await ready;
  return {
    get snapshot() { return snapshot; },
    get renderPlayer() { return inputEnabled() ? prediction.player : snapshot.player; },
    get serverTime() { return serverTime; },
    get serverWallTimeMillis() { return serverWallTimeMillis; },
    get online() { return online; },
    get reconnecting() { return reconnecting; },
    get connectionRevision() { return connectionRevision; },
    get session() { return session; },
    get inputEnabled() { return inputEnabled(); },
    get pendingTransition() { return pendingTransition; },
    get players() { return players; },
    get party() { return party; },
    get partyInvites() { return partyInvites; },
    partyCommand(command) { send(command); },
    get chat() { return [...chat, ...notices]; },
    get autorunning() { return prediction.autorunning; },
    toggleAutorun() {
      if (!inputEnabled()) return;
      stopFollowing();
      prediction.setAutorun(!prediction.autorunning);
      notify();
    },
    stopAutorun() { prediction.setAutorun(false); },
    followPlayer(id) {
      prediction.setAutorun(false);
      if (follow.targetId !== null && (id === null || id === follow.targetId)) {
        stopFollowing(); notices.push({ id: noticeId--, speakerId: null, name: 'Notice', text: 'Stopped following.' }); notify(); return;
      }
      follow.targetId = id;
      const target = players.find(player => player.id === id);
      const destination = inputEnabled() && snapshot.phase !== 'lost' ? follow.destination(snapshot.player, players, party) : null;
      if (!destination) stopFollowing();
      notices.push({ id: noticeId--, speakerId: null, name: 'Notice', text: destination ? 'Following ' + target!.name + '. Move to stop.' : 'Select a nearby player to follow.' });
      notify();
    },
    advance(seconds) {
      if (!inputEnabled()) { stopFollowing(); prediction.setAutorun(false); return; }
      prediction.setFollowDestination(follow.targetId === null ? null : follow.destination(snapshot.player, players, party));
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
      if (pressed && ['forward', 'backward', 'left', 'right'].includes(action)) prediction.setAutorun(false);
      if (pressed && isLocomotionAction(action)) stopFollowing();
      if (pressed && !inputEnabled()) return;
      if (isLocomotionAction(action)) { prediction.setAction(action, pressed); return; }
      if (pressed) flushCamera(); send({type:'action',action,pressed});
    },
    setMouseForward(active) { if (active) { stopFollowing(); prediction.setAutorun(false); } prediction.setMouseForward(active && inputEnabled()); },
    emote(name) { if (inputEnabled()) send({ type: 'chat', text: `/${name}` }); },
    sit() { if (inputEnabled()) send({ type: 'sit' }); },
    setCameraForward(x,z) { prediction.setCameraForward(x,z); if (x!==cameraX || z!==cameraZ) { cameraX=x;cameraZ=z;pendingCamera=true; } },
    selectTarget(id) { send({type:'target',id}); },
    queueBait(destination, via = []) { send({type:'bait',destination,via}); return online; },
    submitBait(destination, via = []) {
      return new Promise(resolve => {
        const id = inputEnabled() ? send({type:'bait',destination,via}) : null;
        if (id === null) resolve(false); else submissions.set(id, resolve);
      });
    },
    previewBait(destination, via = []) {
      clearPreviews();
      return new Promise(resolve => {
        const id = inputEnabled() ? send({type:'previewBait',destination,via}) : null;
        if (id === null) resolve(null); else previews.set(id, resolve);
      });
    },
    readyCombat() { send({type:'ready'}); return online; },
    setSprint(active) { return inputEnabled() && send({type:'sprint',active}) !== null; },
    setActionTiming(timing) { send({type:'actionTiming',timing}); return online; },
    removeQueuedAction(id) { send({type:'remove',id}); },
    clearQueuedActions() { send({type:'clear'}); },
    openLoot(id) { if (inputEnabled()) send({type:'loot',id}); },
    setTradeOffer(kind,quantity) { if (inputEnabled()) send({type:'trade',kind,quantity}); },
    bankTransfer(operation,kind,quantity) { return inputEnabled() && send({type:"bank",operation,kind,quantity}) !== null; },
    buyGear(vendor,item) { return inputEnabled() && send({type:"buyGear",vendor,item}) !== null; },
    fly(destination) { return inputEnabled() && send({type:'flight',destination}) !== null; },
    interactNpc(id) { if (inputEnabled()) send({type:"interactNpc",id}); },
    quest(id, operation) { if (inputEnabled()) send({type:"quest",id,operation}); },
    equip(slot, item) { if (inputEnabled()) send({type:"equip",slot,item}); },
    save() { throw new Error('Shared journeys are saved by the world.'); },
    sendChat(text) { if (text.trim().toLowerCase() === '/sit') { if (inputEnabled()) send({ type: 'sit' }); } else send({type:'chat',text}); },
    pause() {
      stopFollowing();
      prediction.setAutorun(false);
      if (!inputEnabled()) return;
      pauseRequest = send({type:'pause'}); notify();
    },
    resume() { if (online && session.mode === 'paused' && transitionRequest === null) { pendingTransition = 'resume'; transitionRequest = send({type:'resume'}); notify(); } },
    rejoin() { if (online && session.canRejoin && transitionRequest === null) { pendingTransition = 'rejoin'; transitionRequest = send({type:'rejoin'}); notify(); } },
    selectReturnSpot(destination) { return online && session.mode === 'viewing' && !session.returnPlan?.confirmed && transitionRequest === null && send({type:'returnSpot',destination}) !== null; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close,
  };
}
