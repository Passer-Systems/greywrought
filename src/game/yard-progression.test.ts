import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { earnedChapter, foremanFixture, fightForeman, tap } from "./yard-test-fixtures.js";
import type { AdventureGame } from "./adventure-types.js";

function at(game: AdventureGame, x: number, z: number, phase: "town"|"expedition"): AdventureGame {
  const data=JSON.parse(game.save());
  Object.assign(data.state,{position:{x,y:0,z},phase});
  return createAdventure({save:JSON.stringify(data)});
}
test("Cold Hands requires nearby acceptance, gathered cargo, physical return and a single explicit reward",()=>{
  let game=createAdventure();
  game.quest("cold-hands","accept"); expect(game.snapshot.quests[0]!.status).toBe("available");
  game=at(game,3.4,-7.5,"town"); game.quest("cold-hands","accept");
  game.quest("roll-call","accept"); expect(game.snapshot.quests[1]!.status).toBe("locked");
  game=at(game,-2,12,"expedition"); tap(game,"gather");
  expect(game.snapshot.cargo).toBe(3); expect(game.snapshot.quests[0]!.status).toBe("ready");
  game.quest("cold-hands","turnIn"); expect(game.snapshot.progression.level).toBe(1);
  game=at(game,0,0.02,"expedition");game.setCameraForward(0,-1);game.setAction("forward",true);game.advance(.05);game.setAction("forward",false);
  expect(game.snapshot.phase).toBe("town");expect(game.snapshot.cargo).toBe(3);expect(game.snapshot.supplies).toBe(15);
  game=at(game,3.4,-7.5,"town");game.quest("cold-hands","turnIn");
  expect(game.snapshot.progression).toMatchObject({level:2,attackBonus:2,ownedGear:["insulated-coat"]});
  expect(game.snapshot.potions).toBe(2);expect(game.snapshot.cargo).toBe(0);
  game.quest("cold-hands","turnIn");expect(game.snapshot.potions).toBe(2);
  game.equip("mainhand","insulated-coat");game.equip("mainhand","yard-weapon");expect(game.snapshot.progression.equipment.mainhand).toBeNull();
  game.equip("chest","insulated-coat");expect(game.snapshot.progression.damageReduction).toBe(2);
  const restored=createAdventure({save:game.save()});expect(restored.snapshot.progression).toEqual(game.snapshot.progression);
  game.advance(1.5);game.equip("chest",null);expect(game.snapshot.progression.damageReduction).toBe(0);
});
test("locked skills reject activation; earned lessons and level bonuses persist",()=>{
  let game=at(createAdventure(),-3,8,"expedition");tap(game,"disengage");tap(game,"bloodRage");expect(game.snapshot.player.currentAction).toBeNull();expect(game.snapshot.player.stamina).toBe(5);
  const c=earnedChapter();expect(c.level).toBe(3);expect(c.completed).toEqual(["cold-hands","roll-call","last-shift"]);
  const save=JSON.parse(game.save());save.state.chapter=c;
  game=createAdventure({save:JSON.stringify(save)});expect(game.snapshot.progression.attackBonus).toBe(4);expect(game.snapshot.progression.unlockedActions).toContain("bloodRage");
});
test("legacy character inventory survives while the new chapter becomes available",()=>{
  const save=JSON.parse(createAdventure().save());delete save.state.chapter;
  Object.assign(save.state,{supplies:47,potions:4,bankedRelics:2});
  const game=createAdventure({save:JSON.stringify(save)});
  expect(game.snapshot).toMatchObject({supplies:47,potions:4,bankedRelics:2});expect(game.snapshot.quests[0]!.status).toBe("available");
});
test("shared scout kills grant saved credit to current contributors, excluding bystanders and private encounters",()=>{
  const seed=createSharedAdventure();for(const id of ["a","b","c"])seed.join(id,id,"mage");
  const save=JSON.parse(seed.save());
  for(const p of save.characters){p.state.chapter=earnedChapter(1);p.state.chapter.accepted.push("roll-call");p.state.phase="expedition";p.state.position={x:-3,y:0,z:8};}
  save.world.threats[0].health=33;
  const world=createSharedAdventure({save:JSON.stringify(save)}),a=world.join("a","a","mage"),b=world.join("b","b","mage"),c=world.join("c","c","mage");
  tap(a,"strike");world.advance(.01);tap(b,"strike");world.advance(.01);
  expect(a.snapshot.player.inCombat).toBe(true);expect(b.snapshot.player.inCombat).toBe(true);
  world.leave("a");world.advance(1.5);
  expect(b.snapshot.quests[1]!.status).toBe("ready");expect(c.snapshot.quests[1]!.status).toBe("active");
  const restored=createSharedAdventure({save:world.save()});
  expect(restored.join("a","a","mage").snapshot.quests[1]!.status).toBe("active");
  expect(restored.join("b","b","mage").snapshot.quests[1]!.status).toBe("ready");
  expect(restored.session('a').mode).toBe('paused');
});
test("earned gear and timed defense improve the Foreman fight",()=>{
  const unprepared=fightForeman(foremanFixture(false),false);
  const prepared=fightForeman(foremanFixture(true),true);
  expect(unprepared.health).toBe(0);expect(unprepared.bossHealth).toBeGreaterThan(0);
  expect(prepared.bossHealth).toBe(0);expect(prepared.health).toBeGreaterThan(0);
});
test("coat applies after Block, preserves complete blocks, and enforces one damage minimum",()=>{
  for(const [damage,block,expected] of [[32,0,30],[32,24,6],[8,24,0],[25,24,1]] as const){
    const source=foremanFixture(true),save=JSON.parse(source.save());
    const boss=save.state.threats.find((t:{id:string})=>t.id==="ritual-guardian");boss.damage=damage;
    const game=createAdventure({save:JSON.stringify(save)});
    const cast=game.snapshot.threats.find(t=>t.id==="ritual-guardian")!.cast!;
    game.advance(cast.remainingSeconds-.1);expect(game.snapshot.player.health).toBe(100);
    if(block)tap(game,"brace");
    game.advance(.5);expect(game.snapshot.player.health).toBe(100-expected);
  }
});
test("each participating quest holder loots a personal Roll; replay waits for claims and preserves turn-in",()=>{
  const seed=createSharedAdventure();for(const id of ["a","b","c"])seed.join(id,id,"mage");
  const save=JSON.parse(seed.save());save.world.ritualCalled=true;
  for(const p of save.characters){p.state.chapter=earnedChapter(2);p.state.chapter.accepted.push("last-shift");p.state.phase="expedition";p.state.position={x:2,y:0,z:38.5};p.state.cargo=6;}
  for(const t of save.world.threats)if(t.id==="ritual-guardian")Object.assign(t,{active:true,health:22});else Object.assign(t,{health:0,phase:"cleared",lootClaimed:true});
  let world=createSharedAdventure({save:JSON.stringify(save)});const a=world.join("a","a","mage"),b=world.join("b","b","mage"),c=world.join("c","c","mage");
  a.selectTarget("ritual-guardian");b.selectTarget("ritual-guardian");
  tap(a,"strike");tap(b,"strike");world.advance(.01);
  expect(c.snapshot.loot.find(t=>t.sourceId==="ritual-guardian")!.available).toBe(false);
  a.openLoot("ritual-guardian");tap(a,"takeLoot");
  expect(a.snapshot.carriedRelics).toBe(1);expect(b.snapshot.loot.find(t=>t.sourceId==="ritual-guardian")!.available).toBe(true);
  world.advance(1);tap(a,"ritual");expect(a.snapshot.cargo).toBe(6);
  const waiting=world.save(),deadline=JSON.parse(waiting).world.threats.find((t:{id:string})=>t.id==="ritual-guardian").respawnAt;
  const expired=createSharedAdventure({save:waiting,now:()=>deadline+1});
  const next=expired.join("a","a","mage");tap(next,"ritual");expect(next.snapshot.cargo).toBe(0);
  const live=JSON.parse(expired.save());live.characters.find((p:{id:string})=>p.id==="a").state.cargo=6;
  const stillFighting=createSharedAdventure({save:JSON.stringify(live),now:()=>deadline+1_000_000});
  const challenger=stillFighting.join("a","a","mage");tap(challenger,"ritual");expect(challenger.snapshot.cargo).toBe(6);
  b.openLoot("ritual-guardian");tap(b,"takeLoot");expect(b.snapshot.carriedRelics).toBe(1);
  tap(a,"ritual");expect(a.snapshot.cargo).toBe(0);expect(a.snapshot.threats.find(t=>t.id==="ritual-guardian")!.health).toBe(200);
  const returned=JSON.parse(world.save());
  for(const p of returned.characters)Object.assign(p.state,{position:{x:5,y:0,z:-11},phase:"expedition"});
  world=createSharedAdventure({save:JSON.stringify(returned)});
  const home=world.join("a","a","mage"),partner=world.join("b","b","mage");world.advance(.01);
  expect(home.snapshot.carriedRelics).toBe(1);expect(home.snapshot.bankedRelics).toBe(0);
  home.quest("last-shift","turnIn");expect(home.snapshot.progression.level).toBe(3);expect(home.snapshot.supplies).toBe(27);expect(home.snapshot.carriedRelics).toBe(0);
  expect(partner.snapshot.progression.level).toBe(2);expect(partner.snapshot.carriedRelics).toBe(1);
  home.quest("last-shift","turnIn");expect(home.snapshot.supplies).toBe(27);
});
test("Blood Rage adds its earned damage to both ranged attacks",()=>{
  for(const archetype of ["mage","hunter"] as const){
    const save=JSON.parse(createAdventure({archetype}).save());
    save.state.chapter=earnedChapter();Object.assign(save.state,{phase:"expedition",position:{x:-3,y:0,z:8},bloodRage:2,rageDrainSeconds:5});
    const game=createAdventure({save:JSON.stringify(save)});tap(game,"strike");game.advance(.01);
    expect(game.snapshot.threats.find(t=>t.id==="scout")!.health).toBe(96-9-4-8);
  }
});

test("clicking an NPC addresses that NPC when both are nearby; range still applies",()=>{
  const game=at(createAdventure(),4.2,-9.25,"town");
  game.interactNpc("mara");expect(game.snapshot.shopOpen).toBe(true);expect(game.snapshot.innOpen).toBe(false);
  game.interactNpc("inn");expect(game.snapshot.innOpen).toBe(true);expect(game.snapshot.shopOpen).toBe(false);
  const away=at(game,0,12,"expedition");away.interactNpc("mara");
  expect(away.snapshot.shopOpen).toBe(false);expect(away.snapshot.report).toContain("Move closer to Mara");
});
