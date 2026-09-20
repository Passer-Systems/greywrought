import type { AdventureAction, CombatForecast } from '../game/adventure-types.js';
import type { ServerWorldMessage, WorldCommand } from '../game/multiplayer-types.js';
import type { PlayerProfile } from './profile.js';

export type WorldState = Extract<ServerWorldMessage, { type: 'state' }>;
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { stop(); reject(new Error('Action cancelled.')); };
    const timer = setTimeout(() => { stop(); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
interface Pending { resolve: (forecast: CombatForecast | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; preview: boolean; }
export class GameClient {
  private socket: WebSocket | undefined;
  private state: WorldState | undefined;
  private receivedAt = 0;
  private revision = 0;
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private connecting = false;
  notice: string | null = null;
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN && this.state !== undefined; }
  get current(): WorldState {
    if (!this.connected) throw new Error('Not connected. Call connect first.');
    if (Date.now() - this.receivedAt > 3000) { this.disconnect(); throw new Error('World updates stopped. Reconnect before acting.'); }
    return this.state!;
  }
  async connect(profile: PlayerProfile, signal?: AbortSignal): Promise<void> {
    if (this.connected) return;
    if (this.connecting) throw new Error('A connection is already being opened.');
    this.connecting = true; this.state = undefined; this.sequence = 0; this.notice = null;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(profile.worldUrl);
        this.socket = socket;
        const finish = (error?: Error) => {
          clearTimeout(timeout); signal?.removeEventListener('abort', abort);
          if (error) { this.disconnect(); reject(error); } else resolve();
        };
        const abort = () => finish(new Error('Connection cancelled.'));
        const timeout = setTimeout(() => finish(new Error('World connection timed out.')), 10000);
        signal?.addEventListener('abort', abort, { once: true });
        socket.onopen = () => {
          if (this.socket === socket) socket.send(JSON.stringify({ type: 'join', token: profile.token, character: profile.character }));
        };
        socket.onmessage = event => {
          if (this.socket !== socket) return;
          let message: ServerWorldMessage;
          try { message = JSON.parse(String(event.data)) as ServerWorldMessage; } catch { finish(new Error('World sent an unreadable message.')); return; }
          if (message.type === 'state') {
            if (!message.session || !message.snapshot?.player) { finish(new Error('World protocol is incompatible.')); return; }
            this.state = message; this.receivedAt = Date.now(); this.revision++; finish();
          } else if (message.type === 'error') {
            this.notice = message.text;
            if (!this.state) finish(new Error(message.text));
          } else if (message.type === 'result' || message.type === 'movePreview') {
            const pending = this.pending.get(message.sequence);
            if (!pending || message.type === 'result' && message.accepted && pending.preview) return;
            this.pending.delete(message.sequence); clearTimeout(pending.timer);
            if (message.type === 'result' && !message.accepted) pending.reject(new Error(this.notice ?? 'The game rejected this command. Observe the current encounter before retrying.'));
            else pending.resolve(message.type === 'movePreview' ? message.forecast : null);
          }
        };
        socket.onerror = () => finish(new Error('Cannot reach the game world.'));
        socket.onclose = () => {
          if (this.socket !== socket) return;
          const error = new Error('Game connection closed. Reconnect explicitly; actions are never replayed.');
          finish(error);
        };
        if (signal?.aborted) abort();
      });
    } finally { this.connecting = false; }
  }
  disconnect(): void {
    const socket = this.socket; this.socket = undefined; this.state = undefined;
    // The normal server disconnect path releases input and pauses this character.
    socket?.close();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Disconnected from the world.')); }
    this.pending.clear();
  }
  async send(command: WorldCommand): Promise<CombatForecast | null> {
    this.current;
    this.notice = null;
    const sequence = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.disconnect(); reject(new Error('Command acknowledgement timed out. Reconnect and observe; do not blindly repeat the action.')); }, 5000);
      this.pending.set(sequence, { resolve, reject, timer, preview: command.type === 'previewBait' });
      try { this.socket!.send(JSON.stringify({ type: 'command', sequence, command })); }
      catch { this.disconnect(); }
    });
  }
  async fresh(signal?: AbortSignal): Promise<WorldState> {
    const before = this.revision, deadline = Date.now() + 3000;
    while (this.revision <= before) {
      this.current;
      if (Date.now() >= deadline) throw new Error('No fresh world snapshot arrived.');
      await delay(20, signal);
    }
    return this.current;
  }
  async pulse(action: AdventureAction, signal?: AbortSignal): Promise<void> {
    try { await this.send({ type: 'action', action, pressed: true }); }
    finally { if (this.connected) await this.send({ type: 'action', action, pressed: false }); }
    await this.fresh(signal);
  }
  async move(x: number, z: number, seconds: number, signal?: AbortSignal): Promise<void> {
    const state = this.current;
    if (state.session.mode === 'paused' || state.snapshot.player.inCombat || state.snapshot.phase === 'lost') throw new Error('Walking is unavailable. Resume, or use a planned combat move during preparation.');
    const length = Math.hypot(x, z);
    if (!Number.isFinite(length) || length < 1e-9 || !Number.isFinite(seconds) || seconds < .1 || seconds > 3) throw new Error('Use a nonzero heading and 0.1–3 seconds.');
    await this.send({ type: 'camera', x: x / length, z: z / length });
    try {
      await this.send({ type: 'action', action: 'forward', pressed: true });
      await delay(seconds * 1000, signal);
    } finally { if (this.connected) await this.send({ type: 'action', action: 'forward', pressed: false }); }
    await this.fresh(signal);
  }
}
