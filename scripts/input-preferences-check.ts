import {
  actionForPhysicalCode,
  actionsForStandardGamepad,
  decodeInputPreferences,
  defaultBindings,
  defaultInputPreferences,
  encodeInputPreferences,
  rebindAction,
} from "../src/host/input-preferences.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const remapped = rebindAction(defaultBindings, "sword", "KeyK");
assert(actionForPhysicalCode(remapped, "KeyK") === "sword", "sword did not rebind");
assert(actionForPhysicalCode(remapped, "KeyJ") === null, "old sword binding remained active");
const swapped = rebindAction(remapped, "jump", "KeyK");
assert(actionForPhysicalCode(swapped, "KeyK") === "jump", "collision did not move requested action");
assert(actionForPhysicalCode(swapped, "Space") === "sword", "collision did not preserve the displaced action");
assert(actionForPhysicalCode(defaultBindings, "ShiftRight") === "horizontalSustain", "right Shift alias failed");

const decoded = decodeInputPreferences(encodeInputPreferences({
  ...defaultInputPreferences,
  bindings: remapped,
  reducedMotion: true,
  highContrast: true,
  largeText: true,
  effectsVolume: 0.6,
}));
assert(!decoded.recovered, "valid preferences were discarded");
assert(decoded.preferences.bindings.sword === "KeyK", "valid remap did not round trip");
assert(decoded.preferences.reducedMotion, "reduced motion did not round trip");
assert(decoded.preferences.effectsVolume === 0.6, "effects volume did not round trip");
const gamepad = actionsForStandardGamepad([0.7, -0.8], [true, false, true]);
assert(gamepad.has("forward") && gamepad.has("right"), "gamepad axes did not map movement");
assert(gamepad.has("jump") && gamepad.has("sword"), "gamepad buttons did not map actions");
assert(decodeInputPreferences("bad json").recovered, "bad JSON was not recovered");
assert(
  decodeInputPreferences('{"version":1,"bindings":{}}').recovered,
  "incomplete bindings were not recovered",
);

console.log("Input remapping and accessibility preference checks passed.");
