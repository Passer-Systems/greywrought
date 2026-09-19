import { check, openBrowser } from './session.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4296/';
Bun.env.GREYWROUGHT_VULKAN = '1';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9447';
const service = await createWorldService({savePath:`${process.cwd()}/build/browser/pause-menu-${process.pid}.json`,allowedOrigins:['http://127.0.0.1:4296']});
const server = Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4199,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend = Bun.spawn(['bun','scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4296',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/pause-menu-frontend.log'),stderr:Bun.file('build/browser/pause-menu-frontend-errors.log')});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok)break;}catch{}await Bun.sleep(100);}
  page=await openBrowser('pause-menu',{beforeNavigate:async call=>{await call('Page.addScriptToEvaluateOnNewDocument',{source:`const Native=WebSocket; window.sentCommands=[]; window.WebSocket=class extends Native { constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4199/world':url,...args);this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.menuState=message;});} send(value){window.sentCommands.push(JSON.parse(value));super.send(value);} };`});}});
  await page.enter();
  await page.key('KeyA',true);
  await page.waitFor('Number(document.body.dataset.gamePlayerX)>0.4');
  await page.press('Escape');
  await page.key('KeyA',false);
  await page.waitFor('!document.getElementById("pause-panel").hidden&&!window.menuState.snapshot.player.moving');
  const start=await page.evaluate<{time:number,x:number}>('({time:window.menuState.serverTime,x:window.menuState.snapshot.player.position.x})');
  await page.key('KeyW',true); await page.press('Digit1');
  await page.waitFor(`window.menuState.serverTime>${start.time}+0.5`);
  await page.key('KeyW',false);
  check(await page.evaluate<boolean>(`window.menuState.session.mode==='shared'&&window.menuState.snapshot.player.position.x===${start.x}&&!window.menuState.snapshot.player.moving`),'Escape menu must keep shared time running and release/block movement');
  check(await page.evaluate<boolean>('!window.sentCommands.some(message=>message.command?.type==="pause")'),'Opening Escape must send no pause');
  await page.shot('shared-menu-running');
  await page.press('Escape');
  await page.waitFor('document.getElementById("pause-panel").hidden');
  await page.click('#pause-open');
  await page.waitFor('!document.getElementById("pause-settings").hidden');
  check(await page.evaluate<boolean>('window.menuState.session.mode==="shared"'),'Settings must not fork');
  await page.click('#pause-tab-encounter');
  await page.click('#pause-action');
  await page.waitFor('window.menuState.session.mode==="paused"&&document.body.dataset.gamePaused==="true"');
  await page.shot('explicit-pause');
  await page.click('#pause-resume');
  await page.waitFor('window.menuState.session.mode==="private"&&document.getElementById("pause-panel").hidden');
  await page.click('#encounter-rejoin');
  await page.waitFor('window.menuState.session.mode==="shared"');
  await page.click('#pause-toggle');
  await page.waitFor('window.menuState.session.mode==="paused"');
  await page.click('#pause-resume');
  await page.waitFor('window.menuState.session.mode==="private"');
  await page.click('#encounter-rejoin');
  await page.waitFor('window.menuState.session.mode==="shared"');
  check(page.errors.length===0,'Menu journey must have no browser exceptions');
  console.log('PASS Escape/Settings keep shared time running; input blocked; explicit menu and bottom-right Pause fork; resume/rejoin work',page.output);
} catch(error){await page?.shot('failure');throw error;}
finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
