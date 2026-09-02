const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9239;
const gameUrl = "http://127.0.0.1:4173/";

type Snapshot = Readonly<{
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  admittedFrames: number;
  residentPhase: string;
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
    `--user-data-dir=/tmp/greywrought-cdp-camera-${process.pid}`,
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
      chromeReady = (
        await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      ).ok;
      if (chromeReady) break;
    } catch {}
    await Bun.sleep(50);
  }
  requireCondition(chromeReady, "Chrome did not open its debugging port");

  const tabResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?about:blank`,
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
  const pending = new Map<number, (value: unknown) => void>();
  let pageLoadResolver: (() => void) | null = null;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; method?: string };
    if (message.method === "Page.loadEventFired") {
      pageLoadResolver?.();
      pageLoadResolver = null;
    }
    if (message.id === undefined) return;
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  await new Promise<void>((resolve) => (socket!.onopen = () => resolve()));

  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<unknown>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => {
        throw new Error(`browser main thread did not answer ${method}`);
      }),
    ]);
  };
  const key = (type: "keyDown" | "keyUp", code: string, key: string) =>
    call("Input.dispatchKeyEvent", { type, code, key });
  const snapshot = async (): Promise<Snapshot> => {
    const response = (await call("Runtime.evaluate", {
      expression: `JSON.stringify({
        playerX: Number(document.body.dataset.gamePlayerX),
        playerZ: Number(document.body.dataset.gamePlayerZ),
        cameraYaw: Number(document.body.dataset.gameCameraOrbitYaw),
        admittedFrames: (window.__GREYWROUGHT_GAME_EVENTS__ ?? []).filter((event) => event.phase === "frame-admitted").length,
        residentPhase: document.body.dataset.residentPhase,
      })`,
      returnByValue: true,
    })) as { result?: { result?: { value?: string } } };
    const encoded = response.result?.result?.value;
    requireCondition(
      typeof encoded === "string",
      `snapshot evaluation returned no value: ${JSON.stringify(response)}`,
    );
    return JSON.parse(encoded) as Snapshot;
  };
  const waitFor = async (
    condition: (value: Snapshot) => boolean,
    message: string,
  ): Promise<Snapshot> => {
    let last: Snapshot | null = null;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const value = await snapshot();
      last = value;
      if (condition(value)) return value;
      await Bun.sleep(50);
    }
    throw new Error(`${message}: ${JSON.stringify(last)}`);
  };

  await call("Runtime.enable");
  await call("Page.enable");
  const pageLoaded = new Promise<void>((resolve) => {
    pageLoadResolver = resolve;
  });
  await call("Page.navigate", { url: gameUrl });
  const loadFinished = await Promise.race([
    pageLoaded.then(() => true),
    Bun.sleep(15_000).then(() => false),
  ]);
  requireCondition(loadFinished, "Greywrought page did not finish loading");
  await waitFor(
    (value) => value.residentPhase === "session-started",
    "resident session did not start",
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 500,
    y: 400,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 500,
    y: 400,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await key("keyDown", "KeyR", "r");
  await key("keyUp", "KeyR", "r");
  const reset = await waitFor(
    (value) => Number.isFinite(value.playerX) && value.admittedFrames > 0,
    "reset did not open an admitted game projection",
  );

  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 350,
    y: 400,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 664,
    y: 400,
    button: "left",
    buttons: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 664,
    y: 400,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  const rotated = await waitFor(
    (value) => value.cameraYaw < -1.4 && value.admittedFrames >= reset.admittedFrames + 2,
    "camera rotation or its Clause scalar inputs did not settle",
  );

  await key("keyDown", "KeyW", "w");
  await Bun.sleep(500);
  await key("keyUp", "KeyW", "w");
  const moved = await waitFor(
    (value) => value.admittedFrames > rotated.admittedFrames + 2,
    "camera-relative W input did not reach Admission",
  );
  const deltaX = moved.playerX - rotated.playerX;
  const deltaZ = moved.playerZ - rotated.playerZ;
  requireCondition(
    deltaX > 0.75,
    `rotated-camera W moved ${deltaX.toFixed(3)} on x instead of forward`,
  );
  requireCondition(
    Math.abs(deltaZ) < Math.abs(deltaX) * 0.35,
    `rotated-camera W leaked ${deltaZ.toFixed(3)} on z for ${deltaX.toFixed(3)} x`,
  );

  console.log(JSON.stringify({ reset, rotated, moved, deltaX, deltaZ }));
} finally {
  socket?.close();
  chrome.kill();
}
