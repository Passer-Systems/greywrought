const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9248;
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
    `--user-data-dir=/tmp/greywrought-cdp-rts-loss-${process.pid}`,
    "--window-size=1280,900",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await Bun.sleep(50);
  }
  requireCondition(ready, "idle-loss Chrome debugging port did not open");
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: "PUT",
    signal: AbortSignal.timeout(10_000),
  });
  requireCondition(tabResponse.ok, "idle-loss Chrome could not open a tab");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "idle-loss tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const browserErrors: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    }
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("idle-loss CDP WebSocket timeout"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(10_000).then(() => {
        pending.delete(id);
        throw new Error(`idle-loss CDP timeout in ${method}; browser errors: ${browserErrors.join(" | ") || "none"}`);
      }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true });
    return (result.result?.result?.value ?? null) as T;
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: gameUrl });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.gamePhase || ''") === "ready") break;
    await Bun.sleep(50);
  }
  requireCondition(
    await evaluate<string>("document.body.dataset.gamePhase || ''") === "ready",
    "idle-loss page did not become ready",
  );
  await evaluate("document.getElementById('begin-encounter').click()");
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await evaluate<string>("document.body.dataset.encounterPhase || ''") === "Moonwell lost") break;
    await Bun.sleep(50);
  }
  const phase = await evaluate<string>("document.body.dataset.encounterPhase || ''");
  const moonwell = await evaluate<number>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.moonwell ?? 999");
  const playerActions = await evaluate<string[]>("(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='action-requested').map(e=>e.action)");
  requireCondition(phase === "Moonwell lost", `idle source policy did not reach visible defeat (phase=${phase}, moonwell=${moonwell})`);
  requireCondition(moonwell <= 0, `visible defeat did not follow actual Moonwell damage (${moonwell})`);
  requireCondition(playerActions.join(",") === "BeginEncounter", `idle journey issued gameplay actions: ${playerActions.join(",")}`);
  requireCondition(browserErrors.length === 0, `idle-loss browser errors: ${browserErrors.join(" | ")}`);
  console.log(`RTS idle-loss journey passed: autonomous Clause policy reduced Moonwell to ${moonwell.toFixed(2)} and exposed defeat`);
} finally {
  socket?.close();
  chrome.kill();
}
