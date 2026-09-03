import {
  actionForPhysicalCode,
  actionsForStandardGamepad,
  decodeInputPreferences,
  defaultBindings,
  defaultInputPreferences,
  encodeInputPreferences,
  rebindAction,
  swapCombatSlotBindings,
} from "../src/host/input-preferences.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const remapped = rebindAction(defaultBindings, "ability1", "KeyK");
assert(actionForPhysicalCode(remapped, "KeyK") === "ability1", "melee primary did not rebind");
assert(actionForPhysicalCode(remapped, "Digit1") === null, "old melee binding remained active");
assert(actionForPhysicalCode(defaultBindings, "KeyJ") === null, "J must remain unbound");
assert(actionForPhysicalCode(defaultBindings, "ShiftR") === "reset", "Shift+R reset binding failed");
const swapped = rebindAction(remapped, "jump", "KeyK");
assert(actionForPhysicalCode(swapped, "KeyK") === "jump", "collision did not move requested action");
assert(actionForPhysicalCode(swapped, "Space") === "ability1", "collision did not preserve the displaced action");
assert(actionForPhysicalCode(defaultBindings, "ShiftRight") === "horizontalSustain", "right Shift alias failed");
assert(actionForPhysicalCode(defaultBindings, "Digit1") === "ability1", "1 did not bind melee primary");
assert(actionForPhysicalCode(defaultBindings, "Digit2") === "ability2", "2 did not bind Bolt/cast");
assert(actionForPhysicalCode(defaultBindings, "KeyF") === "loot", "F did not bind interact");
assert(actionForPhysicalCode(defaultBindings, "KeyR") === "classUtility", "R did not bind class utility");
assert(actionForPhysicalCode(defaultBindings, "ShiftR") === "reset", "Shift+R did not bind reset");
for (const action of [
  "forward", "backward", "left", "right", "target", "ability1", "ability2",
  "ability3", "ability4", "ability5", "classUtility", "loot", "jump", "shield",
  "horizontalSustain", "horizontalBurst", "reset",
] as const) {
  assert(typeof defaultBindings[action] === "string" && defaultBindings[action].length > 0,
    `default binding was not total for ${action}`);
}
const swappedCombat = swapCombatSlotBindings(defaultBindings, 0, 1);
assert(actionForPhysicalCode(swappedCombat, "Digit1") === "ability2", "combat swap did not move Cinderbolt");
assert(actionForPhysicalCode(swappedCombat, "Digit2") === "ability1", "combat swap did not move Attack");
const movedCombat = swapCombatSlotBindings(defaultBindings, 0, 4);
assert(actionForPhysicalCode(movedCombat, "Digit1") === "ability5", "combat swap did not preserve the displaced action");
assert(actionForPhysicalCode(movedCombat, "Digit5") === "ability1", "combat move did not persist destination key");

const decoded = decodeInputPreferences(encodeInputPreferences({
  ...defaultInputPreferences,
  bindings: remapped,
  reducedMotion: true,
  highContrast: true,
  largeText: true,
  effectsVolume: 0.6,
}));
assert(!decoded.recovered, "valid preferences were discarded");
assert(decoded.preferences.bindings.ability1 === "KeyK", "valid remap did not round trip");
assert(decoded.preferences.reducedMotion, "reduced motion did not round trip");
assert(decoded.preferences.effectsVolume === 0.6, "effects volume did not round trip");
const gamepad = actionsForStandardGamepad([0.7, -0.8], [true, false, true]);
assert(gamepad.has("forward") && gamepad.has("right"), "gamepad axes did not map movement");
assert(gamepad.has("jump") && gamepad.has("ability1"), "gamepad buttons did not map actions");
assert(decodeInputPreferences("bad json").recovered, "bad JSON was not recovered");
assert(
  decodeInputPreferences('{"version":1,"bindings":{}}').recovered,
  "stale v1 bindings were not migrated to the new defaults",
);
assert(
  decodeInputPreferences('{"version":2,"bindings":{}}').recovered,
  "incomplete current-version bindings were not recovered",
);

console.log("Input remapping and accessibility preference checks passed.");
