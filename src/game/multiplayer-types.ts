import type { QuestId, QuestOperation, GearSlot, GearItemId } from "./yard-content.js";
import type { AdventureAction, AdventureSnapshot } from './adventure-types.js';
import type { LocalCharacter } from '../host/character-profile.js';
import type { MovementFrame, MovementCheckpoint } from './movement.js';

export interface RemotePlayerView {
  readonly id: string;
  readonly name: string;
  readonly player: AdventureSnapshot['player'];
}
export interface SharedChatMessage { readonly id: number; readonly speakerId: string | null; readonly name: string; readonly text: string; }
export type WorldCommand =
  | { type: "interactNpc"; id: "mara" | "inn" }
  | { type: "quest"; id: QuestId; operation: QuestOperation }
  | { type: "equip"; slot: GearSlot; item: GearItemId | null }
  | { type: 'movement'; frames: readonly MovementFrame[] }
  | { type: 'action'; action: AdventureAction; pressed: boolean }
  | { type: 'mouseForward'; active: boolean }
  | { type: 'camera'; x: number; z: number }
  | { type: 'target'; id: string }
  | { type: 'loot'; id: string }
  | { type: 'trade'; kind: 'supplies' | 'potions'; quantity: number }
  | { type: 'chat'; text: string };
export type ClientWorldMessage =
  | { type: 'join'; token: string; character: LocalCharacter }
  | { type: 'command'; sequence: number; command: WorldCommand };
export type ServerWorldMessage =
  | { type: 'state'; snapshot: AdventureSnapshot; players: readonly RemotePlayerView[]; chat: readonly SharedChatMessage[]; serverTime: number; serverWallTimeMillis: number; movement: MovementCheckpoint }
  | { type: 'result'; sequence: number; accepted: boolean }
  | { type: 'error'; text: string };
