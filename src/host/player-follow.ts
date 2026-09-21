import type { AdventureSnapshot } from '../game/adventure-types.js';
import type { RemotePlayerView, PartyView } from '../game/multiplayer-types.js';

export class PlayerFollow {
  targetId: string | null = null;
  stop(): void { this.targetId = null; }
  destination(player: AdventureSnapshot['player'], players: readonly RemotePlayerView[], party: PartyView | null) {
    const target = players.find(candidate => candidate.id === this.targetId);
    const member = party?.members.find(candidate => candidate.id === this.targetId);
    if (!target || player.flight || player.health <= 0 || target.player.flight || target.player.health <= 0
      || member && (!member.online || !member.sameEncounter)) { this.stop(); return null; }
    return target.player.position;
  }
}
