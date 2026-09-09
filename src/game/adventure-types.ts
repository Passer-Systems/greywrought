import type { CharacterArchetype } from "../host/character-profile.js";

export interface Position { readonly x: number; readonly y: number; readonly z: number; }
export interface AdventureLogEntry {
  readonly id: number;
  readonly channel: "chat" | "combat";
  readonly text: string;
}
export type AdventureAction =
  | "forward" | "backward" | "left" | "right" | "jump"
  | "strike" | "disengage" | "brace" | "bloodRage" | "gather" | "ritual" | "interact"
  | "buyPotion" | "drinkPotion" | "rest" | "target" | "closeShop" | "takeLoot" | "closeLoot" | "closeInn";
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
  readonly autoAttack: ThreatAbilityView | null; readonly opener: string;
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
  readonly position: Position;
  readonly homePosition: Position;
  readonly disposition: "hostile" | "neutral";
  readonly aggro: boolean;
  readonly moving: boolean;
  readonly movementMode: "idle" | "walk" | "hop" | "circle" | "lunge" | "bite";
  readonly motionProgress: number;
  readonly facing: Position;
  readonly nextAttackSeconds: number;
  readonly attackOrigin: Position;
  readonly autoAttack: ThreatAbilityView | null;
  readonly autoAttackSeconds: number;
  readonly autoAttackSequence: number;
  readonly block: number; readonly blockSeconds: number; readonly volley: number;
  readonly fireballs: readonly FireballView[];
  readonly rootedSeconds: number;
  readonly canStrike: boolean;
  readonly canDisengage: boolean;
  readonly currentActivity: ThreatForecastEntry | null;
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
  readonly phase: "town" | "expedition" | "lost";
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
    readonly actionCooldown: number; readonly currentAction: AdventureAction | null; readonly actionDuration: number;
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
  readonly shopOpen: boolean;
  readonly innOpen: boolean;
  readonly log: readonly AdventureLogEntry[];
  readonly potionPrice: number;
  readonly potionHealing: number;
  readonly report: string;
}
export interface AdventureOptions {
  readonly archetype?: CharacterArchetype;
  readonly save?: string;
}
export interface AdventureGame {
  readonly snapshot: AdventureSnapshot;
  advance(seconds: number): void;
  setAction(action: AdventureAction, pressed: boolean): void;
  setMouseForward(active: boolean): void;
  setCameraForward(x: number, z: number): void;
  selectTarget(id: string): void;
  openLoot(sourceId: string): void;
  save(): string;
}
