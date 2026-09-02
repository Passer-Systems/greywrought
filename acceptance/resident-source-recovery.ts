const sourcePath = `/tmp/greywrought-resident-source-recovery-${process.pid}.clause`;
const port = 4174;
const debugPort = 9238;
const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";

interface GenerationPayload {
  readonly generation: number;
  readonly cwr1: string;
}

interface BrowserSnapshot {
  readonly playerX: number | null;
  readonly playerZ: number | null;
  readonly residentGeneration: number | null;
  readonly residentPhase: string;
  readonly residentSourcePhase: string;
  readonly residentMessage: string;
}

interface BrowserDriver {
  readonly chrome: ReturnType<typeof Bun.spawn>;
  readonly socket: WebSocket;
  call(method: string, params?: unknown): Promise<any>;
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
    } catch {}
    await Bun.sleep(25);
  }
  throw new Error("resident recovery server did not become reachable");
}

async function generationAfter(after: number): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/resident-generation?after=${after}`, {
    cache: "no-store",
  });
}

async function openBrowser(): Promise<BrowserDriver> {
  const chrome = Bun.spawn({
    cmd: [
      chromePath,
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=/tmp/greywrought-source-recovery-browser-${process.pid}`,
      "--window-size=1156,1095",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "about:blank",
    ],
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break;
    } catch {}
    await Bun.sleep(25);
  }
  const tabResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?about:blank`,
    { method: "PUT" },
  );
  requireCondition(tabResponse.ok, "Chrome did not open the recovery page");
  const tab = (await tabResponse.json()) as { webSocketDebuggerUrl?: string };
  requireCondition(
    typeof tab.webSocketDebuggerUrl === "string",
    "Chrome recovery page omitted its debugger URL",
  );
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve) => (socket.onopen = () => resolve()));
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
  const call = (method: string, params: unknown = {}): Promise<any> => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => {
        throw new Error(`browser did not answer ${method} within 15 seconds`);
      }),
    ]);
  };
  await call("Runtime.enable");
  await call("Page.enable");
  const pageLoaded = new Promise<void>((resolve) => {
    pageLoadResolver = resolve;
  });
  await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  const loadFinished = await Promise.race([
    pageLoaded.then(() => true),
    Bun.sleep(15_000).then(() => false),
  ]);
  requireCondition(loadFinished, "recovery page did not finish loading");
  return { chrome, socket, call };
}

async function browserSnapshot(driver: BrowserDriver): Promise<BrowserSnapshot> {
  const response = await driver.call("Runtime.evaluate", {
    expression: `JSON.stringify({
      playerX: Number.isFinite(Number(document.body.dataset.gamePlayerX))
        ? Number(document.body.dataset.gamePlayerX) : null,
      playerZ: Number.isFinite(Number(document.body.dataset.gamePlayerZ))
        ? Number(document.body.dataset.gamePlayerZ) : null,
      residentGeneration: Number.isFinite(Number(document.body.dataset.residentGeneration))
        ? Number(document.body.dataset.residentGeneration) : null,
      residentPhase: document.body.dataset.residentPhase ?? "",
      residentSourcePhase: document.body.dataset.residentSourcePhase ?? "",
      residentMessage: document.getElementById("resident-law")?.textContent ?? ""
    })`,
    returnByValue: true,
  });
  return JSON.parse(response.result.result.value as string) as BrowserSnapshot;
}

async function waitForBrowser(
  driver: BrowserDriver,
  predicate: (snapshot: BrowserSnapshot) => boolean,
  failure: string,
): Promise<BrowserSnapshot> {
  let latest: BrowserSnapshot | null = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    latest = await browserSnapshot(driver);
    if (predicate(latest)) return latest;
    await Bun.sleep(50);
  }
  throw new Error(`${failure}: ${JSON.stringify(latest)}`);
}

const validSource = await Bun.file("src/world/embodied-encounter.clause").text();
await Bun.write(sourcePath, validSource);
const server = Bun.spawn({
  cmd: ["bun", "build/host/play-server.js"],
  cwd: process.cwd(),
  env: {
    ...Bun.env,
    GREYWROUGHT_PORT: String(port),
    GREYWROUGHT_RESIDENT_SOURCE: sourcePath,
  },
  stdout: "ignore",
  stderr: "inherit",
});
let browser: BrowserDriver | null = null;

try {
  await waitForServer();
  const initialResponse = await generationAfter(-1);
  requireCondition(initialResponse.ok, `initial generation returned ${initialResponse.status}`);
  const initial = (await initialResponse.json()) as GenerationPayload;
  requireCondition(Number.isSafeInteger(initial.generation), "initial generation was absent");
  requireCondition(initial.cwr1.length > 0, "initial generation had no CWR1 payload");

  const validBytes = new TextEncoder().encode(validSource);
  const invalidBytes = new Uint8Array(validBytes.length + 1);
  invalidBytes.set(validBytes);
  invalidBytes[validBytes.length] = 0xff;
  await Bun.write(sourcePath, invalidBytes);
  const rejectedForActive = await generationAfter(initial.generation);
  requireCondition(
    rejectedForActive.status === 204,
    `active browser received ${rejectedForActive.status} for rejected source`,
  );
  requireCondition(
    rejectedForActive.headers.get("X-Greywrought-Source-State") === "rejected",
    "active browser was not told that the source candidate was rejected",
  );

  const freshResponse = await generationAfter(-1);
  requireCondition(
    freshResponse.ok,
    `fresh browser could not recover the admitted generation: ${freshResponse.status}`,
  );
  const fresh = (await freshResponse.json()) as GenerationPayload;
  requireCondition(
    fresh.generation === initial.generation && fresh.cwr1 === initial.cwr1,
    "fresh browser did not receive the last admitted generation",
  );

  browser = await openBrowser();
  await waitForBrowser(
    browser,
    (snapshot) =>
      snapshot.residentGeneration === initial.generation &&
      snapshot.residentPhase === "session-started" &&
      snapshot.residentSourcePhase === "rejected",
    "browser did not retain the admitted generation",
  );
  await browser.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    code: "KeyR",
    key: "r",
    windowsVirtualKeyCode: 82,
    nativeVirtualKeyCode: 82,
  });
  const playableWhileRejected = await waitForBrowser(
    browser,
    (snapshot) => snapshot.playerX !== null && snapshot.playerZ !== null,
    "retained generation did not begin playing after keyboard input",
  );
  await browser.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    code: "KeyW",
    key: "w",
    windowsVirtualKeyCode: 87,
    nativeVirtualKeyCode: 87,
  });
  await Bun.sleep(500);
  await browser.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    code: "KeyW",
    key: "w",
    windowsVirtualKeyCode: 87,
    nativeVirtualKeyCode: 87,
  });
  const movedWhileRejected = await waitForBrowser(
    browser,
    (snapshot) =>
      snapshot.playerX !== null &&
      snapshot.playerZ !== null &&
      playableWhileRejected.playerX !== null &&
      playableWhileRejected.playerZ !== null &&
      Math.hypot(
        snapshot.playerX - playableWhileRejected.playerX,
        snapshot.playerZ - playableWhileRejected.playerZ,
      ) > 0.01,
    "keyboard movement stopped while the source candidate was rejected",
  );

  await Bun.write(sourcePath, `${validSource}\n`);
  const repairedResponse = await generationAfter(initial.generation);
  requireCondition(repairedResponse.ok, `repaired source returned ${repairedResponse.status}`);
  const repaired = (await repairedResponse.json()) as GenerationPayload;
  requireCondition(
    repaired.generation > initial.generation && repaired.cwr1.length > 0,
    "repaired source did not advance to a fresh admitted generation",
  );

  const settledResponse = await generationAfter(repaired.generation);
  requireCondition(settledResponse.status === 204, "settled generation did not become current");
  requireCondition(
    settledResponse.headers.get("X-Greywrought-Source-State") === null,
    "source rejection remained after a valid repair",
  );
  const recoveredBrowser = await waitForBrowser(
    browser,
    (snapshot) =>
      snapshot.residentGeneration === repaired.generation &&
      snapshot.residentSourcePhase === "active" &&
      snapshot.residentPhase === "session-started",
    "browser did not admit the repaired source generation",
  );
  console.log(
    JSON.stringify({
      initialGeneration: initial.generation,
      retainedGeneration: fresh.generation,
      repairedGeneration: repaired.generation,
      movementDuringRejection: Math.hypot(
        movedWhileRejected.playerX! - playableWhileRejected.playerX!,
        movedWhileRejected.playerZ! - playableWhileRejected.playerZ!,
      ),
      recoveredResidentPhase: recoveredBrowser.residentPhase,
    }),
  );
} finally {
  browser?.socket.close();
  browser?.chrome.kill();
  if (browser !== null) await browser.chrome.exited;
  server.kill();
  await server.exited;
  await Bun.file(sourcePath).delete();
}
