import { check, openBrowser } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4298/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9449';
Bun.env.GREYWROUGHT_VULKAN = '1';
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4298', GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/chat-continuity-${process.pid}.json` },
  stdout: Bun.file('build/browser/chat-continuity-frontend.log'),
  stderr: Bun.file('build/browser/chat-continuity-frontend-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('chat-continuity', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.EventSource=class{};window.sentCommands=[]; window.tickCount=0; window.blurCount=0;
      addEventListener('blur',()=>window.blurCount++);
      const raf=requestAnimationFrame;
      window.requestAnimationFrame=callback=>raf.call(window,now=>{if(callback.name==='tick')window.tickCount++;callback(now);});
      const Native=WebSocket;
      window.WebSocket=class extends Native {
        constructor(url,...args){super(window.blockReconnect?'ws://127.0.0.1:9/world':url,...args);window.chatSocket=this;this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.chatState=message;});}
        send(value){window.sentCommands.push(JSON.parse(value));super.send(value);}
      };
    ` });
  } });
  await page.enter();
  for (const message of [('A long message about exploring the ruined forest. ').repeat(6).slice(0, 280), '🐢'.repeat(140)]) {
    await page.press('Enter');
    await page.call('Input.insertText', { text: message });
    const before = await page.evaluate<{ time: number; ticks: number }>('({time:window.chatState.serverTime,ticks:window.tickCount})');
    await page.waitFor(`window.chatState.serverTime>${before.time}+2`);
    check(await page.evaluate(`document.activeElement.id==='chat-log-input'&&document.body.dataset.gamePaused==='false'&&window.tickCount>${before.ticks}+10`), 'Typing a long message must retain chat focus and keep rendering');
    await page.press('Enter');
    await page.waitFor(`window.chatState.chat.some(message=>message.text===${JSON.stringify(message)})`);
    check(await page.evaluate('window.chatState.session.mode==="shared"&&document.body.dataset.gamePaused==="false"'), 'Sending a long message must keep the shared world running');
  }
  console.log('PASS long text and Unicode messages keep the world running');
  // Password-manager panels use an embedded frame and take focus from the page.
  await page.click('#chat-log-input');
  await page.evaluate(`new Promise(resolve=>{
    const panel=document.createElement('iframe');panel.id='chat-popup';panel.srcdoc='<input aria-label="Popup choice">';
    Object.assign(panel.style,{position:'fixed',left:'20px',top:'80px',width:'250px',height:'60px',zIndex:'10000'});
    panel.onload=()=>resolve();document.body.append(panel);
  })`);
  await page.evaluate('document.getElementById("chat-popup").contentDocument.querySelector("input").focus()');
  const popup = await page.evaluate<{ time: number; ticks: number; blurs: number; paused: string }>('({time:window.chatState.serverTime,ticks:window.tickCount,blurs:window.blurCount,paused:document.body.dataset.gamePaused})');
  console.log('Embedded popup focus', popup);
  check(popup.blurs > 0, 'Popup focus must exercise a real window blur');
  await page.waitFor(`window.chatState.serverTime>${popup.time}+1`);
  check(await page.evaluate(`document.body.dataset.gamePaused==='false'&&window.tickCount>${popup.ticks}+10`), 'A visible chat popup must not stop world rendering');
  await page.evaluate('document.getElementById("chat-popup").remove()');
  await page.click('#chat-log-input');
  await page.press('Escape');
  check(await page.evaluate('!window.sentCommands.some(message=>message.command?.type==="pause")'), 'Chat and popup focus must send no pause command');

  await page.evaluate('window.blockReconnect=true;window.chatSocket.close();window.dropStarted=performance.now()');
  await page.waitFor('performance.now()>window.dropStarted+2000');
  check(await page.evaluate('document.getElementById("pause-panel").hidden'), 'A short disconnect must not open the pause screen');
  const lastTime = await page.evaluate<number>('window.chatState.serverTime');
  await page.evaluate('window.blockReconnect=false');
  await page.waitFor(`window.chatState.serverTime>${lastTime}&&document.body.dataset.gameOnline==='true'`);
  check(await page.evaluate('window.chatState.session.mode==="shared"&&document.getElementById("pause-panel").hidden'), 'A short disconnect must recover in the shared world without a fork');
  console.log('PASS short socket interruption recovers without pausing or forking');

  await page.evaluate('window.blockReconnect=true;window.chatSocket.close();window.dropStarted=performance.now()');
  await page.waitFor('performance.now()>window.dropStarted+4000');
  check(await page.evaluate('document.getElementById("pause-panel").hidden'), 'Disconnect grace must last at least four seconds');
  await page.waitFor('!document.getElementById("pause-panel").hidden');
  check(await page.evaluate('performance.now()-window.dropStarted>=5000'), 'Disconnect screen must wait five seconds');
  await page.evaluate('window.blockReconnect=false');
  await page.waitFor('document.body.dataset.gameOnline==="true"&&window.chatState.session.mode==="paused"');
  await page.click('#pause-resume');
  await page.waitFor('window.chatState.session.mode==="private"');
  await page.click('#encounter-rejoin');
  await page.waitFor('window.chatState.session.mode==="shared"');
  await page.click('#pause-toggle');
  await page.waitFor('window.chatState.session.mode==="paused"');
  check(page.errors.length === 0, 'Chat journey must have no browser exceptions');
  console.log('PASS popup focus keeps rendering, five-second disconnect grace, sustained loss pauses, explicit pause still works', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); frontend.kill(); await frontend.exited; }
