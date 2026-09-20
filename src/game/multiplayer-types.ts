import type { NpcId, VendorId } from "./economy.js";
import type { QuestId, QuestOperation, GearSlot, GearItemId } from "./yard-content.js";
import type { AdventureAction, AdventureSnapshot, EncounterSession, CombatActionTiming, Position } from './adventure-types.js';
import type { LocalCharacter } from '../host/character-profile.js';
import type { MovementFrame, MovementCheckpoint } from './movement.js';

export interface RemotePlayerView {
  readonly id: string;
  readonly name: string;
  readonly player: AdventureSnapshot['player'];
}
export interface SharedChatMessage { readonly id: number; readonly speakerId: string | null; readonly name: string; readonly text: string; readonly kind?: 'emote'; }
export type WorldCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'rejoin' }
  | { type: "interactNpc"; id: NpcId }
  | { type: "buyGear"; vendor: VendorId; item: GearItemId }
  | { type: "quest"; id: QuestId; operation: QuestOperation }
  | { type: "equip"; slot: GearSlot; item: GearItemId | null }
  | { type: 'movement'; frames: readonly MovementFrame[] }
  | { type: 'action'; action: AdventureAction; pressed: boolean }
  | { type: 'mouseForward'; active: boolean }
  | { type: 'camera'; x: number; z: number }
  | { type: 'target'; id: string }
  | { type: 'bait'; destination: Position }
  | { type: 'ready' }
  | { type: 'actionTiming'; timing: CombatActionTiming }
  | { type: 'remove'; id: number }
  | { type: 'clear' }
  | { type: 'loot'; id: string }
  | { type: 'bank'; operation: 'deposit' | 'withdraw'; kind: 'supplies' | 'potions'; quantity: number }
  | { type: 'trade'; kind: 'supplies' | 'potions'; quantity: number }
  | { type: 'sit' }
  | { type: 'chat'; text: string };
export type ClientWorldMessage =
  | { type: 'join'; token: string; character: LocalCharacter }
  | { type: 'command'; sequence: number; command: WorldCommand };
export type ServerWorldMessage =
  | { type: 'state'; snapshot: AdventureSnapshot; players: readonly RemotePlayerView[]; chat: readonly SharedChatMessage[]; serverTime: number; serverWallTimeMillis: number; movement: MovementCheckpoint; session: EncounterSession }
  | { type: 'result'; sequence: number; accepted: boolean }
  | { type: 'error'; text: string };
