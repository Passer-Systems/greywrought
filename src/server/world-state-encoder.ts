import type { ThreatView } from '../game/adventure-types.js';
import type { WorldStateMessage, WorldStateDelta } from '../game/multiplayer-types.js';

/** WebSocket ordering makes patches relative to the last state on this connection.
 * Public threat views own their mutable data; retaining one cannot follow later simulation changes. */
export function createWorldStateEncoder() {
  let previous: readonly ThreatView[] = [];
  let session = '';
  return {
    reset() { previous = []; session = ''; },
    encode(message: WorldStateMessage): WorldStateMessage | WorldStateDelta {
      const threats = message.snapshot.threats;
      const nextSession = `${message.session.id}/${message.session.mode}`;
      let baseline = session !== nextSession || threats.length !== previous.length || threats.some((threat, index) => threat.id !== previous[index]?.id);
      const patches: WorldStateDelta['threatPatches'][number][] = [];
      if (!baseline) for (const [index, threat] of threats.entries()) {
        const old = previous[index]!;
        const changes: Partial<ThreatView> = {};
        for (const key of Object.keys(threat) as (keyof ThreatView)[]) {
          const value = threat[key];
          if (value === old[key] || Bun.deepEquals(value, old[key], true)) continue;
          if (value === undefined) { baseline = true; break; }
          Object.assign(changes, { [key]: value });
        }
        if (Object.keys(old).some(key => !Object.hasOwn(threat, key))) baseline = true;
        if (baseline) break;
        if (Object.keys(changes).length) patches.push({ index, changes });
      }
      previous = threats; session = nextSession;
      if (baseline) return message;
      const { threats: _threats, ...snapshot } = message.snapshot;
      return { ...message, type: 'stateDelta', snapshot, threatPatches: patches };
    },
  };
}
