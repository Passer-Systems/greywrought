const chromePath =
  "/nix/store/mjf5jfq69yjprs4cq5dq5dafvf44c3nv-google-chrome-151.0.7922.173/bin/google-chrome";
const debugPort = 9234;

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
    "--user-data-dir=/tmp/greywrought-cdp-playability",
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
    `http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:4173/`,
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
  await call("Page.navigate", { url: "http://127.0.0.1:4173/" });
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
      })`,
      returnByValue: true,
    });
    return JSON.parse(result.result.result.value as string) as {
      phase: string;
      playerX: number;
      swordSequence: number;
      swordClock: number;
      frames: number;
      heartbeats: number;
      frameGaps: readonly unknown[];
    };
  };

  await key("keyDown", "KeyR", "r", 82);
  await key("keyUp", "KeyR", "r", 82);
  await Bun.sleep(500);
  const reset = await snapshot();
  await key("keyDown", "KeyD", "d", 68);
  await Bun.sleep(500);
  await key("keyUp", "KeyD", "d", 68);
  const afterMove = await snapshot();
  requireCondition(
    afterMove.playerX > reset.playerX,
    `WASD movement did not advance player x (${reset.playerX} → ${afterMove.playerX})`,
  );

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
  console.log(JSON.stringify(result));
} finally {
  socket?.close();
  chrome.kill();
}
