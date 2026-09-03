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
        shieldEnergy: Number(document.body.dataset.gameShieldEnergy),
        shieldRadius: Number(document.body.dataset.gameShieldRadius),
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
      shieldEnergy: number;
      shieldRadius: number;
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
      expression: `(() => {
        const account = document.getElementById("entry-account");
        const creator = document.getElementById("entry-creator");
        const roster = document.getElementById("entry-roster");
        if (account && !account.hidden) {
          const input = document.getElementById("entry-display-name");
          input.value = "Conference Tester";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          document.getElementById("entry-account-form").requestSubmit();
        } else if (creator && !creator.hidden) {
          document.querySelector('[data-entry-archetype="warrior"]')?.click();
          const input = document.getElementById("entry-character-name");
          input.value = "Ashward";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          document.getElementById("entry-character-form").requestSubmit();
        } else if (roster && !roster.hidden) {
          document.getElementById("entry-enter-world")?.click();
        }
      })()`,
    });
    await Bun.sleep(100);
    initial = await snapshot();
  }
  requireCondition(
    initial.archetype === "warrior",
    `Warrior selection did not settle: ${JSON.stringify(initial)} ${exceptions.join(" | ")}`,
  );
  requireCondition(initial.renderFailures === 0, "resident projection failed before attack test");

  const shieldSamples: Array<{ energy: number; radius: number }> = [];
  await key("keyDown", "Digit1", "1", 49);
  let tapped = await snapshot();
  for (let attempt = 0; attempt < 40 && tapped.swordSequence === initial.swordSequence; attempt += 1) {
    await Bun.sleep(25);
    tapped = await snapshot();
  }
  shieldSamples.push({ energy: tapped.shieldEnergy, radius: tapped.shieldRadius });
  requireCondition(
    tapped.swordSequence === initial.swordSequence + 1,
    `fresh Digit1 down did not actuate exactly once (${initial.swordSequence} → ${tapped.swordSequence}): ${JSON.stringify({ initial, tapped })}`,
  );
  await key("keyDown", "KeyE", "e", 69);
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
  shieldSamples.push({ energy: held.shieldEnergy, radius: held.shieldRadius });
  requireCondition(
    held.swordSequence === tapped.swordSequence,
    `held/repeated Digit1 actuated more than once (${tapped.swordSequence} → ${held.swordSequence}): ${JSON.stringify({ tapped, held })}`,
  );
  requireCondition(held.playerX < initial.playerX, "movement did not continue during held attack test");
  requireCondition(held.renderFailures === 0, "resident projection failed during attack test");
  await key("keyDown", "KeyD", "d", 68);
  await Bun.sleep(100);
  await key("keyUp", "KeyD", "d", 68);
  await Bun.sleep(100);
  const walked = await snapshot();
  shieldSamples.push({ energy: walked.shieldEnergy, radius: walked.shieldRadius });
  requireCondition(
    walked.swordSequence === held.swordSequence,
    `walking without Digit1 actuated Attack (${held.swordSequence} → ${walked.swordSequence})`,
  );
  await key("keyUp", "KeyE", "e", 69);
  requireCondition(
    shieldSamples.at(-1)!.energy < shieldSamples[0]!.energy &&
      shieldSamples.every((value, index) => index === 0 ||
        (value.energy <= shieldSamples[index - 1]!.energy &&
          value.radius <= shieldSamples[index - 1]!.radius)),
    `held shield energy/radius was not monotonic: ${JSON.stringify(shieldSamples)}`,
  );
  requireCondition(exceptions.length === 0, exceptions.join("\n"));
  console.log(
    `Attack edge passed: down ${initial.swordSequence}→${tapped.swordSequence}, ` +
      `hold ${tapped.swordSequence}→${held.swordSequence}, ` +
      `walk ${held.swordSequence}→${walked.swordSequence}.`,
  );
} finally {
  socket?.close();
  chrome.kill();
  await chrome.exited;
}
