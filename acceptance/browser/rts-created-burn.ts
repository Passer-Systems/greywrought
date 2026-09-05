const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9254;
const gamePort = 4188;
const gameUrl = "http://127.0.0.1:" + gamePort + "/";
const sourceFixture = "build/acceptance/m5-created-burn.clause";
const rendererMode = Bun.env.GREYWROUGHT_BROWSER_RENDERER ?? "swiftshader";
if (rendererMode !== "swiftshader" && rendererMode !== "hardware") {
  throw new Error("GREYWROUGHT_BROWSER_RENDERER must be swiftshader or hardware");
}
const rendererFlags = rendererMode === "hardware"
  ? ["--enable-gpu"]
  : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"];

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await Bun.write(sourceFixture, await Bun.file("src/world/embodied-encounter.clause").arrayBuffer());
const server = Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: { ...process.env, GREYWROUGHT_PORT: String(gamePort), GREYWROUGHT_RESIDENT_SOURCE: sourceFixture },
  stdout: "pipe",
  stderr: "inherit",
});
const chrome = Bun.spawn({
  cmd: [
    chromePath,
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=" + debugPort,
    "--user-data-dir=/tmp/greywrought-cdp-created-burn-" + process.pid,
    "--window-size=1280,900",
    ...rendererFlags,
    "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:" + gamePort + "/")).ok) break; } catch {}
    await Bun.sleep(25);
  }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:" + debugPort + "/json/version")).ok) break; } catch {}
    await Bun.sleep(25);
  }
  const tabResponse = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", { method: "PUT" });
  requireCondition(tabResponse.ok, "created-burn Chrome tab did not open");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "created-burn tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("created-burn CDP socket timed out"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => { throw new Error("created-burn CDP timeout in " + method); }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const message = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (message.result?.exceptionDetails) {
      throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text);
    }
    return message.result?.result?.value as T;
  };
  const waitFor = async <T>(
    expression: string,
    accept: (value: T) => boolean,
    label: string,
    attempts = 500,
  ): Promise<T> => {
    let value = await evaluate<T>(expression);
    for (let attempt = 0; attempt < attempts && !accept(value); attempt += 1) {
      await Bun.sleep(25);
      value = await evaluate<T>(expression);
    }
    requireCondition(accept(value), label + " did not settle: " + JSON.stringify(value));
    return value;
  };
  const click = (id: string) => evaluate("document.getElementById(" + JSON.stringify(id) + ").click()");
  const latest = () => evaluate<Record<string, any>>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1) || {}",
  );

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: gameUrl });
  await waitFor<{ phase: string; failure: string }>(
    "({phase:document.body?.dataset.gamePhase||'',failure:document.body?.dataset.runtimeFailure||''})",
    (value) => value.phase === "ready" || value.phase === "failed",
    "created-burn world lifecycle",
  ).then((value) => requireCondition(value.phase === "ready", "created-burn world failed: " + value.failure));
  const renderer = await evaluate<string>(`(() => {
    const gl=document.createElement('canvas').getContext('webgl');
    const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
  })()`);
  if (rendererMode === "hardware") {
    requireCondition(!/unavailable|swiftshader|llvmpipe|software/i.test(renderer),
      "hardware burn journey has no hardware renderer: " + renderer);
  }
  console.log("Created-burn renderer: " + renderer);
  await click("begin-encounter");
  await waitFor<string>("document.body.dataset.encounterPhase || ''", (value) => value === "Battle joined", "created-burn encounter");
  await click("select-all");
  await click("target-cinder-1");
  await waitFor<boolean>(
    "(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);" +
      " return p?.target==='cinder-1' && p?.selected?.length===5 && Object.values(p?.cooldowns||{}).every(v=>v<=0); })()",
    Boolean,
    "created-burn precondition",
  );
  await click("command-attack");
  await waitFor<boolean>(
    "(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);" +
      " return p?.vitality?.['cinder-1']<20 && Object.values(p?.cooldowns||{}).some(v=>v>0); })()",
    Boolean,
    "first ordinary attack",
  );
  await waitFor<boolean>(
    "Object.values((window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns||{}).every(v=>v<=0)",
    Boolean,
    "party attack cooldown",
    800,
  );
  await click("command-attack");
  await waitFor<boolean>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1']<=0",
    Boolean,
    "moonwell attacker defeated through ordinary controls",
  );
  await click("target-cinder-2");
  await waitFor<boolean>(
    "(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);" +
      " return p?.target==='cinder-2' && Object.values(p?.cooldowns||{}).every(v=>v<=0); })()",
    Boolean,
    "safe created-burn target",
    800,
  );
  const control = await evaluate<{ top: number; bottom: number; width: number; disabled: boolean }>(
    "(() => { const b=document.getElementById('command-ignite'); const r=b.getBoundingClientRect();" +
      " return {top:r.top,bottom:r.bottom,width:r.width,disabled:b.disabled}; })()",
  );
  requireCondition(!control.disabled && control.top >= 0 && control.bottom <= 900 && control.width > 0,
    "Ignite control is not reachable at DPR1: " + JSON.stringify(control));
  const before = await latest();
  const igniteStarted = performance.now();
  await click("command-ignite");
  const active = await waitFor<readonly Record<string, any>[]>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.createdBurns || []",
    (burns) => burns.length === 2,
    "two runtime-created burns",
  );
  requireCondition(new Set(active.map((burn) => burn.occurrence)).size === 2, "created burns collapsed equal-valued occurrences");
  requireCondition(active.every((burn) => burn.targetId === "cinder-2" && burn.damage === 7),
    "created burns lost exact target or source damage");
  const durations = active.map((burn) => burn.remaining).sort((left, right) => left - right);
  requireCondition(
    durations[0]! > 1.3 && durations[0]! <= 1.5 && durations[1]! > 2.8 && durations[1]! <= 3,
    "created burns lost unequal source lifetimes: " + JSON.stringify(durations),
  );
  const visible = await evaluate<string>("document.querySelector('#target-cinder-2 span').textContent || ''");
  requireCondition(visible.includes("2 ignitions"), "created burn count is not visible to the player: " + visible);
  const longer = active.find((burn) => burn.remaining === durations[1])!.occurrence;
  const oneRemaining = await waitFor<Record<string, any>>(
    "(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);" +
      " return p?.createdBurns?.length===1 ? p : {}; })()",
    (projection) => projection.createdBurns?.length === 1,
    "independent short-burn expiry",
    800,
  );
  const shortExpiryWallMillis = performance.now() - igniteStarted;
  requireCondition(oneRemaining.createdBurns[0].occurrence === longer, "short burn expiry removed the wrong occurrence");
  console.log(
    "Short created burn expired after " + Math.round(shortExpiryWallMillis) +
      "ms wall; survivor has " + Number(oneRemaining.createdBurns[0].remaining).toFixed(3) + "s source time",
  );
  const priorHealth = Number(before.vitality["cinder-2"]);
  const afterAll = await waitFor<Record<string, any>>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1) || {}",
    (projection) => projection.createdBurns?.length === 0,
    "all created burns expired",
    900,
  );
  const fullExpiryWallMillis = performance.now() - igniteStarted;
  if (rendererMode === "hardware") {
    requireCondition(shortExpiryWallMillis >= 1_450 && shortExpiryWallMillis <= 1_900 &&
      fullExpiryWallMillis >= 2_950 && fullExpiryWallMillis <= 3_500,
      "created-burn clock diverged from real time: " + shortExpiryWallMillis + "/" + fullExpiryWallMillis);
  }
  requireCondition(afterAll.vitality["cinder-2"] < priorHealth - 30,
    "created burns did not apply source-owned timed damage: " + priorHealth + " -> " + afterAll.vitality["cinder-2"]);
  requireCondition(
    await evaluate<number>("window.__GREYWROUGHT_GAME_EVENTS__.filter(e=>e.phase==='action-requested'&&e.action==='Ignite').length") === 1,
    "created-burn journey did not use one ordinary Ignite control",
  );
  console.log(
    "RTS created burns passed at DPR1: two exact occurrences, lifetimes " +
      durations.map((value) => value.toFixed(3)).join("/") + "s, independent expiry, target " +
      priorHealth + "->" + afterAll.vitality["cinder-2"] + ", wall expiry " +
      Math.round(shortExpiryWallMillis) + "/" + Math.round(fullExpiryWallMillis) + "ms",
  );
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
