import { check, openBrowser } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4298/';
Bun.env.GREYWROUGHT_VULKAN = '1';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9449';
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4298', GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/pwa-world-${process.pid}.json` },
  stdout: Bun.file('build/browser/pwa-frontend.log'), stderr: Bun.file('build/browser/pwa-frontend-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('pwa');
  await page.waitFor('document.querySelector(".app-controls-entry [data-app-install]") !== null');
  const manifestReply = await page.call('Page.getAppManifest');
  const manifest = manifestReply.result;
  check(manifest && 'data' in manifest && typeof manifest.data === 'string', 'Chrome must load the app manifest');
  const app = JSON.parse(manifest.data);
  check(app.display === 'fullscreen' && app.id === './' && app.scope === './', 'Installed app must keep a stable identity and request fullscreen');
  const installability = await page.call('Page.getInstallabilityErrors');
  check(installability.result && 'installabilityErrors' in installability.result && Array.isArray(installability.result.installabilityErrors), 'Chrome must report install eligibility');
  check(installability.result.installabilityErrors.length === 0, `Not installable: ${JSON.stringify(installability.result.installabilityErrors)}`);
  console.log('Chrome reports no installability errors');
  await page.click('.app-controls-entry [data-app-fullscreen]');
  await page.waitFor('document.fullscreenElement !== null');
  check(await page.evaluate<boolean>('!document.querySelector(".app-controls-entry [data-app-install]").hidden'), 'Browser fullscreen must not pretend the app was installed');
  await page.click('.app-controls-entry [data-app-fullscreen]');
  await page.waitFor('document.fullscreenElement === null');
  // Browser eligibility is checked above; a controlled prompt tests our click/choice handling without installing an OS app.
  await page.evaluate(`(() => {
    window.installCalls=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=async()=>{window.installCalls++;};
    event.userChoice=Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(event);
  })()`);
  check(await page.evaluate<number>('window.installCalls') === 0, 'Install prompt must wait for a player click');
  await page.click('.app-controls-entry [data-app-install]');
  await page.waitFor('window.installCalls===1&&document.querySelector(".app-controls-entry [role=status]").textContent.includes("cancelled")');
  await page.click('.app-controls-entry [data-app-install]');
  await page.waitFor('document.querySelector(".app-controls-entry [role=status]").textContent.includes("browser menu")');
  await page.shot('install-controls');
  await page.evaluate('window.dispatchEvent(new Event("appinstalled"))');
  check(await page.evaluate<boolean>('document.querySelector(".app-controls-entry [data-app-install]").hidden'), 'Install controls must hide after installation');
  await page.enter();
  await page.click('#pause-open');
  await page.click('.app-controls-settings [data-app-fullscreen]');
  await page.waitFor('document.fullscreenElement!==null');
  check(await page.evaluate<boolean>('document.body.dataset.encounterMode==="shared"'), 'Fullscreen and Settings must leave the shared world running');
  await page.shot('fullscreen-settings');
  await page.click('.app-controls-settings [data-app-fullscreen]');
  await page.waitFor('document.fullscreenElement===null');
  check(page.errors.length === 0, 'Install/fullscreen journey must have no browser exceptions');
  console.log('PASS manifest/icons eligible, real fullscreen entry/exit, deferred install/cancel/guidance, installed state and live Settings', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); frontend.kill(); await frontend.exited; }
