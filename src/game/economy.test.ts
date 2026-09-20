import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { VENDORS } from "./economy.js";
import { tap, travel, earnedChapter, readyParty, finishCycle, foremanFixture } from "./yard-test-fixtures.js";

function soloFixture(coins = 30, experience = 0) {
  const save = JSON.parse(createAdventure({archetype:"mage"}).save());
  save.state.coins = coins; save.state.chapter.experience = experience;
  return save;
}
test("shops require range, open vendor, correct stock and coins; all purchases equip and persist", () => {
  for (const vendor of VENDORS) {
    const save = soloFixture();
    let game = createAdventure({save:JSON.stringify(save)});
    expect(game.buyGear(vendor.id,vendor.item)).toBe(false);
    save.state.position = vendor.position;
    game = createAdventure({save:JSON.stringify(save)});
    expect(game.buyGear(vendor.id,vendor.item)).toBe(false);
    game.interactNpc(vendor.id);
    expect(game.buyGear(vendor.id,"yard-weapon")).toBe(false);
    expect(game.buyGear(vendor.id,vendor.item)).toBe(true);
    expect(game.snapshot.coins).toBe(30-vendor.price);
    expect(game.buyGear(vendor.id,vendor.item)).toBe(false);
    const slot = vendor.id === "weapon-vendor" ? "mainhand" : vendor.id === "armor-vendor" ? "chest" : "offhand";
    game.equip(slot,vendor.item);
    expect(game.snapshot.progression.equipment[slot]).toBe(vendor.item);
    expect(game.snapshot.progression[slot === "mainhand" ? "attackBonus" : "damageReduction"]).toBe(slot === "chest" ? 1 : 2);
    const restored = createAdventure({save:game.save()});
    expect(restored.snapshot.coins).toBe(game.snapshot.coins);
    expect(restored.snapshot.progression).toEqual(game.snapshot.progression);
    save.state.coins = vendor.price - 1;
    game = createAdventure({save:JSON.stringify(save)}); game.interactNpc(vendor.id);
    expect(game.buyGear(vendor.id,vendor.item)).toBe(false);
    expect(game.snapshot.coins).toBe(vendor.price-1);
    expect(game.snapshot.report).toContain("coins");
  }
});
test("a credited defeat awards experience before loot, crosses level four and never repeats on loot or reload", () => {
  const save = soloFixture(0,590);
  Object.assign(save.state,{phase:"expedition",position:{x:-3,y:0,z:28}});
  save.state.threats[0].health = 1;
  const game = createAdventure({save:JSON.stringify(save)});
  tap(game,"strike");
  expect(game.snapshot.progression.experience).toBe(590);
  game.readyCombat(); game.advance(.01);
  expect(game.snapshot.progression).toMatchObject({level:4,experience:600,attackBonus:6,levelExperience:0,nextLevelExperience:400});
  expect(game.snapshot.log.some(entry=>entry.text.includes("Level up!"))).toBe(true);
  expect(game.snapshot.coins).toBe(0);
  game.openLoot("scout"); tap(game,"takeLoot");
  expect(game.snapshot.coins).toBe(3);
  game.openLoot("scout"); tap(game,"takeLoot");
  expect(game.snapshot.coins).toBe(3); expect(game.snapshot.progression.experience).toBe(600);
  const restored = createAdventure({save:game.save()});
  restored.openLoot("scout"); tap(restored,"takeLoot");
  expect(restored.snapshot.coins).toBe(3); expect(restored.snapshot.progression.experience).toBe(600);
});
test("old quest levels migrate without resetting earned lessons, gear or currency", () => {
  const save=soloFixture(); save.state.chapter=earnedChapter();
  delete save.state.chapter.experience; delete save.state.chapter.equipment.offhand; delete save.state.coins;
  const game=createAdventure({save:JSON.stringify(save)});
  expect(game.snapshot.progression).toMatchObject({level:3,experience:300,attackBonus:4});
  expect(game.snapshot.progression.unlockedActions).toContain("bloodRage"); expect(game.snapshot.coins).toBe(0);
});
test("shared contributors receive XP, bystanders do not, and one corpse has one coin purse", () => {
  const seed=createSharedAdventure(); for(const id of ["a","b","c"]) seed.join(id,id,"mage");
  const save=JSON.parse(seed.save()); save.world.threats[0].health=18;
  for(const p of save.characters) Object.assign(p.state,{phase:"expedition",position:{x:-3,y:0,z:28}});
  const world=createSharedAdventure({save:JSON.stringify(save)}),a=world.join("a","a","mage"),b=world.join("b","b","mage"),c=world.join("c","c","mage");
  tap(a,"strike");tap(b,"strike");readyParty(a,b,c);world.advance(.01);
  expect(a.snapshot.progression.experience).toBe(10); expect(b.snapshot.progression.experience).toBe(10); expect(c.snapshot.progression.experience).toBe(0);
  a.openLoot("scout");tap(a,"takeLoot");b.openLoot("scout");tap(b,"takeLoot");
  expect(a.snapshot.coins+b.snapshot.coins).toBe(3);
});
test("private defeats grant no XP or coins", () => {
  const seed=createSharedAdventure();seed.join("a","Alden","mage");
  const save=JSON.parse(seed.save());save.world.threats[0].health=1;
  Object.assign(save.characters[0].state,{phase:"expedition",position:{x:-3,y:0,z:28}});
  const world=createSharedAdventure({save:JSON.stringify(save)}),a=world.join("a","Alden","mage");
  tap(a,"strike");expect(world.pause("a")).toBe(true);expect(world.resume("a")).toBe(true);
  tap(a,"strike");a.readyCombat();world.advance(.01);finishCycle(a,world);
  expect(a.snapshot.threats[0]!.health).toBe(0);expect(a.snapshot.progression.experience).toBe(0);
  a.openLoot("scout");tap(a,"takeLoot");expect(a.snapshot.coins).toBe(0);
  expect(a.buyGear("shield-vendor","yard-shield")).toBe(false);
});
test("shield and coat reduce real incoming damage together", () => {
  const save=JSON.parse(foremanFixture(true).save());
  save.state.chapter.ownedGear.push("yard-shield");save.state.chapter.equipment.offhand="yard-shield";
  const game=createAdventure({save:JSON.stringify(save)});
  const boss=game.snapshot.threats.find(t=>t.id==="ritual-guardian")!;
  expect(game.snapshot.progression.damageReduction).toBe(4);
  game.readyCombat();game.advance(boss.cast!.remainingSeconds+.5);
  expect(game.snapshot.player.health).toBe(100-boss.damage+4);
});
test("personal Foreman rolls share one coin purse without duplicating it", () => {
  const seed=createSharedAdventure();for(const id of ["a","b"])seed.join(id,id,"mage");
  const save=JSON.parse(seed.save());save.world.ritualCalled=true;
  for(const p of save.characters){p.state.chapter=earnedChapter(2);p.state.chapter.accepted.push("last-shift");Object.assign(p.state,{phase:"expedition",position:{x:2,y:0,z:58.5}});}
  for(const t of save.world.threats)if(t.id==="ritual-guardian")Object.assign(t,{active:true,health:22});else Object.assign(t,{health:0,phase:"cleared",lootClaimed:true});
  const world=createSharedAdventure({save:JSON.stringify(save)}),a=world.join("a","a","mage"),b=world.join("b","b","mage");
  a.selectTarget("ritual-guardian");b.selectTarget("ritual-guardian");tap(a,"strike");tap(b,"strike");readyParty(a,b);world.advance(.01);
  finishCycle(a,world);const corpse=a.snapshot.loot.find(t=>t.sourceId==="ritual-guardian")!;
  travel(a,corpse.position.x,corpse.position.z,world);a.openLoot("ritual-guardian");tap(a,"takeLoot");
  travel(b,corpse.position.x,corpse.position.z,world);b.openLoot("ritual-guardian");tap(b,"takeLoot");
  expect(a.snapshot.carriedRelics).toBe(1);expect(b.snapshot.carriedRelics).toBe(1);
  expect(a.snapshot.coins+b.snapshot.coins).toBe(12);
  expect(a.snapshot.progression.experience).toBe(140);expect(b.snapshot.progression.experience).toBe(140);
});
