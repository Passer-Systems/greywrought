import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame, SharedAdventure } from "./adventure-types.js";
import { QUESTS } from "./yard-content.js";

export function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
}
export function readyParty(...players: AdventureGame[]): void {
  for (const player of players) if (player.snapshot.player.inCombat) player.readyCombat();
}
export function finishCycle(game: AdventureGame, world?: SharedAdventure): void {
  for (let elapsed = 0; game.snapshot.combat.phase === "active" && elapsed < 30; elapsed += .05) (world ?? game).advance(.05);
  if (game.snapshot.combat.phase === "active") throw new Error("Committed combat did not finish within 30 seconds");
}
export function fightTarget(game: AdventureGame, id: string, defend = true): void {
  game.selectTarget(id);
  for (let cycle = 0; cycle < 100 && game.snapshot.player.health > 0; cycle++) {
    const target = game.snapshot.threats.find(t => t.id === id)!;
    if (target.health === 0) return;
    if (game.snapshot.combat.phase === "active") { finishCycle(game); continue; }
    const p = game.snapshot.player.position, dx = target.position.x - p.x, dz = target.position.z - p.z;
    const gap = Math.hypot(dx, dz);
    if (defend && target.currentAbility.id === "foreman-press" && gap < 1.9) {
      game.setCameraForward(-dx, -dz); game.setAction("forward", true);
      game.advance((1.95 - gap) / 4.5); game.setAction("forward", false);
      continue;
    }
    if (!target.canStrike) {
      game.setCameraForward(dx, dz); game.setAction("forward", true);
      game.advance(Math.min(1, Math.max(.05, (gap - 1.5) / 4.5))); game.setAction("forward", false);
      continue;
    }
    tap(game, "strike");
    if (defend && game.snapshot.player.health <= 65 && game.snapshot.potions > 0) tap(game, "drinkPotion");
    else tap(game, "strike");
    const defenseAction = target.currentAbility.id === "foreman-press" ? "disengage" : "brace";
    if (defend && target.windowAction?.ability.damage && game.snapshot.player.stamina >= 2) {
      tap(game, defenseAction);
      const defense = game.snapshot.combat.queued.find(e => e.action === defenseAction);
      if (defense && target.windowAction) game.moveQueuedAction(defense.id, target.windowAction.offsetSeconds);
    }
    else tap(game, "strike");
    game.readyCombat(); finishCycle(game);
  }
}
// Seed completed objectives from a prior expedition; rewards and lessons still
// pass through the same explicit NPC turn-ins used by players.
export function earnedChapter(count = 3) {
  let game = createAdventure();
  for (const q of QUESTS.slice(0, count)) {
    const saved = JSON.parse(game.save());
    saved.state.position = { x: q.giver === "mara" ? 3.4 : 5, y: 0, z: q.giver === "mara" ? -7.5 : -11 };
    game = createAdventure({ save: JSON.stringify(saved) });
    game.quest(q.id, "accept");
    const objective = JSON.parse(game.save());
    if (q.id === "cold-hands") objective.state.cargo = 3;
    if (q.id === "roll-call") objective.state.chapter.scoutDefeated = true;
    if (q.id === "last-shift") objective.state.carriedRelics = 1;
    game = createAdventure({ save: JSON.stringify(objective) });
    game.quest(q.id, "turnIn");
  }
  return JSON.parse(game.save()).state.chapter;
}
export function trained(game: AdventureGame, count = 3): AdventureGame {
  const saved = JSON.parse(game.save()); saved.state.chapter = earnedChapter(count);
  return createAdventure({ save: JSON.stringify(saved) });
}
export function foremanFixture(prepared: boolean, seed = 9844): AdventureGame {
  const saved = JSON.parse(createAdventure().save());
  Object.assign(saved.state, { phase: "expedition", position: { x:2, y:0, z:38.5 }, cargo: 6, potions: prepared ? 2 : 0 });
  if (prepared) {
    saved.state.chapter = earnedChapter(2);
    saved.state.chapter.equipment = { chest: "insulated-coat", mainhand: "yard-weapon" };
  }
  for (const enemy of saved.state.threats) {
    enemy.rng = seed;
    if (enemy.id !== "ritual-guardian") Object.assign(enemy, { health:0, phase:"cleared", lootClaimed:true });
  }
  const game = createAdventure({ save:JSON.stringify(saved) });
  tap(game,"ritual"); game.advance(.01); game.selectTarget("ritual-guardian");
  return game;
}
export function fightForeman(game: AdventureGame, prepared: boolean): { health: number; bossHealth: number } {
  fightTarget(game, "ritual-guardian", prepared);
  return { health: game.snapshot.player.health, bossHealth: game.snapshot.threats.find(t => t.id === "ritual-guardian")!.health };
}
