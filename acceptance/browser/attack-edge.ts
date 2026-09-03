const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4173/";
const debugPort = 9240;

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
    `--user-data-dir=/tmp/greywrought-cdp-attack-edge-${process.pid}`,
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
    `http://127.0.0.1:${debugPort}/json/new?about:blank`,
    { method: "PUT" },
  );
  requireCondition(tabResponse.ok, "Chrome did not open the attack-edge tab");
  const tab = (await tabResponse.json()) as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "Chrome omitted its debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const exceptions: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params?.exceptionDetails?.exception?.description ?? "browser exception");
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
  const key = (
    type: "keyDown" | "keyUp",
    code: string,
    keyValue: string,
    keyCode: number,
    autoRepeat = false,
  ) => call("Input.dispatchKeyEvent", {
    type,
    code,
    key: keyValue,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    autoRepeat,
  });
  const snapshot = async () => {
    const result = await call("Runtime.evaluate", {
      expression: `JSON.stringify({
        phase: document.body.dataset.gamePhase,
        archetype: document.body.dataset.archetype,
        inputPreferences: document.body.dataset.inputPreferences,
        residentPhase: document.body.dataset.residentPhase,
        residentLaw: document.getElementById("resident-law")?.textContent,
        playerX: Number(document.body.dataset.gamePlayerX),
        swordSequence: Number(document.body.dataset.gameSwordActionSequence),
        swordClock: Number(document.body.dataset.gameSwordCommitmentClock),
        initialized: Array.isArray(window.__GREYWROUGHT_GAME_EVENTS__),
        renderFailures: Array.isArray(window.__GREYWROUGHT_GAME_EVENTS__)
          ? window.__GREYWROUGHT_GAME_EVENTS__.filter((event) => event.phase === "frame-render-failed").length
          : -1,
        keyboardEvents: Array.isArray(window.__GREYWROUGHT_GAME_EVENTS__)
          ? window.__GREYWROUGHT_GAME_EVENTS__.filter((event) => event.phase === "keyboard-observed").map((event) => ({ code: event.code, inputPhase: event.inputPhase, repeat: event.repeat }))
          : [],
        gamepads: Array.from(navigator.getGamepads()).filter(Boolean).map((gamepad) => gamepad.id)
      })`,
      returnByValue: true,
    });
    return JSON.parse(result.result?.result?.value ?? "{}") as {
      phase?: string;
      archetype?: string;
      inputPreferences?: string;
      residentPhase?: string;
      residentLaw?: string;
      playerX: number;
      swordSequence: number;
      swordClock: number;
      initialized: boolean;
      renderFailures: number;
      keyboardEvents: Array<{ code: string; inputPhase: string; repeat: boolean }>;
      gamepads: string[];
    };
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: gameUrl });
  let initial = await snapshot();
  for (let attempt = 0; attempt < 120 && !initial.initialized; attempt += 1) {
    await Bun.sleep(100);
    initial = await snapshot();
  }
  requireCondition(
    initial.initialized && exceptions.length === 0,
    `startApp did not initialize: ${JSON.stringify(initial)} ${exceptions.join(" | ")}`,
  );
  for (
    let attempt = 0;
    attempt < 80 && (!Number.isFinite(initial.playerX) || initial.archetype !== "warrior");
    attempt += 1
  ) {
    await call("Runtime.evaluate", {
      expression: `document.querySelector('[data-character-code="F1"]')?.click()`,
    });
    await Bun.sleep(100);
    initial = await snapshot();
  }
  requireCondition(
    initial.archetype === "warrior",
    `Warrior selection did not settle: ${JSON.stringify(initial)} ${exceptions.join(" | ")}`,
  );
  requireCondition(initial.renderFailures === 0, "resident projection failed before attack test");

  await key("keyDown", "KeyA", "a", 65);
  await Bun.sleep(100);
  await key("keyUp", "KeyA", "a", 65);
  await Bun.sleep(100);
  const walked = await snapshot();
  requireCondition(walked.playerX < initial.playerX, "walk input did not move the player");
  requireCondition(
    walked.swordSequence === initial.swordSequence,
    `walking actuated Attack (${initial.swordSequence} → ${walked.swordSequence}): ${JSON.stringify({ initial, walked })}`,
  );

  await key("keyDown", "Digit1", "1", 49);
  let tapped = await snapshot();
  for (let attempt = 0; attempt < 40 && tapped.swordSequence === walked.swordSequence; attempt += 1) {
    await Bun.sleep(25);
    tapped = await snapshot();
  }
  await key("keyUp", "Digit1", "1", 49);
  requireCondition(
    tapped.swordSequence === walked.swordSequence + 1,
    `one Digit1 tap did not actuate exactly once (${walked.swordSequence} → ${tapped.swordSequence}): ${JSON.stringify({ walked, tapped })}`,
  );
  let rearmed = tapped;
  for (let attempt = 0; attempt < 120 && rearmed.swordClock > 0; attempt += 1) {
    await Bun.sleep(25);
    rearmed = await snapshot();
  }
  requireCondition(rearmed.swordClock === 0, "Attack did not rearm before hold test");

  await key("keyDown", "Digit1", "1", 49);
  await key("keyDown", "KeyA", "a", 65);
  await Bun.sleep(100);
  await key("keyUp", "KeyA", "a", 65);
  for (let repeat = 0; repeat < 4; repeat += 1) {
    await Bun.sleep(100);
    await key("keyDown", "Digit1", "1", 49, true);
  }
  await key("keyUp", "Digit1", "1", 49);
  await Bun.sleep(150);
  const held = await snapshot();
  requireCondition(
    held.swordSequence === tapped.swordSequence + 1,
    `held/repeated Digit1 did not actuate exactly once (${tapped.swordSequence} → ${held.swordSequence}): ${JSON.stringify({ tapped, rearmed, held })}`,
  );
  requireCondition(held.playerX < walked.playerX, "movement did not continue during held attack test");
  requireCondition(held.renderFailures === 0, "resident projection failed during attack test");
  requireCondition(exceptions.length === 0, exceptions.join("\n"));
  console.log(
    `Attack edge passed: walk ${initial.swordSequence}→${walked.swordSequence}, ` +
      `tap ${walked.swordSequence}→${tapped.swordSequence}, ` +
      `hold ${tapped.swordSequence}→${held.swordSequence}.`,
  );
} finally {
  socket?.close();
  chrome.kill();
  await chrome.exited;
}
