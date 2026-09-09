import type { GameAction } from "../host/input-preferences.js";
import type { CharacterArchetype } from "../host/character-profile.js";

export type FrontierGateAccess = "sealed" | "temporary-open" | "permanent-open";
export interface EncounterFeatureFrame { readonly id: string; readonly position: Vector3Projection; readonly halfExtents: Vector3Projection; }
export interface EncounterTrapFrame extends EncounterFeatureFrame { readonly armed: boolean; readonly triggerSequence: number; }

export interface Vector3Projection { readonly x: number; readonly y: number; readonly z: number; }

export interface PlayerProjection {
  readonly position: Vector3Projection;
  readonly cameraForward: Vector3Projection;
  readonly backwardIntent: number;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly grounded: boolean;
  readonly boosterEquipment: string;
  readonly boosterEnergy: number;
  readonly boosterCapacity: number;
  readonly boosterThreshold: number;
  readonly boosterDelay: number;
  readonly statusEffect: string;
  readonly statusClock: number;
  readonly shieldClock: number;
  readonly shieldActive: boolean;
  readonly shieldEnergy: number;
  readonly shieldActionSequence: number;
  readonly shieldReflectSequence: number;
  readonly shieldAbsorbSequence: number;
  readonly swordActionSequence: number;
  readonly swordCommitmentClock: number;
  readonly rangedActionState: string;
  readonly rangedActionClock: number;
  readonly rangedActionSequence: number;
  readonly rangedActionDuration: number;
  readonly archetype: "unselected" | "warrior" | "mage" | "hunter";
  readonly classResource: Vector3Projection;
  readonly abilityCooldowns: Vector3Projection;
  readonly utilityCooldowns: Vector3Projection;
  readonly abilitySequences: Vector3Projection;
  readonly utilitySequences: Vector3Projection;
  readonly lastAbility: string;
  readonly classUtilitySequence: number;
  readonly selectionSequence: number;
  readonly combatTarget: string;
  readonly targetLockActive: boolean;
  readonly targetSelectionSequence: number;
  readonly combatStatus: string;
}

export interface EnemyProjection {
  readonly id: string;
  readonly position: Vector3Projection;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly combatBehavior: string;
  readonly pressureState: string;
  readonly pressureClock: number;
  readonly chargeStart: Vector3Projection;
  readonly chargeEnd: Vector3Projection;
  readonly chargeRadius: number;
  readonly chargeCommitted: boolean;
  readonly shieldImpactSequence: number;
  readonly recoveryClock: number;
  readonly randomSample: number;
  readonly combatStatus: string;
  readonly bodyVisible: boolean;
  readonly corpseClock: number;
  readonly stealthRadius: number;
}

export interface BoltProjection {
  readonly position: Vector3Projection;
  readonly visible: boolean;
}

export interface LootProjection {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly source: string;
  readonly position: Vector3Projection;
  readonly state: string;
  readonly custody: string;
}

export interface ObjectiveProjection {
  readonly position: Vector3Projection;
  readonly state: number;
}

export interface FrontierProjection {
  readonly access: FrontierGateAccess;
  readonly progress: number;
  readonly requirement: number;
  readonly boundaryX: number;
}

export interface GameProjection {
  readonly player: PlayerProjection;
  readonly enemy: EnemyProjection;
  readonly enemies: readonly EnemyProjection[];
  readonly bolt: BoltProjection;
  readonly wayfarerBolt: BoltProjection;
  readonly loots: readonly LootProjection[];
  readonly objective: ObjectiveProjection;
  readonly frontier: FrontierProjection;
  readonly wall: EncounterFeatureFrame;
  readonly traps: readonly EncounterTrapFrame[];
  readonly lootPickupRadius: number;
  readonly shieldRadiusPerEnergy: number;
  readonly shieldProtectionThreshold: number;
}

export interface GameOptions {
  readonly archetype?: CharacterArchetype;
  readonly footholdProgress?: number;
}

export interface GameEngine {
  readonly projection: GameProjection;
  start(): void;
  advance(seconds: number): void;
  setAction(action: GameAction, pressed: boolean): void;
  setMouseForward(active: boolean): void;
  setCameraForward(x: number, z: number): void;
  selectArchetype(archetype: CharacterArchetype): void;
  restoreFoothold(progress: number): void;
  reset(): void;
}
