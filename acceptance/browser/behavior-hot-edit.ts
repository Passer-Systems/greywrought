const chromePath =
  "/nix/store/mjf5jfq69yjprs4cq5dq5dafvf44c3nv-google-chrome-151.0.7922.173/bin/google-chrome";
const debugPort = 9236;
const gameUrl = "http://127.0.0.1:4173/";
const expectedBehaviors = [
  "patient-charge",
  "relentless-charge",
  "patient-charge",
  "relentless-charge",
] as const;

type ResidentEvent = Readonly<{
  phase: string;
  generation: number;
  latencyMillis: number;
  compilerMicros: number;
}>;

type Snapshot = Readonly<{
  behavior: string;
  generation: number;
  residentPhase: string;
  residentMessage: string;
  timeOrigin: number;
  residentEvents: readonly ResidentEvent[];
  gameEvents: readonly Record<string, unknown>[];
  renderStalls: number;
}>;

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const chrome = Bun.spawn({
  cmd: [
    chromePath,
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=/tmp/greywrought-cdp-behavior-hot-edit-${process.pid}`,
    "--window-size=1156,1095",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  let chromeReady = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) {
        chromeReady = true;
        break;
      }
    } catch {}
    await Bun.sleep(50);
  }
  requireCondition(chromeReady, "Chrome did not expose its debugger endpoint");

  const tabResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${gameUrl}`,
    { method: "PUT" },
  );
  requireCondition(tabResponse.ok, "Chrome did not open the Greywrought tab");
  const tab = (await tabResponse.json()) as { webSocketDebuggerUrl?: string };
  requireCondition(
    typeof tab.webSocketDebuggerUrl === "string",
    "Chrome tab omitted its debugger URL",
  );

  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  await new Promise<void>((resolve) => (socket!.onopen = () => resolve()));
  const call = (method: string, params: any = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return new Promise<any>((resolve) => pending.set(id, resolve));
  };
  await call("Runtime.enable");
  await call("Page.navigate", { url: gameUrl });
  await Bun.sleep(2_500);
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 500,
    y: 400,
    button: "left",
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 500,
    y: 400,
    button: "left",
    clickCount: 1,
  });
  for (const type of ["keyDown", "keyUp"] as const) {
    await call("Input.dispatchKeyEvent", {
      type,
      code: "KeyR",
      key: "r",
      windowsVirtualKeyCode: 82,
      nativeVirtualKeyCode: 82,
    });
  }

  const snapshot = async (): Promise<Snapshot> => {
    const result = await call("Runtime.evaluate", {
      expression: `JSON.stringify({
        behavior: document.body.dataset.gameEnemyBehavior,
        generation: Number(document.body.dataset.residentGeneration),
        residentPhase: document.body.dataset.residentPhase,
        residentMessage: document.getElementById("resident-law")?.textContent ?? "",
        timeOrigin: performance.timeOrigin,
        residentEvents: window.__GREYWROUGHT_RESIDENT_EVENTS__ ?? [],
        gameEvents: (window.__GREYWROUGHT_GAME_EVENTS__ ?? []).slice(-64),
        renderStalls: (window.__GREYWROUGHT_GAME_EVENTS__ ?? []).filter((event) => event.phase === "render-stall").length,
      })`,
      returnByValue: true,
    });
    return JSON.parse(result.result.result.value as string) as Snapshot;
  };

  let baseline: Snapshot | null = null;
  let lastBaseline: Snapshot | null = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await snapshot();
    lastBaseline = value;
    if (
      value.behavior === "relentless-charge" &&
      Number.isSafeInteger(value.generation) &&
      value.generation > 0 &&
      value.residentPhase !== "rejected"
    ) {
      baseline = value;
      break;
    }
    await Bun.sleep(50);
  }
  requireCondition(
    baseline !== null,
    `baseline relentless behavior did not become admitted: ${JSON.stringify(lastBaseline)}`,
  );
  console.log(
    JSON.stringify({
      phase: "ready-for-edit",
      behavior: baseline.behavior,
      generation: baseline.generation,
    }),
  );

  const timeOrigin = baseline.timeOrigin;
  let priorGeneration = baseline.generation;
  const samples: ResidentEvent[] = [];
  for (const expectedBehavior of expectedBehaviors) {
    let admitted: ResidentEvent | null = null;
    let observed: Snapshot | null = null;
    let lastObserved: Snapshot | null = null;
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const value = await snapshot();
      lastObserved = value;
      requireCondition(
        value.residentPhase !== "rejected",
        `resident source generation was rejected during the hot edit: ${value.residentMessage}`,
      );
      requireCondition(value.timeOrigin === timeOrigin, "the browser page restarted");
      admitted =
        value.residentEvents.find(
          (event) =>
            event.phase === "admitted" && event.generation > priorGeneration,
        ) ?? null;
      if (admitted !== null && value.behavior === expectedBehavior) {
        observed = value;
        break;
      }
      await Bun.sleep(10);
    }
    requireCondition(
      admitted !== null && observed !== null,
      `did not observe admitted ${expectedBehavior}: ${JSON.stringify(lastObserved)}`,
    );
    requireCondition(
      admitted.generation === observed.generation,
      `browser projected generation ${observed.generation} after admitting ${admitted.generation}`,
    );
    requireCondition(observed.renderStalls === 0, "the renderer stalled during hot edit");
    samples.push(admitted);
    priorGeneration = admitted.generation;
    console.log(
      JSON.stringify({
        phase: "edit-admitted",
        behavior: expectedBehavior,
        generation: admitted.generation,
        latencyMillis: admitted.latencyMillis,
        compilerMicros: admitted.compilerMicros,
        nonCompilerMillis:
          admitted.latencyMillis - admitted.compilerMicros / 1_000,
        lifecycle: observed.residentEvents.filter(
          (event) => event.generation === admitted.generation,
        ),
      }),
    );
  }

  const ordered = samples.map((sample) => sample.latencyMillis).sort((a, b) => a - b);
  const medianLatencyMillis = (ordered[1]! + ordered[2]!) / 2;
  requireCondition(
    samples.every((sample) => sample.latencyMillis < 250),
    `hot edits took ${samples.map((sample) => sample.latencyMillis).join(", ")} ms instead of under 250 ms`,
  );
  console.log(
    JSON.stringify({
      phase: "complete",
      mode: "hot-resident-source-to-admitted-browser",
      budgetMillis: 250,
      medianLatencyMillis,
      samples,
    }),
  );
} finally {
  socket?.close();
  chrome.kill();
  await chrome.exited;
}
