import { Vector3 } from "three";
import { publicUrl } from "./public-url.js";
import {
  createRtsPresentation,
  type EncounterActorView,
  type EncounterKind,
  type RtsPresentation,
  type UnitClass,
  type UnitView,
} from "./rts-presentation.js";

const classes: readonly UnitClass[] = ["Warrior", "Artificer", "Rogue", "Priest", "Ranger"];
const searchParameters = new URLSearchParams(window.location.search);
const measurementEnabled = searchParameters.get("measure") === "1";
const maximumMeasurementEvents = 4096;

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
  readonly cet1: string | null;
  readonly scalarEffects: readonly ScalarEffectPayload[];
  readonly entries: Readonly<{ attack: number; heal: number }>;
}

interface ScalarEffectPayload {
  readonly index: number;
  readonly handler: number;
  readonly effect: number;
  readonly start: number;
  readonly end: number;
  readonly artifact: string;
  readonly expression: string;
}

type ResidentInput =
  | Readonly<{
      kind: "keyboard";
      code: string;
      phase: "down" | "up";
      repeat: boolean;
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{
      kind: "scalar-input";
      channel: string;
      value: number;
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{
      kind: "referent-input";
      channel: string;
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
      value: unknown;
    }>;

interface ResidentUnitView extends UnitView {
  readonly readiness: Readonly<Record<"attack" | "heal" | "ward" | "ignite", string>>;
  readonly orderNumber: number;
  readonly orderName: string;
  readonly orderReport: string;
  readonly orderAccepted: boolean;
  readonly cooldown: number;
  readonly pickReferent: unknown;
  readonly targetReferent: unknown;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly wardRemaining: number;
  readonly burnRemaining: number;
  readonly capturedExternalGeneration: number;
  readonly capturedWorkbenchGeneration: number;
}

interface ResidentActorView extends EncounterActorView {
  readonly name: string;
  readonly hostile: boolean;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly wardRemaining: number;
  readonly burnRemaining: number;
  readonly targetReferent: unknown;
  readonly capturedExternalGeneration: number;
  readonly capturedWorkbenchGeneration: number;
}

interface EncounterView {
  readonly phase: string;
  readonly ended: boolean;
  readonly message: string;
  readonly targetId: string;
}

interface CreatedBurnView {
  readonly occurrence: string;
  readonly targetId: string;
  readonly remaining: number;
  readonly damage: number;
}

interface ResidentState {
  readonly worker: Worker;
  generation: number;
  polling: boolean;
  staticGeneration: boolean;
  interval: number;
  workbenchGeneration: number;
  editing: boolean;
  scalarEffects: readonly ScalarEffectPayload[];
  entries: Readonly<{ attack: number; heal: number }>;
  editStartedMillis: number;
  pendingVisibleEdit: Readonly<{
    startedMillis: number;
    runtimeMillis: number;
    compilerMillis: number;
    continuity: unknown;
  }> | null;
  editFenceResolver: (() => void) | null;
}

interface GameState {
  readonly lifetime: AbortController;
  readonly resident: ResidentState;
  readonly presentation: RtsPresentation;
  readonly selectionRectangle: HTMLElement;
  readonly listeners: Array<() => void>;
  units: readonly ResidentUnitView[];
  actors: readonly ResidentActorView[];
  createdBurns: readonly CreatedBurnView[];
  encounter: EncounterView;
  drag: Readonly<{ pointerId: number; x: number; y: number; moved: boolean; additive: boolean; targeting: boolean }> | null;
  disposed: boolean;
}

declare global {
  interface Window {
    __GREYWROUGHT_GAME_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_MEASUREMENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_TEARDOWN__: (() => void) | undefined;
  }
}

function measure(event: Readonly<Record<string, unknown>>): void {
  if (!measurementEnabled) return;
  const measurements = window.__GREYWROUGHT_MEASUREMENTS__;
  measurements.push({ ...event, epochMillis: performance.timeOrigin + performance.now() });
  if (measurements.length > maximumMeasurementEvents) {
    measurements.splice(0, measurements.length - maximumMeasurementEvents);
  }
}

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`missing browser element #${id}`);
  return value;
}

function record(value: unknown, context: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} is not a projected object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function field(value: unknown, name: string, context: string): unknown {
  const result = record(value, context)[name];
  if (result === undefined) throw new Error(`${context}.${name} is absent`);
  return result;
}

function text(value: unknown, name: string, context: string): string {
  const result = field(value, name, context);
  if (typeof result !== "string") throw new Error(`${context}.${name} is not text`);
  return result;
}

function number(value: unknown, name: string, context: string): number {
  const result = field(value, name, context);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`${context}.${name} is not a finite number`);
  }
  return result;
}

function finiteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} is not a finite number`);
  }
  return value;
}

function boolean(value: unknown, name: string, context: string): boolean {
  const result = field(value, name, context);
  if (typeof result !== "boolean") throw new Error(`${context}.${name} is not Boolean`);
  return result;
}

function unitClass(value: string): UnitClass {
  if (!classes.includes(value as UnitClass)) throw new Error(`unknown unit class ${value}`);
  return value as UnitClass;
}

function referentKey(value: unknown, context: string): string {
  const reference = record(value, context);
  if (reference.kind !== "referent") throw new Error(`${context} is not a projected referent`);
  return JSON.stringify(reference);
}

interface ProjectionIndex {
  readonly game: Readonly<Record<string, unknown>>;
  readonly domains: Readonly<Record<string, number>>;
  readonly subjectsByReferent: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly idsByReferent: ReadonlyMap<string, string>;
}

function projectedSubjects(game: Readonly<Record<string, unknown>>): readonly (readonly [string, Readonly<Record<string, unknown>>])[] {
  return Object.entries(game).flatMap(([id, candidate]) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const subject = record(candidate, id);
    return "$referent" in subject || "$referents" in subject ? [[id, subject] as const] : [];
  });
}

function projectionIndex(projection: unknown): ProjectionIndex {
  const game = record(projection, "game projection");
  const inputDomains = record(field(game, "$referent-inputs", "game projection"), "$referent-inputs");
  const domains = Object.fromEntries(Object.entries(inputDomains).map(([channel, domain]) => {
    if (typeof domain !== "number" || !Number.isSafeInteger(domain)) {
      throw new Error(`$referent-inputs.${channel} is not a checked domain`);
    }
    return [channel, domain];
  }));
  const subjectsByReferent = new Map<string, Readonly<Record<string, unknown>>>();
  const idsByReferent = new Map<string, string>();
  for (const [id, subject] of projectedSubjects(game)) {
    const references = [
      ...(subject.$referent === undefined ? [] : [subject.$referent]),
      ...(subject.$referents === undefined ? [] : Object.values(record(subject.$referents, `${id}.$referents`))),
    ];
    for (const reference of references) {
      const key = referentKey(reference, `${id} reference`);
      subjectsByReferent.set(key, subject);
      idsByReferent.set(key, id);
    }
  }
  return { game, domains, subjectsByReferent, idsByReferent };
}

function subjectFor(index: ProjectionIndex, reference: unknown, context: string): Readonly<Record<string, unknown>> {
  const subject = index.subjectsByReferent.get(referentKey(reference, context));
  if (subject === undefined) throw new Error(`${context} does not resolve in the admitted projection`);
  return subject;
}

function idFor(index: ProjectionIndex, reference: unknown, context: string): string {
  const id = index.idsByReferent.get(referentKey(reference, context));
  if (id === undefined) throw new Error(`${context} does not resolve in the admitted projection`);
  return id;
}

function channelReferent(index: ProjectionIndex, subject: Readonly<Record<string, unknown>>, channel: string, context: string): unknown {
  const domain = index.domains[channel];
  if (domain === undefined) throw new Error(`admitted projection omitted ${channel} input metadata`);
  if (subject.$referent !== undefined) {
    const direct = record(subject.$referent, `${context}.$referent`);
    if (direct.domain === domain) return subject.$referent;
  }
  const facets = record(subject.$referents, `${context}.$referents`);
  return field(facets, String(domain), `${context}.$referents`);
}

function decodeUnits(
  index: ProjectionIndex,
  capturedExternalGeneration: number,
  capturedWorkbenchGeneration: number,
): readonly ResidentUnitView[] {
  return projectedSubjects(index.game).flatMap(([id, unit]) => {
    if (!("selected" in unit) || !("actor-position" in unit) || !("unit-class" in unit)) return [];
    const position = field(unit, "actor-position", id);
    const classProjection = subjectFor(index, field(unit, "unit-class", id), `${id}.unit-class`);
    const vitality = number(unit, "vitality", id);
    const maximumVitality = number(unit, "maximum-vitality", id);
    return [{
      id,
      name: text(unit, "actor-name", id),
      unitClass: unitClass(text(classProjection, "class-name", `${id}.unit-class`)),
      x: number(position, "x", `${id}.unit-position`),
      z: number(position, "z", `${id}.unit-position`),
      selected: boolean(unit, "selected", id),
      moving: boolean(unit, "moving", id),
      alive: boolean(unit, "alive", id),
      targeted: id === idFor(index, field(record(field(index.game, "player-1", "game projection"), "player-1"), "chosen-target", "player-1"), "player-1.chosen-target"),
      healthFraction: Math.max(0, Math.min(1, vitality / maximumVitality)),
      vitality,
      maximumVitality,
      wardRemaining: number(unit, "ward-remaining", id),
      burnRemaining: number(unit, "burn-remaining", id),
      cooldown: number(unit, "action-cooldown", id),
      readiness: {
        attack: text(unit, "attack-readiness", id),
        heal: text(unit, "heal-readiness", id),
        ward: text(unit, "ward-readiness", id),
        ignite: text(unit, "ignite-readiness", id),
      },
      orderNumber: number(unit, "order-number", id),
      orderName: text(unit, "order-name", id),
      orderReport: text(unit, "order-report", id),
      orderAccepted: boolean(unit, "order-accepted", id),
      pickReferent: channelReferent(index, unit, "Pick", id),
      targetReferent: channelReferent(index, unit, "Target", id),
      capturedExternalGeneration,
      capturedWorkbenchGeneration,
    }];
  });
}

function decodeEncounterActors(
  index: ProjectionIndex,
  targetId: string,
  capturedExternalGeneration: number,
  capturedWorkbenchGeneration: number,
): readonly ResidentActorView[] {
  return projectedSubjects(index.game).flatMap(([id, actor]) => {
    if (!("actor-position" in actor) || !("vitality" in actor)) return [];
    const kindValue = text(actor, "presentation-kind", id);
    if (!["Warrior", "Artificer", "Rogue", "Priest", "Ranger", "Cinder", "Moonwell"].includes(kindValue)) return [];
    const kind = kindValue as EncounterKind;
    const position = field(actor, "actor-position", id);
    const vitality = number(actor, "vitality", id);
    const maximumVitality = number(actor, "maximum-vitality", id);
    return [{
      id,
      kind,
      name: text(actor, "actor-name", id),
      x: number(position, "x", `${id}.actor-position`),
      z: number(position, "z", `${id}.actor-position`),
      hostile: boolean(actor, "hostile", id),
      vitality,
      maximumVitality,
      alive: boolean(actor, "alive", id),
      wardRemaining: number(actor, "ward-remaining", id),
      burnRemaining: number(actor, "burn-remaining", id),
      targeted: id === targetId,
      healthFraction: Math.max(0, Math.min(1, vitality / maximumVitality)),
      targetReferent: channelReferent(index, actor, "Target", id),
      capturedExternalGeneration,
      capturedWorkbenchGeneration,
    }];
  });
}

function decodeEncounter(index: ProjectionIndex): EncounterView {
  const controller = record(field(index.game, "player-1", "game projection"), "player-1");
  const encounter = record(field(index.game, "encounter", "game projection"), "encounter");
  const state = subjectFor(index, field(encounter, "encounter-state", "encounter"), "encounter.encounter-state");
  return {
    phase: text(state, "state-name", "encounter state"),
    ended: boolean(state, "state-ended", "encounter state"),
    message: text(state, "state-message", "encounter state"),
    targetId: idFor(index, field(controller, "chosen-target", "player-1"), "player-1.chosen-target"),
  };
}

function relationRows(index: ProjectionIndex, name: string): readonly Readonly<{
  subject: unknown;
  values: readonly unknown[];
}>[] {
  const relations = record(field(index.game, "relations", "game projection"), "projected relations");
  const table = record(field(relations, name, "projected relations"), `relation ${name}`);
  if (table.kind !== "relation-table" || !Array.isArray(table.rows)) {
    throw new Error(`relation ${name} is not a projected relation table`);
  }
  return table.rows.map((candidate, row) => {
    const value = record(candidate, `${name} row ${row}`);
    if (!Array.isArray(value.values)) throw new Error(`${name} row ${row}.values is not ordered`);
    return { subject: field(value, "subject", `${name} row ${row}`), values: value.values };
  });
}

function decodeCreatedBurns(index: ProjectionIndex): readonly CreatedBurnView[] {
  const targets = new Map(relationRows(index, "burn-target").map((row) => [
    referentKey(row.subject, "burn-target subject"),
    row.values,
  ]));
  const damages = new Map(relationRows(index, "effect-damage").map((row) => [
    referentKey(row.subject, "effect-damage subject"),
    row.values,
  ]));
  return relationRows(index, "effect-remaining").map((row) => {
    const occurrence = referentKey(row.subject, "effect-remaining subject");
    const target = targets.get(occurrence);
    const damage = damages.get(occurrence);
    if (row.values.length !== 1 || target?.length !== 1 || damage?.length !== 1) {
      throw new Error("created burn projection has incomplete exact rows");
    }
    return {
      occurrence,
      targetId: idFor(index, target[0], "created burn target"),
      remaining: finiteNumber(row.values[0], "created burn remaining"),
      damage: finiteNumber(damage[0], "created burn damage"),
    };
  });
}

function sendInput(state: GameState, input: ResidentInput): void {
  if (state.disposed) return;
  state.resident.worker.postMessage({ kind: "input", input });
}

interface CapturedFrame {
  readonly capturedExternalGeneration: number;
  readonly capturedWorkbenchGeneration: number;
}

function capturedFrame(state: GameState): CapturedFrame | null {
  if (state.disposed) return null;
  const unit = state.units[0];
  return unit === undefined
    ? null
    : {
        capturedExternalGeneration: unit.capturedExternalGeneration,
        capturedWorkbenchGeneration: unit.capturedWorkbenchGeneration,
      };
}

function press(state: GameState, code: string, captured: CapturedFrame): void {
  sendInput(state, {
    kind: "keyboard",
    code,
    phase: "down",
    repeat: false,
    ...captured,
  });
}

function selectUnits(state: GameState, ids: readonly string[], mode: "replace" | "add" | "toggle" = "replace"): void {
  const desired = new Set(ids);
  const captured = state.units.filter((unit) => desired.has(unit.id));
  const frame = capturedFrame(state);
  if (frame === null) return;
  if (mode === "replace") press(state, "ClearSelection", frame);
  for (const unit of captured) {
    sendInput(state, {
      kind: "referent-input",
      channel: mode === "toggle" ? "TogglePick" : "Pick",
      capturedExternalGeneration: unit.capturedExternalGeneration,
      capturedWorkbenchGeneration: unit.capturedWorkbenchGeneration,
      value: unit.pickReferent,
    });
  }
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "selection-requested",
    mode,
    units: captured.map((unit) => unit.id),
  });
}

function chooseTarget(state: GameState, id: string): void {
  const actor = state.actors.find((candidate) => candidate.id === id);
  if (actor === undefined) return;
  sendInput(state, {
    kind: "referent-input",
    channel: "Target",
    capturedExternalGeneration: actor.capturedExternalGeneration,
    capturedWorkbenchGeneration: actor.capturedWorkbenchGeneration,
    value: actor.targetReferent,
  });
  window.__GREYWROUGHT_GAME_EVENTS__.push({ phase: "target-requested", target: id });
  element("command-status").textContent = `Targeting ${actor.name}`;
}

function issueAction(state: GameState, code: "BeginEncounter" | "Stop" | "Attack" | "Ignite" | "Heal" | "Ward"): void {
  const frame = capturedFrame(state);
  if (frame === null) return;
  press(state, code, frame);
  if (code === "Attack" || code === "Heal" || code === "Ward" || code === "Ignite") {
    element("command-status").textContent = state.units.some((unit) => unit.selected)
      ? `${code}: awaiting the company's response`
      : "Select a living unit";
  }
  window.__GREYWROUGHT_GAME_EVENTS__.push({ phase: "action-requested", action: code });
}

function issueMove(state: GameState, point: Vector3): void {
  const captured = capturedFrame(state);
  if (captured === null) return;
  sendInput(state, { kind: "scalar-input", channel: "PointerWorldX", value: point.x, ...captured });
  sendInput(state, { kind: "scalar-input", channel: "PointerWorldZ", value: point.z, ...captured });
  press(state, "IssueMove", captured);
  element("command-status").textContent = `Move formation to ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`;
  window.__GREYWROUGHT_GAME_EVENTS__.push({ phase: "move-requested", x: point.x, z: point.z });
}

function readinessSummary(state: GameState, action: "attack" | "heal" | "ward" | "ignite"): string {
  const selected = state.units.filter((unit) => unit.selected);
  if (selected.length === 0) return "Select a living unit";
  return selected.map((unit) => `${unit.name}: ${unit.readiness[action]}`).join(" · ");
}

function renderHud(state: GameState): void {
  const selected = state.units.filter((unit) => unit.selected);
  const createdBurnLabel = (id: string): string => {
    const burns = state.createdBurns.filter((burn) => burn.targetId === id && burn.remaining > 0);
    if (burns.length === 0) return "";
    const longest = Math.max(...burns.map((burn) => burn.remaining));
    return ` · ${burns.length} ignition${burns.length === 1 ? "" : "s"} (${longest.toFixed(1)}s)`;
  };
  document.body.dataset.selectedCount = String(selected.length);
  document.body.dataset.unitClasses = state.units.map((unit) => unit.unitClass).join(",");
  const roster = element("roster");
  const priorCards = [...roster.querySelectorAll<HTMLElement>(".roster-card")];
  const rosterChanged = priorCards.length !== state.units.length ||
    priorCards.some((card, index) => card.dataset.unitId !== state.units[index]?.id);
  if (rosterChanged) {
    for (const card of priorCards) card.remove();
  }
  for (const unit of state.units) {
    const card = rosterChanged
      ? document.createElement("button")
      : priorCards.find((candidate) => candidate.dataset.unitId === unit.id)!;
    if (rosterChanged) {
      card.id = `roster-${unit.id}`;
      card.dataset.unitId = unit.id;
      card.setAttribute("type", "button");
      const rune = document.createElement("b");
      const labels = document.createElement("span");
      labels.append(document.createElement("strong"), document.createElement("small"));
      card.append(rune, labels);
      roster.insertBefore(card, element("selection-count"));
    }
    card.className = `roster-card ${unit.unitClass.toLowerCase()}`;
    card.classList.toggle("selected", unit.selected);
    card.classList.toggle("moving", unit.moving);
    card.setAttribute("aria-pressed", String(unit.selected));
    const rune = card.querySelector("b")!;
    rune.textContent = unit.unitClass.slice(0, 1);
    const name = card.querySelector("strong")!;
    name.textContent = unit.name;
    const className = card.querySelector("small")!;
    className.textContent = `${unit.unitClass} · ${Math.max(0, unit.vitality).toFixed(0)}/${unit.maximumVitality.toFixed(0)}${unit.wardRemaining > 0 ? " · Ward" : ""}${unit.burnRemaining > 0 ? " · Burn" : ""}${createdBurnLabel(unit.id)}${unit.cooldown > 0 ? ` · ${unit.cooldown.toFixed(1)}s` : ""}${unit.alive ? "" : " · Fallen"}`;
  }
  const selectionCount = element("selection-count");
  const primary = selected[0];
  selectionCount.textContent = `${selected.length} / ${state.units.length} selected`;
  element("selected-name").textContent = primary?.name ?? "No unit selected";
  element("selected-class").textContent = primary?.unitClass ?? "Drag a box or click a unit";
  element("equipment-owner").textContent = primary === undefined
    ? "No unit selected"
    : `${primary.name} · ${primary.unitClass}`;
  element("command-move").toggleAttribute("disabled", selected.length === 0);
  element("command-stop").toggleAttribute("disabled", selected.length === 0);
  element("retry-encounter").toggleAttribute("disabled", state.units.length === 0 || state.resident.editing);
  element("outcome-retry").toggleAttribute("disabled", state.units.length === 0 || state.resident.editing);
  element("outcome-panel").hidden = !state.encounter.ended;
  element("outcome-title").textContent = state.encounter.phase;
  element("outcome-message").textContent = state.encounter.message;

  document.body.dataset.encounterPhase = state.encounter.phase;
  document.body.dataset.targetId = state.encounter.targetId;
  const moonwell = state.actors.find((actor) => actor.kind === "Moonwell");
  const target = state.actors.find((actor) => actor.id === state.encounter.targetId) ??
    state.units.find((unit) => unit.id === state.encounter.targetId);
  element("encounter-state").textContent = state.encounter.phase;
  element("moonwell-status").textContent = moonwell === undefined
    ? "Moonwell unseen"
    : `${Math.max(0, moonwell.vitality).toFixed(0)} / ${moonwell.maximumVitality.toFixed(0)}${moonwell.wardRemaining > 0 ? " · warded" : ""}${moonwell.burnRemaining > 0 ? " · burning" : ""}`;
  element("target-status").textContent = target === undefined
    ? "No target"
    : `Target: ${target.name}`;
  const targets = element("encounter-targets");
  const priorTargets = [...targets.querySelectorAll<HTMLElement>(".target-card")];
  const targetIds = state.actors.map((actor) => actor.id);
  const targetsChanged = priorTargets.length !== targetIds.length ||
    priorTargets.some((card, index) => card.dataset.targetId !== targetIds[index]);
  if (targetsChanged) priorTargets.forEach((card) => card.remove());
  for (const actor of state.actors) {
    const card = targetsChanged
      ? document.createElement("button")
      : priorTargets.find((candidate) => candidate.dataset.targetId === actor.id)!;
    if (targetsChanged) {
      card.setAttribute("type", "button");
      card.className = "target-card";
      card.dataset.targetId = actor.id;
      card.append(document.createElement("strong"), document.createElement("span"));
      targets.append(card);
    }
    card.id = `target-${actor.id}`;
    card.classList.toggle("targeted", actor.targeted);
    card.classList.toggle("dead", !actor.alive);
    card.querySelector("strong")!.textContent = actor.name;
    card.querySelector("span")!.textContent = `${Math.max(0, actor.vitality).toFixed(0)} / ${actor.maximumVitality.toFixed(0)}${actor.wardRemaining > 0 ? " · Ward" : ""}${actor.burnRemaining > 0 ? " · Burn" : ""}${createdBurnLabel(actor.id)}`;
  }
  element("begin-encounter").toggleAttribute("disabled", state.encounter.phase !== "Ready");
  for (const action of ["attack", "heal", "ward", "ignite"] as const) {
    const button = element(`command-${action}`);
    const ready = selected.filter((unit) => unit.readiness[action] === "Ready").length;
    const summary = readinessSummary(state, action);
    button.toggleAttribute("disabled", state.resident.editing || state.units.length === 0);
    button.dataset.readyCount = String(ready);
    button.title = summary;
    button.setAttribute("aria-describedby", `readiness-${action}`);
    element(`readiness-${action}`).textContent = `${action[0]!.toUpperCase()}${action.slice(1)} · ${ready}/${selected.length} ready — ${summary}`;
  }
}

function applyProjection(
  state: GameState,
  projection: unknown,
  generation: number,
  workbenchGeneration: number,
): void {
  const started = performance.now();
  const index = projectionIndex(projection);
  const previousOrders = new Map(state.units.map((unit) => [unit.id, unit.orderNumber]));
  state.encounter = decodeEncounter(index);
  state.units = decodeUnits(index, generation, workbenchGeneration);
  const receivedOrders = state.units.filter((unit) =>
    previousOrders.has(unit.id) && unit.orderNumber > previousOrders.get(unit.id)!);
  if (receivedOrders.length > 0) {
    const report = receivedOrders.map((unit) =>
      `${unit.name}: ${unit.orderName} — ${unit.orderAccepted ? "Accepted" : unit.orderReport}`).join(" · ");
    element("command-status").textContent = report;
    element("command-status").title = report;
  }
  state.actors = decodeEncounterActors(index, state.encounter.targetId, generation, workbenchGeneration);
  state.createdBurns = decodeCreatedBurns(index);
  state.presentation.applyUnits(state.units);
  state.presentation.applyEncounterActors(
    state.actors.filter((actor) => actor.kind === "Cinder" || actor.kind === "Moonwell"),
  );
  state.presentation.applyObstacles(projectedSubjects(index.game).flatMap(([id, obstacle]) => {
    if (!("obstacle-position" in obstacle) || !("obstacle-radius" in obstacle)) return [];
    const position = field(obstacle, "obstacle-position", id);
    return [{ id, x: number(position, "x", id), z: number(position, "z", id),
      radius: number(obstacle, "obstacle-radius", id) }];
  }));
  state.presentation.applyCombat(state.actors.map((actor) => ({ ...actor,
    burns: state.createdBurns.filter((burn) => burn.targetId === actor.id && burn.remaining > 0).map((burn) => burn.remaining),
    cooldown: state.units.find((unit) => unit.id === actor.id)?.cooldown ?? 0,
  })));
  renderHud(state);
  measure({
    metric: "projection-to-hud",
    durationMillis: performance.now() - started,
    generation,
    workbenchGeneration,
  });
  document.body.dataset.gamePhase = "ready";
  document.body.dataset.residentGeneration = String(generation);
  element("authority-status").textContent = "Company ready · orders received";
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "projection",
    generation,
    workbenchGeneration,
    selected: state.units.filter((unit) => unit.selected).map((unit) => unit.id),
    positions: Object.fromEntries(state.units.map((unit) => [unit.id, [unit.x, unit.z]])),
    encounter: state.encounter.phase,
    target: state.encounter.targetId,
    vitality: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.vitality])),
    wards: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.wardRemaining])),
    burns: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.burnRemaining])),
    createdBurns: state.createdBurns,
    cooldowns: Object.fromEntries(state.units.map((unit) => [unit.id, number(record(index.game[unit.id], unit.id), "action-cooldown", unit.id)])),
  });
  if (state.resident.pendingVisibleEdit !== null) {
    const pending = state.resident.pendingVisibleEdit;
    const visibleMillis = performance.now() - pending.startedMillis;
    state.resident.pendingVisibleEdit = null;
    state.resident.editing = false;
    document.body.dataset.liveEditState = "continued";
    document.body.dataset.liveEditMillis = String(visibleMillis);
    element("live-edit-status").textContent = `Battle continued visibly after ${Math.round(visibleMillis)} ms (${Math.round(pending.runtimeMillis)} ms Wasm transfer)`;
    window.__GREYWROUGHT_GAME_EVENTS__.push({
      phase: "live-edit-visible",
      generation,
      workbenchGeneration,
      elapsedMillis: visibleMillis,
      runtimeMillis: pending.runtimeMillis,
      compilerMillis: pending.compilerMillis,
      continuity: pending.continuity,
    });
  }
}

function bindResident(state: GameState): void {
  const message = (event: MessageEvent<unknown>): void => {
    if (state.disposed) return;
    try {
      const payload = record(event.data, "resident event");
      const kind = payload.kind;
      if (kind === "projection") {
        const generation = payload.generation;
        const workbenchGeneration = payload.workbenchGeneration;
        if (
          typeof generation !== "number" ||
          typeof workbenchGeneration !== "number" ||
          generation < state.resident.generation
        ) return;
        state.resident.workbenchGeneration = workbenchGeneration;
        if (typeof payload.workerSentEpochMillis === "number") {
          measure({
            metric: "worker-to-main",
            durationMillis: performance.timeOrigin + performance.now() - payload.workerSentEpochMillis,
            generation,
            workbenchGeneration,
          });
        }
        applyProjection(state, payload.projection, generation, workbenchGeneration);
      } else if (kind === "receipt") {
        const receipt = record(payload.receipt, "resident receipt");
        if (typeof receipt.event === "string") document.body.dataset.lastReceipt = receipt.event;
        if (typeof payload.workerSentEpochMillis === "number") {
          measure({
            metric: "lifecycle",
            event: receipt.event,
            sequence: receipt.sequence,
            activeGeneration: receipt.activeGeneration,
            operationGeneration: receipt.operationGeneration,
            operationId: receipt.operationId,
            configurationRevision: receipt.configurationRevision,
            detail: receipt.detail,
            workerEpochMillis: payload.workerSentEpochMillis,
            mainTransportMillis: performance.timeOrigin + performance.now() - payload.workerSentEpochMillis,
          });
        }
      } else if (kind === "measurement-input") {
        if (
          typeof payload.configurationRevision === "number" &&
          typeof payload.workerSentEpochMillis === "number"
        ) {
          measure({
            metric: "observed-input",
            input: payload.input,
            configurationRevision: payload.configurationRevision,
            receiptSequence: payload.receiptSequence,
            activeGeneration: payload.activeGeneration,
            workerEpochMillis: payload.workerSentEpochMillis,
          });
        }
      } else if (kind === "heartbeat") {
        if (typeof payload.workbenchPhase === "string") document.body.dataset.workbenchPhase = payload.workbenchPhase;
      } else if (kind === "edit-fenced") {
        if (
          payload.generation !== state.resident.generation ||
          payload.workbenchGeneration !== state.resident.workbenchGeneration
        ) return;
        document.body.dataset.liveEditState = "fenced";
        state.resident.editFenceResolver?.();
        state.resident.editFenceResolver = null;
      } else if (kind === "live-edit") {
        if (
          payload.generation !== state.resident.generation ||
          typeof payload.workbenchGeneration !== "number" ||
          typeof payload.elapsedMillis !== "number" ||
          typeof payload.compilerMillis !== "number"
        ) return;
        state.resident.workbenchGeneration = payload.workbenchGeneration;
        state.resident.pendingVisibleEdit = {
          startedMillis: state.resident.editStartedMillis,
          runtimeMillis: payload.elapsedMillis,
          compilerMillis: payload.compilerMillis,
          continuity: payload.continuity,
        };
        element("live-edit-status").textContent = "Checked change accepted; awaiting carried battle frame…";
        window.__GREYWROUGHT_GAME_EVENTS__.push({
          phase: "live-edit-runtime",
          generation: payload.generation,
          workbenchGeneration: payload.workbenchGeneration,
          elapsedMillis: payload.elapsedMillis,
          compilerMillis: payload.compilerMillis,
          continuity: payload.continuity,
        });
      } else if (kind === "diagnostic") {
        if (
          payload.generation !== state.resident.generation ||
          payload.workbenchGeneration !== state.resident.workbenchGeneration
        ) return;
        const explanation = record(payload.explanation, "execution explanation");
        const rules = Object.values(record(explanation.rules, "explanation rules"))
          .map((rule, index) => record(rule, `explanation rule ${index}`));
        const selected = rules.filter((rule) => rule.selected === true);
        if (!Array.isArray(payload.explanationRows)) throw new Error("diagnostic omitted relation rows");
        const changedStates = payload.explanationRows
          .map((value, index) => record(value, `explained state ${index}`))
          .filter((value) => JSON.stringify(value.before) !== JSON.stringify(value.after))
          .slice(0, 8)
          .map((value) => {
            const source = record(value.source, "state source");
            const actor = [...state.actors, ...state.units].find(actor =>
              referentKey(actor.targetReferent, "actor reference") === referentKey(value.subject, "explained subject"));
            return `${actor?.name ?? referentKey(value.subject, "explained subject")} ${String(source.relation)}: ${String(value.before ?? "absent")} → ${String(value.after ?? "absent")}`;
          });
        const origins = selected.slice(0, 8).map((rule) => {
          const source = record(rule.source, "selected rule source");
          const origin = record(source.origin, "handler origin");
          const laws = Object.values(record(source.laws, "law origins"))
            .map((law) => record(law, "law origin"))
            .map((law) => `${String(law.start)}–${String(law.end)}`)
            .join(", ");
          return `${String(source.designation)} @ ${String(origin.start)}–${String(origin.end)}${laws ? `; laws ${laws}` : ""}`;
        });
        const premises = selected.slice(0, 1).flatMap((rule) =>
          Object.entries(record(rule.premises, "selected rule premises")).slice(0, 5).map(([index, premise]) => {
            const evaluated = record(premise, `premise ${index}`);
            const reads = Object.values(record(evaluated.reads, `premise ${index} reads`))
              .map((read) => record(read, `premise ${index} read`))
              .map((read) => `${String(read.kind)}[${String(read.coordinate)}]=${String(read.value)}`)
              .join(", ");
            return `premise ${index}: ${String(evaluated.value)} (${reads})`;
          })
        );
        element("explanation-status").textContent = [
          `Recorded Step ${String(explanation.step)} · ${selected.length} selected rule occurrence(s)`,
          ...changedStates,
          ...premises,
          ...origins,
        ].join("\n");
        if (payload.intervention !== null) {
          const answer = record(payload.intervention, "intervention answer");
          const bounded = record(payload.boundedIntervention, "bounded intervention answer");
          const solution = answer.solution === undefined ? {} : record(answer.solution, "intervention solution");
          const predictedVitality = payload.interventionTargetValue;
          element("intervention-status").textContent = [
            `Finite domain: ${String(payload.interventionChoiceCount)} Boolean deselections; bound 32`,
            `Order: ${String(answer["cost-order"])}; evaluations ${String(answer.evaluations)}`,
            `Found ${String(answer.found)} · completed ${String(answer.completed)} · exhausted ${String(answer.exhausted)} · cost ${String(answer.cost ?? "none")}`,
            `Changes ${JSON.stringify(solution)}; predicted target vitality ${String(predictedVitality ?? "absent")}`,
            `One-evaluation prefix: completed ${String(bounded.completed)} · exhausted ${String(bounded.exhausted)} · found ${String(bounded.found)}`,
          ].join("\n");
        }
        window.__GREYWROUGHT_GAME_EVENTS__.push({
          phase: "diagnostic",
          entry: payload.entry,
          explanation: payload.explanation,
          intervention: payload.intervention,
          boundedIntervention: payload.boundedIntervention,
        });
      } else if (kind === "failure") {
        throw new Error(typeof payload.message === "string" ? payload.message : "resident worker failed");
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      document.body.dataset.gamePhase = "failed";
      document.body.dataset.runtimeFailure = message;
      console.error("Company runtime failure", message);
      element("authority-status").textContent = "The company could not form ranks";
    }
  };
  const error = (event: ErrorEvent): void => {
    if (state.disposed) return;
    document.body.dataset.gamePhase = "failed";
    console.error("Company worker failure", event.message);
    element("authority-status").textContent = "The company could not form ranks";
  };
  state.resident.worker.addEventListener("message", message);
  state.resident.worker.addEventListener("error", error);
  state.listeners.push(() => state.resident.worker.removeEventListener("message", message));
  state.listeners.push(() => state.resident.worker.removeEventListener("error", error));
}

function parseGeneration(value: unknown): GenerationPayload {
  const source = record(value, "resident generation");
  const { generation, compilerMicros, cwr1, sourceModifiedMillis, hot, cet1, scalarEffects, entries } = source;
  if (
    typeof generation !== "number" || typeof compilerMicros !== "number" ||
    typeof cwr1 !== "string" || typeof sourceModifiedMillis !== "number" || typeof hot !== "boolean" ||
    !(cet1 === null || typeof cet1 === "string") || !Array.isArray(scalarEffects)
  ) throw new Error("resident generation payload is malformed");
  const parsedEntries = record(entries, "resident entries");
  if (typeof parsedEntries.attack !== "number" || typeof parsedEntries.heal !== "number") {
    throw new Error("resident diagnostic entries are malformed");
  }
  const parsedEffects = scalarEffects.map((candidate, index) => {
    const effect = record(candidate, `scalar effect ${index}`);
    if (
      typeof effect.index !== "number" || typeof effect.handler !== "number" ||
      typeof effect.effect !== "number" || typeof effect.start !== "number" ||
      typeof effect.end !== "number" || typeof effect.artifact !== "string" ||
      typeof effect.expression !== "string"
    ) throw new Error(`scalar effect ${index} is malformed`);
    return effect as unknown as ScalarEffectPayload;
  });
  return {
    generation, compilerMicros, cwr1, sourceModifiedMillis, hot, cet1,
    scalarEffects: parsedEffects,
    entries: { attack: parsedEntries.attack, heal: parsedEntries.heal },
  };
}

function installGeneration(state: GameState, payload: GenerationPayload): void {
  if (state.disposed) return;
  state.resident.generation = payload.generation;
  state.resident.scalarEffects = payload.scalarEffects;
  state.resident.entries = payload.entries;
  renderScalarEffectCatalog(state);
  state.resident.worker.postMessage({ kind: "install-generation", payload });
  element("authority-status").textContent = payload.hot ? "Forming ranks…" : "Rallying the company…";
}

function renderScalarEffectCatalog(state: GameState): void {
  const catalog = element("scalar-effect-catalog") as HTMLSelectElement;
  const selected = catalog.value;
  catalog.replaceChildren(...state.resident.scalarEffects.map((effect) => {
    const option = document.createElement("option");
    option.value = String(effect.index);
    option.textContent = `${effect.expression} · bytes ${effect.start}–${effect.end}`;
    option.dataset.handler = String(effect.handler);
    option.dataset.effect = String(effect.effect);
    option.dataset.artifact = effect.artifact;
    return option;
  }));
  if ([...catalog.options].some((option) => option.value === selected)) catalog.value = selected;
  const chosen = selectedScalarEffect(state);
  (element("scalar-effect-expression") as HTMLInputElement).value = chosen?.expression ?? "";
}

async function pollResident(state: GameState): Promise<void> {
  if (state.disposed || state.resident.polling || state.resident.staticGeneration || state.resident.editing) return;
  state.resident.polling = true;
  const requestedAfter = state.resident.generation;
  try {
    const response = await fetch(publicUrl(`resident-generation?after=${requestedAfter}`), {
      cache: "no-store", signal: state.lifetime.signal,
    });
    if (state.disposed) return;
    if (response.status === 404 && state.resident.generation < 0) {
      state.resident.staticGeneration = true;
      const cartridge = await fetch(publicUrl("assets/embodied-encounter-v1.cwr1.hex"), { signal: state.lifetime.signal }).then((entry) => {
        if (!entry.ok) throw new Error(`company roster failed: ${entry.status}`);
        return entry.text();
      });
      installGeneration(state, {
        generation: 0, compilerMicros: 0, cwr1: cartridge, sourceModifiedMillis: 0,
        hot: false, cet1: null, scalarEffects: [], entries: { attack: 0, heal: 0 },
      });
      return;
    }
    if (response.status === 204) return;
    const payload: unknown = await response.json();
    if (state.disposed) return;
    if (!response.ok) throw new Error("company update was rejected; prior orders retained");
    const parsed = parseGeneration(payload);
    if (parsed.generation > state.resident.generation) installGeneration(state, parsed);
  } catch (cause: unknown) {
    if (state.disposed) return;
    const message = cause instanceof Error ? cause.message : String(cause);
    element("authority-status").textContent = message;
  } finally {
    state.resident.polling = false;
  }
}

function bindInteraction(state: GameState): void {
  const canvas = state.presentation.canvas;
  const rectanglePoint = (clientX: number, clientY: number): readonly [number, number] => {
    const bounds = canvas.getBoundingClientRect();
    return [clientX - bounds.left, clientY - bounds.top];
  };
  const showSelectionRectangle = (startX: number, startY: number, endX: number, endY: number): void => {
    state.selectionRectangle.hidden = false;
    state.selectionRectangle.style.left = `${Math.min(startX, endX)}px`;
    state.selectionRectangle.style.top = `${Math.min(startY, endY)}px`;
    state.selectionRectangle.style.width = `${Math.abs(endX - startX)}px`;
    state.selectionRectangle.style.height = `${Math.abs(endY - startY)}px`;
  };
  const pointerDown = (event: PointerEvent): void => {
    canvas.focus({ preventScroll: true });
    if (event.button !== 0) return;
    event.preventDefault();
    const [x, y] = rectanglePoint(event.clientX, event.clientY);
    state.drag = { pointerId: event.pointerId, x, y, moved: false, additive: event.shiftKey, targeting: event.altKey };
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent): void => {
    state.presentation.setPointer(event.clientX, event.clientY, true);
    if (state.drag === null || state.drag.pointerId !== event.pointerId) return;
    const [x, y] = rectanglePoint(event.clientX, event.clientY);
    const moved = state.drag.moved || Math.hypot(x - state.drag.x, y - state.drag.y) > 5;
    state.drag = { ...state.drag, moved };
    if (moved) showSelectionRectangle(state.drag.x, state.drag.y, x, y);
  };
  const pointerUp = (event: PointerEvent): void => {
    if (state.drag === null || state.drag.pointerId !== event.pointerId) return;
    const drag = state.drag;
    state.drag = null;
    state.selectionRectangle.hidden = true;
    const [x, y] = rectanglePoint(event.clientX, event.clientY);
    if (drag.moved) {
      selectUnits(state, state.presentation.unitsInScreenRectangle(
        Math.min(drag.x, x), Math.min(drag.y, y), Math.max(drag.x, x), Math.max(drag.y, y),
      ), drag.additive ? "add" : "replace");
    } else {
      const picked = state.presentation.pickActor(event.clientX, event.clientY);
      if (picked !== null && (drag.targeting || !state.units.some((unit) => unit.id === picked))) {
        chooseTarget(state, picked);
      } else if (!drag.targeting) {
        selectUnits(state, picked === null ? [] : [picked], drag.additive ? "toggle" : "replace");
      }
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const pointerCancel = (event: PointerEvent): void => {
    if (state.drag?.pointerId !== event.pointerId) return;
    state.drag = null;
    state.selectionRectangle.hidden = true;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const contextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const point = state.presentation.groundPoint(event.clientX, event.clientY);
    if (point !== null && state.units.some((unit) => unit.selected)) {
      state.presentation.showMoveDestination(point);
      issueMove(state, point);
    }
  };
  const pointerLeave = (event: PointerEvent): void => state.presentation.setPointer(event.clientX, event.clientY, false);
  const wheel = (event: WheelEvent): void => { event.preventDefault(); state.presentation.zoom(event.deltaY); };
  const keyDown = (event: KeyboardEvent): void => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
      state.presentation.setPanKey(event.code, true);
    }
    if (event.code === "F1") selectUnits(state, state.units.map((unit) => unit.id));
    if (event.code === "KeyE") element("equipment-panel").classList.toggle("open");
    if (event.code === "Escape") element("equipment-panel").classList.remove("open");
  };
  const keyUp = (event: KeyboardEvent): void => {
    state.presentation.setPanKey(event.code, false);
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("contextmenu", contextMenu);
  canvas.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  state.listeners.push(
    () => canvas.removeEventListener("pointerdown", pointerDown),
    () => canvas.removeEventListener("pointermove", pointerMove),
    () => canvas.removeEventListener("pointerup", pointerUp),
    () => canvas.removeEventListener("pointercancel", pointerCancel),
    () => canvas.removeEventListener("pointerleave", pointerLeave),
    () => canvas.removeEventListener("contextmenu", contextMenu),
    () => canvas.removeEventListener("wheel", wheel),
    () => window.removeEventListener("keydown", keyDown),
    () => window.removeEventListener("keyup", keyUp),
  );
}

function selectedScalarEffect(state: GameState): ScalarEffectPayload | undefined {
  const selected = Number.parseInt((element("scalar-effect-catalog") as HTMLSelectElement).value, 10);
  return state.resident.scalarEffects.find((effect) => effect.index === selected);
}

function reportLiveFailure(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  document.body.dataset.liveEditState = "failed";
  element("live-edit-status").textContent = message;
  console.error("Battle-law operation failed", message);
}

async function requestLiveEdit(
  state: GameState,
): Promise<void> {
  if (state.disposed || state.resident.editing) return;
  const effect = selectedScalarEffect(state);
  if (effect === undefined) throw new Error("Choose an exact offered scalar effect");
  const capturedExternalGeneration = state.resident.generation;
  const capturedWorkbenchGeneration = state.resident.workbenchGeneration;
  const expression = (element("scalar-effect-expression") as HTMLInputElement).value;
  state.resident.editing = true;
  element("retry-encounter").toggleAttribute("disabled", true);
  state.resident.editStartedMillis = performance.now();
  document.body.dataset.liveEditState = "checking";
  element("live-edit-status").textContent = "Checking the offered battle-law expression…";
  const started = performance.now();
  try {
    const fenced = new Promise<void>((resolve, reject) => {
      state.resident.editFenceResolver = resolve;
      window.setTimeout(() => {
        if (state.resident.editFenceResolver === resolve) {
          state.resident.editFenceResolver = null;
          reject(new Error("settled live-edit fence timed out"));
        }
      }, 2_000);
    });
    state.resident.worker.postMessage({
      kind: "fence-edit",
      capturedExternalGeneration,
      capturedWorkbenchGeneration,
    });
    await fenced;
    if (state.disposed) return;
    const response = await fetch(publicUrl("resident-edit"), {
      method: "POST",
      signal: state.lifetime.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capturedGeneration: capturedExternalGeneration,
        catalogIndex: effect.index,
        expression,
      }),
    });
    const body: unknown = await response.json();
    if (state.disposed) return;
    if (!response.ok) {
      const rejected = record(body, "source edit rejection");
      if (
        response.status !== 422 || rejected.rejected !== true ||
        typeof rejected.errorHex !== "string" || rejected.errorHex.length === 0
      ) throw new Error(`battle-law transport failed (${response.status})`);
      state.resident.editing = false;
      state.resident.worker.postMessage({
        kind: "release-edit", capturedExternalGeneration, capturedWorkbenchGeneration,
      });
      document.body.dataset.liveEditState = "rejected-preserved";
      element("live-edit-status").textContent = "Rejected expression; running battle preserved";
      window.__GREYWROUGHT_GAME_EVENTS__.push({
        phase: "source-edit-rejected", capturedExternalGeneration,
        capturedWorkbenchGeneration, elapsedMillis: performance.now() - started,
      });
      return;
    }
    const payload = parseGeneration(body);
    if (payload.generation === capturedExternalGeneration && payload.cet1 === null) {
      state.resident.editing = false;
      state.resident.worker.postMessage({
        kind: "release-edit", capturedExternalGeneration, capturedWorkbenchGeneration,
      });
      document.body.dataset.liveEditState = "unchanged-preserved";
      element("live-edit-status").textContent = "No change; running battle preserved";
      window.__GREYWROUGHT_GAME_EVENTS__.push({
        phase: "source-edit-unchanged", capturedExternalGeneration,
        capturedWorkbenchGeneration, elapsedMillis: performance.now() - started,
      });
      return;
    }
    if (
      payload.generation <= capturedExternalGeneration ||
      payload.cet1 === null || state.resident.generation !== capturedExternalGeneration ||
      state.resident.workbenchGeneration !== capturedWorkbenchGeneration
    ) throw new Error("changed battle law lost captured generation custody");
    state.resident.generation = payload.generation;
    state.resident.scalarEffects = payload.scalarEffects;
    state.resident.entries = payload.entries;
    renderScalarEffectCatalog(state);
    state.resident.worker.postMessage({ kind: "install-edit", payload });
  } catch (cause: unknown) {
    if (state.disposed) return;
    throw cause;
  }
}

function requestDiagnostic(
  state: GameState,
  entry: "attack" | "heal",
  interventionTarget?: string,
): void {
  state.resident.worker.postMessage({
    kind: "diagnose",
    capturedExternalGeneration: state.resident.generation,
    capturedWorkbenchGeneration: state.resident.workbenchGeneration,
    entry,
    interventionTarget: interventionTarget === undefined ? undefined :
      [...state.actors, ...state.units].find(actor => actor.id === interventionTarget)?.targetReferent,
  });
}

function bindHud(state: GameState): void {
  const roster = element("roster");
  const select = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>(".roster-card");
    const id = card?.dataset.unitId;
    if (id !== undefined) {
      if (event.altKey) chooseTarget(state, id);
      else selectUnits(state, [id], event.shiftKey ? "toggle" : "replace");
    }
  };
  roster.addEventListener("click", select);
  const all = (): void => selectUnits(state, state.units.map((unit) => unit.id));
  const equipment = (): void => {
    element("equipment-panel").classList.toggle("open");
  };
  const close = (): void => element("equipment-panel").classList.remove("open");
  const target = (event: MouseEvent): void => {
    const source = event.target;
    if (!(source instanceof Element)) return;
    const id = source.closest<HTMLElement>(".target-card")?.dataset.targetId;
    if (id !== undefined) chooseTarget(state, id);
  };
  const begin = (): void => issueAction(state, "BeginEncounter");
  const retry = (): void => {
    if (state.disposed || state.resident.editing || state.units.length === 0) return;
    teardown(state);
    start();
  };
  const stop = (): void => issueAction(state, "Stop");
  const attack = (): void => issueAction(state, "Attack");
  const ignite = (): void => issueAction(state, "Ignite");
  const heal = (): void => issueAction(state, "Heal");
  const ward = (): void => issueAction(state, "Ward");
  const chooseEffect = (): void => {
    const selected = selectedScalarEffect(state);
    (element("scalar-effect-expression") as HTMLInputElement).value = selected?.expression ?? "";
  };
  const changedEdit = (): void => void requestLiveEdit(state).catch(reportLiveFailure);
  const explainAttack = (): void => requestDiagnostic(state, "attack");
  const explainHeal = (): void => requestDiagnostic(state, "heal");
  const interveneAttack = (): void => requestDiagnostic(state, "attack", state.encounter.targetId || "cinder-1");
  element("select-all").addEventListener("click", all);
  element("equipment-toggle").addEventListener("click", equipment);
  element("equipment-close").addEventListener("click", close);
  element("encounter-targets").addEventListener("click", target);
  element("begin-encounter").addEventListener("click", begin);
  element("retry-encounter").addEventListener("click", retry);
  element("outcome-retry").addEventListener("click", retry);
  element("command-stop").addEventListener("click", stop);
  element("command-attack").addEventListener("click", attack);
  element("command-ignite").addEventListener("click", ignite);
  element("command-heal").addEventListener("click", heal);
  element("command-ward").addEventListener("click", ward);
  element("edit-double-damage").addEventListener("click", changedEdit);
  element("scalar-effect-catalog").addEventListener("change", chooseEffect);
  element("explain-attack").addEventListener("click", explainAttack);
  element("explain-heal").addEventListener("click", explainHeal);
  element("intervene-attack").addEventListener("click", interveneAttack);
  state.listeners.push(
    () => roster.removeEventListener("click", select),
    () => element("select-all").removeEventListener("click", all),
    () => element("equipment-toggle").removeEventListener("click", equipment),
    () => element("equipment-close").removeEventListener("click", close),
    () => element("encounter-targets").removeEventListener("click", target),
    () => element("begin-encounter").removeEventListener("click", begin),
    () => element("retry-encounter").removeEventListener("click", retry),
    () => element("outcome-retry").removeEventListener("click", retry),
    () => element("command-stop").removeEventListener("click", stop),
    () => element("command-attack").removeEventListener("click", attack),
    () => element("command-ignite").removeEventListener("click", ignite),
    () => element("command-heal").removeEventListener("click", heal),
    () => element("command-ward").removeEventListener("click", ward),
    () => element("edit-double-damage").removeEventListener("click", changedEdit),
    () => element("scalar-effect-catalog").removeEventListener("change", chooseEffect),
    () => element("explain-attack").removeEventListener("click", explainAttack),
    () => element("explain-heal").removeEventListener("click", explainHeal),
    () => element("intervene-attack").removeEventListener("click", interveneAttack),
  );
}

function teardown(state: GameState): void {
  if (state.disposed) return;
  state.disposed = true;
  state.lifetime.abort();
  state.resident.editFenceResolver?.();
  state.resident.editFenceResolver = null;
  window.clearInterval(state.resident.interval);
  for (const remove of state.listeners) remove();
  state.resident.worker.postMessage({ kind: "dispose" });
  state.resident.worker.terminate();
  state.presentation.dispose();
}

function start(): GameState {
  document.body.dataset.gamePhase = "loading";
  delete document.body.dataset.runtimeFailure;
  delete document.body.dataset.destinationMarker;
  delete document.body.dataset.liveEditMillis;
  document.body.dataset.liveEditState = "idle";
  element("retry-encounter").toggleAttribute("disabled", true);
  element("authority-status").textContent = "Rallying the company…";
  element("command-status").textContent = "Awaiting orders";
  element("live-edit-status").textContent = "No battle-law change offered";
  element("explanation-status").textContent = "No strike inspected";
  element("intervention-status").textContent = "No alternatives explored";
  element("equipment-panel").classList.remove("open");
  element("selection-rectangle").hidden = true;
  window.__GREYWROUGHT_GAME_EVENTS__ = [];
  window.__GREYWROUGHT_MEASUREMENTS__ = [];
  let priorAnimationFrame: number | null = null;
  let animationFrameHandle = 0;
  if (measurementEnabled) {
    const sampleAnimationFrame = (now: number): void => {
      if (priorAnimationFrame !== null) measure({ metric: "raf-interval", durationMillis: now - priorAnimationFrame });
      priorAnimationFrame = now;
      animationFrameHandle = window.requestAnimationFrame(sampleAnimationFrame);
    };
    animationFrameHandle = window.requestAnimationFrame(sampleAnimationFrame);
  }
  const resident: ResidentState = {
    worker: new Worker(`${publicUrl("app/greywrought-clause/resident-worker.js")}${measurementEnabled ? "?measure=1" : ""}`, { type: "module", name: "greywrought-rts-resident" }),
    generation: -1,
    polling: false,
    staticGeneration: false,
    interval: 0,
    workbenchGeneration: -1,
    editing: false,
    scalarEffects: [],
    entries: { attack: 0, heal: 0 },
    editStartedMillis: 0,
    pendingVisibleEdit: null,
    editFenceResolver: null,
  };
  const state: GameState = {
    lifetime: new AbortController(),
    resident,
    presentation: createRtsPresentation(element("world-wrap")),
    selectionRectangle: element("selection-rectangle"),
    listeners: [],
    units: [],
    actors: [],
    createdBurns: [],
    encounter: { phase: "Ready", ended: false, message: "", targetId: "" },
    drag: null,
    disposed: false,
  };
  bindResident(state);
  bindInteraction(state);
  bindHud(state);
  if (measurementEnabled) state.listeners.push(() => window.cancelAnimationFrame(animationFrameHandle));
  state.presentation.start();
  void pollResident(state);
  resident.interval = window.setInterval(() => void pollResident(state), 100);
  const unload = (): void => teardown(state);
  window.addEventListener("beforeunload", unload, { once: true });
  state.listeners.push(() => window.removeEventListener("beforeunload", unload));
  window.__GREYWROUGHT_TEARDOWN__ = () => teardown(state);
  return state;
}

start();
