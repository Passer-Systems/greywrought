const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9246;
const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4173/";
const expectedUnitCount = Number(Bun.env.GREYWROUGHT_EXPECTED_UNIT_COUNT ?? "5");
const duplicateUnitId = Bun.env.GREYWROUGHT_DUPLICATE_UNIT_ID;

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const chrome = Bun.spawn({
  cmd: [chromePath, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=/tmp/greywrought-cdp-rts-${process.pid}`,
    "--window-size=1280,900", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank"],
  stdout: "ignore", stderr: "ignore",
});
let socket: WebSocket | null = null;
try {
  console.log("rts journey: launching Chrome");
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) { ready = true; break; } } catch {}
    await Bun.sleep(50);
  }
  requireCondition(ready, "Chrome debugging port did not open");
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(10_000) });
  requireCondition(tabResponse.ok, "Chrome could not open Greywrought");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "Chrome tab omitted debugger URL");
  console.log("rts journey: CDP tab connected");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: unknown) => void>();
  const browserErrors: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) browserErrors.push(String(message.params?.args?.[0]?.value ?? "console error"));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("CDP WebSocket open timeout"); }),
  ]);
  console.log("rts journey: websocket open");
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++; socket!.send(JSON.stringify({ id, method, params }));
    const detail = method === "Runtime.evaluate" && typeof params.expression === "string"
      ? ` for ${params.expression.slice(0, 120)}`
      : "";
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(10_000).then(() => { pending.delete(id); throw new Error(`CDP timeout in ${method}${detail}; browser errors: ${browserErrors.join(" | ") || "none"}`); }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true });
    return (result.result?.result?.value ?? null) as T;
  };
  await call("Runtime.enable"); await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "window.__RTS_ERRORS__=[]; addEventListener('error', e => window.__RTS_ERRORS__.push(String(e.message || e.error || e))); addEventListener('unhandledrejection', e => window.__RTS_ERRORS__.push(String(e.reason)));" });
  await call("Page.navigate", { url: gameUrl }); await Bun.sleep(2500);
  console.log("rts journey: page navigated");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.gamePhase") === "ready") break;
    await Bun.sleep(50);
  }
  const phase = await evaluate<string>("document.body.dataset.gamePhase");
  const authority = await evaluate<string>("document.getElementById('authority-status')?.textContent || ''");
  const lastReceipt = await evaluate<string>("document.body.dataset.lastReceipt || ''");
  const workbenchPhase = await evaluate<string>("document.body.dataset.workbenchPhase || ''");
  const runtimeFailure = await evaluate<string>("document.body.dataset.runtimeFailure || ''");
  requireCondition(phase === "ready", `company did not become ready (phase=${phase}, status=${authority}, receipt=${lastReceipt}, workbench=${workbenchPhase}, failure=${runtimeFailure}); browser errors: ${browserErrors.join(" | ") || "none"}`);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const assetsReady = await evaluate<boolean>(
      "document.body.dataset.companyAssetStatus === 'ready' && document.body.dataset.natureAssetStatus === 'ready'",
    );
    if (assetsReady) break;
    await Bun.sleep(50);
  }
  const companyAssetStatus = await evaluate<string>("document.body.dataset.companyAssetStatus || ''");
  const natureAssetStatus = await evaluate<string>("document.body.dataset.natureAssetStatus || ''");
  const companyModels = await evaluate<string>("document.body.dataset.companyModels || ''");
  const artificerSilhouette = await evaluate<string>("document.body.dataset.artificerSilhouette || ''");
  const pageErrors = await evaluate<string[]>("window.__RTS_ERRORS__ || []");
  requireCondition(companyAssetStatus === "ready", `five Quaternius company models did not load (status=${companyAssetStatus}, models=${companyModels})`);
  requireCondition(natureAssetStatus === "ready", `Quaternius Stylized Nature did not load (status=${natureAssetStatus})`);
  requireCondition(companyModels === "Warrior:Knight_Golden_Female,Artificer:Worker_Female,Rogue:Ninja_Female,Priest:Wizard,Ranger:Elf", `unexpected Quaternius model mapping: ${companyModels}`);
  requireCondition(new Set(companyModels.split(",").map((entry) => entry.split(":")[1])).size === 5, "company models are not distinct");
  requireCondition(artificerSilhouette === "engineer-alchemist-kit", `Artificer silhouette is not engineer/alchemist (${artificerSilhouette})`);
  requireCondition([...browserErrors, ...pageErrors].length === 0, `browser errors: ${[...browserErrors, ...pageErrors].join(" | ")}`);
  const bodyText = await evaluate<string>("document.body.innerText");
  requireCondition(!/Clause|authority|projection|generation|resident|Wasm|compiler|backend|runtime/i.test(bodyText), "player-facing text leaked implementation vocabulary");
  const classes = await evaluate<string[]>("(document.body.dataset.unitClasses || '').split(',').filter(Boolean)");
  requireCondition(
    classes.length === expectedUnitCount && ["Warrior", "Artificer", "Rogue", "Priest", "Ranger"].every((entry) => classes.includes(entry)),
    `unexpected company classes: ${classes.join(",")}`,
  );
  requireCondition(
    await evaluate<number>("document.querySelectorAll('#roster .roster-card').length") === expectedUnitCount,
    `company roster does not contain ${expectedUnitCount} projected units`,
  );
  const canvas = await evaluate<{ x: number; y: number; width: number; height: number }>("(() => { const r=document.getElementById('world-canvas').getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()");
  const mouse = async (type: string, x: number, y: number, button = "left", buttons = 0) => call("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount: 1 });
  // Establish a one-unit precondition, then drag-select the company and verify
  // the Clause-owned selection transition independently.
  await evaluate("document.getElementById('roster-warrior-1').click()");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.selectedCount") === "1") break;
    await Bun.sleep(25);
  }
  requireCondition(
    await evaluate<string>("document.body.dataset.selectedCount") === "1",
    "single-unit selection precondition did not settle",
  );
  if (duplicateUnitId !== undefined) {
    const firstSelection = await evaluate<string[]>(
      "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.selected || []",
    );
    requireCondition(
      firstSelection.join(",") === "warrior-1",
      `first same-class occurrence was not independently selected: ${firstSelection.join(",")}`,
    );
    await evaluate(`document.getElementById(${JSON.stringify(`roster-${duplicateUnitId}`)}).click()`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const selected = await evaluate<string[]>(
        "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.selected || []",
      );
      if (selected.join(",") === duplicateUnitId) break;
      await Bun.sleep(25);
    }
    const duplicateSelection = await evaluate<string[]>(
      "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.selected || []",
    );
    requireCondition(
      duplicateSelection.join(",") === duplicateUnitId,
      `second same-class occurrence was not independently selected: ${duplicateSelection.join(",")}`,
    );
  }
  // Keep the gesture inside the visible 900px viewport.
  const visibleBottom = Math.min(canvas.y + canvas.height - 2, 880);
  await mouse("mousePressed", canvas.x + 2, canvas.y + 2, "left", 1); await mouse("mouseMoved", canvas.x + canvas.width - 2, visibleBottom, "left", 1); await mouse("mouseReleased", canvas.x + canvas.width - 2, visibleBottom);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.selectedCount") === String(expectedUnitCount)) break;
    await Bun.sleep(25);
  }
  const selectedCount = await evaluate<string>("document.body.dataset.selectedCount");
  const selectionEvents = await evaluate<unknown[]>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='selection-requested').slice(-2)");
  requireCondition(selectedCount === String(expectedUnitCount), `drag selection did not select all ${expectedUnitCount} units (count=${selectedCount}, canvas=${canvas.width}x${canvas.height}, events=${JSON.stringify(selectionEvents)})`);
  const before = await evaluate<Record<string, [number, number]>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions || {}");
  await mouse("mousePressed", canvas.x + canvas.width * 0.72, canvas.y + canvas.height * 0.45, "right", 2); await mouse("mouseReleased", canvas.x + canvas.width * 0.72, canvas.y + canvas.height * 0.45, "right");
  const marker = await evaluate<string>("document.body.dataset.destinationMarker || ''");
  const markerCoords = marker.split(',').map(Number);
  requireCondition(markerCoords.length === 2 && markerCoords.every(Number.isFinite), `destination marker missing/invalid: ${marker}`);
  await Bun.sleep(900);
  requireCondition(await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='move-requested').length") > 0, "right-click did not issue a move order");
  const after = await evaluate<Record<string, [number, number]>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions || {}");
  requireCondition(Object.keys(after).length === expectedUnitCount && Object.keys(before).every((id) => JSON.stringify(before[id]) !== JSON.stringify(after[id])), "every selected formation occurrence did not advance");
  await evaluate("document.getElementById('equipment-toggle').click()");
  requireCondition(await evaluate<boolean>("document.getElementById('equipment-panel').classList.contains('open')"), "equipment panel did not open");
  requireCondition(await evaluate<number>("document.querySelectorAll('#equipment-panel .gear-slot').length") === 20, "equipment paper doll is incomplete");
  requireCondition(await evaluate<boolean>("document.querySelector('#command-move') !== null && document.querySelector('#equipment-toggle') !== null"), "RTS command controls are incomplete");
  console.log(`RTS browser journey passed: ${expectedUnitCount} projected units, five distinct Quaternius classes, Stylized Nature, exact/box selection, formation move, camera/move marker/paper doll UI`);
} finally {
  socket?.close(); chrome.kill();
}
