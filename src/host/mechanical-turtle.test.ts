import { expect, test } from "bun:test";
import { Box3, Vector3 } from "three";
import { mechanicalTurtle } from "./mechanical-turtle.js";

for (const armored of [false, true]) test(`${armored ? "Armored" : "Pond"} turtle rolls its whole body on death and restores its live pose`, () => {
  const actor = mechanicalTurtle(armored);
  const body = actor.root.getObjectByName("TurtleBody")!;
  actor.play("Walk"); actor.mixer.update(.3);
  actor.play("Death", false); actor.mixer.update(1);
  actor.root.updateMatrixWorld(true);
  expect(body.rotation.z).toBeCloseTo(Math.PI / 2);
  for (const name of ["Shell", "Head", "Tail", "Flipper0", "Flipper1", "Flipper2", "Flipper3"]) {
    const part = actor.root.getObjectByName(name)!;
    const up = new Vector3(0, 1, 0).transformDirection(part.matrixWorld);
    expect(up.x).toBeCloseTo(-1);
    expect(up.y).toBeCloseTo(0);
  }
  expect(new Box3().setFromObject(actor.root).min.y).toBeGreaterThan(-.03);
  actor.mixer.update(2);
  expect(body.rotation.z).toBeCloseTo(Math.PI / 2);
  actor.play("Idle"); actor.mixer.update(.3);
  expect(body.rotation.z).toBeCloseTo(0);
  expect(body.position.y).toBeCloseTo(0);
  actor.play("Walk"); actor.mixer.update(.5);
  expect(Math.abs(actor.root.getObjectByName("Flipper0")!.rotation.z)).toBeGreaterThan(.4);
  actor.dispose();
});
