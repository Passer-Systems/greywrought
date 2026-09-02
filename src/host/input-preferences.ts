export const inputPreferencesStorageKey = "greywrought/input-preferences-v1";

export type GameAction =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "target"
  | "bolt"
  | "sword"
  | "loot"
  | "jump"
  | "horizontalSustain"
  | "horizontalBurst"
  | "verticalSustain"
  | "verticalBurst"
  | "reset";

export interface ActionDefinition {
  readonly action: GameAction;
  readonly label: string;
  readonly semanticCode: string;
  readonly held: boolean;
}

export const actionDefinitions: readonly ActionDefinition[] = [
  { action: "forward", label: "Move forward", semanticCode: "KeyW", held: true },
  { action: "backward", label: "Move backward", semanticCode: "KeyS", held: true },
  { action: "left", label: "Move left", semanticCode: "KeyA", held: true },
  { action: "right", label: "Move right", semanticCode: "KeyD", held: true },
  { action: "target", label: "Cycle target", semanticCode: "Tab", held: false },
  { action: "bolt", label: "Lock-on bolt", semanticCode: "Digit1", held: false },
  { action: "sword", label: "Sword", semanticCode: "KeyJ", held: false },
  { action: "loot", label: "Loot", semanticCode: "LootItem", held: false },
  { action: "jump", label: "Jump", semanticCode: "Space", held: false },
  { action: "horizontalSustain", label: "Horizontal sustain", semanticCode: "ShiftLeft", held: true },
  { action: "horizontalBurst", label: "Horizontal burst", semanticCode: "KeyQ", held: false },
  { action: "verticalSustain", label: "Vertical sustain", semanticCode: "KeyE", held: true },
  { action: "verticalBurst", label: "Vertical burst", semanticCode: "KeyF", held: false },
  { action: "reset", label: "Reset encounter", semanticCode: "KeyR", held: false },
] as const;

export type InputBindings = Readonly<Record<GameAction, string>>;

export interface InputPreferences {
  readonly version: 1;
  readonly bindings: InputBindings;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly largeText: boolean;
  readonly effectsVolume: number;
}

export const defaultBindings: InputBindings = Object.freeze({
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  target: "Tab",
  bolt: "Digit1",
  sword: "KeyJ",
  loot: "KeyL",
  jump: "Space",
  horizontalSustain: "ShiftLeft",
  horizontalBurst: "KeyQ",
  verticalSustain: "KeyE",
  verticalBurst: "KeyF",
  reset: "KeyR",
});

export const defaultInputPreferences: InputPreferences = Object.freeze({
  version: 1,
  bindings: defaultBindings,
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  effectsVolume: 0.35,
});

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function decodeInputPreferences(source: string | null): Readonly<{
  preferences: InputPreferences;
  recovered: boolean;
}> {
  if (source === null) return { preferences: defaultInputPreferences, recovered: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return { preferences: defaultInputPreferences, recovered: true };
  }
  const value = record(parsed);
  const bindings = record(value?.bindings);
  if (
    value?.version !== 1 ||
    bindings === null ||
    typeof value.reducedMotion !== "boolean" ||
    typeof value.highContrast !== "boolean" ||
    typeof value.largeText !== "boolean" ||
    typeof value.effectsVolume !== "number" ||
    !Number.isFinite(value.effectsVolume) ||
    value.effectsVolume < 0 ||
    value.effectsVolume > 1
  ) {
    return { preferences: defaultInputPreferences, recovered: true };
  }
  const next = { ...defaultBindings };
  const occupied = new Set<string>();
  for (const definition of actionDefinitions) {
    const code = bindings[definition.action];
    if (typeof code !== "string" || code.length === 0 || occupied.has(code)) {
      return { preferences: defaultInputPreferences, recovered: true };
    }
    next[definition.action] = code;
    occupied.add(code);
  }
  return {
    preferences: {
      version: 1,
      bindings: Object.freeze(next),
      reducedMotion: value.reducedMotion,
      highContrast: value.highContrast,
      largeText: value.largeText,
      effectsVolume: value.effectsVolume,
    },
    recovered: false,
  };
}

export function encodeInputPreferences(preferences: InputPreferences): string {
  return JSON.stringify(preferences);
}

export function actionForPhysicalCode(
  bindings: InputBindings,
  physicalCode: string,
): GameAction | null {
  for (const definition of actionDefinitions) {
    if (bindings[definition.action] === physicalCode) return definition.action;
  }
  if (physicalCode === "ShiftRight" && bindings.horizontalSustain === "ShiftLeft") {
    return "horizontalSustain";
  }
  return null;
}

export function definitionForAction(action: GameAction): ActionDefinition {
  const definition = actionDefinitions.find((candidate) => candidate.action === action);
  if (definition === undefined) throw new Error(`unknown game action ${action}`);
  return definition;
}

export function rebindAction(
  bindings: InputBindings,
  action: GameAction,
  physicalCode: string,
): InputBindings {
  if (physicalCode.length === 0) throw new Error("a binding needs a physical key code");
  const next = { ...bindings };
  const collision = actionForPhysicalCode(bindings, physicalCode);
  if (collision !== null && collision !== action) {
    next[collision] = bindings[action];
  }
  next[action] = physicalCode;
  return Object.freeze(next);
}

export function displayKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code === "ShiftLeft") return "Left Shift";
  if (code === "ShiftRight") return "Right Shift";
  return code;
}

export function actionsForStandardGamepad(
  axes: readonly number[],
  pressedButtons: readonly boolean[],
): ReadonlySet<GameAction> {
  const actions = new Set<GameAction>();
  const axisX = axes[0] ?? 0;
  const axisY = axes[1] ?? 0;
  const pressed = (index: number): boolean => pressedButtons[index] ?? false;
  if (axisY < -0.35 || pressed(12)) actions.add("forward");
  if (axisY > 0.35 || pressed(13)) actions.add("backward");
  if (axisX < -0.35 || pressed(14)) actions.add("left");
  if (axisX > 0.35 || pressed(15)) actions.add("right");
  if (pressed(0)) actions.add("jump");
  if (pressed(1)) actions.add("loot");
  if (pressed(2)) actions.add("sword");
  if (pressed(3)) actions.add("target");
  if (pressed(4)) actions.add("horizontalBurst");
  if (pressed(5)) actions.add("bolt");
  if (pressed(6)) actions.add("verticalSustain");
  if (pressed(7)) actions.add("verticalBurst");
  if (pressed(9)) actions.add("reset");
  if (pressed(10)) actions.add("horizontalSustain");
  return actions;
}
