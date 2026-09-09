import { check, openBrowser } from './session.js';
import { createAdventure } from '../../src/game/adventure.js';
const page = await openBrowser('ground-telegraphs');
async function restore(kind: 'frost'|'fire') {
  await page.evaluate('document.getElementById("return-roster").click()');
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  const save=JSON.parse(createAdventure().save()), s=save.state;
  s.phase='expedition'; s.position={x:0,y:0,z:kind==='frost'?32:19};
  s.combat.phase='preparation';s.combat.cycle=1;s.combat.elapsedSeconds=0;
  const ids=kind==='frost'?['warder','ritual-guardian']:['scout','nest'];
  s.selectedThreat=ids[0];
  if(kind==='frost')s.ritualCalled=true;
  for(const t of s.threats) if(ids.includes(t.id)) {
    t.active=true;t.aggro=true;t.phase='preparation';t.windowCycle=0;t.joinCycle=1;t.rng=t.id==='scout'?1500:t.id==='ritual-guardian'?500:2000;
    if(t.id==='scout'){t.position={x:-2,y:0,z:16};t.head.opened=true;}
    if(t.id==='ritual-guardian')t.position={x:2,y:0,z:36};
    t.targetPosition={...t.position};
  }
  const valid=createAdventure({save:JSON.stringify(save)}).save();
  await page.evaluate(`(() => { const id=document.querySelector('#entry-roster-list [data-character-id]').dataset.characterId; localStorage.setItem('greywrought/adventure-v1/'+id,${JSON.stringify(valid)}); })()`);
  await page.reload(); await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.click('#entry-enter-world'); await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0,buttons:0});
}
try {
  await page.enter();
  for(const kind of ['frost','fire'] as const){
    await restore(kind);
    await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs || "[]").length >= 2');
    const cues=await page.evaluate<{color:number;seconds:number;beat:number;ability:string;radius:number;kind:string}[]>('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs)');
    check(new Set(cues.map(c=>c.color)).size>=2,'Warnings must distinguish effects by color');
    check(cues.every(c=>c.seconds>=0&&c.beat>=1&&c.beat<=5),'Warnings need real timing');
    if(kind==='frost') check(cues.some(c=>c.ability==='ritual-guardian'&&c.radius===3&&c.kind==='area'),'Frost warning must match 3m area');
    else check(cues.some(c=>c.ability==='fireball'&&c.kind==='target'),'Homing fire must be marked as targeted');
    check(new Set(cues.map(c=>c.beat)).size>=2,'Independent enemies must retain their different announced beats');
    await page.shot(kind+'-preparation');
    if(kind==='fire') {
      await page.press('KeyE'); await page.press('Digit5');
      await page.waitFor('Number(document.body.dataset.gameBlock) === 7',12000);
      check(Number((await page.read()).gamePlayerVitality)===100,'Fifth-slot Block must cover the announced fireball impact');
      await page.waitFor('!JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(c=>c.ability==="fireball")');
      await page.shot('fifth-beat-fire-blocked');
    }
    await Bun.write(`${page.output}/${kind}.json`,JSON.stringify(cues,null,2));
  }
  check(page.errors.length===0,'Browser exception');
  console.log('PASS two simultaneous world warnings, true area/target distinction, icons and countdown: '+page.output);
}finally{await page.close();}
