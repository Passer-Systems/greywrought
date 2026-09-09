import {check, openBrowser} from './session.js';

interface MotionFrame {time: number; x: number; y: number; z: number; cameraX: number; cameraZ: number; screenX: number; screenY: number;}
const page = await openBrowser('movement-smoothness');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', {source: `
    window.motionFrames = []; window.motionPackets = []; window.motionDelay = false;
    window.EventSource = class {};
    const raf = requestAnimationFrame;
    window.requestAnimationFrame = callback => raf(time => {window.motionFrameTime = time; callback(time);});
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      incoming = 0; outgoing = 0; countIn = 0; countOut = 0;
      set onmessage(callback) {
        super.onmessage = event => {
          const now = performance.now();
          const due = window.motionDelay ? Math.max(this.incoming + 1, now + 120 + [0,60,20,90][this.countIn++ % 4]) : now;
          this.incoming = due;
          setTimeout(() => {window.motionPackets.push(performance.now()); callback?.call(this, event);}, due - now);
        };
      }
      send(data) {
        const now = performance.now();
        const due = window.motionDelay ? Math.max(this.outgoing + 1, now + 100 + [0,30,10,50][this.countOut++ % 4]) : now;
        this.outgoing = due;
        setTimeout(() => {if (this.readyState === Native.OPEN) super.send(data);}, due - now);
      }
    };
  `});
  await page.reload();
  await page.evaluate(`(async () => {
    const {Scene, Vector3} = await import('three');
    Scene.prototype.onAfterRender = function(renderer, scene, camera) {
      const player = scene.children.find(object => object.userData.localPlayer);
      if (!player) return;
      const screen = new Vector3().copy(player.position).project(camera);
      window.motionFrames.push({time: window.motionFrameTime, ...player.position,
        cameraX: camera.position.x, cameraZ: camera.position.z, screenX: screen.x, screenY: screen.y});
    };
  })()`);
  await page.enter();
  await Bun.sleep(600);
  const reports = [];
  for (const delayed of [false, true]) {
    await page.evaluate(`window.motionDelay = ${delayed}`);
    await Bun.sleep(500);
    const started = await page.evaluate<number>('performance.now()');
    await page.key('KeyW', true);
    await Bun.sleep(1400);
    const released = await page.evaluate<number>('performance.now()');
    await page.key('KeyW', false);
    await Bun.sleep(650);
    const frames = await page.evaluate<MotionFrame[]>(`window.motionFrames.filter(frame => frame.time > ${started - 100} && frame.time < ${released + 600})`);
    const before = frames.filter(frame => frame.time < started).at(-1)!;
    check(before !== undefined, 'Rendered player must be observable before input');
    const firstMove = frames.find(frame => frame.time >= started && Math.hypot(frame.x - before.x, frame.z - before.z) > 0.015);
    check(firstMove !== undefined && firstMove.time - started < 100, 'Movement must begin locally within 100 ms, before delayed server replies');
    const steady = frames.filter(frame => frame.time > started + 250 && frame.time < released - 50);
    const speeds = steady.slice(1).map((frame, index) => Math.hypot(frame.x - steady[index]!.x, frame.z - steady[index]!.z) / ((frame.time - steady[index]!.time) / 1000));
    const wrongSpeed = speeds.filter(speed => speed < 3.8 || speed > 5.2);
    check(speeds.length > 15, 'Need actual rendered moving frames');
    check(wrongSpeed.length / speeds.length < 0.05, 'Steady movement must not freeze, jump, or pulse with incoming packets');
    const stopped = frames.filter(frame => frame.time > released + 100);
    const stopTravel = Math.hypot(stopped.at(-1)!.x - stopped[0]!.x, stopped.at(-1)!.z - stopped[0]!.z);
    check(stopTravel < 0.12, 'Releasing movement must stop locally without a delayed extra step');
    const cameraBacksteps = steady.slice(1).filter((frame, index) => frame.cameraZ < steady[index]!.cameraZ - 0.001).length;
    check(cameraBacksteps === 0, 'Camera must not jerk backwards during steady forward movement');
    reports.push({delayed, responseMs: firstMove.time - started, frames: speeds.length,
      minimumSpeed: Math.min(...speeds), maximumSpeed: Math.max(...speeds), wrongSpeedFrames: wrongSpeed.length, stopTravel, cameraBacksteps});
    await page.key('KeyS', true); await Bun.sleep(1400); await page.key('KeyS', false); await Bun.sleep(650);
  }
  await page.shot('motion-checked');
  await Bun.write(`${page.output}/measurements.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  check(page.errors.length === 0, 'No browser exceptions during movement');
} finally {await page.close();}
