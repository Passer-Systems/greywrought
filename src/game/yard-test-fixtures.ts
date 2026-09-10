import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame } from "./adventure-types.js";
import { QUESTS } from "./yard-content.js";

export function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
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
  tap(game,"ritual"); game.selectTarget("ritual-guardian");
  return game;
}
export function fightForeman(game: AdventureGame, prepared: boolean): { health: number; bossHealth: number; seconds: number } {
  game.selectTarget("ritual-guardian");
  let seconds = 0;
  tap(game, "strike");
  while (seconds < 180 && game.snapshot.player.health > 0) {
    const s = game.snapshot, boss = s.threats.find(t => t.id === "ritual-guardian")!;
    if (boss.health === 0) break;
    const cast = boss.cast;
    if (prepared && s.combat.globalCooldown === 0) {
      if (cast && cast.ability.damage > 0 && cast.remainingSeconds < .3) tap(game, "brace");
      else if (s.player.health <= 65 && s.potions > 0 && (!cast || cast.remainingSeconds > 2)) tap(game, "drinkPotion");
    }
    const dx = boss.position.x - s.player.position.x, dz = boss.position.z - s.player.position.z;
    game.setCameraForward(dx, dz); game.setAction("forward", Math.hypot(dx, dz) > 1.7);
    game.advance(.05); seconds += .05;
  }
  game.setAction("forward", false);
  return { health: game.snapshot.player.health, bossHealth: game.snapshot.threats.find(t => t.id === "ritual-guardian")!.health, seconds };
}
