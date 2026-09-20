import { terrainHeight } from "./cave-layout.js";
import { snapCombatPosition, reachableCombatCells } from "./combat-grid.js";
import { classKit, classAction } from "./class-kit.js";
import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame, SharedAdventure, Position } from "./adventure-types.js";
import { QUESTS } from "./yard-content.js";

export function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
}
export function readyParty(...players: AdventureGame[]): void {
  for (const player of players) if (player.snapshot.player.inCombat) player.readyCombat();
}
export function finishGathering(game: AdventureGame, world?: SharedAdventure): void {
  (world ?? game).advance(game.snapshot.combat.gatheringRemainingSeconds);
}
export function finishCycle(game: AdventureGame, world?: SharedAdventure): void {
  if (game.snapshot.combat.ready) finishGathering(game, world);
  for (let elapsed = 0; game.snapshot.combat.phase === "active" && elapsed < 30; elapsed += .05) (world ?? game).advance(.05);
  if (game.snapshot.combat.phase === "active") throw new Error("Committed combat did not finish within 30 seconds");
}
export function travel(game: AdventureGame, x: number, z: number, world?: SharedAdventure): void {
  const advance = (seconds: number) => (world ?? game).advance(seconds);
  for (let step = 0; step < 100 && game.snapshot.player.health > 0; step++) {
    if (game.snapshot.combat.phase === "active") { finishCycle(game, world); continue; }
    const p = game.snapshot.player.position;
    const goal = game.snapshot.player.inCombat ? snapCombatPosition({x,y:terrainHeight(x,z),z},p,Infinity,game.snapshot.threats.filter(t=>t.active&&t.health>0).map(t=>t.position)) : {x,y:terrainHeight(x,z),z};
    const gap = Math.hypot(goal.x-p.x,goal.z-p.z);
    if (gap < .01) return;
    if (game.snapshot.player.inCombat) {
      game.clearQueuedActions();
      queueMoveToward(game,goal); tap(game,"brace"); game.setActionTiming("before");
      if (world) readyParty(...world.players().map(p => world.getPlayer(p.id)!)); else game.readyCombat();
      finishCycle(game, world);
    } else {
      game.setCameraForward(x-p.x,z-p.z); game.setAction("forward",true);
      advance(Math.min(.1,gap/classKit(game.snapshot.player.archetype).movementSpeed)); game.setAction("forward",false);
    }
  }
  throw new Error(`Could not travel to ${x},${z}: ${JSON.stringify(game.snapshot.player.position)}; ${game.snapshot.report}`);
}
export function retreatUntilReleased(game: AdventureGame, id: string, world?: SharedAdventure): void {
  for (let cycle=0;cycle<15 && game.snapshot.threats.find(t=>t.id===id)!.aggro;cycle++) {
    if(game.snapshot.combat.phase==="active") { finishCycle(game,world); continue; }
    game.clearQueuedActions();
    const p=game.snapshot.player.position;
    const destination=snapCombatPosition({x:p.x,y:terrainHeight(p.x,p.z-15),z:p.z-15},p,Infinity,game.snapshot.threats.filter(t=>t.active&&t.health>0).map(t=>t.position));
    if(!queueMoveToward(game,destination)) throw new Error("Retreat plan could not be queued");
    tap(game,"brace"); game.setActionTiming("before");
    if(world) readyParty(...world.players().map(p=>world.getPlayer(p.id)!)); else game.readyCombat();
    for(let time=0;time<5 && game.snapshot.threats.find(t=>t.id===id)!.aggro;time+=.05)(world??game).advance(.05);
  }
}
export function fightTarget(game: AdventureGame, id: string, defend = true): void {
  game.selectTarget(id);
  for (let cycle = 0; cycle < 100 && game.snapshot.player.health > 0; cycle++) {
    const target = game.snapshot.threats.find(t => t.id === id)!;
    if (target.health === 0) return;
    if (game.snapshot.combat.phase === "active") { finishCycle(game); continue; }
    const p = game.snapshot.player.position, dx = target.position.x - p.x, dz = target.position.z - p.z;
    const gap = Math.hypot(dx, dz);

    if (!game.snapshot.player.inCombat && !target.canStrike) {
      game.setCameraForward(dx,dz); game.setAction("forward",true); game.advance(Math.min(.1,(gap-2.5)/5.2)); game.setAction("forward",false); continue;
    }
    game.clearQueuedActions(); tap(game, "strike");
    if (defend) {
      const view = game.snapshot;
      const cells = reachableCombatCells(p, classKit(view.player.archetype).movementTiles, view.threats.filter(t => t.active && t.health > 0).map(t => t.position));
      let best: { destination: Position | null; action: "strike" | "brace"; timing: "before" | "after" } = { destination: null, action: "strike", timing: "before" }, bestScore = -Infinity;
      for (const action of (target.currentAbility.id === "foreman-pulse" ? ["brace"] : ["strike", "brace"]) as readonly ("strike" | "brace")[]) for (const destination of [null, ...cells]) for (const timing of destination && action === "strike" ? ["before", "after"] as const : ["before"] as const) {
        game.clearQueuedActions(); tap(game, action);
        if (!game.snapshot.combat.queued.some(entry => entry.action === action)) continue;
        if (destination && Math.hypot(destination.x-target.homePosition.x,destination.z-target.homePosition.z) > 8) continue;
        if (destination && !game.queueBait(destination)) continue;
        game.setActionTiming(timing);
        const forecast = game.snapshot.combat.forecast;
        if (!forecast) continue;
        const health = forecast.outcomes.find(o => o.id === "solo")!.health;
        const damage = target.health - forecast.outcomes.find(o => o.id === id)!.health;
        const end = forecast.paths.find(path => path.actorId === "solo" && path.kind === "move")?.points.at(-1) ?? p;
        const score = health + damage * 3 - (id !== "ritual-guardian" && Math.hypot(end.x-target.position.x,end.z-target.position.z) > classAction(view.player.archetype,"strike").range! + 1e-8 ? 15 : 0) - Math.hypot(end.x-target.homePosition.x,end.z-target.homePosition.z) * .01 - Math.hypot(end.x-p.x,end.z-p.z) * .001;
        if (score > bestScore) { bestScore = score; best = { destination, action, timing }; }
      }
      game.clearQueuedActions(); tap(game, best.action);
      if (best.destination) game.queueBait(best.destination);
      game.setActionTiming(best.timing);
    }
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
  Object.assign(saved.state, { phase: "expedition", position: { x:2, y:0, z:58.5 }, cargo: 6, potions: prepared ? 2 : 0 });
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

export function queueMoveToward(game: AdventureGame, goal: Position): boolean {
  const view=game.snapshot, origin=view.player.position;
  if (Math.hypot(origin.x-goal.x,origin.z-goal.z)<.01) return false;
  const candidates=reachableCombatCells(origin,classKit(view.player.archetype).movementTiles,view.threats.filter(t=>t.active&&t.health>0).map(t=>t.position));
  const destination=candidates.sort((a,b)=>Math.hypot(a.x-goal.x,a.z-goal.z)-Math.hypot(b.x-goal.x,b.z-goal.z))[0];
  return destination ? game.queueBait(destination) : false;
}
