import { expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";

test("watchmen keep moving and face their curved travel through repeated patrol corners", () => {
  const game = createAdventure();
  const ids = ["scout", "warder"];
  const corners = new Map(ids.map(id => [id, new Set<number>()]));
  let previous = game.snapshot;
  for (let frame = 0; frame < 1800; frame++) {
    game.advance(1 / 60);
    const current = game.snapshot;
    for (const id of ids) {
      const before = previous.threats.find(t => t.id === id)!;
      const threat = current.threats.find(t => t.id === id)!;
      const speed = id === "scout" ? 1.6 : 2;
      const dx = threat.position.x - before.position.x, dz = threat.position.z - before.position.z;
      const length = Math.hypot(dx, dz);
      expect(threat.moving).toBe(true);
      expect(length).toBeCloseTo(speed / 60, 5);
      expect((dx * threat.facing.x + dz * threat.facing.z) / length).toBeCloseTo(1, 5);
      const dot = before.facing.x * threat.facing.x + before.facing.z * threat.facing.z;
      expect(Math.acos(Math.min(1, Math.max(-1, dot)))).toBeLessThanOrEqual(speed / 60 / .3 + 1e-6);
      expect(Math.hypot(threat.position.x - threat.homePosition.x, threat.position.z - threat.homePosition.z)).toBeLessThan(5);
      corners.get(id)!.add(Math.round(Math.atan2(threat.facing.x, threat.facing.z) / (Math.PI / 2)));
    }
    previous = current;
  }
  for (const id of ids) expect(corners.get(id)!.size).toBeGreaterThanOrEqual(4);
});

test("other creatures retain patrol rests and a paused world does not turn", () => {
  const game = createAdventure();
  const before = game.snapshot.threats.find(t => t.id === "scout")!;
  game.advance(0);
  expect(game.snapshot.threats.find(t => t.id === "scout")!).toEqual(before);
  let rested = false;
  for (let frame = 0; frame < 300; frame++) {
    game.advance(1 / 60);
    const bee = game.snapshot.threats.find(t => t.id === "nest")!;
    if (!bee.moving && bee.remainingSeconds > 0) rested = true;
  }
  expect(rested).toBe(true);
});
