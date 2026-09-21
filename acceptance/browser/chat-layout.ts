import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4351/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9551' });
const built = await Bun.build({ entrypoints: ['src/host/chat-log.ts'], target: 'browser' });
check(built.success, 'Chat module builds');
const html = `<!doctype html><html><head><style>:root{--ui-font-body:12px}body{margin:0;background:#22332e}#host{position:fixed;inset:0}</style></head><body><div id="host"></div><script type="module">
import {createChatLog} from '/chat-log.js';window.sent=[];window.log=createChatLog(document.getElementById('host'),text=>window.sent.push(text));window.entries=Array.from({length:160},(_,id)=>({id,channel:id%2?'combat':'chat',text:'Message '+id+' — a long enough line to exercise wrapping when the log is resized.'}));window.log.update(window.entries);
</script></body></html>`;
const server = Bun.serve({ hostname: '127.0.0.1', port: 4351, fetch: request => new URL(request.url).pathname === '/chat-log.js' ? new Response(built.outputs[0], { headers: { 'Content-Type': 'application/javascript' } }) : new Response(html, { headers: { 'Content-Type': 'text/html' } }) });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  page = await openBrowser('chat-layout');
  await page.waitFor('document.querySelectorAll("#chat-log-messages p").length===80');
  const rect = () => page!.evaluate<{x:number;y:number;width:number;height:number}>('(()=>{const r=document.getElementById("chat-log").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()');
  async function drag(x:number,y:number,dx:number,dy:number) {
    await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0});
    await page!.call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx/2,y:y+dy/2,button:'left',buttons:1});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y:y+dy,button:'left',buttons:1});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',buttons:0,clickCount:1});
  }
  const start = await rect();
  await drag(start.x+230,start.y+10,180,-180);
  const moved=await rect();
  check(Math.abs(moved.x-start.x-180)<2&&Math.abs(moved.y-start.y+180)<2,'Tab strip drags the log');
  await page.evaluate('document.getElementById("chat-log-messages").scrollTop=250');
  const anchor = await page.evaluate<string>('(()=>{const v=document.getElementById("chat-log-messages"),t=v.getBoundingClientRect().top;return [...v.children].find(r=>r.getBoundingClientRect().bottom>t).dataset.logEntry})()');
  await drag(moved.x+moved.width-6,moved.y+moved.height-6,130,90);
  const resized=await rect();
  check(resized.width>moved.width+100&&resized.height>moved.height+60,'Corner grip resizes the log');
  check(await page.evaluate<string>('(()=>{const v=document.getElementById("chat-log-messages"),t=v.getBoundingClientRect().top;return [...v.children].find(r=>r.getBoundingClientRect().bottom>t).dataset.logEntry})()')===anchor,'Resize preserves the visible message');
  await page.click('#chat-log-tab-combat');
  check(await page.evaluate('document.getElementById("chat-log").dataset.logChannel==="combat"'),'Tabs still switch channels');
  await page.click('#chat-log-tab-chat');
  check(await page.evaluate<string>('(()=>{const v=document.getElementById("chat-log-messages"),t=v.getBoundingClientRect().top;return [...v.children].find(r=>r.getBoundingClientRect().bottom>t).dataset.logEntry})()')===anchor,'Channel switching restores scroll position');
  await page.click('#chat-log-input');await page.call('Input.insertText',{text:'Layout works'});await page.press('Enter');
  check(await page.evaluate('window.sent[0]==="Layout works"&&document.getElementById("chat-log-input").value===""'),'Typing and sending still work');
  async function send(text: string) {
    await page!.click('#chat-log-input');
    await page!.call('Input.insertText', { text });
    await page!.press('Enter');
  }
  await send('/party');
  check(await page.evaluate('window.sent.length===1&&!document.getElementById("chat-log-prefix").hidden&&document.activeElement.id==="chat-log-input"'),'Bare /party selects party chat without sending and keeps typing focus');
  await send('Meet at the bridge');
  await send('Bring supplies');
  check(await page.evaluate('window.sent.slice(-2).every(text=>text.startsWith("/p "))'),'Plain messages stay in party chat');
  await page.click('#chat-log-input');
  await page.call('Input.insertText', { text: 'Ready when you are' });
  check(await page.evaluate('getComputedStyle(document.getElementById("chat-log-input")).color==="rgb(112, 183, 255)"&&getComputedStyle(document.getElementById("chat-log-prefix")).color==="rgb(112, 183, 255)"'),'Party prefix and typed message are blue');
  await page.shot('sticky-party-chat');
  await page.press('Enter');
  await send('/follow Friend');
  await send('/sit');
  await send('/roll');
  check(await page.evaluate('JSON.stringify(window.sent.slice(-3))===JSON.stringify(["/follow Friend","/sit","/roll"])'),'Other slash commands remain commands in party mode');
  await send('Still private');
  check(await page.evaluate('window.sent.at(-1)==="/p Still private"'),'Slash commands preserve party mode');
  await send('/s');
  await send('Hello everyone');
  check(await page.evaluate('document.getElementById("chat-log-prefix").hidden&&window.sent.at(-1)==="Hello everyone"&&getComputedStyle(document.getElementById("chat-log-input")).color!=="rgb(112, 183, 255)"'),'Bare /s returns to normal chat and its normal color');
  await send('/p One more party message');
  check(await page.evaluate('window.sent.at(-1)==="/p One more party message"'),'Party alias with a message selects party chat');
  await send('/say Public again');
  await send('And still public');
  check(await page.evaluate('JSON.stringify(window.sent.slice(-2))===JSON.stringify(["Public again","And still public"])'),'Say alias with a message selects normal chat');
  await page.click('#chat-log-input');
  await page.call('Input.insertText', { text: '/p ' });
  check(await page.evaluate('document.getElementById("chat-log-input").value===""&&!document.getElementById("chat-log-prefix").hidden'),'Typing /p and a space switches channel before composing');
  await page.evaluate('window.log.reset();window.log.update(window.entries)');
  check(await page.evaluate('document.getElementById("chat-log-prefix").hidden'),'Character reset clears party mode');
  await page.call('Page.reload');await page.waitFor('document.querySelectorAll("#chat-log-messages p").length===80');
  const restored=await rect();
  check(Math.abs(restored.x-resized.x)<1&&Math.abs(restored.y-resized.y)<1&&Math.abs(restored.width-resized.width)<1&&Math.abs(restored.height-resized.height)<1,'Reload restores position and size');
  await page.call('Emulation.setDeviceMetricsOverride',{width:420,height:300,deviceScaleFactor:1,mobile:false});
  await page.waitFor('(()=>{const r=document.getElementById("chat-log").getBoundingClientRect();return r.left>=8&&r.top>=8&&r.right<=innerWidth-8&&r.bottom<=innerHeight-8})()');
  await page.shot('chat-clamped-layout');
  await page.evaluate('window.log.dispose()');
  await page.call('Emulation.setDeviceMetricsOverride',{width:600,height:400,deviceScaleFactor:1,mobile:false});
  check(await page.evaluate('!document.getElementById("chat-log")'),'Disposal removes the panel');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS chat layout, sticky party channel, blue composer, slash commands, say aliases, reset, reload persistence and disposal',page.output);
} catch(error){await page?.shot('failure');throw error;}
finally{await page?.close();server.stop(true);}
