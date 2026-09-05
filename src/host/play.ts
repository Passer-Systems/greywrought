import { Vector3 } from "three";
import { publicUrl } from "./public-url.js";
import {
  createRtsPresentation,
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
  readonly referent: unknown;
  readonly capturedExternalGeneration: number;
  readonly capturedWorkbenchGeneration: number;
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

function decodeUnits(
  projection: unknown,
  capturedExternalGeneration: number,
  capturedWorkbenchGeneration: number,
): readonly ResidentUnitView[] {
  const game = record(projection, "game projection");
  return Object.entries(game).flatMap(([id, candidate]) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const unit = record(candidate, id);
    if (!("$referent" in unit) || !("unit-position" in unit) || !("unit-class" in unit)) return [];
    const position = field(unit, "unit-position", id);
    const classId = text(unit, "unit-class", id);
    const classProjection = field(game, classId, "game projection");
    return [{
      id,
      name: text(unit, "unit-name", id),
      unitClass: unitClass(text(classProjection, "class-name", classId)),
      x: number(position, "x", `${id}.unit-position`),
      z: number(position, "z", `${id}.unit-position`),
      selected: boolean(unit, "selected", id),
      moving: boolean(unit, "moving", id),
      referent: field(unit, "$referent", id),
      capturedExternalGeneration,
      capturedWorkbenchGeneration,
    }];
  });
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
      value: unit.referent,
    });
  }
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "selection-requested",
    units: captured.map((unit) => unit.id),
  });
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
    className.textContent = unit.unitClass;
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
}

function applyProjection(
  state: GameState,
  projection: unknown,
  generation: number,
  workbenchGeneration: number,
): void {
  state.units = decodeUnits(projection, generation, workbenchGeneration);
  state.presentation.applyUnits(state.units);
  renderHud(state);
  document.body.dataset.gamePhase = "ready";
  document.body.dataset.residentGeneration = String(generation);
  element("authority-status").textContent = "Company ready · orders received";
  window.__GREYWROUGHT_GAME_EVENTS__.push({
    phase: "projection",
    generation,
    selected: state.units.filter((unit) => unit.selected).map((unit) => unit.id),
    positions: Object.fromEntries(state.units.map((unit) => [unit.id, [unit.x, unit.z]])),
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
  element("select-all").addEventListener("click", all);
  element("equipment-toggle").addEventListener("click", equipment);
  element("equipment-close").addEventListener("click", close);
  state.listeners.push(
    () => roster.removeEventListener("click", select),
    () => element("select-all").removeEventListener("click", all),
    () => element("equipment-toggle").removeEventListener("click", equipment),
    () => element("equipment-close").removeEventListener("click", close),
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
