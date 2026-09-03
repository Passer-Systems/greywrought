const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4197/";
const debugPort = 9247;
const chrome = Bun.spawn({
  cmd: [
    Bun.env.CHROME_PATH ?? "google-chrome",
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=/tmp/greywrought-nameplates-${process.pid}`,
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
  if (!tabResponse.ok) throw new Error("Chrome did not open the game");
  const tab = (await tabResponse.json()) as { webSocketDebuggerUrl?: string };
  if (tab.webSocketDebuggerUrl === undefined) throw new Error("missing debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (message: any) => void>();
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
  await call("Page.enable");
  await call("Page.navigate", { url: gameUrl });
  await Bun.sleep(1800);
  const key = (type: "keyDown" | "keyUp", code: string, key: string) =>
    call("Input.dispatchKeyEvent", { type, code, key });
  await key("keyDown", "F1", "F1");
  await key("keyUp", "F1", "F1");
  await key("keyDown", "KeyD", "d");
  await Bun.sleep(2200);
  await key("keyUp", "KeyD", "d");
  await Bun.sleep(600);
  const evaluated = await call("Runtime.evaluate", {
    returnByValue: true,
    expression: `JSON.stringify([...document.querySelectorAll('.enemy-nameplate')].map((node) => ({
      id: node.dataset.enemyId,
      hidden: node.hidden,
      name: node.querySelector('.enemy-nameplate-name')?.textContent,
      health: node.querySelector('.enemy-nameplate-health > span')?.style.transform,
      alive: node.dataset.alive === 'true',
      targeted: node.classList.contains('targeted')
    })))`,
  });
  const entries = JSON.parse(evaluated.result.result.value) as Array<{
    id: string;
    hidden: boolean;
    name: string;
    health: string;
    alive: boolean;
    targeted: boolean;
  }>;
  if (entries.length !== 3) throw new Error(`expected 3 nameplates, got ${entries.length}`);
  const living = entries.filter(({ alive }) => alive);
  if (living.length < 2) throw new Error(`expected both active boars projected, got ${living.length}`);
  if (living.some(({ name, health }) => name.length === 0 || !health.startsWith("scaleX("))) {
    throw new Error("living nameplate omitted its name or health projection");
  }
  if (living.filter(({ targeted }) => targeted).length !== 1) {
    throw new Error("target emphasis is not exclusive");
  }
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  const screenshotBytes = screenshot.result.data.length;
  if (screenshotBytes < 5000) throw new Error("captured screenshot was empty");
  console.log(JSON.stringify({ entries, screenshotBytes }));
} finally {
  socket?.close();
  chrome.kill();
  await chrome.exited;
}
