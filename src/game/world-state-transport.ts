import type { ThreatView } from './adventure-types.js';
import type { ServerWorldMessage, WorldStateDelta } from './multiplayer-types.js';

/** Keep this closure self-contained so browser acceptance observers use the production decoder. */
export function createWorldMessageDecoder() {
  let threats: readonly ThreatView[] | undefined;
  return (message: ServerWorldMessage): Exclude<ServerWorldMessage, WorldStateDelta> => {
    if (message.type === 'state') { threats = message.snapshot.threats; return message; }
    if (message.type !== 'stateDelta') return message;
    if (!threats) throw new Error('World update arrived before its baseline');
    const next = [...threats];
    for (const { index, changes } of message.threatPatches) {
      const previous = next[index];
      if (!previous) throw new Error('World update has no matching threat');
      next[index] = { ...previous, ...changes };
    }
    threats = next;
    const { threatPatches: _patches, ...state } = message;
    return { ...state, type: 'state', snapshot: { ...message.snapshot, threats } };
  };
}
