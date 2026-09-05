import { CLAUSE_COMMIT } from "../../scripts/clause-pin.js";

const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9252;
const gamePort = 4186;
const gameUrl = `http://127.0.0.1:${gamePort}/?measure=1`;
const fixture = "build/measurement/m5-baseline-source.clause";
const output = Bun.env.GREYWROUGHT_MEASUREMENT_OUTPUT ?? "build/measurement/m5-baseline.json";
const windowMillis = 2_500;
const rendererMode = Bun.env.GREYWROUGHT_MEASUREMENT_RENDERER ?? "swiftshader";
if (rendererMode !== "swiftshader" && rendererMode !== "hardware") {
  throw new Error("GREYWROUGHT_MEASUREMENT_RENDERER must be swiftshader or hardware");
}
const rendererFlags = rendererMode === "hardware"
  ? ["--enable-gpu"]
  : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"];

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { samples: sorted.length, median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? null };
}

function lifecycleDurations(events: readonly Record<string, any>[], startName: string, endName: string): number[] {
  const starts = new Map<number, number>();
  const durations: number[] = [];
  for (const event of events) {
    if (event.metric !== "lifecycle" || typeof event.operationId !== "number") continue;
    if (event.event === startName) starts.set(event.operationId, event.workerEpochMillis);
    if (event.event === endName && starts.has(event.operationId)) {
      durations.push(event.workerEpochMillis - starts.get(event.operationId)!);
    }
  }
  return durations;
}

await Bun.write(fixture, await Bun.file("src/world/embodied-encounter.clause").arrayBuffer());
const server = Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: { ...process.env, GREYWROUGHT_PORT: String(gamePort), GREYWROUGHT_RESIDENT_SOURCE: fixture },
  stdout: "pipe",
  stderr: "inherit",
});
const chrome = Bun.spawn({
  cmd: [
    chromePath, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=/tmp/greywrought-cdp-measure-${process.pid}`,
    "--window-size=1280,900", ...rendererFlags, "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${gamePort}/`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  requireCondition(tabResponse.ok, "measurement Chrome tab did not open");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "measurement tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("measurement CDP socket timed out"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => { throw new Error(`measurement CDP timeout in ${method}`); }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const message = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text);
    return message.result?.result?.value as T;
  };
  const waitFor = async <T>(expression: string, accept: (value: T) => boolean, label: string, attempts = 400): Promise<T> => {
    let value = await evaluate<T>(expression);
    for (let attempt = 0; attempt < attempts && !accept(value); attempt += 1) {
      await Bun.sleep(25);
      value = await evaluate<T>(expression);
    }
    requireCondition(accept(value), `${label} did not settle: ${JSON.stringify(value)}`);
    return value;
  };
  const click = (id: string) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: gameUrl });
  await waitFor<string>("document.body?.dataset.gamePhase || ''", (value) => value === "ready", "measurement world ready");
  await Bun.sleep(2_000);

  const browser = await evaluate<Record<string, unknown>>(`(() => {
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl');
    const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return { userAgent:navigator.userAgent, hardwareConcurrency:navigator.hardwareConcurrency,
      renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      viewport:[innerWidth,innerHeight], dpr:devicePixelRatio };
  })()`);
  if (rendererMode === "hardware") {
    requireCondition(typeof browser.renderer === "string" &&
      !/unavailable|swiftshader|llvmpipe|software/i.test(browser.renderer),
      "hardware measurement has no hardware renderer: " + JSON.stringify(browser));
  }
  const rawWindows: Array<Record<string, unknown>> = [];
  const observe = async (label: string): Promise<void> => {
    // The browser uses a bounded ring for long-lived opt-in sessions. Reset at
    // each explicit observation boundary so eviction cannot invalidate an
    // absolute index captured after a slow SwiftShader warm-up.
    await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
    const start = Date.now();
    await Bun.sleep(windowMillis);
    const events = await evaluate<Record<string, any>[]>("window.__GREYWROUGHT_MEASUREMENTS__.slice()");
    const durationMillis = Date.now() - start;
    const raf = events.filter((event) => event.metric === "raf-interval").map((event) => event.durationMillis);
    const projection = events.filter((event) => event.metric === "projection-to-hud").map((event) => event.durationMillis);
    const transport = events.filter((event) => event.metric === "worker-to-main").map((event) => event.durationMillis);
    const candidates = lifecycleDurations(events, "candidate-requested", "candidate-produced");
    const admissionDurations = lifecycleDurations(events, "admission-requested", "admission-accepted");
    const receivedCandidateRequests = events.filter(
      (event) => event.metric === "lifecycle" && event.event === "candidate-requested",
    ).length;
    const admissions = events.filter(
      (event) => event.metric === "lifecycle" && event.event === "admission-accepted",
    );
    const firstAdmission = admissions[0];
    const lastAdmission = admissions.at(-1);
    const contiguous = firstAdmission !== undefined && admissions.length > 1 && admissions.every((event, index) =>
      event.activeGeneration === firstAdmission.activeGeneration &&
      event.operationId === firstAdmission.operationId + index);
    const admittedClock = contiguous && firstAdmission !== undefined && lastAdmission !== undefined ? {
      intervals: admissions.length - 1,
      fixedTickAdvanceMillis: (admissions.length - 1) * 16,
      workerWallMillis: lastAdmission.workerEpochMillis - firstAdmission.workerEpochMillis,
      sourceSecondsPerWallSecond: (admissions.length - 1) * 16 /
        (lastAdmission.workerEpochMillis - firstAdmission.workerEpochMillis),
    } : null;
    rawWindows.push({ label, durationMillis, events, summary: {
      rafIntervalsMillis: distribution(raf),
      observedFps: raf.length / (durationMillis / 1_000),
      projectionToHudMillis: distribution(projection),
      workerToMainMillis: distribution(transport),
      candidateRuntimeMillis: distribution(candidates),
      admissionMillis: distribution(admissionDurations),
      receivedCandidateRequests,
      receivedCandidateRequestsPerWallSecond: receivedCandidateRequests / (durationMillis / 1_000),
      admittedClock,
    }});
  };

  await observe("ready");
  await click("select-all");
  const canvas = await evaluate<{ x: number; y: number; width: number; height: number }>(
    `(() => { const r=document.getElementById('world-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`,
  );
  const moveX = canvas.x + canvas.width * 0.72;
  const moveY = canvas.y + canvas.height * 0.45;
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: moveX, y: moveY, button: "right", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: moveX, y: moveY, button: "right", clickCount: 1 });
  await waitFor<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='move-requested').length", (value) => value > 0, "normal move input");
  await observe("movement");

  await click("begin-encounter");
  await waitFor<string>("document.body.dataset.encounterPhase || ''", (value) => value === "Battle joined", "active encounter");
  await click("target-moonwell");
  await click("roster-priest-1");
  await click("command-ward");
  await waitFor<number>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.wards?.moonwell || 0",
    (value) => value > 0,
    "normal Ward admission",
  );
  await observe("active-encounter");

  await evaluate(`(() => {
    const catalog=document.getElementById('scalar-effect-catalog');
    const option=[...catalog.options].find(candidate=>candidate.textContent.startsWith('0.0 - ?damage ·'));
    if(!option) throw new Error('measurement effect absent');
    catalog.value=option.value; catalog.dispatchEvent(new Event('change'));
  })()`);
  const edits: Array<Record<string, unknown>> = [];
  for (const expression of ["0.0 - (?damage * 2.0)", "0.0 - ?damage", "0.0 - (?damage * 2.0)"]) {
    const before = await evaluate<Record<string, unknown>>(`({
      generation:Number(document.body.dataset.residentGeneration),
      expression:document.getElementById('scalar-effect-expression').value,
      phase:document.body.dataset.encounterPhase
    })`);
    await evaluate(`document.getElementById('scalar-effect-expression').value=${JSON.stringify(expression)}`);
    await click("edit-double-damage");
    const visible = await waitFor<Record<string, any>>(
      `(window.__GREYWROUGHT_GAME_EVENTS__||[]).findLast(e=>e.phase==='live-edit-visible'&&e.generation>${Number(before.generation)}) || {}`,
      (value) => Number.isFinite(value.elapsedMillis),
      `visible edit ${expression}`,
      800,
    );
    edits.push({ before, expression, afterGeneration: visible.generation, clickToVisibleMillis: visible.elapsedMillis,
      nativeCompilerMillis: visible.compilerMillis, wasmTransferMillis: visible.runtimeMillis });
  }

  const cgroupPath = (await Bun.file("/proc/self/cgroup").text()).trim().split(":").at(-1) ?? "";
  const cgroupRoot = `/sys/fs/cgroup${cgroupPath}`;
  const readLimit = async (name: string) => (await Bun.file(`${cgroupRoot}/${name}`).exists())
    ? (await Bun.file(`${cgroupRoot}/${name}`).text()).trim() : "unavailable";
  const artifact = {
    schema: "greywrought-m5-baseline-v2",
    recordedAt: new Date().toISOString(),
    conditions: { browser, fixedTickMillis: 16, renderAspirationMillis: 16.67, warmupMillis: 2_000, windowMillis,
      rendererMode, rendererFlags, clausePin: CLAUSE_COMMIT },
    cgroup: { path: cgroupPath, cpuMax: await readLimit("cpu.max"), memoryHigh: await readLimit("memory.high"), memoryMax: await readLimit("memory.max"), pidsMax: await readLimit("pids.max") },
    windows: rawWindows,
    edits,
    replayActionRecipe: { inputs: ["Select Company", "right-click ground", "Begin defence", "Moonwell target", "Priest", "Ward"],
      editExpressions: ["0.0 - (?damage * 2.0)", "0.0 - ?damage", "0.0 - (?damage * 2.0)"] },
  };
  await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ output, windows: rawWindows.map((window) => ({ label: window.label, summary: window.summary })), edits }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
