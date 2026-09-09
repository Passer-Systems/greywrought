import { Vector3 } from "three";
import { createGame } from "../game/game.js";
import type { GameEngine } from "../game/types.js";
import type { GameProjection, Vector3Projection, LootProjection } from "../game/types.js";
import {
  applyAdmittedFrame,
  createCinderwakePresentation,
  disposeCinderwakePresentation,
  faceSubjectAlong,
  faceSubjectToward,
  hideChargeCorridor,
  orbitPresentationCamera,
  pickPresentationSubject,
  playBoarAttack,
  playWayfarerSwordAction,
  renderPresentationFrame,
  setActivityCue,
  setChargeCorridor,
  setEncounterFeatures,
  setFrontierAccess,
  setPulseShield,
  setSubjectLootable,
  setSubjectStealthVisibility,
  signalDeath,
  signalImpact,
  signalPropulsion,
  zoomPresentationCamera,
  type CinderwakePresentation,
  type EncounterFeatureFrame,
  type EncounterTrapFrame,
  type FrontierGateAccess,
  type ProjectedPosition,
} from "./cinderwake-presentation.js";
import {
  identityString,
  parseForeignJson,
  requireArray,
  requireBoolean,
  requireField,
  requireForeignRecord,
  requireNumber,
  requireString,
} from "./foreign.js";
import { publicUrl } from "./public-url.js";
import {
  campaignStorageKey,
  decodeCampaignStorage,
  encodeCampaignStorage,
  legacyFootholdStorageKey,
  type CampaignRead,
} from "./campaign-persistence.js";
import {
  characterProfileStorageKey,
  decodeCharacterProfile,
  encodeCharacterProfile,
  normalizedCharacterName,
  normalizedDisplayName,
  type CharacterArchetype,
  type LocalCharacter,
  type LocalProfile,
} from "./character-profile.js";
import {
  actionDefinitions,
  actionForPhysicalCode,
  actionsForStandardGamepad,
  combatActionForSlot,
  decodeInputPreferences,
  defaultInputPreferences,
  definitionForAction,
  displayKey,
  encodeInputPreferences,
  inputPreferencesStorageKey,
  rebindAction,
  swapCombatSlotBindings,
  type GameAction,
  type InputPreferences,
} from "./input-preferences.js";
import {
  createPresentationAudio,
  disposePresentationAudio,
  playPresentationAudioCue,
  setPresentationAudioVolume,
  unlockPresentationAudio,
  type PresentationAudio,
  type PresentationAudioCue,
} from "./presentation-audio.js";

interface SceneShell { readonly presentation:CinderwakePresentation; readonly canvas:HTMLCanvasElement; readonly pointerHandler:(e:PointerEvent)=>void; readonly pointerMoveHandler:(e:PointerEvent)=>void; readonly pointerReleaseHandler:(e:PointerEvent)=>void; readonly contextMenuHandler:(e:MouseEvent)=>void; readonly wheelHandler:(e:WheelEvent)=>void; readonly enemyNameplates:Map<string,EnemyNameplate>; lootInteractions:readonly LootInteraction[]; cursorSubjects:readonly string[]; frameHandle:number; lastFrameRenderedAt:number; alive:boolean; }
interface EnemyNameplateProjection { readonly position:Vector3Projection; readonly vitality:number; readonly maximumVitality:number; readonly alive:boolean; readonly targeted:boolean; }
interface EnemyNameplate { readonly root:HTMLDivElement; readonly name:HTMLDivElement; readonly fill:HTMLSpanElement; readonly anchor:Vector3; projection:EnemyNameplateProjection|null; }
interface LootInteraction { readonly loot:LootProjection; readonly presentationSubject:string; readonly inRange:boolean; }
interface PlayApp { readonly game:GameEngine; readonly scene:SceneShell; readonly listeners:Array<()=>void>; readonly playerInput:PlayerInputState; readonly presentationAudio:PresentationAudio; }
interface PhysicalKey { readonly code:string; readonly repeat:boolean; }
interface PlayerInputState { preferences:InputPreferences; captureAction:GameAction|null; gamepadFrame:number; readonly gamepadHeld:Set<GameAction>; readonly gamepadPressed:Set<GameAction>; }
type BrowserCampaignRead = CampaignRead | Readonly<{ kind: "unavailable" }>;
const ARCHETYPE_HUD = {
  unselected: {
    name: "Wayfarer",
    resource: "Resource",
    abilities: ["Attack", "Cinderbolt", "Ability 3", "Ability 4", "Ability 5"],
    utility: "Interrupt",
  },
  warrior: {
    name: "Warrior",
    resource: "Rage",
    abilities: ["Attack", "Cinderbolt", "Whirlwind", "Shield Block", "Battle Shout"],
    utility: "Pummel",
  },
  mage: {
    name: "Mage",
    resource: "Mana",
    abilities: ["Attack", "Cinderbolt", "Frost Nova", "Blink", "Mana Shield"],
    utility: "Counterspell",
  },
  hunter: {
    name: "Hunter",
    resource: "Focus",
    abilities: ["Attack", "Cinderbolt", "Concussive Shot", "Freezing Trap", "Disengage"],
    utility: "Scatter Shot",
  },
} as const;

const ENEMY_PRESENTATIONS = [
  { world: "cinder-wraith", presentation: "magitek-boar", baseScale: 1 },
  { world: "veil-tusk", presentation: "veil-tusk-boar", baseScale: 0.92 },
  { world: "ashen-colossus", presentation: "ashen-colossus-boar", baseScale: 2.35 },
] as const;

function presentationSubjectForEnemy(enemyId: string): string {
  return requireValue(
    ENEMY_PRESENTATIONS.find(({ world }) => world === enemyId)?.presentation,
    `enemy presentation ${enemyId}`,
  );
}

function enemyTitle(enemyId: string): string {
  if (enemyId === "ashen-colossus") return "ASHEN COLOSSUS // SIEGEBORE";
  if (enemyId === "veil-tusk") return "VEIL-TUSK PROWLER";
  return "CORRUPTED MAGITEK BOAR";
}

function createEnemyNameplates(): Map<string, EnemyNameplate> {
  const container = element("enemy-nameplates");
  const entries = new Map<string, EnemyNameplate>();
  for (const { world } of ENEMY_PRESENTATIONS) {
    const root = document.createElement("div");
    root.className = "enemy-nameplate";
    root.dataset.enemyId = world;
    root.hidden = true;
    const marker = document.createElement("div");
    marker.className = "enemy-nameplate-target-marker";
    marker.textContent = "▼";
    const name = document.createElement("div");
    name.className = "enemy-nameplate-name";
    name.textContent = enemyTitle(world);
    const health = document.createElement("div");
    health.className = "enemy-nameplate-health";
    const fill = document.createElement("span");
    health.append(fill);
    root.append(marker, name, health);
    container.append(root);
    entries.set(world, {
      root,
      name,
      fill,
      anchor: new Vector3(),
      projection: null,
    });
  }
  return entries;
}

declare global {
  interface Window {
    __GREYWROUGHT_RESIDENT_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_GAME_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_TEARDOWN__: (() => void) | undefined;
  }
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireValue<T>(value: T | undefined, context: string): T {
  if (value === undefined) throw new Error(`${context} is absent`);
  return value;
}

function isProjectedArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isProjectedObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !isProjectedArray(value);
}

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`missing browser element #${id}`);
  return value;
}

function button(id: string): HTMLButtonElement {
  const value = element(id);
  if (!(value instanceof HTMLButtonElement)) {
    throw new Error(`browser element #${id} is not a button`);
  }
  return value;
}

function readPersistedFoothold(): BrowserCampaignRead {
  try {
    const result = decodeCampaignStorage(
      localStorage.getItem(campaignStorageKey),
      localStorage.getItem(legacyFootholdStorageKey),
    );
    if (result.kind === "migrated") {
      localStorage.setItem(
        campaignStorageKey,
        encodeCampaignStorage(result.progress, Date.now()),
      );
      localStorage.removeItem(legacyFootholdStorageKey);
    } else if (result.kind === "corrupt") {
      localStorage.removeItem(campaignStorageKey);
      localStorage.removeItem(legacyFootholdStorageKey);
    }
    return result;
  } catch {
    return { kind: "unavailable" };
  }
}

function persistFoothold(progress: number): void {
  try {
    localStorage.setItem(
      campaignStorageKey,
      encodeCampaignStorage(progress, Date.now()),
    );
    localStorage.removeItem(legacyFootholdStorageKey);
    element("save-status").textContent = `Saved foothold · ${progress} / 3`;
    document.body.dataset.gamePersistence = "saved";
  } catch {
    element("save-status").textContent = "Save unavailable in this browser";
    document.body.dataset.gamePersistence = "unavailable";
  }
}

function clearPersistedFoothold(): void {
  try {
    localStorage.removeItem(campaignStorageKey);
    localStorage.removeItem(legacyFootholdStorageKey);
  } finally {
    location.reload();
  }
}

function objectiveLabel(state: number): "completed" | "failed" | "playing" {
  if (state === 1) return "completed";
  if (state === -1) return "failed";
  return "playing";
}

function lootById(projection: GameProjection, id: string): LootProjection {
  return requireValue(
    projection.loots.find((loot) => loot.id === id),
    `loot projection ${id}`,
  );
}

function lootPresentationSubject(loot: LootProjection): string {
  return loot.source === "cinder-wraith" ? "magitek-boar" : loot.id;
}

function setVitalityBar(
  barId: string,
  valueId: string,
  vitality: number,
  maximum: number,
): void {
  const ratio = Math.max(0, Math.min(1, vitality / Math.max(0.001, maximum)));
  element(barId).style.transform = `scaleX(${ratio})`;
  element(valueId).textContent = `${vitality} / ${maximum}`;
}

function placeMinimapMarker(
  id: string,
  player: Vector3Projection,
  destination: Vector3Projection,
  visible: boolean,
): void {
  const marker = element(id);
  marker.hidden = !visible;
  if (!visible) return;
  const maximumWorldOffset = 20;
  const maximumMapOffset = 38;
  const offsetX = destination.x - player.x;
  const offsetZ = destination.z - player.z;
  const distance = Math.hypot(offsetX, offsetZ);
  const scale = distance > maximumWorldOffset ? maximumWorldOffset / distance : 1;
  marker.style.left = `${50 + (offsetX * scale / maximumWorldOffset) * maximumMapOffset}%`;
  marker.style.top = `${50 + (offsetZ * scale / maximumWorldOffset) * maximumMapOffset}%`;
}

function setQuestStep(id: string, complete: boolean, label: string): void {
  const step = element(id);
  step.classList.toggle("complete", complete);
  step.textContent = `${complete ? "✓" : "—"} ${label}: ${complete ? "1/1" : "0/1"}`;
}

function renderMinimapAndQuest(
  projection: GameProjection,
  objectiveStatus: "completed" | "failed" | "playing",
): void {
  const { player, enemy, enemies, objective } = projection;
  const boss = requireValue(
    enemies.find(({ id }) => id === "ashen-colossus"),
    "Ashen Colossus projection",
  );
  const ashenKey = lootById(projection, "ashen-key");
  const cephorium = lootById(projection, "cephorium-cache");
  const playerMarker = element("minimap-player");
  playerMarker.style.left = "50%";
  playerMarker.style.top = "50%";
  playerMarker.style.rotate = `${Math.atan2(player.cameraForward.x, -player.cameraForward.z)}rad`;
  placeMinimapMarker(
    "minimap-target",
    player.position,
    enemy.position,
    enemy.bodyVisible && enemy.combatStatus !== "dead" && enemy.combatStatus !== "dormant",
  );
  const nextObjective =
    ashenKey.state === "available"
      ? ashenKey.position
      : boss.combatStatus === "alive"
        ? boss.position
        : cephorium.state === "available" || cephorium.custody === "player-1"
          ? cephorium.position
          : objective.position;
  placeMinimapMarker(
    "minimap-objective",
    player.position,
    nextObjective,
    objectiveStatus !== "completed",
  );

  const gateComplete = ashenKey.state === "acquired";
  const bossComplete = boss.combatStatus === "dead";
  const coreComplete = cephorium.custody === "player-1" || objectiveStatus === "completed";
  const completed = Number(gateComplete) + Number(bossComplete) + Number(coreComplete);
  element("quest-tracker-heading").textContent = `Quest Tracker · ${completed}/3`;
  setQuestStep("quest-step-gate", gateComplete, "Breach key");
  setQuestStep("quest-step-boss", bossComplete, "Ashen Colossus");
  setQuestStep("quest-step-core", coreComplete, "Cephorium Core");
  document.body.dataset.questProgress = `${completed}/3`;
}

function setAbilitySlot(
  app: PlayApp,
  action: "ability1" | "ability2" | "ability3" | "ability4" | "ability5",
  label: string,
  cooldown: number,
): void {
  const code = app.playerInput.preferences.bindings[action];
  const match = /^Digit([1-5])$/.exec(code);
  if (match === null) return;
  const slot = document.querySelector<HTMLElement>(
    `[data-combat-slot="${Number(match[1]) - 1}"]`,
  );
  if (slot === null) throw new Error(`combat slot for ${action} is missing`);
  const caption = slot.querySelector("small");
  if (caption === null) throw new Error(`combat slot for ${action} is missing its ability caption`);
  caption.textContent = label;
  slot.dataset.cooldown = cooldown > 0 ? String(Math.ceil(cooldown / 60)) : "";
  slot.classList.toggle("cooling", cooldown > 0);
}

function showDamageNumber(amount: number, kind: string, critical: boolean): void {
  const damageNumber = element("enemy-damage-number");
  const kindClass =
    kind === "auto-attack"
      ? "damage-auto-attack"
      : kind === "pet"
        ? "damage-pet"
        : "damage-special";
  damageNumber.textContent = String(amount);
  damageNumber.className = `enemy-damage-number ${kindClass}${critical ? " critical" : ""}`;
  damageNumber.getBoundingClientRect();
  damageNumber.classList.add("active");
}

function boundedGameEvent(event: Record<string, unknown>): void {
  const events = window.__GREYWROUGHT_GAME_EVENTS__;
  events.push({ atMillis: Math.round(performance.now()), ...event });
  if (events.length > 512) events.shift();
}

function renderGameProjection(app: PlayApp, projection: GameProjection): void {
  const prior = (app as any).priorProjection as GameProjection | null;
  const ordinal = ((app as any).ordinal ?? 0) + 1;
  const {
    player,
    enemy,
    enemies,
    bolt,
    wayfarerBolt,
    objective,
    frontier,
    wall,
    traps,
  } = projection;
  const archetypeHud = ARCHETYPE_HUD[player.archetype];
  const characterSelect = element("character-select");
  characterSelect.hidden = player.archetype !== "unselected";
  document.body.dataset.archetype = player.archetype;
  element("player-frame-name").textContent =
    document.body.dataset.characterName ?? archetypeHud.name;
  element("class-resource-name").textContent = archetypeHud.resource;
  element("class-resource-value").textContent =
    `${Math.round(player.classResource.x)} / ${Math.round(player.classResource.y)}`;
  setAbilitySlot(app, "ability1", archetypeHud.abilities[0], 0);
  setAbilitySlot(app, "ability2", archetypeHud.abilities[1], player.abilityCooldowns.x);
  setAbilitySlot(app, "ability3", archetypeHud.abilities[2], player.abilityCooldowns.y);
  setAbilitySlot(app, "ability4", archetypeHud.abilities[3], player.abilityCooldowns.z);
  setAbilitySlot(app, "ability5", archetypeHud.abilities[4], player.utilityCooldowns.x);
  const utilitySlot = element("class-utility-slot");
  const utilityCaption = utilitySlot.querySelector("small");
  if (utilityCaption === null) throw new Error("class utility slot is missing its ability caption");
  utilityCaption.textContent = archetypeHud.utility;
  utilitySlot.dataset.cooldown =
    player.utilityCooldowns.y > 0 ? String(Math.ceil(player.utilityCooldowns.y / 60)) : "";
  utilitySlot.classList.toggle("cooling", player.utilityCooldowns.y > 0);
  const priorEnemy = prior?.enemies.find(({ id }) => id === enemy.id) ?? null;
  const enemyPresentationSubject = presentationSubjectForEnemy(enemy.id);
  const enemyTitleText = enemyTitle(enemy.id);
  element("target-frame-name").textContent = enemyTitleText;
  const boss = requireValue(
    enemies.find(({ id }) => id === "ashen-colossus"),
    "Ashen Colossus projection",
  );
  const ashenKey = lootById(projection, "ashen-key");
  const cephorium = lootById(projection, "cephorium-cache");
  const presentedBolt = wayfarerBolt.visible ? wayfarerBolt : bolt;
  const objectiveStatus = objectiveLabel(objective.state);
  if (prior !== null) {
    if (player.shieldActionSequence > prior.player.shieldActionSequence) {
      playPresentationCue(app, "shield-activate");
    }
    if (player.shieldReflectSequence > prior.player.shieldReflectSequence) {
      playPresentationCue(app, "shield-reflect");
    }
    if (player.swordActionSequence > prior.player.swordActionSequence) {
      playPresentationCue(app, "melee-swing");
    }
    if (
      player.rangedActionState === "charging" &&
      prior.player.rangedActionState !== "charging"
    ) {
      playPresentationCue(app, "bolt-cast");
    }
    if (wayfarerBolt.visible && !prior.wayfarerBolt.visible) {
      playPresentationCue(app, "bolt-launch");
    }
    if (!wayfarerBolt.visible && prior.wayfarerBolt.visible) {
      playPresentationCue(app, "bolt-impact");
    }
    if (
      player.shieldActive &&
      player.shieldReflectSequence === prior.player.shieldReflectSequence &&
      prior.bolt.visible &&
      !bolt.visible
    ) {
      playPresentationCue(app, "shield-absorb");
    }
    const acquiredLoot = projection.loots.find((loot) => {
      const previous = prior.loots.find(({ id }) => id === loot.id);
      return previous?.custody !== loot.custody && loot.custody === "player-1";
    });
    if (acquiredLoot !== undefined) {
      playPresentationCue(app, "loot");
      boundedGameEvent({ phase: "loot-acquired", item: acquiredLoot.id });
    }
    if (objective.state !== prior.objective.state && objectiveStatus === "completed") {
      playPresentationCue(app, "objective");
    }
    if (frontier.access !== prior.frontier.access && frontier.access !== "sealed") {
      playPresentationCue(app, "gate");
    }
    for (const projectedEnemy of enemies) {
      const previousEnemy = prior.enemies.find(({ id }) => id === projectedEnemy.id);
      if (
        previousEnemy !== undefined &&
        projectedEnemy.vitality < previousEnemy.vitality
      ) {
        if (!prior.wayfarerBolt.visible) playPresentationCue(app, "melee-hit");
        playPresentationCue(app, "boar-hit");
      }
      if (
        projectedEnemy.pressureState === "telegraph" &&
        previousEnemy?.pressureState !== "telegraph"
      ) {
        playPresentationCue(app, "boar-charge");
      }
      if (
        projectedEnemy.pressureState === "charging" &&
        previousEnemy?.pressureState !== "charging"
      ) {
        playPresentationCue(app, "boar-charge");
      }
      if (
        projectedEnemy.pressureState === "cannon-telegraph" &&
        previousEnemy?.pressureState !== "cannon-telegraph"
      ) {
        playPresentationCue(app, "cannon-charge");
      }
      if (
        previousEnemy?.pressureState === "cannon-telegraph" &&
        projectedEnemy.pressureState === "projectile-opening"
      ) {
        playPresentationCue(app, "cannon-fire");
      }
      if (
        projectedEnemy.combatStatus === "dead" &&
        previousEnemy?.combatStatus !== "dead"
      ) {
        playPresentationCue(app, "boar-death");
      }
      if (
        previousEnemy !== undefined &&
        projectedEnemy.shieldImpactSequence >
          previousEnemy.shieldImpactSequence
      ) {
        signalImpact(
          app.scene.presentation,
          presentationSubjectForEnemy(projectedEnemy.id),
          ordinal,
          1,
        );
        boundedGameEvent({
          phase: "boar-shield-impact",
          enemy: projectedEnemy.id,
          sequence: projectedEnemy.shieldImpactSequence,
        });
      }
    }
  }
  if (frontier.progress > 0 && (prior === null || frontier.progress > prior.frontier.progress)) {
    persistFoothold(frontier.progress);
  }
  const expedition = Math.min(frontier.requirement, frontier.progress + 1);
  element("expedition-progress").textContent =
    frontier.access === "permanent-open"
      ? `Foothold secured · ${frontier.progress} / ${frontier.requirement}`
      : `Expedition ${expedition} of ${frontier.requirement} · foothold ${frontier.progress} / ${frontier.requirement}`;
  element("expedition-progress").setAttribute("aria-valuenow", String(frontier.progress));
  element("expedition-progress").setAttribute("aria-valuemax", String(frontier.requirement));
  const terminalFeedback = element("terminal-feedback");
  terminalFeedback.hidden = objectiveStatus === "playing";
  if (objectiveStatus === "failed") {
    element("terminal-feedback-kicker").textContent = "ENCOUNTER TERMINATED";
    element("terminal-feedback-title").textContent = "WAYFARER DISABLED";
    element("terminal-feedback-detail").textContent =
      "The corrupted magitek boar reduced your vitality to zero.";
    element("terminal-feedback-action").textContent =
      "PRESS SHIFT+R TO RESTORE THE REVISION";
  } else if (objectiveStatus === "completed") {
    const permanent = frontier.access === "permanent-open";
    element("terminal-feedback-kicker").textContent = permanent
      ? "FOOTHOLD SECURED"
      : "EXPEDITION EXTRACTED";
    element("terminal-feedback-title").textContent = permanent
      ? "ASHEN VERGE ACCESS IS PERMANENT"
      : "CEPHORIUM RECOVERED";
    element("terminal-feedback-detail").textContent = permanent
      ? "Repeated successful expeditions established durable access to the Ashen Verge."
      : `The temporary breach yielded durable value · foothold ${frontier.progress} / ${frontier.requirement}.`;
    element("terminal-feedback-action").textContent =
      "PRESS SHIFT+R TO RUN THE ENCOUNTER AGAIN";
  }
  (app as any).ordinal = ordinal;
  (app as any).priorProjection = projection;

  for (const projectedEnemy of enemies) {
    const nameplate = requireValue(
      app.scene.enemyNameplates.get(projectedEnemy.id),
      `enemy nameplate ${projectedEnemy.id}`,
    );
    const title = enemyTitle(projectedEnemy.id);
    nameplate.name.textContent = title;
    nameplate.projection = {
      position: projectedEnemy.position,
      vitality: projectedEnemy.vitality,
      maximumVitality: projectedEnemy.maximumVitality,
      alive:
        projectedEnemy.bodyVisible && projectedEnemy.combatStatus === "alive",
      targeted:
        player.targetLockActive && player.combatTarget === projectedEnemy.id,
    };
    nameplate.fill.style.transform =
      `scaleX(${Math.max(0, Math.min(1, projectedEnemy.vitality / Math.max(0.001, projectedEnemy.maximumVitality)))})`;
    nameplate.root.setAttribute(
      "aria-label",
      `${title}, ${projectedEnemy.vitality} of ${projectedEnemy.maximumVitality} health`,
    );
    nameplate.root.classList.toggle("targeted", nameplate.projection.targeted);
    nameplate.root.dataset.alive = String(nameplate.projection.alive);
  }
  const cannonCasting = enemy.pressureState === "cannon-telegraph";
  const enemyCast = element("enemy-cast");
  enemyCast.hidden = !cannonCasting;
  element("enemy-cast-fill").style.transform =
    `scaleX(${cannonCasting ? Math.max(0, Math.min(1, 1 - enemy.pressureClock / 94)) : 0})`;
  const playerCasting = player.rangedActionState === "charging";
  const playerCast = element("player-cast");
  playerCast.hidden = !playerCasting;
  const playerCastProgress = playerCasting
    ? Math.max(0, Math.min(1, 1 - player.rangedActionClock / Math.max(1, player.rangedActionDuration)))
    : 0;
  element("player-cast-fill").style.transform = `scaleX(${playerCastProgress})`;
  element("player-cast-time").textContent =
    playerCasting ? (player.rangedActionClock * 0.016).toFixed(2) : "0.00";
  element("player-cast-name").textContent = player.lastAbility.replaceAll("-", " ").toUpperCase();
  playerCast.setAttribute(
    "aria-label",
    `${player.lastAbility.replaceAll("-", " ")} ${Math.round(playerCastProgress * 100)} percent`,
  );
  const hitStunVisible =
    enemy.pressureState === "hit-recovery" ||
    enemy.pressureState === "overrun-recovery";
  const hitStun = element("enemy-hit-stun");
  hitStun.hidden = !hitStunVisible;
  if (hitStunVisible) {
    const maximumTicks =
      enemy.pressureState === "overrun-recovery" ? 31 : 30;
    const remainingTicks = Math.max(
      0,
      Math.min(maximumTicks, enemy.recoveryClock),
    );
    hitStun.classList.toggle(
      "punishable",
      enemy.pressureState === "overrun-recovery",
    );
    hitStun.style.setProperty(
      "--stun-progress",
      String(remainingTicks / maximumTicks),
    );
    element("enemy-hit-stun-timer").textContent =
      (remainingTicks * 0.016).toFixed(2);
  }
  const targetedNameplate = app.scene.enemyNameplates.get(enemy.id);
  if (targetedNameplate !== undefined) targetedNameplate.root.append(hitStun);

  applyAdmittedFrame(app.scene.presentation, {
    ordinal,
    subjects: [
      {
        subject: "ashen-wayfarer",
        position: player.position,
        visible: true,
        vitalityRatio: player.vitality / Math.max(0.001, player.maximumVitality),
      },
      ...enemies.flatMap((projectedEnemy) => [
        {
          subject: projectedEnemy.id,
          position: projectedEnemy.position,
          visible: false,
          vitalityRatio:
            projectedEnemy.vitality /
            Math.max(0.001, projectedEnemy.maximumVitality),
        },
        {
          subject: presentationSubjectForEnemy(projectedEnemy.id),
          position: projectedEnemy.position,
          visible:
            projectedEnemy.bodyVisible &&
            projectedEnemy.combatStatus !== "dormant",
          vitalityRatio:
            projectedEnemy.vitality /
            Math.max(0.001, projectedEnemy.maximumVitality),
        },
      ]),
      {
        subject: "cinder-bolt",
        position: presentedBolt.position,
        visible: presentedBolt.visible,
        vitalityRatio: 1,
      },
      {
        subject: "ashen-key",
        position: ashenKey.position,
        visible: ashenKey.state === "available",
        vitalityRatio: 1,
      },
      {
        subject: "cephorium-cache",
        position: cephorium.position,
        visible: cephorium.state === "available",
        vitalityRatio: 1,
      },
      {
        subject: "moonwell",
        position: objective.position,
        visible: true,
        vitalityRatio: 1,
      },
    ],
    cameraTarget: player.position,
    wayfarerMotion: {
      moving:
        prior !== null &&
        (Math.abs(player.position.x - prior.player.position.x) > 0.0001 ||
          Math.abs(player.position.z - prior.player.position.z) > 0.0001),
      airborne: !player.grounded,
      backpedaling: player.backwardIntent > 0,
      directionX:
        prior === null ? 0 : player.position.x - prior.player.position.x,
      directionZ:
        prior === null ? 0 : player.position.z - prior.player.position.z,
      facingDirectionX: player.cameraForward.x,
      facingDirectionZ: player.cameraForward.z,
    },
  });
  const reflected =
    prior !== null &&
    player.shieldReflectSequence > prior.player.shieldReflectSequence;
  const absorbed =
    prior !== null &&
    player.shieldAbsorbSequence > prior.player.shieldAbsorbSequence;
  setPulseShield(
    app.scene.presentation,
    player.shieldClock,
    player.shieldActive,
    player.shieldEnergy,
    player.shieldEnergy * projection.shieldRadiusPerEnergy,
    player.shieldActive &&
      player.shieldEnergy >= projection.shieldProtectionThreshold,
    reflected,
    absorbed,
  );
  app.scene.lootInteractions = projection.loots.flatMap((loot) =>
    loot.state === "available"
      ? [
          {
            loot,
            presentationSubject: lootPresentationSubject(loot),
            inRange:
              Math.hypot(
                player.position.x - loot.position.x,
                player.position.z - loot.position.z,
              ) <= projection.lootPickupRadius,
          },
        ]
      : [],
  );
  app.scene.cursorSubjects = Array.from(new Set([
    ...enemies
      .filter(({ bodyVisible, combatStatus }) =>
        bodyVisible && combatStatus !== "dead" && combatStatus !== "dormant")
      .map(({ id }) => presentationSubjectForEnemy(id)),
    ...app.scene.lootInteractions.map(({ presentationSubject }) => presentationSubject),
  ]));
  setSubjectLootable(
    app.scene.presentation,
    "magitek-boar",
    ashenKey.state === "available",
  );
  setSubjectLootable(
    app.scene.presentation,
    "cephorium-cache",
    cephorium.state === "available",
  );
  setFrontierAccess(
    app.scene.presentation,
    frontier.boundaryX,
    frontier.access,
  );
  setEncounterFeatures(app.scene.presentation, wall, traps);
  const openLootId = document.body.dataset.lootWindowItem;
  if (
    openLootId !== undefined &&
    !projection.loots.some(
      (loot) => loot.id === openLootId && loot.state === "available",
    )
  ) {
    closeLootWindow();
  }
  for (const projectedEnemy of enemies) {
    const presentationSubject = presentationSubjectForEnemy(projectedEnemy.id);
    if (projectedEnemy.stealthRadius > 0) {
      const distance = Math.hypot(
        projectedEnemy.position.x - player.position.x,
        projectedEnemy.position.z - player.position.z,
      );
      const visibility = Math.max(
        0.08,
        Math.min(
          1,
          1 -
            (distance - projectedEnemy.stealthRadius) /
              (projectedEnemy.stealthRadius * 1.25),
        ),
      );
      setSubjectStealthVisibility(
        app.scene.presentation,
        presentationSubject,
        visibility,
      );
    }
    setActivityCue(
      app.scene.presentation,
      presentationSubject,
      projectedEnemy.pressureState === "telegraph" ||
        projectedEnemy.pressureState === "cannon-telegraph"
        ? 1
        : 0,
      projectedEnemy.pressureState === "charging" ? 1 : 0,
      projectedEnemy.pressureState === "hit-recovery" ||
        projectedEnemy.pressureState === "overrun-recovery"
        ? 1
        : 0,
    );
    if (
      projectedEnemy.pressureState === "approach" ||
      projectedEnemy.pressureState === "telegraph" ||
      projectedEnemy.pressureState === "cannon-telegraph" ||
      projectedEnemy.pressureState === "charging"
    ) {
      if (projectedEnemy.pressureState === "approach") {
        faceSubjectToward(
          app.scene.presentation,
          presentationSubject,
          player.position,
        );
      } else {
        faceSubjectAlong(
          app.scene.presentation,
          presentationSubject,
          projectedEnemy.chargeEnd.x - projectedEnemy.chargeStart.x,
          projectedEnemy.chargeEnd.z - projectedEnemy.chargeStart.z,
        );
      }
    }
  }
  const chargeCorridorVisible =
    enemy.pressureState === "telegraph" ||
    enemy.pressureState === "cannon-telegraph" ||
    (enemy.id === "ashen-colossus" &&
      enemy.pressureState === "projectile-opening" &&
      enemy.recoveryClock > 40) ||
    enemy.chargeCommitted;
  if (chargeCorridorVisible) {
    const telegraphProgress = Math.max(
      0,
      Math.min(
        1,
        1 -
          enemy.pressureClock /
            (enemy.pressureState === "cannon-telegraph" ? 94 : 63),
      ),
    );
    setChargeCorridor(
      app.scene.presentation,
      enemy.chargeStart,
      enemy.chargeEnd,
      enemy.chargeRadius,
      enemy.pressureState === "telegraph" ||
        enemy.pressureState === "cannon-telegraph"
        ? telegraphProgress
        : 1,
      enemy.pressureState === "charging" ||
        enemy.pressureState === "projectile-opening",
    );
  } else {
    hideChargeCorridor(app.scene.presentation);
  }
  setActivityCue(
    app.scene.presentation,
    "ashen-wayfarer",
    playerCasting
      ? Math.max(
          0.25,
          1 - player.rangedActionClock / Math.max(1, player.rangedActionDuration),
        )
      : 0,
    0,
    0,
  );
  setActivityCue(
    app.scene.presentation,
    "ashen-key",
    ashenKey.state === "available" ? 1 : 0,
    ashenKey.state === "available" ? 0.7 : 0,
    0,
  );
  setActivityCue(
    app.scene.presentation,
    "cephorium-cache",
    cephorium.state === "available" ? 1 : 0,
    cephorium.state === "available" ? 0.7 : 0,
    0,
  );
  setVitalityBar(
    "player-vitality-bar",
    "player-vitality",
    player.vitality,
    player.maximumVitality,
  );
  element("shield-energy-bar").style.transform =
    `scaleX(${Math.max(0, Math.min(1, player.shieldEnergy / 100))})`;
  element("shield-energy").textContent = `${Math.round(player.shieldEnergy)} / 100`;
  setVitalityBar(
    "enemy-vitality-bar",
    "enemy-vitality",
    enemy.vitality,
    enemy.maximumVitality,
  );
  element("booster-energy-bar").style.transform =
    `scaleX(${Math.max(0, Math.min(1, player.classResource.x / Math.max(1, player.classResource.y)))})`;
  renderMinimapAndQuest(projection, objectiveStatus);
  element("objective").textContent =
    objectiveStatus === "completed"
      ? frontier.access === "permanent-open"
        ? "ASHEN VERGE SECURED · permanent access established"
        : `CEPHORIUM EXTRACTED · foothold ${frontier.progress} / ${frontier.requirement}`
      : objectiveStatus === "failed"
        ? "WAYFARER FALLEN · press Shift + R to restore the revision"
        : ashenKey.state === "available"
          ? "CORPSE CONTAINS LOOT · move close and press F"
          : boss.combatStatus === "alive"
            ? "ASHEN COLOSSUS AWAKENED · cross the breach and bring it down"
            : cephorium.state === "available"
              ? "COLOSSUS SLAIN · move close and press F"
              : cephorium.state === "acquired" && cephorium.custody === "player-1"
                ? "CEPHORIUM SECURED · extract west to the moonwell"
                : "Read the boar telegraph · burst perpendicular · punish recovery";
  element("stage").textContent = `world · ${objectiveStatus}`;
  element("summary").textContent =
    `wayfarer ${player.combatStatus} · boar ${enemy.combatStatus} / ${enemy.combatBehavior} / ` +
    `${enemy.pressureState} ${enemy.pressureClock} · recovery ${enemy.recoveryClock} · ` +
    `key ${ashenKey.state} / ${ashenKey.custody} · ` +
    `cephorium ${cephorium.state} / ${cephorium.custody} · ` +
    `booster ${player.boosterEnergy} / ${player.boosterCapacity} · ` +
    `rig ${player.boosterEquipment} · ` +
    `frontier ${frontier.access} ${frontier.progress}/${frontier.requirement} · ` +
    `ignition ${player.boosterThreshold} · regeneration delay ${player.boosterDelay} · ` +
    `status ${player.statusEffect} ${player.statusClock} · fixed sample ${enemy.randomSample}`;
  element("combat-state").textContent =
    `BOOST ${player.boosterEnergy} / ${player.boosterCapacity} · ` +
    `IGNITE ${player.boosterThreshold} · REGEN ${player.boosterDelay}   ` +
    `STATUS ${player.statusEffect} · ${player.statusClock} · ` +
    `SHIELD ${player.shieldClock > 0 ? "REFLECT" : player.shieldActive ? "GUARD" : "READY"} ${Math.round(player.shieldEnergy)}`;

  Object.assign(document.body.dataset, {
    gamePhase: objectiveStatus,
    gamePlayerVitality: String(player.vitality),
    gamePlayerGrounded: String(player.grounded),
    gameEnemyId: enemy.id,
    gameEnemyVitality: String(enemy.vitality),
    gameEnemyCombatStatus: enemy.combatStatus,
    gameEnemyBodyVisible: String(enemy.bodyVisible),
    gameEnemyCorpseClock: String(enemy.corpseClock),
    gameEnemyBehavior: enemy.combatBehavior,
    gameBossVitality: String(boss.vitality),
    gameBossCombatStatus: boss.combatStatus,
    gameBossBodyVisible: String(boss.bodyVisible),
    gameLootState: ashenKey.state,
    gameCustody: ashenKey.custody,
    gameCephoriumState: cephorium.state,
    gameCephoriumCustody: cephorium.custody,
    gameCephoriumX: String(cephorium.position.x),
    gameCephoriumZ: String(cephorium.position.z),
    gameFrontierAccess: frontier.access,
    gameFootholdProgress: String(frontier.progress),
    gameFootholdRequirement: String(frontier.requirement),
    gameFrontierBoundaryX: String(frontier.boundaryX),
    gamePlayerX: String(player.position.x),
    gamePlayerZ: String(player.position.z),
    gameBoarX: String(enemy.position.x),
    gameBoarZ: String(enemy.position.z),
    gameBoarChargeStartX: String(enemy.chargeStart.x),
    gameBoarChargeStartZ: String(enemy.chargeStart.z),
    gameBoarChargeEndX: String(enemy.chargeEnd.x),
    gameBoarChargeEndZ: String(enemy.chargeEnd.z),
    gameBoarFacingYaw: String(
      app.scene.presentation.subjects.find(
        ({ subject }) => subject === enemyPresentationSubject,
      )?.facingYaw ?? 0,
    ),
    gameBoarMeshYaw: String(
      app.scene.presentation.subjects.find(
        ({ subject }) => subject === enemyPresentationSubject,
      )?.root.rotation.y ?? 0,
    ),
    gameBoosterEnergy: String(player.boosterEnergy),
    gameBoosterCapacity: String(player.boosterCapacity),
    gameBoosterEquipment: player.boosterEquipment,
    gameBoosterIgnitionThreshold: String(player.boosterThreshold),
    gameBoosterRegenerationDelay: String(player.boosterDelay),
    gameStatusEffect: player.statusEffect,
    gameStatusClock: String(player.statusClock),
    gameShieldClock: String(player.shieldClock),
    gameShieldActive: String(player.shieldActive),
    gameShieldEnergy: String(player.shieldEnergy),
    gameShieldActionSequence: String(player.shieldActionSequence),
    gameShieldReflectSequence: String(player.shieldReflectSequence),
    gameShieldAbsorbSequence: String(player.shieldAbsorbSequence),
    gameShieldRadius: String(player.shieldEnergy * projection.shieldRadiusPerEnergy),
    gameShieldProtective: String(
      player.shieldActive &&
        player.shieldEnergy >= projection.shieldProtectionThreshold,
    ),
    gameSwordActionSequence: String(player.swordActionSequence),
    gameSwordCommitmentClock: String(player.swordCommitmentClock),
    gameRangedActionState: player.rangedActionState,
    gameRangedActionClock: String(player.rangedActionClock),
    gameRangedActionSequence: String(player.rangedActionSequence),
    gamePlayerCasting: String(playerCasting),
    gameCombatTarget: player.combatTarget,
    gameTargetLockActive: String(player.targetLockActive),
    gameTargetSelectionSequence: String(player.targetSelectionSequence),
    gameProjectileVisible: String(bolt.visible),
    gameWayfarerProjectileVisible: String(wayfarerBolt.visible),
    gameEnemyPressure: enemy.pressureState,
    gamePressureClock: String(enemy.pressureClock),
    gameBoarRecoveryClock: String(enemy.recoveryClock),
    gameBoarShieldImpactSequence: String(enemy.shieldImpactSequence),
    gameWestTrapArmed: String(traps[0]?.armed ?? false),
    gameEastTrapArmed: String(traps[1]?.armed ?? false),
    gameWestTrapTriggerSequence: String(traps[0]?.triggerSequence ?? 0),
    gameEastTrapTriggerSequence: String(traps[1]?.triggerSequence ?? 0),
    gameChargeCorridorVisible: String(chargeCorridorVisible),
    gameChargeTelegraphProgress: String(
      enemy.pressureState === "telegraph"
        ? Math.max(0, Math.min(1, 1 - enemy.pressureClock / 63))
        : enemy.pressureState === "charging"
          ? 1
          : 0,
    ),
  });

  if (prior !== null) {
    element("combat-feedback").textContent = "";
    if (player.shieldActionSequence > prior.player.shieldActionSequence) {
      element("combat-feedback").textContent = "PULSE SHIELD · PERFECT WINDOW";
    }
    if (player.shieldReflectSequence > prior.player.shieldReflectSequence) {
      element("combat-feedback").textContent = "PERFECT REFLECT";
    }
    if (player.shieldAbsorbSequence > prior.player.shieldAbsorbSequence) {
      element("combat-feedback").textContent = "SHIELD ABSORB";
    }
    if (player.rangedActionSequence > prior.player.rangedActionSequence) {
      element("combat-feedback").textContent = "BOLT CASTING";
    }
    if (wayfarerBolt.visible && !prior.wayfarerBolt.visible) {
      element("combat-feedback").textContent = "BOLT LAUNCHED";
    }
    if (player.swordActionSequence > prior.player.swordActionSequence) {
      const targetsEnemy =
        player.targetLockActive && player.combatTarget === enemy.id;
      playWayfarerSwordAction(
        app.scene.presentation,
        targetsEnemy ? enemy.position.x - player.position.x : 0,
        targetsEnemy ? enemy.position.z - player.position.z : 0,
      );
      element("combat-feedback").textContent = "ATTACK ADMITTED";
    }
    if (player.targetSelectionSequence > prior.player.targetSelectionSequence) {
      element("combat-feedback").textContent = `TARGET ACQUIRED · ${enemyTitleText}`;
    }
    if (priorEnemy !== null && enemy.vitality < priorEnemy.vitality) {
      const damage = priorEnemy.vitality - enemy.vitality;
      element("combat-feedback").textContent = `EMBER IMPACT · -${damage}`;
      signalImpact(
        app.scene.presentation,
        enemyPresentationSubject,
        ordinal,
        damage / Math.max(0.001, enemy.maximumVitality),
      );
      showDamageNumber(damage, "auto-attack", false);
    }
    if (player.vitality < prior.player.vitality) {
      const damage = prior.player.vitality - player.vitality;
      element("combat-feedback").textContent = `WRAITH IMPACT · -${damage}`;
      const attackingEnemy =
        enemies.find(({ pressureState }) =>
          pressureState === "charging" ||
          pressureState === "hit-recovery" ||
          pressureState === "overrun-recovery",
        ) ?? enemy;
      playBoarAttack(
        app.scene.presentation,
        presentationSubjectForEnemy(attackingEnemy.id),
      );
      signalImpact(
        app.scene.presentation,
        "ashen-wayfarer",
        ordinal,
        damage / Math.max(0.001, player.maximumVitality),
      );
    }
    if (player.boosterEnergy < prior.player.boosterEnergy) {
      const spent = prior.player.boosterEnergy - player.boosterEnergy;
      const magnitude = Math.max(
        0.45,
        Math.min(1, spent / Math.max(1, player.boosterThreshold)),
      );
      signalPropulsion(
        app.scene.presentation,
        "ashen-wayfarer",
        ordinal,
        magnitude,
      );
    }
    if (player.combatStatus === "dead" && prior.player.combatStatus !== "dead") {
      signalDeath(app.scene.presentation, "ashen-wayfarer", ordinal);
    }
    for (const projectedEnemy of enemies) {
      const priorProjectedEnemy = prior.enemies.find(
        ({ id }) => id === projectedEnemy.id,
      );
      if (
        projectedEnemy.combatStatus === "dead" &&
        priorProjectedEnemy?.combatStatus !== "dead"
      ) {
        signalDeath(
          app.scene.presentation,
          presentationSubjectForEnemy(projectedEnemy.id),
          ordinal,
        );
      }
    }
  }
  (app as any).ordinal = ordinal;
  (app as any).priorProjection = projection;
  boundedGameEvent({
    phase: "frame-admitted",
    objective: objectiveStatus,
    playerX: player.position.x,
    playerZ: player.position.z,
    boarX: enemy.position.x,
    boarZ: enemy.position.z,
    boosterEnergy: player.boosterEnergy,
    boosterCapacity: player.boosterCapacity,
    boosterIgnitionThreshold: player.boosterThreshold,
    boosterRegenerationDelay: player.boosterDelay,
    statusEffect: player.statusEffect,
    statusClock: player.statusClock,
    swordActionSequence: player.swordActionSequence,
    swordCommitmentClock: player.swordCommitmentClock,
    combatTarget: player.combatTarget,
    targetLockActive: player.targetLockActive,
    targetSelectionSequence: player.targetSelectionSequence,
    projectileVisible: bolt.visible,
    wayfarerProjectileVisible: wayfarerBolt.visible,
    enemyPressure: enemy.pressureState,
    pressureClock: enemy.pressureClock,
    boarRecoveryClock: enemy.recoveryClock,
    chargeCorridorVisible: enemy.chargeCommitted,
    playerVitality: player.vitality,
    enemyVitality: enemy.vitality,
    enemyBehavior: enemy.combatBehavior,
    lootState: ashenKey.state,
    custody: ashenKey.custody,
    cephoriumState: cephorium.state,
    cephoriumCustody: cephorium.custody,
  });
}

function bindFantasyCursor(app: PlayApp, listeners: Array<() => void>): void {
  const cursor = element("fantasy-cursor");
  let pendingPoint: Readonly<{
    clientX: number;
    clientY: number;
    target: EventTarget | null;
  }> | null = null;
  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const point = pendingPoint;
    pendingPoint = null;
    if (point === null) return;
    const target = point.target instanceof Element ? point.target : null;
    let glow = target?.closest("button, input, label, summary, [role='button'], [draggable='true']") !== null;
    if (target === app.scene.canvas) {
      glow = app.scene.cursorSubjects.some((subject) =>
        pickPresentationSubject(
          app.scene.presentation,
          subject,
          point.clientX,
          point.clientY,
        ));
    }
    cursor.dataset.glow = String(glow);
    cursor.style.transform =
      `translate3d(${point.clientX - 7}px, ${point.clientY - 7}px, 0)`;
    document.body.dataset.cursorVisible = "true";
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    pendingPoint = {
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
    };
    if (frame === 0) frame = requestAnimationFrame(paint);
  };
  const hide = (): void => {
    document.body.dataset.cursorVisible = "false";
  };
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("mouseleave", hide);
  listeners.push(() => {
    window.removeEventListener("pointermove", move);
    document.documentElement.removeEventListener("mouseleave", hide);
    if (frame !== 0) cancelAnimationFrame(frame);
  });
}

function bindHudClock(listeners: Array<() => void>): void {
  const renderClock = (): void => {
    const now = new Date();
    const clock = element("minimap-clock");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    clock.textContent = `${hour}:${minute}`;
    clock.setAttribute("datetime", now.toISOString());
    clock.setAttribute("aria-label", `Local time ${hour}:${minute}`);
  };
  renderClock();
  const interval = window.setInterval(renderClock, 30_000);
  listeners.push(() => window.clearInterval(interval));
}

function focusScene(shell: SceneShell): void {
  shell.canvas.focus({ preventScroll: true });
  element("selection").textContent =
    "Arena focused. Keyboard input is active.";
}

function closeLootWindow(): void {
  element("loot-window").hidden = true;
  document.body.dataset.lootWindow = "closed";
  delete document.body.dataset.lootWindowItem;
}

function lootCategoryLabel(category: string): string {
  return category === "quest-item" ? "Quest Item" : "Crafting Material";
}

function openLootWindow(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  loot: LootProjection,
): void {
  const lootWindow = element("loot-window");
  element("loot-item-icon").textContent =
    loot.category === "quest-item" ? "⚿" : "◈";
  element("loot-item-name").textContent = loot.name;
  element("loot-item-category").textContent = lootCategoryLabel(loot.category);
  const canvasRectangle = canvas.getBoundingClientRect();
  lootWindow.hidden = false;
  const lootRectangle = lootWindow.getBoundingClientRect();
  const left = Math.max(
    12,
    Math.min(
      canvasRectangle.width - lootRectangle.width - 12,
      clientX - canvasRectangle.left + 12,
    ),
  );
  const top = Math.max(
    12,
    Math.min(
      canvasRectangle.height - lootRectangle.height - 12,
      clientY - canvasRectangle.top + 12,
    ),
  );
  lootWindow.style.left = `${left}px`;
  lootWindow.style.top = `${top}px`;
  document.body.dataset.lootWindow = "open";
  document.body.dataset.lootWindowItem = loot.id;
  button("loot-item").focus({ preventScroll: true });
}

function renderLoop(shell: SceneShell): void {
  if (!shell.alive) return;
  const now = performance.now();
  if (shell.lastFrameRenderedAt > 0 && now - shell.lastFrameRenderedAt > 250) {
    boundedGameEvent({
      phase: "frame-gap",
      gapMillis: Math.round(now - shell.lastFrameRenderedAt),
    });
  }
  shell.lastFrameRenderedAt = now;
  const { canvas, presentation } = shell;
  const renderStartedAt = performance.now();
  renderPresentationFrame(
    presentation,
    Date.now() / 1000,
    Math.max(1, Math.trunc(canvas.clientWidth)),
    Math.max(1, Math.trunc(canvas.clientHeight)),
  );
  const renderDuration = performance.now() - renderStartedAt;
  if (renderDuration > 100) {
    boundedGameEvent({
      phase: "render-stall",
      durationMillis: Math.round(renderDuration),
    });
  }
  renderEnemyNameplate(shell);
  boundedGameEvent({ phase: "frame-rendered" });
  Object.assign(document.body.dataset, {
    gameCameraX: String(presentation.camera.position.x),
    gameCameraY: String(presentation.camera.position.y),
    gameCameraZ: String(presentation.camera.position.z),
    gameCameraTargetX: String(presentation.cameraTargetX),
    gameCameraTargetY: String(presentation.cameraTargetY),
    gameCameraTargetZ: String(presentation.cameraTargetZ),
    gameCameraLookX: String(presentation.cameraFollowX),
    gameCameraLookY: String(presentation.cameraFollowY + 0.45),
    gameCameraLookZ: String(presentation.cameraFollowZ),
    gameCameraOrbitYaw: String(presentation.cameraOrbitYaw),
    gameCameraOrbitPitch: String(presentation.cameraOrbitPitch),
    gameCameraDistance: String(presentation.cameraDistance),
  });
  shell.frameHandle = requestAnimationFrame(() => renderLoop(shell));
}

function renderEnemyNameplate(shell: SceneShell): void {
  for (const nameplate of shell.enemyNameplates.values()) {
    const admitted = nameplate.projection;
    if (admitted === null || !admitted.alive || admitted.vitality <= 0) {
      nameplate.root.hidden = true;
      continue;
    }
    const projected = nameplate.anchor
      .set(admitted.position.x, admitted.position.y + 1.62, admitted.position.z)
      .project(shell.presentation.camera);
    const visible =
      projected.x >= -1 &&
      projected.x <= 1 &&
      projected.y >= -1 &&
      projected.y <= 1 &&
      projected.z >= -1 &&
      projected.z <= 1;
    nameplate.root.hidden = !visible;
    if (!visible) continue;
    const left = `${(projected.x * 0.5 + 0.5) * shell.canvas.clientWidth}px`;
    const top = `${(-projected.y * 0.5 + 0.5) * shell.canvas.clientHeight}px`;
    nameplate.root.style.left = left;
    nameplate.root.style.top = top;
    if (admitted.targeted) {
      const damageNumber = element("enemy-damage-number");
      damageNumber.style.left = left;
      damageNumber.style.top = top;
    }
  }
}

function createScene(): SceneShell {
  const presentation = createCinderwakePresentation(
    {
      wayfarer: "ashen-wayfarer",
      wraith: "cinder-wraith",
      boars: ENEMY_PRESENTATIONS.map(({ presentation: subject, baseScale }) => ({
        subject,
        baseScale,
      })),
      bolt: "cinder-bolt",
      relic: "ashen-key",
      cache: "cephorium-cache",
      moonwell: "moonwell",
    },
    Math.max(1, Math.min(2, window.devicePixelRatio)),
  );
  const canvas = presentation.renderer.domElement;
  const enemyNameplates = createEnemyNameplates();
  let shell: SceneShell | null = null;
  let cameraPointer: Readonly<{
    pointerId: number;
    button: 0 | 2;
    clientX: number;
    clientY: number;
    dragged: boolean;
  }> | null = null;
  let suppressContextMenu = false;
  const pointerHandler = (event: PointerEvent): void => {
    if (shell === null) return;
    focusScene(shell);
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    cameraPointer = {
      pointerId: event.pointerId,
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      dragged: false,
    };
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMoveHandler = (event: PointerEvent): void => {
    if (cameraPointer === null || cameraPointer.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const horizontal = event.clientX - cameraPointer.clientX;
    const vertical = event.clientY - cameraPointer.clientY;
    orbitPresentationCamera(
      presentation,
      horizontal,
      vertical,
    );
    const dragged =
      cameraPointer.dragged || Math.hypot(horizontal, vertical) >= 2;
    if (cameraPointer.button === 2) {
      faceSubjectAlong(
        presentation,
        "ashen-wayfarer",
        -Math.sin(presentation.cameraOrbitYaw),
        -Math.cos(presentation.cameraOrbitYaw),
      );
    }
    cameraPointer = {
      pointerId: event.pointerId,
      button: cameraPointer.button,
      clientX: event.clientX,
      clientY: event.clientY,
      dragged,
    };
  };
  const pointerReleaseHandler = (event: PointerEvent): void => {
    if (cameraPointer === null || cameraPointer.pointerId !== event.pointerId) {
      return;
    }
    suppressContextMenu =
      cameraPointer.button === 2 && cameraPointer.dragged;
    cameraPointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  const contextMenuHandler = (event: MouseEvent): void => {
    event.preventDefault();
    if (suppressContextMenu) {
      suppressContextMenu = false;
      return;
    }
    if (shell === null) return;
    for (const interaction of shell.lootInteractions) {
      if (
        !pickPresentationSubject(
          presentation,
          interaction.presentationSubject,
          event.clientX,
          event.clientY,
        )
      ) {
        continue;
      }
      if (!interaction.inRange) {
        element("combat-feedback").textContent = "TOO FAR AWAY TO LOOT";
        return;
      }
      focusScene(shell);
      openLootWindow(canvas, event.clientX, event.clientY, interaction.loot);
      return;
    }
  };
  const wheelHandler = (event: WheelEvent): void => {
    event.preventDefault();
    zoomPresentationCamera(presentation, event.deltaY);
  };
  shell = {
    presentation,
    canvas,
    pointerHandler,
    pointerMoveHandler,
    pointerReleaseHandler,
    contextMenuHandler,
    wheelHandler,
    enemyNameplates,
    lootInteractions: [],
    cursorSubjects: [],
    frameHandle: 0,
    lastFrameRenderedAt: 0,
    alive: true,
  };
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Greywrought semantic world");
  element("world-wrap").prepend(canvas);
  canvas.addEventListener("pointerdown", pointerHandler);
  canvas.addEventListener("pointermove", pointerMoveHandler);
  canvas.addEventListener("pointerup", pointerReleaseHandler);
  canvas.addEventListener("pointercancel", pointerReleaseHandler);
  canvas.addEventListener("contextmenu", contextMenuHandler);
  canvas.addEventListener("wheel", wheelHandler, { passive: false });
  renderLoop(shell);
  return shell;
}

function bindClick(
  listeners: Array<() => void>,
  id: string,
  action: () => void,
): void {
  const target = button(id);
  const handler = (): void => action();
  target.addEventListener("click", handler);
  listeners.push(() => target.removeEventListener("click", handler));
}

function queueGameInput(app: PlayApp, action: GameAction, pressed:boolean):void { app.game.setAction(action,pressed); }
function observeGameKey(app:PlayApp,event:PhysicalKey,phase:"down"|"up"):void { const action=actionDefinitions.find(d=>d.semanticCode===event.code)?.action; if(action) { if (phase === "down") app.game.start(); queueGameInput(app,action,phase==="down"); } }
function observeCameraBasis(app:PlayApp):void { const yaw=app.scene.presentation.cameraOrbitYaw; app.game.setCameraForward(-Math.sin(yaw),-Math.cos(yaw)); }

function inputElement(id: string): HTMLInputElement {
  const value = element(id);
  if (!(value instanceof HTMLInputElement)) {
    throw new Error(`browser element #${id} is not an input`);
  }
  return value;
}

function persistInputPreferences(app: PlayApp): void {
  try {
    localStorage.setItem(
      inputPreferencesStorageKey,
      encodeInputPreferences(app.playerInput.preferences),
    );
    document.body.dataset.inputPreferences = "saved";
  } catch {
    document.body.dataset.inputPreferences = "unavailable";
  }
}

function renderCombatActionSlots(preferences: InputPreferences): void {
  const labels = {
    ability1: "Attack",
    ability2: "Cinderbolt",
    ability3: "Ability 3",
    ability4: "Ability 4",
    ability5: "Ability 5",
  } as const;
  for (const slot of document.querySelectorAll<HTMLElement>("[data-combat-slot]")) {
    const slotIndex = Number.parseInt(slot.dataset.combatSlot ?? "", 10);
    const action = combatActionForSlot(preferences.bindings, slotIndex);
    slot.classList.toggle("sword-slot", action === "ability1");
    slot.classList.toggle("bolt-slot", action === "ability2");
    slot.classList.toggle("empty-slot", action === null);
    slot.draggable = action !== null;
    const key = slot.querySelector("kbd");
    const label = slot.querySelector("small");
    const display = action === null ? "Class" : labels[action];
    if (key !== null) key.textContent = String(slotIndex + 1);
    if (label !== null) label.textContent = display;
    slot.setAttribute(
      "aria-label",
      action === null
        ? `Combat slot ${slotIndex + 1}, available for a class action`
        : `Combat slot ${slotIndex + 1}, ${display}. Drag to reorder.`,
    );
    slot.title = action === null ? `Combat slot ${slotIndex + 1}` : `Drag ${display} to reorder`;
  }
}

function applyInputPreferences(app: PlayApp): void {
  const { preferences } = app.playerInput;
  renderCombatActionSlots(preferences);
  document.body.dataset.reducedMotion = String(preferences.reducedMotion);
  document.body.dataset.highContrast = String(preferences.highContrast);
  document.body.dataset.largeText = String(preferences.largeText);
  document.body.dataset.effectsVolume = String(preferences.effectsVolume);
  document.body.dataset.audioMasterVolume = preferences.effectsVolume.toFixed(2);
  document.body.dataset.audioMuted = String(preferences.effectsVolume === 0);
  inputElement("reduced-motion").checked = preferences.reducedMotion;
  inputElement("high-contrast").checked = preferences.highContrast;
  inputElement("large-text").checked = preferences.largeText;
  inputElement("effects-volume").value = String(
    Math.round(preferences.effectsVolume * 100),
  );
  element("effects-volume-value").textContent =
    `${Math.round(preferences.effectsVolume * 100)}%`;
  for (const control of document.querySelectorAll<HTMLButtonElement>(
    "[data-input-action]",
  )) {
    const action = actionDefinitions.find(
      ({ action: candidate }) => candidate === control.dataset.inputAction,
    )?.action;
    if (action === undefined) continue;
    const binding = preferences.bindings[action] ?? defaultInputPreferences.bindings[action];
    control.textContent = displayKey(binding);
    control.setAttribute(
      "aria-label",
      `${definitionForAction(action).label}: ${control.textContent}. Activate to rebind.`,
    );
  }
}

function bindCombatSlotDrag(app: PlayApp, listeners: Array<() => void>): void {
  let sourceIndex: number | null = null;
  for (const slot of document.querySelectorAll<HTMLElement>("[data-combat-slot]")) {
    const dragStart = (event: DragEvent): void => {
      const index = Number.parseInt(slot.dataset.combatSlot ?? "", 10);
      if (combatActionForSlot(app.playerInput.preferences.bindings, index) === null) {
        event.preventDefault();
        return;
      }
      sourceIndex = index;
      slot.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
    };
    const dragOver = (event: DragEvent): void => {
      if (sourceIndex === null) return;
      event.preventDefault();
      slot.classList.add("drag-over");
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    };
    const dragLeave = (): void => slot.classList.remove("drag-over");
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      const targetIndex = Number.parseInt(slot.dataset.combatSlot ?? "", 10);
      if (sourceIndex === null || !Number.isInteger(targetIndex)) return;
      const sourceAction = combatActionForSlot(
        app.playerInput.preferences.bindings,
        sourceIndex,
      );
      app.playerInput.preferences = {
        ...app.playerInput.preferences,
        bindings: swapCombatSlotBindings(
          app.playerInput.preferences.bindings,
          sourceIndex,
          targetIndex,
        ),
      };
      persistInputPreferences(app);
      applyInputPreferences(app);
      element("input-preference-status").textContent =
        sourceAction === null
          ? "Combat bar unchanged."
          : `${definitionForAction(sourceAction).label} moved to ${targetIndex + 1}.`;
      sourceIndex = null;
    };
    const dragEnd = (): void => {
      sourceIndex = null;
      for (const candidate of document.querySelectorAll<HTMLElement>("[data-combat-slot]")) {
        candidate.classList.remove("dragging", "drag-over");
      }
    };
    slot.addEventListener("dragstart", dragStart);
    slot.addEventListener("dragover", dragOver);
    slot.addEventListener("dragleave", dragLeave);
    slot.addEventListener("drop", drop);
    slot.addEventListener("dragend", dragEnd);
    listeners.push(() => {
      slot.removeEventListener("dragstart", dragStart);
      slot.removeEventListener("dragover", dragOver);
      slot.removeEventListener("dragleave", dragLeave);
      slot.removeEventListener("drop", drop);
      slot.removeEventListener("dragend", dragEnd);
    });
  }
}

function resumePresentationAudio(app: PlayApp): void {
  setPresentationAudioVolume(
    app.presentationAudio,
    app.playerInput.preferences.effectsVolume,
  );
  unlockPresentationAudio(app.presentationAudio);
}

function playPresentationCue(
  app: PlayApp,
  cue: PresentationAudioCue,
): void {
  playPresentationAudioCue(app.presentationAudio, cue);
}

function loadInputPreferences(app: PlayApp): void {
  try {
    const result = decodeInputPreferences(
      localStorage.getItem(inputPreferencesStorageKey),
    );
    app.playerInput.preferences = result.preferences;
    if (result.recovered) {
      localStorage.removeItem(inputPreferencesStorageKey);
      document.body.dataset.inputPreferences = "recovered";
      element("input-preference-status").textContent =
        "Damaged control preferences were reset safely.";
    } else {
      document.body.dataset.inputPreferences = "ready";
    }
  } catch {
    app.playerInput.preferences = defaultInputPreferences;
    document.body.dataset.inputPreferences = "unavailable";
  }
  applyInputPreferences(app);
}

function updateInputPreferences(
  app: PlayApp,
  update: Partial<Pick<InputPreferences, "reducedMotion" | "highContrast" | "largeText" | "effectsVolume">>,
): void {
  app.playerInput.preferences = {
    ...app.playerInput.preferences,
    ...update,
  };
  persistInputPreferences(app);
  applyInputPreferences(app);
}

function semanticCode(action: GameAction, reverseTarget = false): string {
  if (action === "target" && reverseTarget) return "ShiftTab";
  return definitionForAction(action).semanticCode;
}

function releaseGamepad(app: PlayApp): void {
  for (const action of app.playerInput.gamepadHeld) {
    observeGameKey(
      app,
      { code: semanticCode(action), repeat: false },
      "up",
    );
  }
  app.playerInput.gamepadHeld.clear();
  app.playerInput.gamepadPressed.clear();
}

function isEscapeMenuOpen(): boolean {
  return document.body.dataset.escapeMenu === "open";
}

function showEscapeSubpanel(panel: "controls" | "accessibility" | null): void {
  const controls = element("escape-controls-panel");
  const accessibility = element("escape-accessibility-panel");
  const showControls = panel === "controls";
  const showAccessibility = panel === "accessibility";
  controls.hidden = !showControls;
  accessibility.hidden = !showAccessibility;
  button("escape-controls").setAttribute("aria-expanded", String(showControls));
  button("escape-accessibility").setAttribute(
    "aria-expanded",
    String(showAccessibility),
  );
}

function setEscapeMenuOpen(app: PlayApp, open: boolean): void {
  element("escape-menu").hidden = !open;
  document.body.dataset.escapeMenu = open ? "open" : "closed";
  showEscapeSubpanel(null);
  if (open) {
    closeLootWindow();
    button("escape-return").focus({ preventScroll: true });
  } else {
    app.scene.canvas.focus({ preventScroll: true });
  }
}

function requestCharacterSelection(app: PlayApp): void {
  setEscapeMenuOpen(app, false);
  const selector = document.querySelector<HTMLElement>(
    "[data-character-selector], #character-selector, #character-selection, #archetype-selector",
  );
  if (selector !== null) selector.hidden = false;
  window.dispatchEvent(new CustomEvent("greywrought:change-character-requested"));
}

function bindEscapeMenu(app: PlayApp, listeners: Array<() => void>): void {
  document.body.dataset.escapeMenu = "closed";
  bindClick(listeners, "escape-return", () => setEscapeMenuOpen(app, false));
  bindClick(listeners, "escape-controls", () => {
    showEscapeSubpanel(
      button("escape-controls").getAttribute("aria-expanded") === "true"
        ? null
        : "controls",
    );
  });
  bindClick(listeners, "escape-accessibility", () => {
    showEscapeSubpanel(
      button("escape-accessibility").getAttribute("aria-expanded") === "true"
        ? null
        : "accessibility",
    );
  });
  bindClick(listeners, "escape-change-character", () => requestCharacterSelection(app));
}

function pollGamepads(app: PlayApp): void {
  if (isEscapeMenuOpen()) {
    if (app.playerInput.gamepadHeld.size > 0 || app.playerInput.gamepadPressed.size > 0) {
      releaseGamepad(app);
    }
    app.playerInput.gamepadFrame = requestAnimationFrame(() => pollGamepads(app));
    return;
  }
  const gamepad = Array.from(navigator.getGamepads()).find(
    (candidate): candidate is Gamepad => candidate !== null && candidate.connected,
  );
  if (gamepad === undefined) {
    if (app.playerInput.gamepadHeld.size > 0) releaseGamepad(app);
    document.body.dataset.gamepad = "disconnected";
    element("gamepad-status").textContent = "Gamepad ready · connect or press any button";
  } else {
    document.body.dataset.gamepad = "connected";
    element("gamepad-status").textContent = `Gamepad connected · ${gamepad.id}`;
    const current = actionsForStandardGamepad(
      gamepad.axes,
      gamepad.buttons.map((candidate) => candidate.pressed),
    );
    if (current.size > 0) resumePresentationAudio(app);
    for (const definition of actionDefinitions) {
      const { action } = definition;
      if (definition.held) {
        if (current.has(action) && !app.playerInput.gamepadHeld.has(action)) {
          if (action === "horizontalBurst") observeCameraBasis(app);
          observeGameKey(app, { code: semanticCode(action), repeat: false }, "down");
          app.playerInput.gamepadHeld.add(action);
        } else if (!current.has(action) && app.playerInput.gamepadHeld.has(action)) {
          observeGameKey(app, { code: semanticCode(action), repeat: false }, "up");
          app.playerInput.gamepadHeld.delete(action);
        }
      } else if (current.has(action) && !app.playerInput.gamepadPressed.has(action)) {
        if (action === "horizontalBurst") observeCameraBasis(app);
        observeGameKey(app, { code: semanticCode(action), repeat: false }, "down");
      }
    }
    app.playerInput.gamepadPressed.clear();
    for (const action of current) app.playerInput.gamepadPressed.add(action);
  }
  app.playerInput.gamepadFrame = requestAnimationFrame(() => pollGamepads(app));
}

type EntryRoute = "account" | "creator" | "roster";

const ENTRY_ARCHETYPES: Readonly<Record<CharacterArchetype, Readonly<{
  label: string;
  copy: string;
  kit: string;
  portrait: string;
}>>> = {
  warrior: {
    label: "Warrior",
    copy: "Break the breach at close range, turning every impact into the rage for your next charge.",
    kit: "Attack · Charge · Whirlwind · Block",
    portrait: publicUrl("assets/ui/characters/warrior.webp"),
  },
  mage: {
    label: "Mage",
    copy: "Shape frost and cinder through deliberate casts, then blink clear before the enemy closes.",
    kit: "Cinderbolt · Frost Nova · Blink · Mana Shield",
    portrait: publicUrl("assets/ui/characters/mage.webp"),
  },
  hunter: {
    label: "Hunter",
    copy: "Control the hunt from range with careful shots, slowing traps, and sudden evasive movement.",
    kit: "Ranged Attack · Aimed Shot · Trap · Disengage",
    portrait: publicUrl("assets/ui/characters/hunter.webp"),
  },
};

function entryForm(id: string): HTMLFormElement {
  const value = element(id);
  if (!(value instanceof HTMLFormElement)) {
    throw new Error(`browser element #${id} is not a form`);
  }
  return value;
}

function entryImage(id: string): HTMLImageElement {
  const value = element(id);
  if (!(value instanceof HTMLImageElement)) {
    throw new Error(`browser element #${id} is not an image`);
  }
  return value;
}

function bindEntryFlow(app: PlayApp, listeners: Array<() => void>): void {
  const profileRead = (() => {
    try {
      return decodeCharacterProfile(localStorage.getItem(characterProfileStorageKey));
    } catch {
      return { kind: "empty" } as const;
    }
  })();
  let profile: LocalProfile | null = profileRead.kind === "ready" ? profileRead.profile : null;
  let route: EntryRoute = profile === null
    ? "account"
    : profile.characters.length === 0
      ? "creator"
      : "roster";
  let draftArchetype: CharacterArchetype = "warrior";

  const account = element("entry-account");
  const creator = element("entry-creator");
  const roster = element("entry-roster");
  const accountForm = entryForm("entry-account-form");
  const characterForm = entryForm("entry-character-form");
  const displayNameInput = inputElement("entry-display-name");
  const characterNameInput = inputElement("entry-character-name");
  const rosterList = element("entry-roster-list");

  const persist = (): void => {
    if (profile === null) return;
    try {
      localStorage.setItem(characterProfileStorageKey, encodeCharacterProfile(profile));
      document.body.dataset.characterProfile = "saved";
    } catch {
      document.body.dataset.characterProfile = "session-only";
    }
  };

  const selectedCharacter = (): LocalCharacter | null => {
    if (profile === null) return null;
    return profile.characters.find(({ id }) => id === profile?.selectedCharacterId)
      ?? profile.characters[0]
      ?? null;
  };

  const renderAvatar = (
    avatarId: string,
    portraitId: string,
    archetype: CharacterArchetype,
  ): void => {
    element(avatarId).dataset.avatarArchetype = archetype;
    entryImage(portraitId).src = ENTRY_ARCHETYPES[archetype].portrait;
  };

  const renderRoster = (): void => {
    const selected = selectedCharacter();
    rosterList.replaceChildren();
    const characters = profile?.characters ?? [];
    for (const character of characters) {
      const item = document.createElement("li");
      item.className = "entry-roster-item";
      const select = document.createElement("button");
      select.type = "button";
      select.dataset.characterId = character.id;
      select.setAttribute("aria-pressed", String(character.id === selected?.id));
      const emblem = document.createElement("span");
      emblem.className = "entry-roster-emblem";
      emblem.textContent = ENTRY_ARCHETYPES[character.archetype].label.slice(0, 1);
      const copy = document.createElement("span");
      copy.className = "entry-roster-copy";
      const name = document.createElement("strong");
      name.textContent = character.name;
      const className = document.createElement("span");
      className.textContent = ENTRY_ARCHETYPES[character.archetype].label;
      copy.append(name, className);
      select.append(emblem, copy);
      item.append(select);
      rosterList.append(item);
    }
    for (let slot = characters.length; slot < 8; slot += 1) {
      const item = document.createElement("li");
      item.className = "entry-roster-empty";
      const mark = document.createElement("span");
      mark.textContent = "+";
      const copy = document.createElement("span");
      copy.textContent = "Empty slot";
      item.append(mark, copy);
      rosterList.append(item);
    }
    element("entry-roster-count").textContent = `${characters.length} / 8`;
    button("entry-enter-world").disabled = selected === null;
    if (selected !== null) {
      const archetype = ENTRY_ARCHETYPES[selected.archetype];
      renderAvatar("entry-roster-avatar", "entry-roster-portrait", selected.archetype);
      element("entry-roster-class").textContent = archetype.label;
      element("entry-roster-name").textContent = selected.name;
      element("entry-roster-summary").textContent = archetype.kit;
      document.body.dataset.characterName = selected.name;
    }
  };

  const render = (): void => {
    account.hidden = route !== "account";
    creator.hidden = route !== "creator";
    roster.hidden = route !== "roster";
    document.body.dataset.entryRoute = route;
    const displayName = profile?.displayName ?? "";
    element("entry-creator-profile").textContent = displayName;
    element("entry-roster-profile").textContent = displayName;
    for (const choice of document.querySelectorAll<HTMLButtonElement>("[data-entry-archetype]")) {
      choice.setAttribute("aria-pressed", String(choice.dataset.entryArchetype === draftArchetype));
    }
    const archetype = ENTRY_ARCHETYPES[draftArchetype];
    renderAvatar("entry-creator-avatar", "entry-creator-portrait", draftArchetype);
    element("entry-creator-class").textContent = archetype.label;
    element("entry-lore-title").textContent = archetype.label;
    element("entry-lore-copy").textContent = archetype.copy;
    element("entry-lore-kit").textContent = archetype.kit;
    element("entry-creator-preview-name").textContent =
      normalizedCharacterName(characterNameInput.value) ?? "Unnamed Adventurer";
    renderRoster();
  };

  const accountSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const displayName = normalizedDisplayName(displayNameInput.value);
    if (displayName === null) {
      element("entry-account-feedback").textContent = "Use a display name between 2 and 24 characters.";
      displayNameInput.focus();
      return;
    }
    profile = {
      version: 1,
      displayName,
      characters: [],
      selectedCharacterId: null,
      savedAtMillis: Date.now(),
    };
    persist();
    route = "creator";
    element("entry-account-feedback").textContent = "";
    render();
    characterNameInput.focus();
  };

  const characterSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (profile === null) return;
    const name = normalizedCharacterName(characterNameInput.value);
    if (name === null) {
      element("entry-character-feedback").textContent = "Use 2–18 letters; spaces, apostrophes, and hyphens are allowed.";
      characterNameInput.focus();
      return;
    }
    if (profile.characters.length >= 8) {
      element("entry-character-feedback").textContent = "This local roster is full.";
      return;
    }
    if (profile.characters.some((character) => character.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      element("entry-character-feedback").textContent = "Choose a different character name.";
      return;
    }
    const character: LocalCharacter = {
      id: crypto.randomUUID(),
      name,
      archetype: draftArchetype,
      createdAtMillis: Date.now(),
    };
    profile = {
      ...profile,
      characters: [...profile.characters, character],
      selectedCharacterId: character.id,
      savedAtMillis: Date.now(),
    };
    persist();
    characterNameInput.value = "";
    element("entry-character-feedback").textContent = "";
    route = "roster";
    render();
    button("entry-enter-world").focus();
  };

  const creatorNameInput = (): void => render();
  const creatorBack = (): void => {
    if ((profile?.characters.length ?? 0) > 0) {
      route = "roster";
      render();
      return;
    }
    route = "account";
    displayNameInput.value = profile?.displayName ?? "";
    render();
    displayNameInput.focus();
  };
  const changeCharacter = (): void => {
    draftArchetype = selectedCharacter()?.archetype ?? "warrior";
    characterNameInput.value = "";
    route = "creator";
    render();
    characterNameInput.focus();
  };
  const chooseArchetype = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;
    const choice = target.dataset.entryArchetype;
    if (choice !== "warrior" && choice !== "mage" && choice !== "hunter") return;
    draftArchetype = choice;
    render();
  };
  const chooseRosterCharacter = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || profile === null) return;
    const candidate = target.closest<HTMLButtonElement>("[data-character-id]");
    const id = candidate?.dataset.characterId;
    if (id === undefined || !profile.characters.some((character) => character.id === id)) return;
    profile = { ...profile, selectedCharacterId: id, savedAtMillis: Date.now() };
    persist();
    render();
  };
  const enterSelectedWorld = (): void => {
    const selected = selectedCharacter();
    if (selected === null) return;
    document.body.dataset.characterName = selected.name;
    document.body.dataset.entryPending = "true";
    button("entry-enter-world").disabled = true;
    button("entry-enter-world").textContent = "Entering World…";
    resumePresentationAudio(app);
    app.game.selectArchetype(selected.archetype);
    boundedGameEvent({ phase: "local-character-enter", characterId: selected.id, archetype: selected.archetype });
    app.scene.canvas.focus();
  };

  accountForm.addEventListener("submit", accountSubmit);
  characterForm.addEventListener("submit", characterSubmit);
  characterNameInput.addEventListener("input", creatorNameInput);
  button("entry-creator-back").addEventListener("click", creatorBack);
  button("entry-change-character").addEventListener("click", changeCharacter);
  button("entry-enter-world").addEventListener("click", enterSelectedWorld);
  rosterList.addEventListener("click", chooseRosterCharacter);
  for (const choice of document.querySelectorAll<HTMLButtonElement>("[data-entry-archetype]")) {
    choice.addEventListener("click", chooseArchetype);
    listeners.push(() => choice.removeEventListener("click", chooseArchetype));
  }
  listeners.push(() => accountForm.removeEventListener("submit", accountSubmit));
  listeners.push(() => characterForm.removeEventListener("submit", characterSubmit));
  listeners.push(() => characterNameInput.removeEventListener("input", creatorNameInput));
  listeners.push(() => button("entry-creator-back").removeEventListener("click", creatorBack));
  listeners.push(() => button("entry-change-character").removeEventListener("click", changeCharacter));
  listeners.push(() => button("entry-enter-world").removeEventListener("click", enterSelectedWorld));
  listeners.push(() => rosterList.removeEventListener("click", chooseRosterCharacter));

  if (profileRead.kind === "corrupt") {
    element("entry-account-feedback").textContent = "The old local profile was damaged; create a fresh one.";
  } else if (profileRead.kind === "future") {
    element("entry-account-feedback").textContent = `A newer local profile v${profileRead.version} was found. Creating an account replaces it.`;
  }
  if (profile !== null) displayNameInput.value = profile.displayName;
  render();
}

function bindGameInput(app: PlayApp, listeners: Array<() => void>): void {
  const { canvas } = app.scene;
  const keyboardListenerOptions: AddEventListenerOptions = { capture: true };
  const heldKeys = new Map<string, string>();
  loadInputPreferences(app);
  const physicalBindingCode = (event: KeyboardEvent): string =>
    event.shiftKey && event.code === "KeyR" ? "ShiftR" : event.code;
  const down = (event: KeyboardEvent): void => {
    if (app.playerInput.captureAction !== null) {
      event.preventDefault();
      if (event.repeat) return;
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(event.code)) {
        return;
      }
      const action = app.playerInput.captureAction;
      app.playerInput.captureAction = null;
      if (event.code !== "Escape") {
        const physicalCode = physicalBindingCode(event);
        app.playerInput.preferences = {
          ...app.playerInput.preferences,
          bindings: rebindAction(
            app.playerInput.preferences.bindings,
            action,
            physicalCode,
          ),
        };
        persistInputPreferences(app);
        element("input-preference-status").textContent =
          `${definitionForAction(action).label} now uses ${displayKey(physicalCode)}.`;
      } else {
        element("input-preference-status").textContent = "Rebinding cancelled.";
      }
      applyInputPreferences(app);
      return;
    }
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (event.code === "Escape") {
      event.preventDefault();
      if (event.repeat) return;
      releaseHeldKeys();
      setEscapeMenuOpen(app, !isEscapeMenuOpen());
      return;
    }
    if (isEscapeMenuOpen()) return;
    const action = actionForPhysicalCode(
      app.playerInput.preferences.bindings,
      physicalBindingCode(event),
    );
    if (action === null || event.repeat) return;
    event.preventDefault();
    resumePresentationAudio(app);
    const definition = definitionForAction(action);
    const code = semanticCode(action, action === "target" && event.shiftKey);
    if (definition.held) heldKeys.set(event.code, code);
    if (action === "horizontalBurst") observeCameraBasis(app);
    observeGameKey(app, { code, repeat: false }, "down");
  };
  const up = (event: KeyboardEvent): void => {
    const code = heldKeys.get(event.code);
    if (code !== undefined) {
      event.preventDefault();
      heldKeys.delete(event.code);
      observeGameKey(app, { code, repeat: false }, "up");
      return;
    }
    const action = actionForPhysicalCode(
      app.playerInput.preferences.bindings,
      physicalBindingCode(event),
    );
    if (action !== "ability1") return;
    event.preventDefault();
    observeGameKey(app, { code: semanticCode(action), repeat: false }, "up");
  };
  const releaseHeldKeys = (): void => {
    for (const code of heldKeys.values()) {
      observeGameKey(app, { code, repeat: false }, "up");
    }
    heldKeys.clear();
  };
  const cameraBasis = (event: PointerEvent): void => {
    if ((event.buttons & 2) !== 0) observeCameraBasis(app);
  };
  // Keyboard control follows the active game page rather than canvas focus.
  // Camera/pointer capture remains canvas-local, but clicking another HUD
  // surface must not make ordinary WASD movement appear to stop.
  window.addEventListener("keydown", down, keyboardListenerOptions);
  window.addEventListener("keyup", up, keyboardListenerOptions);
  window.addEventListener("blur", releaseHeldKeys);
  document.addEventListener("visibilitychange", releaseHeldKeys);
  canvas.addEventListener("pointermove", cameraBasis);
  for (const control of document.querySelectorAll<HTMLButtonElement>(
    "[data-input-action]",
  )) {
    const capture = (): void => {
      const action = actionDefinitions.find(
        ({ action: candidate }) => candidate === control.dataset.inputAction,
      )?.action;
      if (action === undefined) return;
      app.playerInput.captureAction = action;
      control.textContent = "Press key…";
      element("input-preference-status").textContent =
        `Press a key for ${definitionForAction(action).label}, or Escape to cancel.`;
    };
    control.addEventListener("click", capture);
    listeners.push(() => control.removeEventListener("click", capture));
  }
  const resetBindings = (): void => {
    app.playerInput.preferences = {
      ...app.playerInput.preferences,
      bindings: defaultInputPreferences.bindings,
    };
    persistInputPreferences(app);
    applyInputPreferences(app);
    element("input-preference-status").textContent = "Default bindings restored.";
  };
  button("reset-bindings").addEventListener("click", resetBindings);
  const reducedMotion = (): void =>
    updateInputPreferences(app, { reducedMotion: inputElement("reduced-motion").checked });
  const highContrast = (): void =>
    updateInputPreferences(app, { highContrast: inputElement("high-contrast").checked });
  const largeText = (): void =>
    updateInputPreferences(app, { largeText: inputElement("large-text").checked });
  const effectsVolume = (): void => {
    const value = Number.parseInt(inputElement("effects-volume").value, 10) / 100;
    updateInputPreferences(app, { effectsVolume: value });
    resumePresentationAudio(app);
    playPresentationCue(app, "ui-confirm");
  };
  const resumeAudio = (): void => resumePresentationAudio(app);
  inputElement("reduced-motion").addEventListener("change", reducedMotion);
  inputElement("high-contrast").addEventListener("change", highContrast);
  inputElement("large-text").addEventListener("change", largeText);
  inputElement("effects-volume").addEventListener("input", effectsVolume);
  window.addEventListener("pointerdown", resumeAudio, { capture: true });
  window.addEventListener("keydown", resumeAudio, { capture: true });
  app.playerInput.gamepadFrame = requestAnimationFrame(() => pollGamepads(app));
  listeners.push(() =>
    window.removeEventListener("keydown", down, keyboardListenerOptions),
  );
  listeners.push(() =>
    window.removeEventListener("keyup", up, keyboardListenerOptions),
  );
  listeners.push(() => window.removeEventListener("blur", releaseHeldKeys));
  listeners.push(() =>
    document.removeEventListener("visibilitychange", releaseHeldKeys),
  );
  listeners.push(() => canvas.removeEventListener("pointermove", cameraBasis));
  listeners.push(() => button("reset-bindings").removeEventListener("click", resetBindings));
  listeners.push(() => inputElement("reduced-motion").removeEventListener("change", reducedMotion));
  listeners.push(() => inputElement("high-contrast").removeEventListener("change", highContrast));
  listeners.push(() => inputElement("large-text").removeEventListener("change", largeText));
  listeners.push(() => inputElement("effects-volume").removeEventListener("input", effectsVolume));
  listeners.push(() => window.removeEventListener("pointerdown", resumeAudio, { capture: true }));
  listeners.push(() => window.removeEventListener("keydown", resumeAudio, { capture: true }));
  listeners.push(() => {
    cancelAnimationFrame(app.playerInput.gamepadFrame);
    releaseGamepad(app);
  });
}

function pressReset(app: PlayApp): void {
  app.scene.canvas.focus({ preventScroll: true });
  observeGameKey(app, { code: "ShiftR", repeat: false }, "down");
}

function teardown(app:PlayApp):void { if(!app.scene.alive)return; app.scene.alive=false; cancelAnimationFrame(app.scene.frameHandle); for(const remove of app.listeners)remove(); disposePresentationAudio(app.presentationAudio); disposeCinderwakePresentation(app.scene.presentation); app.scene.canvas.remove(); }

function startApp():PlayApp { window.__GREYWROUGHT_GAME_EVENTS__=[]; const game=createGame(); const listeners:Array<()=>void>=[]; const app:any={game,scene:createScene(),listeners,playerInput:{preferences:defaultInputPreferences,captureAction:null,gamepadFrame:0,gamepadHeld:new Set<GameAction>(),gamepadPressed:new Set<GameAction>()},presentationAudio:createPresentationAudio(),ordinal:0,priorProjection:null}; bindEntryFlow(app,listeners); bindGameInput(app,listeners); bindEscapeMenu(app,listeners); bindCombatSlotDrag(app,listeners); bindFantasyCursor(app,listeners); bindHudClock(listeners); bindClick(listeners,"loot-close",closeLootWindow); bindClick(listeners,"reset-encounter",()=>game.reset()); const tick=(now:number)=>{if(!app.scene.alive)return; const dt=app.scene.lastFrameRenderedAt?Math.min(.1,(now-app.scene.lastFrameRenderedAt)/1000):0; app.scene.lastFrameRenderedAt=now; if(dt>0)game.advance(dt); renderGameProjection(app,game.projection); app.scene.frameHandle=requestAnimationFrame(tick);}; app.scene.frameHandle=requestAnimationFrame(tick); window.addEventListener("beforeunload",()=>teardown(app),{once:true}); window.__GREYWROUGHT_TEARDOWN__=()=>teardown(app); return app; }
startApp();
