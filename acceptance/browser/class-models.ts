import { check, openBrowser } from "./session.js";

const page = await openBrowser("class-models");
async function roster() {
  await page.press("Escape");
  await page.waitFor('!document.getElementById("pause-panel").hidden');
  await page.click("#return-roster");
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
}
try {
  await page.enter();
  for (const [kind, name, asset] of [["warrior", "Warrior", "Warrior"], ["mage", "Mage", "Wizard"], ["hunter", "Ranger", "Ranger"]] as const) {
    if (kind !== "warrior") {
      await page.click("#entry-change-character");
      await page.click(`[data-entry-archetype="${kind}"]`);
      await page.evaluate(`document.getElementById("entry-character-name").value=${JSON.stringify(name)};document.getElementById("entry-character-form").requestSubmit()`);
      await page.click("#entry-enter-world");
      await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
    }
    check(await page.evaluate<boolean>(`performance.getEntriesByType("resource").some(entry=>entry.name.endsWith("/class-characters/${asset}.glb"))`), `${name} did not load its own model`);
    await page.shot(`${kind}-idle`);
    await page.key("KeyA", true);
    await page.waitFor('document.body.dataset.rigAnimationMode === "locomotion"');
    await page.shot(`${kind}-run`);
    await page.key("KeyA", false);
    await page.press("Space");
    await page.waitFor('Number(document.body.dataset.gamePlayerY) > 0.2');
    await page.shot(`${kind}-jump`);
    await page.key("KeyW", true);
    await page.waitFor('document.body.dataset.gameCombatPhase === "active"', 15_000);
    await page.key("KeyW", false);
    await page.press("KeyQ");
    await page.waitFor('document.body.dataset.rigAnimationMode === "attack"', 15_000);
    await page.shot(`${kind}-attack`);
    await roster();
  }
  await page.evaluate(`(() => {
    const profile=JSON.parse(localStorage.getItem("greywrought/local-profile-v1"));
    const key="greywrought/adventure-v1/"+profile.selectedCharacterId;
    const saved=JSON.parse(localStorage.getItem(key)), s=saved.state;
    s.phase="expedition";s.position={x:-3,y:0,z:16};s.health=100;s.verticalSpeed=0;
    s.actionCooldown=0;s.currentAction=null;s.actionDuration=0;s.maneuver=null;
    s.combat={phase:"idle",elapsedSeconds:0,cycle:0,queued:[],nextId:1};s.selectedThreat="patrol";
    for(const threat of s.threats) {threat.aggro=false;if(threat.id==="scout"){threat.health=0;threat.phase="cleared";threat.lootClaimed=true;}}
    localStorage.setItem(key,JSON.stringify(saved));
  })()`);
  await page.click("#entry-enter-world");
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  const wolf = '.enemy-nameplate[data-enemy-id="patrol"]';
  await page.waitFor(`!document.querySelector('${wolf}').hidden`);
  await page.evaluate(`(() => {window.plateSamples=[]; const end=performance.now()+2500;function sample(){const p=document.querySelector('${wolf}');if(!p.hidden){const r=p.getBoundingClientRect();window.plateSamples.push({x:r.left+r.width/2,y:r.bottom,t:performance.now()});}if(performance.now()<end)requestAnimationFrame(sample);}requestAnimationFrame(sample);})()`);
  await page.call("Input.dispatchMouseEvent", {type:"mousePressed",x:640,y:320,button:"left",buttons:1,clickCount:1});
  for (let i=0;i<24;i++) {
    await page.call("Input.dispatchMouseEvent", {type:"mouseMoved",x:640+i*5,y:320,buttons:1});
    await Bun.sleep(35);
  }
  await page.call("Input.dispatchMouseEvent", {type:"mouseReleased",x:755,y:320,button:"left",buttons:0,clickCount:1});
  await Bun.sleep(1600);
  const samples=await page.evaluate<{x:number;y:number;t:number}[]>("window.plateSamples");
  check(samples.length > 20, "Hound tracking was not observed for enough frames");
  let maximumJump=0;
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1]!, b=samples[i]!;
    if(b.t-a.t<120) maximumJump=Math.max(maximumJump,Math.hypot(b.x-a.x,b.y-a.y));
  }
  check(maximumJump < 80, `Nameplate jumped ${maximumJump.toFixed(1)} pixels while tracking`);
  await page.shot("hound-nameplate-tracking");
  check(page.errors.length === 0, "Class models or nameplates caused browser exceptions");
  await Bun.write(`${page.output}/result.json`,JSON.stringify({classes:["warrior","mage","hunter"],samples:samples.length,maximumJump,errors:page.errors},null,2));
  console.log(`Class models and nameplate tracking passed: ${page.output}`);
} finally { await page.close(); }
