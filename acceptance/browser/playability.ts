const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9234;
const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4173/";

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
    `--user-data-dir=/tmp/greywrought-cdp-playability-${process.pid}`,
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
  let pageLoadResolver: (() => void) | null = null;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Page.loadEventFired") {
      pageLoadResolver?.();
      pageLoadResolver = null;
    }
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
  await call("Page.enable");
  await call("Page.navigate", { url: gameUrl });
  await Bun.sleep(2500);
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

  const key = (type: string, code: string, key: string, keyCode: number) =>
    call("Input.dispatchKeyEvent", {
      type,
      code,
      key,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
  const snapshot = async () => {
    const result = await call("Runtime.evaluate", {
      expression: `JSON.stringify({
        phase: document.body.dataset.gamePhase,
        playerX: Number(document.body.dataset.gamePlayerX),
        swordSequence: Number(document.body.dataset.gameSwordActionSequence),
        swordClock: Number(document.body.dataset.gameSwordCommitmentClock),
        frames: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.phase === "frame-admitted").length,
        heartbeats: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.phase === "worker-heartbeat").length,
        frameGaps: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.phase === "frame-gap"),
        renderStalls: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.phase === "render-stall"),
        actionTrace: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.phase === "frame-admitted" && e.swordActionSequence > 0).map((e) => ({ atMillis: e.atMillis, sequence: e.swordActionSequence, clock: e.swordCommitmentClock })),
        timeline: window.__GREYWROUGHT_GAME_EVENTS__.filter((e) => e.atMillis >= 3500 && e.atMillis <= 8000).slice(-24),
        rigState: document.body.dataset.rigState,
        rigLoadStartedAt: Number(document.body.dataset.rigLoadStartedAt),
        rigReadyAt: Number(document.body.dataset.rigReadyAt),
        rigFailureMessage: document.body.dataset.rigFailureMessage,
        inputPreferences: document.body.dataset.inputPreferences,
        reducedMotion: document.body.dataset.reducedMotion,
        effectsVolume: document.body.dataset.effectsVolume,
        controlsVisible: Boolean(document.querySelector('[data-input-action="right"]')),
        gamePersistence: document.body.dataset.gamePersistence,
        campaignStored: localStorage.getItem("greywrought/campaign-v2") !== null,
        residentPhase: document.body.dataset.residentPhase,
      })`,
      returnByValue: true,
    });
    const serialized = result.result?.result?.value;
    return JSON.parse(typeof serialized === "string" ? serialized : "{}") as {
      phase: string;
      playerX: number;
      swordSequence: number;
      swordClock: number;
      frames: number;
      heartbeats: number;
      frameGaps: readonly unknown[];
      renderStalls: readonly unknown[];
      actionTrace: readonly unknown[];
      timeline: readonly unknown[];
      rigState: string | undefined;
      rigLoadStartedAt: number;
      rigReadyAt: number;
      rigFailureMessage: string | undefined;
      inputPreferences: string | undefined;
      reducedMotion: string | undefined;
      effectsVolume: string | undefined;
      controlsVisible: boolean;
      gamePersistence: string | undefined;
      campaignStored: boolean;
      residentPhase: string | undefined;
    };
  };
  const waitForProjection = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const value = await snapshot();
      if (Number.isFinite(value.playerX)) return value;
      await Bun.sleep(100);
    }
    throw new Error("resident projection did not become available");
  };

  await key("keyDown", "KeyR", "r", 82);
  await key("keyUp", "KeyR", "r", 82);
  const reset = await waitForProjection();
  let afterMove = reset;
  for (let attempt = 0; attempt < 4 && afterMove.playerX <= reset.playerX; attempt += 1) {
    await key("keyDown", "KeyD", "d", 68);
    await Bun.sleep(750);
    await key("keyUp", "KeyD", "d", 68);
    await Bun.sleep(100);
    afterMove = await snapshot();
  }
  requireCondition(
    afterMove.playerX > reset.playerX,
    `WASD movement did not advance player x (${reset.playerX} → ${afterMove.playerX})`,
  );

  await call("Runtime.evaluate", {
    expression: `document.querySelector('[data-input-action="right"]').click()`,
  });
  await key("keyDown", "KeyK", "k", 75);
  await key("keyUp", "KeyK", "k", 75);
  const beforeRemappedMove = await snapshot();
  await key("keyDown", "KeyK", "k", 75);
  await Bun.sleep(250);
  await key("keyUp", "KeyK", "k", 75);
  await Bun.sleep(100);
  const afterRemappedMove = await snapshot();
  requireCondition(
    afterRemappedMove.playerX > beforeRemappedMove.playerX,
    `remapped movement did not advance player x (${beforeRemappedMove.playerX} → ${afterRemappedMove.playerX})`,
  );
  await call("Runtime.evaluate", {
    expression: `document.getElementById("reduced-motion").click(); const volume = document.getElementById("effects-volume"); volume.value = "0"; volume.dispatchEvent(new Event("input", { bubbles: true }))`,
  });
  await key("keyDown", "KeyR", "r", 82);
  await key("keyUp", "KeyR", "r", 82);
  await Bun.sleep(250);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await key("keyDown", "KeyJ", "j", 74);
    await key("keyUp", "KeyJ", "j", 74);
    await Bun.sleep(120);
  }
  await Bun.sleep(500);
  const result = await snapshot();
  requireCondition(result.phase === "playing", `encounter reached ${result.phase}`);
  requireCondition(
    result.swordSequence === 1,
    `J mash admitted ${result.swordSequence} sword actions instead of one committed action`,
  );
  requireCondition(result.frames >= 20, `only ${result.frames} admitted frames observed`);
  requireCondition(result.heartbeats >= 2, `only ${result.heartbeats} worker heartbeats observed`);
  requireCondition(result.controlsVisible, "remappable controls are absent");
  requireCondition(result.inputPreferences === "saved", "input preferences did not persist");
  requireCondition(result.reducedMotion === "true", "reduced-motion preference did not apply");
  requireCondition(result.effectsVolume === "0", "effects-volume preference did not apply");
  await call("Runtime.evaluate", {
    expression: `localStorage.setItem("greywrought/campaign-v2", "damaged")`,
  });
  const pageLoaded = new Promise<void>((resolve) => {
    pageLoadResolver = resolve;
  });
  await call("Page.reload", { ignoreCache: true });
  const loaded = await Promise.race([
    pageLoaded.then(() => true),
    Bun.sleep(10_000).then(() => false),
  ]);
  requireCondition(loaded, "browser did not finish corrupt-save recovery reload");
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const value = await snapshot();
    if (value.residentPhase === "session-started") break;
    await Bun.sleep(50);
  }
  await key("keyDown", "KeyR", "r", 82);
  await key("keyUp", "KeyR", "r", 82);
  const recovered = await waitForProjection();
  requireCondition(
    recovered.gamePersistence === "recovered",
    `damaged campaign reached ${recovered.gamePersistence} instead of recovered`,
  );
  requireCondition(!recovered.campaignStored, "damaged campaign remained in storage");
  console.log(JSON.stringify({ ...result, campaignRecovery: recovered.gamePersistence }));
} finally {
  socket?.close();
  chrome.kill();
}
