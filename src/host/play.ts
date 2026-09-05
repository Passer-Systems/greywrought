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

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
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
  readonly targetId: string;
}

interface ResidentState {
  readonly worker: Worker;
  generation: number;
  polling: boolean;
  staticGeneration: boolean;
  interval: number;
}

interface GameState {
  readonly resident: ResidentState;
  readonly presentation: RtsPresentation;
  readonly selectionRectangle: HTMLElement;
  readonly listeners: Array<() => void>;
  units: readonly ResidentUnitView[];
  actors: readonly ResidentActorView[];
  encounter: EncounterView;
  drag: Readonly<{ pointerId: number; x: number; y: number; moved: boolean }> | null;
  disposed: boolean;
}

declare global {
  interface Window {
    __GREYWROUGHT_GAME_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_TEARDOWN__: (() => void) | undefined;
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
  for (const [id, candidate] of Object.entries(game)) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) continue;
    const subject = record(candidate, id);
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
  return Object.entries(index.game).flatMap(([id, candidate]) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const unit = record(candidate, id);
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
  return Object.entries(index.game).flatMap(([id, candidate]) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const actor = record(candidate, id);
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
    targetId: idFor(index, field(controller, "chosen-target", "player-1"), "player-1.chosen-target"),
  };
}

function sendInput(state: GameState, input: ResidentInput): void {
  state.resident.worker.postMessage({ kind: "input", input });
}

interface CapturedFrame {
  readonly capturedExternalGeneration: number;
  readonly capturedWorkbenchGeneration: number;
}

function capturedFrame(state: GameState): CapturedFrame | null {
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

function selectUnits(state: GameState, ids: readonly string[]): void {
  const desired = new Set(ids);
  const captured = state.units.filter((unit) => desired.has(unit.id));
  const frame = capturedFrame(state);
  if (frame === null) return;
  press(state, "ClearSelection", frame);
  for (const unit of captured) {
    sendInput(state, {
      kind: "referent-input",
      channel: "Pick",
      capturedExternalGeneration: unit.capturedExternalGeneration,
      capturedWorkbenchGeneration: unit.capturedWorkbenchGeneration,
      value: unit.pickReferent,
    });
  }
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "selection-requested",
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
}

function issueAction(state: GameState, code: "BeginEncounter" | "Attack" | "Heal" | "Ward"): void {
  const frame = capturedFrame(state);
  if (frame === null) return;
  press(state, code, frame);
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

function renderHud(state: GameState): void {
  const selected = state.units.filter((unit) => unit.selected);
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
    className.textContent = `${unit.unitClass} · ${Math.max(0, unit.vitality).toFixed(0)}/${unit.maximumVitality.toFixed(0)}${unit.wardRemaining > 0 ? " · Ward" : ""}${unit.burnRemaining > 0 ? " · Burn" : ""}${unit.alive ? "" : " · Fallen"}`;
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
    card.querySelector("span")!.textContent = `${Math.max(0, actor.vitality).toFixed(0)} / ${actor.maximumVitality.toFixed(0)}${actor.wardRemaining > 0 ? " · Ward" : ""}${actor.burnRemaining > 0 ? " · Burn" : ""}`;
  }
  const active = state.encounter.phase === "Battle joined";
  element("begin-encounter").toggleAttribute("disabled", state.encounter.phase !== "Ready");
  for (const id of ["command-attack", "command-heal", "command-ward"]) {
    element(id).toggleAttribute("disabled", !active || selected.length === 0);
  }
}

function applyProjection(
  state: GameState,
  projection: unknown,
  generation: number,
  workbenchGeneration: number,
): void {
  const index = projectionIndex(projection);
  state.encounter = decodeEncounter(index);
  state.units = decodeUnits(index, generation, workbenchGeneration);
  state.actors = decodeEncounterActors(index, state.encounter.targetId, generation, workbenchGeneration);
  state.presentation.applyUnits(state.units);
  state.presentation.applyEncounterActors(
    state.actors.filter((actor) => actor.kind === "Cinder" || actor.kind === "Moonwell"),
  );
  renderHud(state);
  document.body.dataset.gamePhase = "ready";
  document.body.dataset.residentGeneration = String(generation);
  element("authority-status").textContent = "Company ready · orders received";
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "projection",
    generation,
    selected: state.units.filter((unit) => unit.selected).map((unit) => unit.id),
    positions: Object.fromEntries(state.units.map((unit) => [unit.id, [unit.x, unit.z]])),
    encounter: state.encounter.phase,
    target: state.encounter.targetId,
    vitality: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.vitality])),
    wards: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.wardRemaining])),
    burns: Object.fromEntries(state.actors.map((actor) => [actor.id, actor.burnRemaining])),
    cooldowns: Object.fromEntries(state.units.map((unit) => [unit.id, number(record(index.game[unit.id], unit.id), "action-cooldown", unit.id)])),
  });
}

function bindResident(state: GameState): void {
  const message = (event: MessageEvent<unknown>): void => {
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
        applyProjection(state, payload.projection, generation, workbenchGeneration);
      } else if (kind === "receipt") {
        const receipt = record(payload.receipt, "resident receipt");
        if (typeof receipt.event === "string") document.body.dataset.lastReceipt = receipt.event;
      } else if (kind === "heartbeat") {
        if (typeof payload.workbenchPhase === "string") document.body.dataset.workbenchPhase = payload.workbenchPhase;
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
  const { generation, compilerMicros, cwr1, sourceModifiedMillis, hot } = source;
  if (
    typeof generation !== "number" || typeof compilerMicros !== "number" ||
    typeof cwr1 !== "string" || typeof sourceModifiedMillis !== "number" || typeof hot !== "boolean"
  ) throw new Error("resident generation payload is malformed");
  return { generation, compilerMicros, cwr1, sourceModifiedMillis, hot };
}

function installGeneration(state: GameState, payload: GenerationPayload): void {
  state.resident.generation = payload.generation;
  state.resident.worker.postMessage({ kind: "install-generation", payload });
  element("authority-status").textContent = payload.hot ? "Forming ranks…" : "Rallying the company…";
}

async function pollResident(state: GameState): Promise<void> {
  if (state.disposed || state.resident.polling || state.resident.staticGeneration) return;
  state.resident.polling = true;
  try {
    const response = await fetch(publicUrl(`resident-generation?after=${state.resident.generation}`), { cache: "no-store" });
    if (response.status === 404 && state.resident.generation < 0) {
      state.resident.staticGeneration = true;
      const cartridge = await fetch(publicUrl("assets/embodied-encounter-v1.cwr1.hex")).then((entry) => {
        if (!entry.ok) throw new Error(`company roster failed: ${entry.status}`);
        return entry.text();
      });
      installGeneration(state, { generation: 0, compilerMicros: 0, cwr1: cartridge, sourceModifiedMillis: 0, hot: false });
      return;
    }
    if (response.status === 204) return;
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error("company update was rejected; prior orders retained");
    installGeneration(state, parseGeneration(payload));
  } catch (cause: unknown) {
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
    state.drag = { pointerId: event.pointerId, x, y, moved: false };
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
      ));
    } else {
      const picked = state.presentation.pickUnit(event.clientX, event.clientY);
      selectUnits(state, picked === null ? [] : [picked]);
    }
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
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("contextmenu", contextMenu);
  canvas.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  state.listeners.push(
    () => canvas.removeEventListener("pointerdown", pointerDown),
    () => canvas.removeEventListener("pointermove", pointerMove),
    () => canvas.removeEventListener("pointerup", pointerUp),
    () => canvas.removeEventListener("pointercancel", pointerUp),
    () => canvas.removeEventListener("pointerleave", pointerLeave),
    () => canvas.removeEventListener("contextmenu", contextMenu),
    () => canvas.removeEventListener("wheel", wheel),
    () => window.removeEventListener("keydown", keyDown),
    () => window.removeEventListener("keyup", keyUp),
  );
}

function bindHud(state: GameState): void {
  const roster = element("roster");
  const select = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>(".roster-card");
    const id = card?.dataset.unitId;
    if (id !== undefined) selectUnits(state, [id]);
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
  const attack = (): void => issueAction(state, "Attack");
  const heal = (): void => issueAction(state, "Heal");
  const ward = (): void => issueAction(state, "Ward");
  element("select-all").addEventListener("click", all);
  element("equipment-toggle").addEventListener("click", equipment);
  element("equipment-close").addEventListener("click", close);
  element("encounter-targets").addEventListener("click", target);
  element("begin-encounter").addEventListener("click", begin);
  element("command-attack").addEventListener("click", attack);
  element("command-heal").addEventListener("click", heal);
  element("command-ward").addEventListener("click", ward);
  state.listeners.push(
    () => roster.removeEventListener("click", select),
    () => element("select-all").removeEventListener("click", all),
    () => element("equipment-toggle").removeEventListener("click", equipment),
    () => element("equipment-close").removeEventListener("click", close),
    () => element("encounter-targets").removeEventListener("click", target),
    () => element("begin-encounter").removeEventListener("click", begin),
    () => element("command-attack").removeEventListener("click", attack),
    () => element("command-heal").removeEventListener("click", heal),
    () => element("command-ward").removeEventListener("click", ward),
  );
}

function teardown(state: GameState): void {
  if (state.disposed) return;
  state.disposed = true;
  window.clearInterval(state.resident.interval);
  for (const remove of state.listeners) remove();
  state.resident.worker.postMessage({ kind: "dispose" });
  state.resident.worker.terminate();
  state.presentation.dispose();
}

function start(): GameState {
  window.__GREYWROUGHT_GAME_EVENTS__ = [];
  const resident: ResidentState = {
    worker: new Worker(publicUrl("app/greywrought-clause/resident-worker.js"), { type: "module", name: "greywrought-rts-resident" }),
    generation: -1,
    polling: false,
    staticGeneration: false,
    interval: 0,
  };
  const state: GameState = {
    resident,
    presentation: createRtsPresentation(element("world-wrap")),
    selectionRectangle: element("selection-rectangle"),
    listeners: [],
    units: [],
    actors: [],
    encounter: { phase: "Ready", targetId: "" },
    drag: null,
    disposed: false,
  };
  bindResident(state);
  bindInteraction(state);
  bindHud(state);
  state.presentation.start();
  void pollResident(state);
  resident.interval = window.setInterval(() => void pollResident(state), 100);
  window.addEventListener("beforeunload", () => teardown(state), { once: true });
  window.__GREYWROUGHT_TEARDOWN__ = () => teardown(state);
  return state;
}

start();
