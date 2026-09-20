import { createSharedAdventure } from "../../src/game/adventure.js";
import { terrainHeight } from "../../src/game/cave-layout.js";
import { createWorldService, type WorldSocketData } from "../../src/server/world-service.js";
import { CREATURE_APPEARANCES } from "../../src/host/creature-appearances.js";
import { openBrowser, check } from "./session.js";

const url = "http://127.0.0.1:4295/";
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = "9457";
const frontend = Bun.spawn([process.execPath, "scripts/dev-server.ts"], {
  env: { ...Bun.env, GREYWROUGHT_PORT: "4295", GREYWROUGHT_LOCAL_WORLD: "0" },
  stdout: Bun.file("build/browser/relic-frontend.log"), stderr: Bun.file("build/browser/relic-frontend-errors.log"),
});
const cases = [
  ["nest", "Hearth Keeper"], ["patrol", "Greyrot Penitent"], ["warder", "Relic Warden"],
  ["cave-bat", "Hollow Saint"], ["cave-crab", "Ironback cave crab"],
] as const;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  for (const [id, name] of cases) {
    const character = { id: "relic-test-" + id, name: "Relic Tester", archetype: "mage" as const, createdAtMillis: 1 };
    const token = "relic-fixture-token-000000000000000000";
    const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
    const saved = JSON.parse(seed.save());
    const target = saved.world.threats.find((t: { id: string }) => t.id === id);
    const cave = id.startsWith("cave-");
    const position = { x: target.position.x - (cave ? 12 : 0), y: 0, z: target.position.z - (cave ? 0 : 12) };
    position.y = terrainHeight(position.x, position.z);
    Object.assign(saved.characters[0].state, { phase: "expedition", position, potions: 5, selectedThreat: id });
    for (const t of saved.world.threats) {
      if (t.id === id) t.health = 54;
      else if (t.active) Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
    }
    const savePath = `${process.cwd()}/build/browser/relic-${id}-${process.pid}.json`;
    await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher("sha256").update(token).digest("hex") }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
    const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
    const server = Bun.serve<WorldSocketData>({ hostname: "127.0.0.1", port: 4296, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
    let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
    try {
      page = await openBrowser("relic-mob-" + id, { beforeNavigate: async call => {
        await call("Page.addScriptToEvaluateOnNewDocument", { source: `window.EventSource=class{};
          localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: "Relic Test", characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
          localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
          window.relicHistory=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4296/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state'){window.relicState=d.snapshot;window.relicHistory.push(d.snapshot);}});}};` });
      } });
      await page.waitFor('document.body.dataset.entryRoute==="roster"', 30000);
      await page.click("#entry-enter-world");
      await page.waitFor('document.body.dataset.rigState==="ready" && document.body.dataset.creatureRigState==="ready" && document.body.dataset.environmentState==="ready"', 45000);
      await page.shot("loaded");
      await Bun.sleep(1500);
      // Slow headless shader compilation can trigger the normal reconnect pause.
      // Resume/rejoin through the real UI before approaching the encounter.
      for (let warmup = 0; warmup < 5; warmup++) {
        if (await page.evaluate('document.body.dataset.encounterMode==="paused"')) {
          await page.click("#pause-resume");
          await page.waitFor('document.body.dataset.encounterMode==="private" && document.getElementById("pause-panel").hidden');
          await page.click("#encounter-rejoin");
          await page.waitFor('document.body.dataset.encounterMode==="shared"');
        }
        await Bun.sleep(1500);
        if (await page.evaluate('document.body.dataset.encounterMode==="shared" && document.body.dataset.gamePaused==="false"')) break;
      }
      await page.waitFor('document.body.dataset.encounterMode==="shared" && document.body.dataset.gamePaused==="false"');
      check(await page.evaluate(`relicState.threats.find(t=>t.id===${JSON.stringify(id)}).name===${JSON.stringify(name)}`), "Updated creature name must reach the client");
      const model = CREATURE_APPEARANCES[id]!.model;
      check(await page.evaluate(`performance.getEntriesByType('resource').some(e=>e.name.endsWith('/${model}.glb'))`), `${name} asset must load`);
      check(await page.evaluate(`!performance.getEntriesByType('resource').some(e=>['Armabee','Wolf','Bat','MushroomKing'].some(name=>e.name.endsWith('/'+name+'.glb')))`), "Retired models must not be requested by actors or portraits");
      await page.evaluate(`(async()=>{const {Mesh,SkinnedMesh}=await import('three');window.relicPoses=[];window.relicAttached=[];Mesh.prototype.onBeforeRender=function(){for(let p=this;p;p=p.parent)if(p.userData.threatId===${JSON.stringify(id)}){if(this instanceof SkinnedMesh){const s=Array.from(this.skeleton.boneMatrices).map(n=>n.toFixed(3)).join(',');if(!relicPoses.includes(s)&&relicPoses.length<40)relicPoses.push(s);}else if(this.userData.authoredParts&&!relicAttached.includes(this.name))relicAttached.push(this.name);break;}};})()`);
      const distance = `(()=>{const t=relicState.threats.find(t=>t.id===${JSON.stringify(id)}),p=relicState.player.position;return Math.hypot(t.position.x-p.x,t.position.z-p.z)})()`;
      async function approach(range: number, stopOnCombat = false) {
        const held = new Set<string>(), deadline = performance.now() + 25000;
        try {
          while (performance.now() < deadline) {
            const delta = await page!.evaluate<{ x: number; z: number; combat: boolean }>(`(()=>{const t=relicState.threats.find(t=>t.id===${JSON.stringify(id)}),p=relicState.player.position;return {x:t.position.x-p.x,z:t.position.z-p.z,combat:relicState.player.inCombat}})()`);
            if (Math.hypot(delta.x, delta.z) < range || (stopOnCombat && delta.combat)) return;
            const next = new Set<string>();
            if (Math.abs(delta.x) > .6) next.add(delta.x > 0 ? "KeyA" : "KeyD");
            if (Math.abs(delta.z) > .6) next.add(delta.z > 0 ? "KeyW" : "KeyS");
            for (const key of held) if (!next.has(key)) { await page!.key(key, false); held.delete(key); }
            for (const key of next) if (!held.has(key)) { await page!.key(key, true); held.add(key); }
            await Bun.sleep(80);
          }
          throw new Error(`Could not walk within ${range} metres of ${name}`);
        } finally { for (const key of held) await page!.key(key, false); }
      }
      await approach(6, true);
      await page.waitFor(`!document.querySelector('.enemy-nameplate[data-enemy-id="${id}"]').hidden`);
      await page.click(`.enemy-nameplate[data-enemy-id="${id}"] .nameplate-target`);
      await page.shot("selected");
      // One strike per window leaves time to observe preparation, attack and recovery.
      for (let cycle = 0; cycle < 5; cycle++) {
        const health = await page.evaluate<number>(`relicState.threats.find(t=>t.id===${JSON.stringify(id)}).health`);
        if (health === 0) break;
        await page.click('.adventure-actions [data-action="strike"]');
        await page.waitFor('relicState.combat.phase==="preparation"', 10000);
        const sequence = await page.evaluate<number>("relicState.combat.cycle");
        await page.press("KeyR");
        await page.waitFor(`relicState.combat.phase!=="active" && (relicState.combat.cycle>${sequence} || !relicState.player.inCombat)`, 15000);
        await page.shot("cycle-" + cycle);
      }
      await page.waitFor(`relicState.threats.find(t=>t.id===${JSON.stringify(id)}).health===0`);
      check(await page.evaluate("relicPoses.length>1"), `${name} skeleton must animate`);
      if (id !== "cave-crab") check(await page.evaluate("relicAttached.length>3"), `${name} authored bone attachments must render`);
      check(await page.evaluate(`relicHistory.some(s=>s.threats.find(t=>t.id===${JSON.stringify(id)}).actionSequence>0)`), `${name} must execute its real combat action`);
      check(await page.evaluate("relicState.player.health>0"), "Player survives encounter");
      // Walk to the corpse before opening the normal loot panel.
      if (await page.evaluate<number>(distance) > 2) {
        await approach(2);
      }
      await page.press("KeyF");
      await page.waitFor(`relicState.lootOpenId===${JSON.stringify(id)}`);
      await page.click("#loot-item");
      await page.waitFor("relicState.carriedSalvage>0");
      await page.shot("defeated-and-looted");
      check(page.errors.length === 0, "No browser exceptions");
      await Bun.write(`${page.output}/result.json`, JSON.stringify({ id, name, model, errors: page.errors, poses: await page.evaluate("relicPoses.length"), attachments: await page.evaluate("relicAttached"), health: await page.evaluate("relicState.player.health") }, null, 2));
      console.log(`PASS ${name}: selected, animated, attacked, defeated and looted — ${page.output}`);
    } catch (error) { await page?.shot("failure"); throw error; }
    finally { await page?.close(); await service.close(); server.stop(true); }
  }
} finally { frontend.kill(); await frontend.exited; }
