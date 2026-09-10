import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_VULKAN = '1';
const service = await createWorldService({savePath:process.cwd()+'/build/browser/background-jump-'+process.pid+'.json',allowedOrigins:['http://127.0.0.1:4173']});
const server = Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4197,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const jumper = {id:'background-jumper',name:'Leaper',archetype:'hunter',createdAtMillis:1};
const observer = {id:'background-observer',name:'Observer',archetype:'alchemist',createdAtMillis:2};
Bun.env.GREYWROUGHT_DEBUG_PORT='9430';
const first=await openBrowser('background-jumper');
Bun.env.GREYWROUGHT_DEBUG_PORT='9431';
const second=await openBrowser('background-observer');
try {
  for(const [page,character] of [[first,jumper],[second,observer]] as const){
    await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:character.name,characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});
      window.sentCommands=[];const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4197/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.gameState=d;});}
        send(data){window.sentCommands.push(JSON.parse(data));super.send(data);}
      };`});
    await page.reload();
    await page.waitFor('document.body.dataset.entryRoute==="roster"');
    await page.click('#entry-enter-world');
    await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  }
  await first.waitFor('window.gameState.players.length===1');
  await second.waitFor('window.gameState.players.length===1');
  await second.key('KeyA',true);await Bun.sleep(400);await second.key('KeyA',false);
  await first.press('Space');
  await first.waitFor('window.gameState.snapshot.player.position.y>0');
  await first.call('Emulation.setFocusEmulationEnabled',{enabled:false});
  const created=await first.call('Target.createTarget',{url:'about:blank'});
  const targetId=(created.result as {targetId?:string})?.targetId;
  check(targetId,'Companion tab must open');
  await first.call('Target.activateTarget',{targetId});
  await first.waitFor('document.hidden&&!document.hasFocus()');
  const sent=await first.evaluate<number>('window.sentCommands.filter(m=>m.command?.type==="movement").length');
  await second.waitFor('window.gameState.players.some(p=>p.id==="background-jumper"&&p.player.grounded&&p.player.position.y===0&&!p.player.moving)');
  await Bun.sleep(2300);
  check(await first.evaluate<number>('window.sentCommands.filter(m=>m.command?.type==="movement").length')===sent,'Hidden tab should not need to stream movement to finish its jump');
  check(await first.evaluate<boolean>('window.gameState.session.mode==="shared"'),'Hidden jumper must stay in the shared world');
  check(await second.evaluate<boolean>('window.gameState.players.some(p=>p.id==="background-jumper"&&p.player.grounded&&p.player.position.y===0&&!p.player.moving)'),'Other player must see a settled character after the connection deadline');
  await second.shot('other-player-sees-grounded-character');
  await first.call('Page.bringToFront');
  await first.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await first.waitFor('!document.hidden&&document.body.dataset.gamePaused==="false"&&Number(document.body.dataset.gamePlayerY)===0');
  const before=await first.evaluate<number>('window.gameState.snapshot.player.position.z');
  await first.key('KeyW',true);await Bun.sleep(350);await first.key('KeyW',false);
  await first.waitFor(`window.gameState.snapshot.player.position.z>${before}+.5`);
  await first.shot('returned-and-moving');
  check(first.errors.length===0&&second.errors.length===0,'No browser exceptions');
  console.log('PASS jump lands without hidden-tab movement packets, observer sees grounded idle character, shared connection survives, movement resumes',second.output);
} catch(error){await second.shot('failure');throw error;}
finally{await first.close();await second.close();await service.close();server.stop(true);}
