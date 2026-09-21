import { mkdir } from "node:fs/promises";
import { createSharedAdventure } from "../../src/game/adventure.js";
import { terrainHeight } from "../../src/game/cave-layout.js";
import { createWorldService, type WorldSocketData } from "../../src/server/world-service.js";
import { openBrowser, check } from "./session.js";

const url = "http://127.0.0.1:4305/";
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = "9467";
await mkdir("build/browser", { recursive: true });
const frontend = Bun.spawn([process.execPath, Bun.env.GREYWROUGHT_TEST_BUILT === "1" ? "scripts/static-server.ts" : "scripts/dev-server.ts"], {
  env: { ...Bun.env, GREYWROUGHT_PORT: "4305", GREYWROUGHT_LOCAL_WORLD: "0" },
  stdout: Bun.file("build/browser/rattagane-frontend.log"), stderr: Bun.file("build/browser/rattagane-frontend-errors.log"),
});
const cases = [["cave-crab", "Rattagane"]] as const;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  for (const [id, name] of cases) {
    const character = { id: "rattagane-test-" + id, name: "Rat Hunter", archetype: "mage" as const, createdAtMillis: 1 };
    const token = "rattagane-fixture-token-000000000000000000";
    const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
    const saved = JSON.parse(seed.save());
    const target = saved.world.threats.find((t: { id: string }) => t.id === id);
    const position = { x: target.position.x - 8, y: 0, z: target.position.z };
    position.y = terrainHeight(position.x, position.z);
    Object.assign(saved.characters[0].state, { phase: "expedition", position, potions: 5, selectedThreat: id });
    for (const t of saved.world.threats) {
      if (t.id === id) t.health = 36;
      else if (t.active) Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
    }
    const savePath = `${process.cwd()}/build/browser/rattagane-${id}-${process.pid}.json`;
    await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher("sha256").update(token).digest("hex") }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
    const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
    const server = Bun.serve<WorldSocketData>({ hostname: "127.0.0.1", port: 4306, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
    let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
    try {
      page = await openBrowser("rattagane-mob-" + id, { beforeNavigate: async call => {
        await call("Page.addScriptToEvaluateOnNewDocument", { source: `window.EventSource=class{};localStorage.setItem("greywrought/combat-auto-ready-v1","false");
          localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: "Rattagane Test", characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
          localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
          window.rattaganeHistory=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4306/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state'){window.rattaganeState=d.snapshot;window.rattaganeHistory.push(d.snapshot);}});}};` });
      } });
      await page.waitFor('document.body.dataset.entryRoute==="roster"', 30000);
      await page.click("#entry-enter-world");
      await page.waitFor('document.body.dataset.rigState==="ready" && document.body.dataset.creatureRigState==="ready" && document.body.dataset.environmentState==="ready"', 45000);
      await page.waitFor('document.body.dataset.entryRoute==="world"', 90000);
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
      check(await page.evaluate(`rattaganeState.threats.find(t=>t.id===${JSON.stringify(id)}).name===${JSON.stringify(name)}`), "Updated creature name must reach the client");
      const model = "rattagane";
      check(await page.evaluate(`performance.getEntriesByType('resource').some(e=>e.name.endsWith('/${model}.glb'))`), `${name} asset must load`);
      check(await page.evaluate(`performance.getEntriesByType('resource').some(e=>e.name.endsWith('/MushroomKing.glb'))`), "The Ossuary King must retain its separate model");
      await page.evaluate(`(async()=>{const {Mesh,SkinnedMesh}=await import('three');window.rattaganePoses=[];Mesh.prototype.onBeforeRender=function(){for(let p=this;p;p=p.parent)if(p.userData.threatId===${JSON.stringify(id)}){if(this instanceof SkinnedMesh){const s=Array.from(this.skeleton.boneMatrices).map(n=>n.toFixed(3)).join(',');if(!rattaganePoses.includes(s)&&rattaganePoses.length<40)rattaganePoses.push(s);}break;}};})()`);
      const distance = `(()=>{const t=rattaganeState.threats.find(t=>t.id===${JSON.stringify(id)}),p=rattaganeState.player.position;return Math.hypot(t.position.x-p.x,t.position.z-p.z)})()`;
      async function approach(range: number, stopOnCombat = false) {
        const held = new Set<string>(), deadline = performance.now() + 25000;
        try {
          while (performance.now() < deadline) {
            const delta = await page!.evaluate<{ x: number; z: number; combat: boolean }>(`(()=>{const t=rattaganeState.threats.find(t=>t.id===${JSON.stringify(id)}),p=rattaganeState.player.position;return {x:t.position.x-p.x,z:t.position.z-p.z,combat:rattaganeState.player.inCombat}})()`);
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
      await page.waitFor('document.querySelector(".unit-frame-target .unit-frame-image").naturalWidth>0');
      check(await page.evaluate('rattaganeState.threats.find(t=>t.id==="cave-crab").currentAbility.name==="Hook Sweep"'), "The hook attack is named in the client");
      await page.shot("selected");
      // One strike per window leaves time to observe preparation, attack and recovery.
      for (let cycle = 0; cycle < 5; cycle++) {
        const health = await page.evaluate<number>(`rattaganeState.threats.find(t=>t.id===${JSON.stringify(id)}).health`);
        if (health === 0) break;
        await page.click('.adventure-actions [data-action="strike"]');
        await page.waitFor('rattaganeState.combat.phase==="preparation"', 10000);
        const sequence = await page.evaluate<number>("rattaganeState.combat.cycle");
        await page.press("KeyR");
        await page.waitFor(`rattaganeState.combat.phase!=="active" && (rattaganeState.combat.cycle>${sequence} || !rattaganeState.player.inCombat)`, 15000);
        await page.shot("cycle-" + cycle);
      }
      await page.waitFor(`rattaganeState.threats.find(t=>t.id===${JSON.stringify(id)}).health===0`);
      check(await page.evaluate("rattaganePoses.length>1"), `${name} skeleton must animate`);
      check(await page.evaluate("rattaganeState.carriedSalvage===0"), "Rewards require looting the corpse");
      check(await page.evaluate(`rattaganeHistory.some(s=>s.threats.find(t=>t.id===${JSON.stringify(id)}).actionSequence>0)`), `${name} must execute its real combat action`);
      check(await page.evaluate("rattaganeState.player.health>0"), "Player survives encounter");
      // Walk to the corpse before opening the normal loot panel.
      if (await page.evaluate<number>(distance) > 2) {
        await approach(2);
      }
      await page.press("KeyF");
      await page.waitFor(`rattaganeState.lootOpenId===${JSON.stringify(id)}`);
      await page.waitFor('document.getElementById("loot-item").checkVisibility()');
      await page.click("#loot-item");
      await page.waitFor("rattaganeState.carriedSalvage===6");
      check(await page.evaluate("rattaganeState.loot.some(t=>t.sourceId==='ironback-chest' && t.sourceName==='Rattagane’s cache' && t.available)"), "Defeating Rattagane unlocks his named cache");
      await page.shot("defeated-and-looted");
      check(page.errors.length === 0, "No browser exceptions");
      await Bun.write(`${page.output}/result.json`, JSON.stringify({ id, name, model, errors: page.errors, poses: await page.evaluate("rattaganePoses.length"), health: await page.evaluate("rattaganeState.player.health") }, null, 2));
      console.log(`PASS ${name}: selected, animated, attacked, defeated and looted — ${page.output}`);
    } catch (error) { await page?.shot("failure"); throw error; }
    finally { await page?.close(); await service.close(); server.stop(true); }
  }
} finally { frontend.kill(); await frontend.exited; }
