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
  let planned = -1, seconds = 0;
  while (seconds < 240 && game.snapshot.player.health > 0) {
    const s = game.snapshot, boss = s.threats.find(t => t.id === "ritual-guardian")!;
    if (boss.health === 0) break;
    if (s.combat.phase === "preparation" && planned !== s.combat.cycle) {
      planned = s.combat.cycle;
      const move = boss.windowAction!;
      const beat = Math.floor(move.offsetSeconds);
      for (let slot=0;slot<3;slot++) {
        if (!prepared) tap(game,"strike");
        else if (move.ability.id === "foreman-shield") {
          if (slot === 0 && s.player.health <= 85 && s.potions > 0) tap(game,"drinkPotion");
        } else tap(game,slot === beat ? move.ability.id === "foreman-pulse" ? "brace" : "disengage" : "strike");
      }
    }
    // Walk into reach before a new attack sequence; queued Disengage alone
    // controls movement during the active Press turn.
    const pos = s.player.position;
    const gap = Math.hypot(boss.position.x-pos.x,boss.position.z-pos.z);
    if (s.combat.phase === "preparation" && gap > 1.6) {
      game.setCameraForward(boss.position.x-pos.x,boss.position.z-pos.z); game.setAction("forward",true);
    } else game.setAction("forward",false);
    game.advance(0.05); seconds += 0.05;
  }
  game.setAction("forward",false);
  return { health:game.snapshot.player.health, bossHealth:game.snapshot.threats.find(t=>t.id==="ritual-guardian")!.health, seconds };
}
