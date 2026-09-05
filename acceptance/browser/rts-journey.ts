import { PerspectiveCamera, Vector3 } from "three";

const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9246;
const gamePort = 4180;
const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? `http://127.0.0.1:${gamePort}/`;
const expectedUnitCount = Number(Bun.env.GREYWROUGHT_EXPECTED_UNIT_COUNT ?? "5");
const duplicateUnitId = Bun.env.GREYWROUGHT_DUPLICATE_UNIT_ID;
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

const sourceFixture = "build/acceptance/rts-journey.clause";
if (Bun.env.GREYWROUGHT_GAME_URL === undefined) {
  await Bun.write(sourceFixture, await Bun.file("src/world/embodied-encounter.clause").arrayBuffer());
}
const server = Bun.env.GREYWROUGHT_GAME_URL === undefined ? Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: { ...process.env, GREYWROUGHT_PORT: String(gamePort), GREYWROUGHT_RESIDENT_SOURCE: sourceFixture },
  stdout: "ignore", stderr: "inherit",
}) : null;
const chrome = Bun.spawn({
  cmd: [chromePath, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=/tmp/greywrought-cdp-rts-${process.pid}`,
    "--window-size=1280,900", ...rendererFlags, "about:blank"],
  stdout: "ignore", stderr: "ignore",
});
let socket: WebSocket | null = null;
try {
  if (server !== null) {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try { if ((await fetch(gameUrl, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await Bun.sleep(25);
    }
    requireCondition(ready, "isolated RTS server did not open");
  }
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
  const screenshot = async (path: string): Promise<void> => {
    // Freeze animation only in the CDP driver while capturing. SwiftShader's
    // continuously composited WebGL surface otherwise starves the screenshot
    // command even though gameplay evaluations remain responsive.
    await call("Page.setWebLifecycleState", { state: "frozen" });
    try {
      const result = await call("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      });
      const data = result.result?.data;
      requireCondition(typeof data === "string", `Chrome omitted screenshot data for ${path}`);
      await Bun.write(path, Buffer.from(data, "base64"));
    } finally {
      await call("Page.setWebLifecycleState", { state: "active" });
    }
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
  if (rendererMode === "hardware") {
    const renderer = await evaluate<string>(`(() => {
      const gl=document.createElement('canvas').getContext('webgl');
      const ext=gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    })()`);
    requireCondition(!/unavailable|swiftshader|llvmpipe|software/i.test(renderer),
      "hardware movement journey has no hardware renderer: " + renderer);
    console.log("RTS renderer: " + renderer);
  }
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
  requireCondition(
    await evaluate<number>("document.querySelectorAll('#encounter-targets .target-card').length") === expectedUnitCount + 3,
    "the passive target deck did not expose all company, enemy, and objective Actors",
  );
  const canvas = await evaluate<{ x: number; y: number; width: number; height: number }>("(() => { const r=document.getElementById('world-canvas').getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()");
  const mouse = async (type: string, x: number, y: number, button = "left", buttons = 0, modifiers = 0) => call("Input.dispatchMouseEvent", { type, x, y, button, buttons, modifiers, clickCount: 1 });
  const worldPoint = async (x: number, y: number, z: number): Promise<{ x: number; y: number }> => {
    const view = await evaluate<{ x: number; z: number; distance: number }>(
      "({x:Number(document.body.dataset.cameraX),z:Number(document.body.dataset.cameraZ),distance:Number(document.body.dataset.cameraDistance)})",
    );
    const camera = new PerspectiveCamera(38, canvas.width / canvas.height, 0.2, 120);
    camera.position.set(view.x + view.distance * 0.66, view.distance * 0.78, view.z + view.distance * 0.66);
    camera.lookAt(view.x, 0, view.z);
    camera.updateMatrixWorld();
    const point = new Vector3(x, y, z).project(camera);
    return { x: canvas.x + (point.x * 0.5 + 0.5) * canvas.width, y: canvas.y + (-point.y * 0.5 + 0.5) * canvas.height };
  };
  const clickPoint = async (point: { x: number; y: number }, modifiers = 0): Promise<void> => {
    const hit = await evaluate<string>(`document.elementFromPoint(${point.x}, ${point.y})?.id ?? 'none'`);
    if (hit !== "world-canvas") {
      await screenshot("build/acceptance/rts-obstructed-world.png");
      throw new Error(`world click at ${point.x},${point.y} is obstructed by ${hit}`);
    }
    await mouse("mousePressed", point.x, point.y, "left", 1, modifiers);
    await mouse("mouseReleased", point.x, point.y, "left", 0, modifiers);
  };
  const selectedIds = (): Promise<string[]> => evaluate("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.selected || []");
  const waitForSelection = async (expected: readonly string[]): Promise<void> => {
    const expectedKey = [...expected].sort().join(",");
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if ((await selectedIds()).sort().join(",") === expectedKey) return;
      await Bun.sleep(25);
    }
    throw new Error(`selection expected ${expectedKey}, got ${(await selectedIds()).join(",")}`);
  };
  const waitForTarget = async (id: string): Promise<void> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate<string>("document.body.dataset.targetId") === id) return;
      await Bun.sleep(25);
    }
    throw new Error(`direct target expected ${id}, got ${await evaluate<string>("document.body.dataset.targetId")}`);
  };
  const openingPositions = await evaluate<Record<string, [number, number]>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions || {}");
  const warriorPosition = openingPositions['warrior-1']!;
  const priestPosition = openingPositions['priest-1']!;
  await clickPoint(await worldPoint(warriorPosition[0], 0.8, warriorPosition[1]));
  await waitForSelection(['warrior-1']);
  await clickPoint(await worldPoint(priestPosition[0], 0.8, priestPosition[1]), 8);
  await waitForSelection(['warrior-1', 'priest-1']);
  await clickPoint(await worldPoint(warriorPosition[0], 0.8, warriorPosition[1]), 8);
  await waitForSelection(['priest-1']);
  await evaluate("document.getElementById('roster-warrior-1').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))");
  await waitForSelection(['warrior-1', 'priest-1']);
  await evaluate("(() => {const b=document.getElementById('roster-warrior-1'); for(let i=0;i<2;i++) b.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));})()");
  await Bun.sleep(300);
  await waitForSelection(['warrior-1', 'priest-1']);
  await clickPoint(await worldPoint(priestPosition[0], 0.8, priestPosition[1]), 1);
  await waitForTarget('priest-1');
  await waitForSelection(['warrior-1', 'priest-1']);
  await clickPoint(await worldPoint(3, 1.0, 7));
  await waitForTarget('cinder-2');
  await waitForSelection(['warrior-1', 'priest-1']);
  await clickPoint(await worldPoint(0, 0.65, 4));
  await waitForTarget('moonwell');
  await waitForSelection(['warrior-1', 'priest-1']);
  await evaluate("document.getElementById('roster-warrior-1').click()");
  await waitForSelection(['warrior-1']);
  const priestPoint = await worldPoint(priestPosition[0], 0.8, priestPosition[1]);
  await mouse("mousePressed", priestPoint.x - 10, priestPoint.y - 10, "left", 1, 8);
  await mouse("mouseMoved", priestPoint.x + 10, priestPoint.y + 10, "left", 1, 8);
  await mouse("mouseReleased", priestPoint.x + 10, priestPoint.y + 10, "left", 0, 8);
  await waitForSelection(['warrior-1', 'priest-1']);
  await evaluate("document.getElementById('target-cinder-1').click()");
  await waitForTarget('cinder-1');
  console.log("RTS targeting/selection passed: world picks, independent enemy/ally/objective target, Shift toggle including queued double toggle, additive drag and target deck");
  const waitForCooldowns = async (unitIds: readonly string[]): Promise<void> => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const cooldowns = await evaluate<Record<string, number>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns || {}");
      if (unitIds.every((id) => (cooldowns[id] ?? 1) <= 0)) return;
      await Bun.sleep(25);
    }
    const cooldowns = await evaluate<Record<string, number>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns || {}");
    throw new Error(`source cooldowns did not expire: ${JSON.stringify(cooldowns)}`);
  };
  const waitForActionCycle = async (unitIds: readonly string[]): Promise<void> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const cooldowns = await evaluate<Record<string, number>>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns || {}");
      if (unitIds.some((id) => (cooldowns[id] ?? 0) > 0)) {
        await waitForCooldowns(unitIds);
        return;
      }
      await Bun.sleep(25);
    }
    throw new Error(`attack input did not produce a positive source cooldown for ${unitIds.join(",")}`);
  };
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
  const farX = canvas.x + canvas.width * 0.8;
  const farY = canvas.y + canvas.height * 0.45;
  const soloMoving = "document.getElementById('roster-warrior-1').classList.contains('moving')";
  const soloCoordinates = "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions?.['warrior-1']";
  await mouse("mousePressed", farX, farY, "right", 2);
  await mouse("mouseReleased", farX, farY, "right");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate<boolean>(soloMoving)) break;
    await Bun.sleep(25);
  }
  requireCondition(await evaluate<boolean>(soloMoving), "Stop precondition: the selected unit did not start moving");
  await evaluate("document.getElementById('command-stop').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!(await evaluate<boolean>(soloMoving))) break;
    await Bun.sleep(25);
  }
  requireCondition(!(await evaluate<boolean>(soloMoving)), "Stop did not cancel the selected unit's movement");
  const stoppedPosition = await evaluate<[number, number]>(soloCoordinates);
  await Bun.sleep(200);
  requireCondition(JSON.stringify(await evaluate(soloCoordinates)) === JSON.stringify(stoppedPosition),
    "the stopped unit resumed its superseded route");
  await mouse("mousePressed", farX, farY, "right", 2);
  await mouse("mouseReleased", farX, farY, "right");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate<boolean>(soloMoving)) break;
    await Bun.sleep(25);
  }
  requireCondition(await evaluate<boolean>(soloMoving), "a fresh order did not resume the stopped unit");
  await mouse("mousePressed", canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.45, "right", 2);
  await mouse("mouseReleased", canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.45, "right");
  const soloOrder = await evaluate<{ x: number; z: number }>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='move-requested').at(-1)",
  );
  requireCondition(soloOrder !== null, "single-unit click did not issue an order");
  let soloPosition: [number, number] | null = null;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    soloPosition = await evaluate<[number, number]>(
      "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions?.['warrior-1']",
    );
    if (soloPosition && Math.hypot(soloPosition[0] - soloOrder.x, soloPosition[1] - soloOrder.z) < 0.01) break;
    await Bun.sleep(50);
  }
  requireCondition(soloPosition !== null && Math.hypot(soloPosition[0] - soloOrder.x, soloPosition[1] - soloOrder.z) < 0.01,
    `single unit missed the clicked marker: order=${JSON.stringify(soloOrder)}, position=${JSON.stringify(soloPosition)}`);
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
  const groupOrder = await evaluate<{ x: number; z: number }>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='move-requested').at(-1)",
  );
  let groupPositions: [number, number][] = [];
  const groupCentered = (): boolean => groupPositions.length === expectedUnitCount && Math.hypot(
    groupPositions.reduce((sum, p) => sum + p[0], 0) / expectedUnitCount - groupOrder.x,
    groupPositions.reduce((sum, p) => sum + p[1], 0) / expectedUnitCount - groupOrder.z,
  ) < 0.01;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    groupPositions = Object.values(await evaluate<Record<string, [number, number]>>(
      "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.positions || {}",
    ));
    if (groupCentered()) break;
    await Bun.sleep(50);
  }
  requireCondition(groupCentered(), `group missed the marker center: ${JSON.stringify({ groupOrder, groupPositions })}`);
  for (let index = 0; index < groupPositions.length; index += 1) {
    for (const other of groupPositions.slice(index + 1)) {
      const point = groupPositions[index]!;
      requireCondition(Math.hypot(point[0] - other[0], point[1] - other[1]) >= 0.9, "selected group destinations overlap");
    }
  }
  console.log("RTS movement passed: Stop, replacement order, solo arrival at the marker and separated group destinations centered on the click");

  // Join the source-owned encounter through its real controls. Targeting uses
  // projected referents from the admitted frame; the browser never names a
  // compiler domain or translates an actor into a gameplay code.
  await evaluate("document.getElementById('begin-encounter').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.encounterPhase || ''") === "Battle joined") break;
    await Bun.sleep(25);
  }
  requireCondition(
    await evaluate<string>("document.body.dataset.encounterPhase || ''") === "Battle joined",
    "the Begin defence control did not enter the Clause-owned battle phase",
  );
  const openingMoonwell = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.moonwell ?? -1");
  requireCondition(openingMoonwell < 110, `the autonomous cinder opening did not damage the Moonwell (${openingMoonwell})`);

  const waitForReadiness = async (action: string, reason: string): Promise<void> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate<boolean>(`document.getElementById(${JSON.stringify(`readiness-${action}`)})?.textContent?.includes(${JSON.stringify(reason)}) ?? false`)) return;
      await Bun.sleep(25);
    }
    throw new Error(`${action} did not display ${reason}`);
  };
  const waitForOrderReport = async (report: string): Promise<void> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate<boolean>(`document.getElementById('command-status').textContent.includes(${JSON.stringify(report)})`)) return;
      await Bun.sleep(25);
    }
    throw new Error(`processed order did not report ${report}`);
  };
  await evaluate("document.querySelector('#command-readiness summary').click()");
  requireCondition(await evaluate<boolean>("document.getElementById('readiness-attack').getBoundingClientRect().height > 0"), "command readiness details did not open visibly");
  await evaluate("document.getElementById('roster-warrior-1').click()");
  await waitForSelection(["warrior-1"]);
  await evaluate("document.getElementById('roster-warrior-1').dispatchEvent(new MouseEvent('click', {bubbles:true, shiftKey:true}))");
  await waitForSelection([]);
  await waitForReadiness("attack", "Select a living unit");
  await evaluate("document.getElementById('command-attack').click()");
  requireCondition(await evaluate<boolean>("document.getElementById('command-status').textContent.includes('Select a living unit')"), "empty-selection order did not explain the missing selection");
  await evaluate("document.getElementById('roster-warrior-1').click()");
  await evaluate("document.getElementById('target-moonwell').click()");
  await waitForReadiness("attack", "Aldric: Wrong target");
  await waitForReadiness("heal", "Aldric: Ability unavailable");
  await evaluate("document.getElementById('command-attack').click()");
  await waitForOrderReport("Attack — Wrong target");
  await waitForReadiness("ignite", "Aldric: Ability unavailable");
  await evaluate("document.getElementById('command-ignite').click()");
  await waitForOrderReport("Ignite — Ability unavailable");

  await evaluate("document.getElementById('target-moonwell').click()");
  await evaluate("document.getElementById('roster-priest-1').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      await evaluate<string>("document.body.dataset.targetId || ''") === "moonwell" &&
      await evaluate<string>("document.body.dataset.selectedCount || ''") === "1"
    ) break;
    await Bun.sleep(25);
  }
  requireCondition(await evaluate<string>("document.body.dataset.targetId || ''") === "moonwell", "Moonwell target choice did not settle");
  await waitForReadiness("ward", "Mara: Ready");
  await evaluate("document.getElementById('command-ward').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.wards?.moonwell ?? 0") > 0) break;
    await Bun.sleep(25);
  }
  const wardRemaining = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.wards?.moonwell ?? 0");
  requireCondition(wardRemaining > 0, "Mara's ward did not become active on the exact Moonwell target");
  await waitForOrderReport("Ward — Accepted");
  await evaluate("document.getElementById('command-ward').click()");
  await waitForOrderReport("Ward — Cooling down");
  await waitForReadiness("ward", "Mara: Cooling down");
  requireCondition(await evaluate<boolean>("/\\d\\.\\ds/.test(document.getElementById('roster-priest-1').textContent)"), "action cooldown was not visible on Mara's roster card");
  await waitForCooldowns(["priest-1"]);
  const beforeHeal = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.moonwell ?? -1");
  await evaluate("document.getElementById('command-heal').click()");
  let afterHeal = beforeHeal;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    afterHeal = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.moonwell ?? -1");
    if (afterHeal > beforeHeal + 20) break;
    await Bun.sleep(25);
  }
  requireCondition(afterHeal > beforeHeal + 20, `Mara's source-owned healing did not restore the Moonwell (${beforeHeal} -> ${afterHeal})`);
  console.log("RTS command feedback passed: processed acceptance/rejection, Ignite capability, selection, target, readiness and cooldown");
  await evaluate("document.querySelector('#command-readiness summary').click()");
  await screenshot("build/acceptance/m3-live-battle.png");

  await evaluate("document.getElementById('select-all').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.selectedCount || ''") === String(expectedUnitCount)) break;
    await Bun.sleep(25);
  }
  await waitForCooldowns(["warrior-1", "artificer-1", "rogue-1", "priest-1", "ranger-1"]);
  const strike = async (targetId: string): Promise<void> => {
    await evaluate(`document.getElementById(${JSON.stringify(`target-${targetId}`)}).click()`);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate<string>("document.body.dataset.targetId || ''") === targetId) break;
      await Bun.sleep(25);
    }
    await evaluate("document.getElementById('command-attack').click()");
  };
  await strike("cinder-1");
  await waitForActionCycle(["warrior-1", "artificer-1", "rogue-1", "priest-1", "ranger-1"]);
  await evaluate("document.getElementById('command-attack').click()");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const health = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1'] ?? 100");
    if (health <= 0) break;
    await Bun.sleep(25);
  }
  const firstCinderHealth = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1'] ?? 100");
  const combatTrace = await evaluate<unknown[]>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='action-requested'||e.phase==='target-requested'||e.phase==='projection').slice(-20)");
  requireCondition(
    firstCinderHealth <= 0,
    `the selected party did not defeat the first exact cinder target (health=${firstCinderHealth}, trace=${JSON.stringify(combatTrace)})`,
  );
  await waitForCooldowns(["warrior-1", "artificer-1", "rogue-1", "priest-1", "ranger-1"]);
  await strike("cinder-2");
  await waitForActionCycle(["warrior-1", "artificer-1", "rogue-1", "priest-1", "ranger-1"]);
  await evaluate("document.getElementById('command-attack').click()");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.encounterPhase || ''") === "Moonwell restored") break;
    await Bun.sleep(25);
  }
  requireCondition(
    await evaluate<string>("document.body.dataset.encounterPhase || ''") === "Moonwell restored",
    "meaningful target/ward/heal/attack play did not reach the visible victory state",
  );
  await screenshot("build/acceptance/m3-victory.png");
  await evaluate("document.getElementById('equipment-toggle').click()");
  requireCondition(await evaluate<boolean>("document.getElementById('equipment-panel').classList.contains('open')"), "equipment panel did not open");
  requireCondition(await evaluate<number>("document.querySelectorAll('#equipment-panel .gear-slot').length") === 20, "equipment paper doll is incomplete");
  requireCondition(await evaluate<boolean>("document.querySelector('#command-move') !== null && document.querySelector('#equipment-toggle') !== null"), "RTS command controls are incomplete");
  console.log(`RTS browser journey passed: ${expectedUnitCount} projected units, exact/box selection and formation, autonomous Moonwell pressure, exact targets, ward/heal/attack interaction, and visible victory`);
} finally {
  socket?.close(); chrome.kill();
  server?.kill();
  await Promise.all([chrome.exited, server?.exited]);
}
