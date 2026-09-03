const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const gameUrl = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4180/greywrought/";
const debugPort = 9243;

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
    `--user-data-dir=/tmp/greywrought-audio-output-${process.pid}`,
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
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "Chrome omitted its debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const exceptions: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(String(message.params?.exceptionDetails?.text ?? "unknown exception"));
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
  const evaluate = async <T>(expression: string): Promise<T> => {
    const response = await call("Runtime.evaluate", { expression, returnByValue: true });
    return response.result?.result?.value as T;
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: gameUrl });

  let choice = await evaluate<{ x: number; y: number; visible: boolean }>(`(() => {
    const button = document.querySelector('[data-archetype="mage"]');
    const rect = button?.getBoundingClientRect();
    return { x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.top + rect.height / 2 : 0, visible: Boolean(rect && rect.width > 0 && rect.height > 0) };
  })()`);
  for (let attempt = 0; attempt < 100 && !choice.visible; attempt += 1) {
    await Bun.sleep(100);
    choice = await evaluate(`(() => {
      const button = document.querySelector('[data-archetype="mage"]');
      const rect = button?.getBoundingClientRect();
      return { x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.top + rect.height / 2 : 0, visible: Boolean(rect && rect.width > 0 && rect.height > 0) };
    })()`);
  }
  requireCondition(choice.visible, "Mage choice did not render");
  let before = await evaluate<{ resident?: string; unlocked?: string; volume?: string }>(`({
    resident: document.body.dataset.residentPhase,
    unlocked: document.body.dataset.audioUnlocked,
    volume: document.body.dataset.audioMasterVolume,
  })`);
  for (
    let attempt = 0;
    attempt < 240 && (before.volume === undefined || before.resident !== "session-started");
    attempt += 1
  ) {
    await Bun.sleep(50);
    before = await evaluate(`({
      resident: document.body.dataset.residentPhase,
      unlocked: document.body.dataset.audioUnlocked,
      volume: document.body.dataset.audioMasterVolume,
    })`);
  }
  requireCondition(before.unlocked === undefined, "audio unlocked before a user gesture");
  requireCondition(before.volume === "0.72", `initial master volume was ${before.volume}`);
  requireCondition(before.resident === "session-started", `resident reached ${before.resident}`);

  await call("Runtime.evaluate", {
    expression: `document.querySelector('[data-archetype="mage"]').click()`,
    userGesture: true,
  });

  const snapshot = () => evaluate<{
    archetype?: string;
    context?: string;
    unlocked?: string;
    muted?: string;
    volume?: string;
    rms: number;
    peak: number;
    active?: string;
    cueCount: number;
    cue?: string;
  }>(`({
    archetype: document.body.dataset.archetype,
    context: document.body.dataset.audioContextState,
    unlocked: document.body.dataset.audioUnlocked,
    muted: document.body.dataset.audioMuted,
    volume: document.body.dataset.audioMasterVolume,
    rms: Number(document.body.dataset.audioOutputRms ?? 0),
    peak: Number(document.body.dataset.audioOutputPeakRms ?? 0),
    active: document.body.dataset.audioOutputActive,
    cueCount: Number(document.body.dataset.audioCueCount ?? 0),
    cue: document.body.dataset.lastAudioCue,
  })`);
  let output = await snapshot();
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      output.archetype === "mage" &&
      output.context === "running" &&
      output.active === "true" &&
      output.peak >= 0.01
    ) break;
    await Bun.sleep(100);
    output = await snapshot();
  }
  requireCondition(output.archetype === "mage", `character selection reached ${output.archetype}`);
  requireCondition(output.unlocked === "true" && output.context === "running", "selection did not start WebAudio");
  requireCondition(output.muted === "false" && output.volume === "0.72", "master output remained muted or misreported");
  requireCondition(output.active === "true" && output.peak >= 0.01, `post-compressor RMS remained ${output.rms}, peak ${output.peak}`);

  const cueCountBefore = output.cueCount;
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    code: "Digit2",
    key: "2",
    windowsVirtualKeyCode: 50,
    nativeVirtualKeyCode: 50,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    code: "Digit2",
    key: "2",
    windowsVirtualKeyCode: 50,
    nativeVirtualKeyCode: 50,
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    output = await snapshot();
    if (output.cue !== undefined && output.cueCount > cueCountBefore) break;
    await Bun.sleep(25);
  }
  requireCondition(
    output.cue !== undefined && output.cueCount > cueCountBefore,
    `Mage action scheduled no clear combat cue: ${JSON.stringify(output)}`,
  );
  requireCondition(exceptions.length === 0, `browser exceptions: ${exceptions.join("; ")}`);
  console.log(JSON.stringify(output));
} finally {
  socket?.close();
  chrome.kill();
}

export {};
