import type { NpcId, VendorId } from "./economy.js";
import type { QuestId, QuestOperation, GearSlot, GearItemId } from "./yard-content.js";
import type { AdventureAction, AdventureSnapshot, CombatForecast, EncounterSession, CombatActionTiming, Position } from './adventure-types.js';
import type { CharacterArchetype, LocalCharacter } from '../host/character-profile.js';
import type { MovementFrame, MovementCheckpoint } from './movement.js';

export const DISCONNECT_GRACE_MS = 5_000;
export const DEPARTURE_CLOSE_CODE = 4005;

export interface RemotePlayerView {
  readonly id: string;
  readonly name: string;
  readonly player: AdventureSnapshot['player'];
}
export interface SharedChatMessage { readonly id: number; readonly speakerId: string | null; readonly name: string; readonly text: string; readonly kind?: 'emote'; readonly partyId?: string; }
export interface PartyMemberView {
  readonly id: string;
  readonly name: string;
  readonly archetype: CharacterArchetype;
  readonly health: number;
  readonly maximumHealth: number;
  readonly online: boolean;
  readonly sameEncounter: boolean;
}
export interface PartyView {
  readonly id: string;
  readonly leaderId: string;
  readonly members: readonly PartyMemberView[];
}
export interface PartyInviteView {
  readonly id: string;
  readonly inviterId: string;
  readonly inviterName: string;
  readonly expiresAtMillis: number;
}
export type PartyCommand =
  | { type: 'partyInvite'; playerId: string }
  | { type: 'partyAccept'; inviteId: string }
  | { type: 'partyDecline'; inviteId: string }
  | { type: 'partyLeave' }
  | { type: 'partyKick'; playerId: string };
export type WorldCommand =
  | { type: "flight"; destination: import("./bellrunner.js").BellrunnerStopId }
  | PartyCommand
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'rejoin' }
  | { type: 'returnSpot'; destination: Position }
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
  | { type: 'previewBait'; destination: Position }
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
  | { type: 'state'; snapshot: AdventureSnapshot; players: readonly RemotePlayerView[]; chat: readonly SharedChatMessage[]; serverTime: number; serverWallTimeMillis: number; movement: MovementCheckpoint; session: EncounterSession; party: PartyView | null; partyInvites: readonly PartyInviteView[] }
  | { type: 'result'; sequence: number; accepted: boolean }
  | { type: 'movePreview'; sequence: number; forecast: CombatForecast | null }
  | { type: 'error'; text: string };
