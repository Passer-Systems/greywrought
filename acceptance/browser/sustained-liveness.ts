const chromePath =
  "/nix/store/mjf5jfq69yjprs4cq5dq5dafvf44c3nv-google-chrome-151.0.7922.173/bin/google-chrome";
const debugPort = 9236;
const gameUrl = "http://127.0.0.1:4173/";
const journeyMillis = Number.parseInt(
  Bun.env.GREYWROUGHT_LIVENESS_MILLIS ?? "120000",
  10,
);

type MovementKey = "KeyW" | "KeyA" | "KeyS" | "KeyD";

type Snapshot = Readonly<{
  now: number;
  phase: string;
  residentPhase: string;
  residentMessage: string;
  rigState: string;
  rigFailureMessage: string;
  playerX: number;
  playerZ: number;
  latestRenderAt: number;
  latestAdmissionAt: number;
  latestHeartbeatAt: number;
  latestKeyboardAt: number;
  frameGaps: readonly Record<string, unknown>[];
  renderStalls: readonly Record<string, unknown>[];
  mainThreadStalls: readonly Record<string, unknown>[];
  longTasks: readonly Record<string, unknown>[];
  recentEvents: readonly Record<string, unknown>[];
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
    `--user-data-dir=/tmp/greywrought-cdp-liveness-${process.pid}`,
    "--window-size=1156,1095",
    "--use-angle=gl",
    "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break;
    } catch {}
    await Bun.sleep(50);
  }
  const tabResponse = await fetch(`${debugPortUrl()}/json/new?${gameUrl}`, {
    method: "PUT",
  });
  requireCondition(tabResponse.ok, "Chrome did not open the Greywrought tab");
  const tab = (await tabResponse.json()) as { webSocketDebuggerUrl?: string };
  requireCondition(
    typeof tab.webSocketDebuggerUrl === "string",
    "Chrome tab omitted its debugger URL",
  );

  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const exceptions: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          "unknown browser exception",
      );
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  await new Promise<void>((resolve) => (socket!.onopen = () => resolve()));
  const call = (method: string, params: any = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    const response = new Promise<any>((resolve) => pending.set(id, resolve));
    return Promise.race([
      response,
      Bun.sleep(3_000).then(() => {
        throw new Error(`browser main thread did not answer ${method} within 3 seconds`);
      }),
    ]);
  };

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__GREYWROUGHT_LONG_TASKS__ = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__GREYWROUGHT_LONG_TASKS__.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
            name: entry.name,
          });
        }
      }).observe({ type: "longtask", buffered: true });
    `,
  });
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

  const dispatchKey = (type: "keyDown" | "keyUp", code: string) => {
    const key = code.slice(-1).toLowerCase();
    const keyCode = key.toUpperCase().charCodeAt(0);
    return call("Input.dispatchKeyEvent", {
      type,
      code,
      key,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
  };
  const press = async (code: string) => {
    await dispatchKey("keyDown", code);
    await dispatchKey("keyUp", code);
  };
  const snapshot = async (eventsSince = -1): Promise<Snapshot> => {
    const result = await call("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const events = window.__GREYWROUGHT_GAME_EVENTS__ ?? [];
        const latest = (phase) => events.findLast((event) => event.phase === phase)?.atMillis ?? -1;
        return {
          now: performance.now(),
          phase: document.body.dataset.gamePhase,
          residentPhase: document.body.dataset.residentPhase,
          residentMessage: document.getElementById("resident-law")?.textContent ?? "",
          rigState: document.body.dataset.rigState,
          rigFailureMessage: document.body.dataset.rigFailureMessage ?? "",
          playerX: Number(document.body.dataset.gamePlayerX),
          playerZ: Number(document.body.dataset.gamePlayerZ),
          latestRenderAt: latest("frame-rendered"),
          latestAdmissionAt: latest("frame-admitted"),
          latestHeartbeatAt: latest("worker-heartbeat"),
          latestKeyboardAt: latest("keyboard-observed"),
          frameGaps: events.filter((event) => event.phase === "frame-gap" && event.atMillis >= ${eventsSince}),
          renderStalls: events.filter((event) => event.phase === "render-stall" && event.atMillis >= ${eventsSince}),
          mainThreadStalls: events.filter((event) =>
            (event.phase === "projection-main-thread-stall" || event.phase === "projection-transport-stall") &&
            event.atMillis >= ${eventsSince}
          ),
          longTasks: (window.__GREYWROUGHT_LONG_TASKS__ ?? []).filter((entry) => entry.startTime >= ${eventsSince}),
          recentEvents: events.slice(-24),
        };
      })())`,
      returnByValue: true,
    });
    return JSON.parse(result.result.result.value as string) as Snapshot;
  };

  await press("KeyR");
  let initial: Snapshot | null = null;
  let lastInitial: Snapshot | null = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = await snapshot();
    lastInitial = value;
    if (
      Number.isFinite(value.playerX) &&
      value.latestRenderAt >= 0 &&
      value.latestAdmissionAt >= 0 &&
      value.latestHeartbeatAt >= 0
    ) {
      initial = value;
      break;
    }
    await Bun.sleep(50);
  }
  requireCondition(
    initial !== null,
    `resident game liveness did not initialize: ${JSON.stringify({ exceptions, lastInitial })}`,
  );

  const directions: readonly MovementKey[] = ["KeyW", "KeyD", "KeyS", "KeyA"];
  let directionIndex = 0;
  let held = directions[directionIndex]!;
  await dispatchKey("keyDown", held);
  const startedAt = performance.now();
  let directionChangedAt = startedAt;
  let lastAttackAt = startedAt;
  let lastCameraAt = startedAt;
  let lastPositionChangeAt = startedAt;
  let priorX = initial.playerX;
  let priorZ = initial.playerZ;
  const journeyPageStartedAt = initial.now;
  let samples = 0;
  let resets = 0;
  let maxRenderAge = 0;
  let maxAdmissionAge = 0;
  let maxHeartbeatAge = 0;
  const frameGaps = new Set<string>();
  const renderStalls = new Set<string>();
  const mainThreadStalls = new Set<string>();
  const longTasks = new Set<string>();

  while (performance.now() - startedAt < journeyMillis) {
    const value = await snapshot(journeyPageStartedAt);
    samples += 1;
    requireCondition(
      value.residentPhase !== "rejected",
      `resident Clause session rejected during sustained play: ${value.residentMessage}\n${JSON.stringify(value.recentEvents)}`,
    );
    requireCondition(
      value.rigState !== "failed",
      `rig failed during sustained play: ${value.rigFailureMessage}`,
    );
    const renderAge = value.now - value.latestRenderAt;
    const admissionAge = value.now - value.latestAdmissionAt;
    const heartbeatAge = value.now - value.latestHeartbeatAt;
    maxRenderAge = Math.max(maxRenderAge, renderAge);
    maxAdmissionAge = Math.max(maxAdmissionAge, admissionAge);
    maxHeartbeatAge = Math.max(maxHeartbeatAge, heartbeatAge);
    requireCondition(renderAge < 1_000, `render RAF stalled for ${renderAge} ms`);
    requireCondition(admissionAge < 1_500, `admitted simulation stalled for ${admissionAge} ms`);
    requireCondition(heartbeatAge < 2_000, `resident worker stalled for ${heartbeatAge} ms`);

    if (Math.hypot(value.playerX - priorX, value.playerZ - priorZ) > 0.001) {
      lastPositionChangeAt = performance.now();
      priorX = value.playerX;
      priorZ = value.playerZ;
    }
    requireCondition(
      performance.now() - lastPositionChangeAt < 2_500,
      `WASD was observed but position did not change for ${Math.round(performance.now() - lastPositionChangeAt)} ms`,
    );
    for (const event of value.frameGaps) frameGaps.add(JSON.stringify(event));
    for (const event of value.renderStalls) renderStalls.add(JSON.stringify(event));
    for (const event of value.mainThreadStalls) mainThreadStalls.add(JSON.stringify(event));
    for (const event of value.longTasks) longTasks.add(JSON.stringify(event));

    if (value.phase === "failed" || value.phase === "completed") {
      await dispatchKey("keyUp", held);
      await press("KeyR");
      await dispatchKey("keyDown", held);
      resets += 1;
      lastPositionChangeAt = performance.now();
    }
    if (performance.now() - directionChangedAt >= 5_000) {
      await dispatchKey("keyUp", held);
      directionIndex = (directionIndex + 1) % directions.length;
      held = directions[directionIndex]!;
      await dispatchKey("keyDown", held);
      directionChangedAt = performance.now();
    }
    if (performance.now() - lastAttackAt >= 3_000) {
      await press("KeyJ");
      lastAttackAt = performance.now();
    }
    if (performance.now() - lastCameraAt >= 10_000) {
      await call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: 500,
        y: 400,
        button: "left",
        clickCount: 1,
      });
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: 530,
        y: 385,
        button: "left",
        buttons: 1,
      });
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: 530,
        y: 385,
        button: "left",
        clickCount: 1,
      });
      lastCameraAt = performance.now();
    }
    await Bun.sleep(250);
  }

  await dispatchKey("keyUp", held);
  requireCondition(exceptions.length === 0, `browser exceptions: ${exceptions.join("\n")}`);
  requireCondition(
    frameGaps.size === 0,
    `${frameGaps.size} render frame gaps observed: ${[...frameGaps].join("\n")}` +
      `\nprojection stalls: ${[...mainThreadStalls].join("\n")}` +
      `\nlong tasks: ${[...longTasks].join("\n")}`,
  );
  requireCondition(
    renderStalls.size === 0,
    `${renderStalls.size} blocking renders observed: ${[...renderStalls].join("\n")}`,
  );
  console.log(
    JSON.stringify({
      durationMillis: Math.round(performance.now() - startedAt),
      samples,
      resets,
      maxRenderAge: Math.round(maxRenderAge),
      maxAdmissionAge: Math.round(maxAdmissionAge),
      maxHeartbeatAge: Math.round(maxHeartbeatAge),
      frameGaps: frameGaps.size,
      renderStalls: renderStalls.size,
      exceptions: exceptions.length,
    }),
  );
} finally {
  socket?.close();
  chrome.kill();
}

function debugPortUrl(): string {
  return `http://127.0.0.1:${debugPort}`;
}
