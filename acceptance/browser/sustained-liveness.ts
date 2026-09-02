const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9237;
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
  pendingInputCount: number;
  pendingObservationCount: number;
  workbenchPhase: string;
  receivedInputCount: number;
  acceptedInputCount: number;
  maximumInputQueueDepth: number;
  inputBackpressureCount: number;
  eventCount: number;
  contextLosses: number;
  contextRestores: number;
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
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
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
  const tabResponse = await fetch(`${debugPortUrl()}/json/new?about:blank`, {
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
  const targetCrashes: string[] = [];
  let pageLoadResolver: (() => void) | null = null;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Page.loadEventFired") {
      pageLoadResolver?.();
      pageLoadResolver = null;
    }
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          "unknown browser exception",
      );
    }
    if (message.method === "Inspector.targetCrashed") {
      targetCrashes.push(JSON.stringify(message.params ?? {}));
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
      Bun.sleep(15_000).then(() => {
        throw new Error(`browser main thread did not answer ${method} within 15 seconds`);
      }),
    ]);
  };

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Inspector.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__GREYWROUGHT_LONG_TASKS__ = [];
      window.__GREYWROUGHT_CONTEXT_LOSSES__ = 0;
      window.__GREYWROUGHT_CONTEXT_RESTORES__ = 0;
      document.addEventListener("webglcontextlost", () => {
        window.__GREYWROUGHT_CONTEXT_LOSSES__ += 1;
      }, true);
      document.addEventListener("webglcontextrestored", () => {
        window.__GREYWROUGHT_CONTEXT_RESTORES__ += 1;
      }, true);
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
  const pageLoaded = new Promise<void>((resolve) => {
    pageLoadResolver = resolve;
  });
  await call("Page.navigate", { url: gameUrl });
  const loadFinished = await Promise.race([
    pageLoaded.then(() => true),
    Bun.sleep(15_000).then(() => false),
  ]);
  requireCondition(loadFinished, "Greywrought page did not finish loading");
  let residentStarted = false;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await call("Runtime.evaluate", {
      expression: `document.body.dataset.residentPhase`,
      returnByValue: true,
    });
    if (response.result?.result?.value === "session-started") {
      residentStarted = true;
      break;
    }
    await Bun.sleep(50);
  }
  requireCondition(residentStarted, "resident session did not start before input");
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
    const key =
      code === "Space"
        ? " "
        : code === "Tab"
          ? "Tab"
          : code.startsWith("Shift")
            ? "Shift"
            : code.slice(-1).toLowerCase();
    const keyCode =
      code === "Space"
        ? 32
        : code === "Tab"
          ? 9
          : code.startsWith("Shift")
            ? 16
            : key.toUpperCase().charCodeAt(0);
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
        const heartbeat = events.findLast((event) => event.phase === "worker-heartbeat") ?? {};
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
          pendingInputCount: Number(heartbeat.pendingInputCount),
          pendingObservationCount: Number(heartbeat.pendingObservationCount),
          workbenchPhase: String(heartbeat.workbenchPhase ?? "absent"),
          receivedInputCount: Number(heartbeat.receivedInputCount),
          acceptedInputCount: Number(heartbeat.acceptedInputCount),
          maximumInputQueueDepth: Number(heartbeat.maximumInputQueueDepth),
          inputBackpressureCount: Number(heartbeat.inputBackpressureCount),
          eventCount: events.length,
          contextLosses: window.__GREYWROUGHT_CONTEXT_LOSSES__ ?? 0,
          contextRestores: window.__GREYWROUGHT_CONTEXT_RESTORES__ ?? 0,
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
  for (let attempt = 0; attempt < 240; attempt += 1) {
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
  let lastBurstAt = startedAt;
  let lastJumpAt = startedAt;
  let lastTargetAt = startedAt;
  let lastCameraAt = startedAt;
  let lastFocusCycleAt = startedAt;
  let lastResetAt = startedAt;
  let lastScreenshotAt = startedAt;
  let lastPositionChangeAt = startedAt;
  let priorX = initial.playerX;
  let priorZ = initial.playerZ;
  const journeyPageStartedAt = initial.now;
  let samples = 0;
  let resets = 0;
  let maxRenderAge = 0;
  let maxAdmissionAge = 0;
  let maxHeartbeatAge = 0;
  let maxPendingInputCount = 0;
  let maxPendingObservationCount = 0;
  let maximumInputQueueDepth = 0;
  let inputBackpressureCount = 0;
  let screenshots = 0;
  let unchangedScreenshots = 0;
  let priorScreenshot = "";
  let initialHeapBytes = 0;
  let maximumHeapBytes = 0;
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
    requireCondition(
      value.contextLosses === 0,
      `WebGL context was lost ${value.contextLosses} time(s) and restored ${value.contextRestores} time(s)`,
    );
    requireCondition(
      targetCrashes.length === 0,
      `browser target crashed: ${targetCrashes.join("\n")}`,
    );
    requireCondition(
      value.eventCount <= 512,
      `browser event telemetry grew past its 512-entry bound to ${value.eventCount}`,
    );
    const renderAge = value.now - value.latestRenderAt;
    const admissionAge = value.now - value.latestAdmissionAt;
    const heartbeatAge = value.now - value.latestHeartbeatAt;
    maxRenderAge = Math.max(maxRenderAge, renderAge);
    maxAdmissionAge = Math.max(maxAdmissionAge, admissionAge);
    maxHeartbeatAge = Math.max(maxHeartbeatAge, heartbeatAge);
    maxPendingInputCount = Math.max(
      maxPendingInputCount,
      value.pendingInputCount,
    );
    maxPendingObservationCount = Math.max(
      maxPendingObservationCount,
      value.pendingObservationCount,
    );
    maximumInputQueueDepth = Math.max(
      maximumInputQueueDepth,
      value.maximumInputQueueDepth,
    );
    inputBackpressureCount = Math.max(
      inputBackpressureCount,
      value.inputBackpressureCount,
    );
    requireCondition(renderAge < 5_000, `render RAF stalled for ${renderAge} ms`);
    requireCondition(admissionAge < 5_000, `admitted simulation stalled for ${admissionAge} ms`);
    requireCondition(heartbeatAge < 5_000, `resident worker stalled for ${heartbeatAge} ms`);
    requireCondition(
      value.acceptedInputCount <= value.receivedInputCount,
      `worker accepted ${value.acceptedInputCount} inputs after receiving only ${value.receivedInputCount}`,
    );
    requireCondition(
      value.pendingInputCount <= 16,
      `worker input queue grew to ${value.pendingInputCount}: ${JSON.stringify(value.recentEvents)}`,
    );

    if (Math.hypot(value.playerX - priorX, value.playerZ - priorZ) > 0.001) {
      lastPositionChangeAt = performance.now();
      priorX = value.playerX;
      priorZ = value.playerZ;
    }
    const positionStallMillis = performance.now() - lastPositionChangeAt;
    requireCondition(
      positionStallMillis < 5_000,
      `WASD was observed but position did not change: ${JSON.stringify({
        elapsedMillis: Math.round(performance.now() - startedAt),
        positionStallMillis: Math.round(positionStallMillis),
        held,
        priorX,
        priorZ,
        snapshot: value,
      })}`,
    );
    for (const event of value.frameGaps) {
      if (Number(event.gapMillis) >= 5_000) frameGaps.add(JSON.stringify(event));
    }
    for (const event of value.renderStalls) {
      if (Number(event.durationMillis) >= 5_000) renderStalls.add(JSON.stringify(event));
    }
    for (const event of value.mainThreadStalls) mainThreadStalls.add(JSON.stringify(event));
    for (const event of value.longTasks) longTasks.add(JSON.stringify(event));

    if (value.phase === "failed" || value.phase === "completed") {
      await press("KeyR");
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
      for (let pressIndex = 0; pressIndex < 8; pressIndex += 1) {
        await press("KeyJ");
        await Bun.sleep(20);
      }
      lastAttackAt = performance.now();
    }
    if (performance.now() - lastBurstAt >= 4_000) {
      await press("KeyQ");
      await press("KeyF");
      lastBurstAt = performance.now();
    }
    if (performance.now() - lastJumpAt >= 6_000) {
      await press("Space");
      lastJumpAt = performance.now();
    }
    if (performance.now() - lastTargetAt >= 7_000) {
      await press("Tab");
      lastTargetAt = performance.now();
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
    if (performance.now() - lastFocusCycleAt >= 15_000) {
      await call("Runtime.evaluate", {
        expression: "window.dispatchEvent(new Event('blur'))",
      });
      await dispatchKey("keyUp", held);
      await dispatchKey("keyDown", held);
      lastFocusCycleAt = performance.now();
      lastPositionChangeAt = performance.now();
    }
    if (performance.now() - lastResetAt >= 20_000) {
      await press("KeyR");
      resets += 1;
      lastResetAt = performance.now();
      lastPositionChangeAt = performance.now();
    }
    if (performance.now() - lastScreenshotAt >= 5_000) {
      const captured = await call("Page.captureScreenshot", {
        format: "jpeg",
        quality: 35,
        fromSurface: true,
      });
      const screenshot = captured.result.data as string;
      screenshots += 1;
      if (screenshot === priorScreenshot) unchangedScreenshots += 1;
      else unchangedScreenshots = 0;
      priorScreenshot = screenshot;
      const heap = await call("Runtime.getHeapUsage");
      const usedHeapBytes = heap.result.usedSize as number;
      if (initialHeapBytes === 0) initialHeapBytes = usedHeapBytes;
      maximumHeapBytes = Math.max(maximumHeapBytes, usedHeapBytes);
      requireCondition(
        maximumHeapBytes - initialHeapBytes < 128 * 1024 * 1024,
        `browser heap grew by ${maximumHeapBytes - initialHeapBytes} bytes`,
      );
      requireCondition(
        unchangedScreenshots < 2,
        "two consecutive five-second visual samples were pixel-identical",
      );
      lastScreenshotAt = performance.now();
    }
    await Bun.sleep(250);
  }

  await dispatchKey("keyUp", held);
  requireCondition(exceptions.length === 0, `browser exceptions: ${exceptions.join("\n")}`);
  requireCondition(targetCrashes.length === 0, `browser target crashes: ${targetCrashes.join("\n")}`);
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
      maxPendingInputCount,
      maxPendingObservationCount,
      maximumInputQueueDepth,
      inputBackpressureCount,
      screenshots,
      initialHeapBytes,
      maximumHeapBytes,
      maximumHeapGrowthBytes: maximumHeapBytes - initialHeapBytes,
      contextLosses: 0,
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
