import { expect, test } from "bun:test";
import { createAdventure } from "../game/adventure.js";
import { newAttackerTarget } from "./unit-selection.js";

const scout = createAdventure().snapshot.threats.find(threat => threat.id === "scout")!;
const attacker = { ...scout, aggro: true, targetPlayerId: "self" };

test("a new attacker fills an empty, friendly, or defeated enemy target", () => {
  expect(newAttackerTarget([attacker], null, "self", new Set())).toBe("scout");
  expect(newAttackerTarget([attacker], { kind: "player", id: "friend" }, "self", new Set())).toBe("scout");
  const dead = { ...scout, id: "dead", health: 0 };
  expect(newAttackerTarget([dead, attacker], { kind: "enemy", id: "dead" }, "self", new Set())).toBe("scout");
});

test("new attackers never replace an existing living enemy selection", () => {
  const selected = { ...scout, id: "selected", aggro: false };
  expect(newAttackerTarget([selected, attacker], { kind: "enemy", id: "selected" }, "self", new Set())).toBeNull();
});

test("clearing a target stays cleared until another enemy begins targeting this player", () => {
  const previous = new Set(["scout"]);
  expect(newAttackerTarget([attacker], null, "self", previous)).toBeNull();
  const newcomer = { ...attacker, id: "newcomer" };
  expect(newAttackerTarget([attacker, newcomer], null, "self", previous)).toBe("newcomer");
});

test("nearby enemies targeting someone else, idle enemies, and corpses do not select themselves", () => {
  for (const threat of [{ ...attacker, targetPlayerId: "friend" }, { ...attacker, aggro: false }, { ...attacker, health: 0 }, { ...attacker, active: false }]) {
    expect(newAttackerTarget([threat], null, "self", new Set())).toBeNull();
  }
  expect(newAttackerTarget([attacker], null, "self", new Set())).toBe("scout");
});
