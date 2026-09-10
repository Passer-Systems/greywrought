import type { CharacterArchetype } from "../host/character-profile.js";
import type { QuestId, QuestOperation, QuestView, ProgressionView, GearSlot, GearItemId } from "./yard-content.js";
import type { MovementFrame, MovementCheckpoint } from "./movement.js";

export interface Position { readonly x: number; readonly y: number; readonly z: number; }
export interface AdventureLogEntry {
  readonly id: number;
  readonly channel: "chat" | "combat";
  readonly text: string;
}
export type AdventureAction =
  | "forward" | "backward" | "left" | "right" | "jump"
  | "strike" | "disengage" | "brace" | "bloodRage" | "jab" | "guard" | "gather" | "ritual" | "interact"
  | "buyPotion" | "drinkPotion" | "rest" | "target" | "openTrade" | "closeTrade" | "acceptTrade" | "closeShop" | "takeLoot" | "closeLoot" | "closeInn";
export interface TradeView {
  readonly kind: "supplies" | "potions"; readonly quantity: number; readonly receivedQuantity: number;
  readonly available: number; readonly canAccept: boolean; readonly reason: string; readonly step: number;
}
export type CombatAction = "strike" | "brace" | "disengage" | "bloodRage" | "jab" | "guard" | "drinkPotion";
export type CombatMove = { readonly action: CombatAction } | { readonly action: "equip"; readonly gear: { readonly slot: GearSlot; readonly item: GearItemId | null } };
export type QueuedCombatAction = CombatMove & {
  readonly id: number; readonly targetId: string | null;
  readonly offsetSeconds: number; readonly cost: number;
  readonly status: "pending" | "executed" | "failed"; readonly reason: string | null;
}
export interface CombatView {
  readonly phase: "idle" | "active" | "choosing" | "preparation"; readonly remainingSeconds: number;
  readonly elapsedSeconds: number; readonly cycle: number; readonly queued: readonly QueuedCombatAction[];
  readonly reservedStamina: number; readonly availableStamina: number;
}
export interface CorpseLootView {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly position: Position;
  readonly itemName: string;
  readonly kind: "salvage" | "relic";
  readonly quantity: number;
  readonly available: boolean;
  readonly reachable: boolean;
}
export type ThreatPhase = "dormant" | "patrol" | "approach" | "preparation" | "action" | "recovery" | "returning" | "cleared";
export interface ThreatAbilityView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly damage: number;
  readonly range: number;
  readonly noticeSeconds: number;
}
export interface MonsterLoreEntry {
  readonly id: string; readonly name: string; readonly health: number;
  readonly disposition: "hostile" | "neutral"; readonly description: string;
  readonly opener: string;
  readonly abilities: readonly ThreatAbilityView[];
  readonly sequences: readonly { readonly name: string; readonly abilityIds: readonly string[]; readonly offsetsSeconds: readonly number[]; readonly description: string; readonly probability?: number }[];
  readonly strategy: string;
}
export interface FireballView {
  readonly id: number; readonly origin: Position; readonly remainingSeconds: number;
  readonly duration: number; readonly damage: number;
}
export interface ThreatForecastEntry {
  readonly ability: ThreatAbilityView; readonly remainingSeconds: number; readonly status: "stored" | "pending" | "active";
}
export interface ThreatView {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly position: Position;
  readonly homePosition: Position;
  readonly disposition: "hostile" | "neutral";
  readonly targetPlayerId?: string | null;
  readonly aggro: boolean; readonly joinsNextWindow: boolean;
  readonly moving: boolean;
  readonly movementMode: "idle" | "walk" | "circle" | "lunge";
  readonly motionProgress: number;
  readonly facing: Position;
  readonly nextAttackSeconds: number;
  readonly attackOrigin: Position;
  readonly block: number; readonly blockSeconds: number; readonly volley: number;
  readonly fireballs: readonly FireballView[];
  readonly rootedSeconds: number;
  readonly canStrike: boolean;
  readonly canDisengage: boolean;
  readonly currentActivity: ThreatForecastEntry | null;
  readonly windowAction: { readonly ability: ThreatAbilityView; readonly offsetSeconds: number; readonly status: "pending" | "active" | "resolved" } | null;
  readonly forecast: readonly ThreatForecastEntry[];
  readonly currentAbility: ThreatAbilityView;
  readonly nextAbility: ThreatAbilityView;
  readonly health: number;
  readonly maximumHealth: number;
  readonly active: boolean;
  readonly selected: boolean;
  readonly phase: ThreatPhase;
  readonly remainingSeconds: number;
  readonly phaseDuration: number;
  readonly preparation: string;
  readonly intention: string;
  readonly damage: number;
  readonly reach: number;
  readonly benefit: string;
  readonly actionSequence: number;
  readonly lastActionHit: boolean;
  readonly targetPosition: Position;
}
export interface PlaceView {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly kind: "town" | "gate" | "resource" | "ritual" | "shop" | "inn";
}
export interface AdventureSnapshot {
  readonly quests: readonly QuestView[];
  readonly progression: ProgressionView;
  readonly phase: "town" | "expedition" | "lost";
  readonly combat: CombatView;
  readonly player: {
    readonly position: Position;
    readonly cameraForward: Position;
    readonly archetype: CharacterArchetype;
    readonly health: number;
    readonly maximumHealth: number;
    readonly grounded: boolean;
    readonly moving: boolean;
    readonly backpedaling: boolean;
    readonly attackSequence: number;
    readonly actionCooldown: number; readonly currentAction: AdventureAction | "equip" | null; readonly actionDuration: number;
    readonly guardSeconds: number;
    readonly block: number;
    readonly stamina: number; readonly maximumStamina: number; readonly staminaRecoverySeconds: number;
    readonly bloodRage: number; readonly rageDrainSeconds: number; readonly rageDecaySeconds: number; readonly inCombat: boolean;
    readonly maneuver: "none" | "lunge" | "disengage";
    readonly maneuverSeconds: number;
    readonly facing: Position;
  };
  readonly threats: readonly ThreatView[];
  readonly loot: readonly CorpseLootView[];
  readonly lootOpenId: string | null;
  readonly carriedSalvage: number;
  readonly places: readonly PlaceView[];
  readonly selectedThreat: string;
  readonly supplies: number;
  readonly cargo: number;
  readonly resourceRemaining: number;
  readonly potions: number;
  readonly carriedRelics: number;
  readonly bankedRelics: number;
  readonly presence: number;
  readonly ritualCalled: boolean;
  readonly shopOpen: boolean; readonly trade: TradeView | null;
  readonly innOpen: boolean;
  readonly log: readonly AdventureLogEntry[];
  readonly potionPrice: number;
  readonly potionHealing: number;
  readonly report: string;
}
export interface AdventureOptions {
  readonly archetype?: CharacterArchetype;
  readonly save?: string;
  /** Wall clock in milliseconds since the Unix epoch. */
  readonly now?: () => number;
}
export interface AdventureGame {
  readonly movementCheckpoint?: MovementCheckpoint;
  enableNetworkMovement?(enabled?: boolean): void;
  enqueueMovement?(frames: readonly MovementFrame[]): boolean;
  readonly snapshot: AdventureSnapshot;
  advance(seconds: number): void;
  setAction(action: AdventureAction, pressed: boolean): void;
  setMouseForward(active: boolean): void;
  setCameraForward(x: number, z: number): void;
  selectTarget(id: string): void;
  setQueuedDelay(id: number, seconds: number): void;
  moveQueuedAction(id: number, offsetSeconds: number): void;
  replaceQueuedAction(id: number, action: CombatAction): boolean;
  removeQueuedAction(id: number): void;
  clearQueuedActions(): void;
  openLoot(sourceId: string): void;
  setTradeOffer(kind: "supplies" | "potions", quantity: number): void;
  interactNpc(id: "mara" | "inn"): void;
  quest(id: QuestId, operation: QuestOperation): void;
  equip(slot: GearSlot, item: GearItemId | null): void;
  save(): string;
}

export interface SharedAdventure {
  join(id: string, name: string, archetype: CharacterArchetype): AdventureGame;
  leave(id: string): void;
  advance(seconds: number): void;
  getPlayer(id: string): AdventureGame | undefined;
  players(): readonly { readonly id: string; readonly name: string; readonly player: AdventureSnapshot["player"] }[];
  save(): string;
}
