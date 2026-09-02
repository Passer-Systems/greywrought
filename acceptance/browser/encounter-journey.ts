const chromePath =
  "/nix/store/mjf5jfq69yjprs4cq5dq5dafvf44c3nv-google-chrome-151.0.7922.173/bin/google-chrome";
const debugPort = 9235;
const gameUrl = "http://127.0.0.1:4173/";
const minimumJourneyMillis = 30_000;

type GameKey = "KeyW" | "KeyA" | "KeyS" | "KeyD";

type Snapshot = Readonly<{
  phase: string;
  residentPhase: string;
  custodyPhase: string;
  playerVitality: number;
  enemyVitality: number;
  enemyCombatStatus: string;
  lootState: string;
  custody: string;
  frontierAccess: string;
  footholdProgress: number;
  footholdRequirement: number;
  playerX: number;
  playerZ: number;
  boarX: number;
  boarZ: number;
  pressure: string;
  pressureClock: number;
  recoveryClock: number;
  swordSequence: number;
  swordClock: number;
  frames: number;
  heartbeats: number;
  latestHeartbeatTime: number;
  candidateReceipts: number;
  admissionReceipts: number;
  orderedAdmissionPairs: number;
  orderViolations: number;
  frameGaps: number;
  renderStalls: number;
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
    `--user-data-dir=/tmp/greywrought-cdp-encounter-${process.pid}`,
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
  const tabResponse = await fetch(`${debugPortUrl()}/json/new?${gameUrl}`, {
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
  await call("Page.navigate", { url: gameUrl });
  await Bun.sleep(2_500);
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
    const key = code === "Tab" ? "Tab" : code === "KeyR" ? "r" : code === "KeyJ" ? "j" : code.slice(-1).toLowerCase();
    const keyCode = code === "Tab" ? 9 : key.toUpperCase().charCodeAt(0);
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
  const held = new Set<GameKey>();
  const setHeld = async (desired: ReadonlySet<GameKey>) => {
    for (const code of [...held]) {
      if (desired.has(code)) continue;
      await dispatchKey("keyUp", code);
      held.delete(code);
    }
    for (const code of desired) {
      if (held.has(code)) continue;
      await dispatchKey("keyDown", code);
      held.add(code);
    }
  };
  const snapshot = async (): Promise<Snapshot> => {
    const result = await call("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const events = window.__GREYWROUGHT_GAME_EVENTS__ ?? [];
        const candidateIndexes = new Map();
        events.forEach((event, index) => {
          if (event.phase === "candidate-produced") {
            candidateIndexes.set(event.operation, index);
          }
        });
        const orderedAdmissions = events.filter((event, index) =>
          event.phase === "admission-accepted" &&
          candidateIndexes.has(event.operation) &&
          candidateIndexes.get(event.operation) < index
        );
        const reversedAdmissions = events.filter((event, index) =>
          event.phase === "admission-accepted" &&
          candidateIndexes.has(event.operation) &&
          candidateIndexes.get(event.operation) > index
        );
        return {
          phase: document.body.dataset.gamePhase,
          residentPhase: document.body.dataset.residentPhase,
          custodyPhase: document.body.dataset.gameCustodyPhase,
          playerVitality: Number(document.body.dataset.gamePlayerVitality),
          enemyVitality: Number(document.body.dataset.gameEnemyVitality),
          enemyCombatStatus: document.body.dataset.gameEnemyCombatStatus,
          lootState: document.body.dataset.gameLootState,
          custody: document.body.dataset.gameCustody,
          frontierAccess: document.body.dataset.gameFrontierAccess,
          footholdProgress: Number(document.body.dataset.gameFootholdProgress),
          footholdRequirement: Number(document.body.dataset.gameFootholdRequirement),
          playerX: Number(document.body.dataset.gamePlayerX),
          playerZ: Number(document.body.dataset.gamePlayerZ),
          boarX: Number(document.body.dataset.gameBoarX),
          boarZ: Number(document.body.dataset.gameBoarZ),
          pressure: document.body.dataset.gameEnemyPressure,
          pressureClock: Number(document.body.dataset.gamePressureClock),
          recoveryClock: Number(document.body.dataset.gameBoarRecoveryClock),
          swordSequence: Number(document.body.dataset.gameSwordActionSequence),
          swordClock: Number(document.body.dataset.gameSwordCommitmentClock),
          frames: events.filter((event) => event.phase === "frame-admitted").length,
          heartbeats: events.filter((event) => event.phase === "worker-heartbeat").length,
          latestHeartbeatTime: Number(events.findLast((event) => event.phase === "worker-heartbeat")?.workerTimeMillis),
          candidateReceipts: events.filter((event) => event.phase === "candidate-produced").length,
          admissionReceipts: events.filter((event) => event.phase === "admission-accepted").length,
          orderedAdmissionPairs: orderedAdmissions.length,
          orderViolations: reversedAdmissions.length,
          frameGaps: events.filter((event) => event.phase === "frame-gap").length,
          renderStalls: events.filter((event) => event.phase === "render-stall").length,
        };
      })())`,
      returnByValue: true,
    });
    return JSON.parse(result.result.result.value as string) as Snapshot;
  };
  const waitForProjection = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const value = await snapshot();
      if (
        Number.isFinite(value.playerX) &&
        value.residentPhase !== "rejected"
      ) {
        return value;
      }
      await Bun.sleep(50);
    }
    throw new Error("resident projection did not become available");
  };
  const movementToward = (
    value: Snapshot,
    targetX: number,
    targetZ: number,
    tolerance: number,
  ): ReadonlySet<GameKey> => {
    const desired = new Set<GameKey>();
    if (value.playerX < targetX - tolerance) desired.add("KeyD");
    if (value.playerX > targetX + tolerance) desired.add("KeyA");
    if (value.playerZ < targetZ - tolerance) desired.add("KeyS");
    if (value.playerZ > targetZ + tolerance) desired.add("KeyW");
    return desired;
  };
  const choosePerpendicularDodge = (value: Snapshot): GameKey => {
    const chargeX = value.playerX - value.boarX;
    const chargeZ = value.playerZ - value.boarZ;
    if (Math.abs(chargeX) >= Math.abs(chargeZ)) {
      return value.playerZ >= 0 ? "KeyW" : "KeyS";
    }
    return value.playerX >= 0 ? "KeyA" : "KeyD";
  };

  await press("KeyR");
  const reset = await waitForProjection();
  requireCondition(reset.phase === "playing", `reset reached ${reset.phase}`);

  const startedAt = performance.now();
  const trace: Array<Record<string, unknown>> = [];
  let priorSummary = "";
  let dodgeKey: GameKey | null = null;
  let lastAttackSequence = -1;
  let completed: Snapshot | null = null;
  let lastHeartbeatTime = Number.NaN;
  let observedHeartbeats = 0;

  while (performance.now() - startedAt < 50_000) {
    const value = await snapshot();
    if (
      Number.isFinite(value.latestHeartbeatTime) &&
      value.latestHeartbeatTime !== lastHeartbeatTime
    ) {
      lastHeartbeatTime = value.latestHeartbeatTime;
      observedHeartbeats += 1;
    }
    const summary = [
      value.phase,
      value.pressure,
      value.enemyVitality,
      value.lootState,
      value.custody,
      value.frontierAccess,
      value.footholdProgress,
      value.swordSequence,
    ].join(":");
    if (summary !== priorSummary) {
      trace.push({
        atMillis: Math.round(performance.now() - startedAt),
        phase: value.phase,
        pressure: value.pressure,
        playerVitality: value.playerVitality,
        enemyVitality: value.enemyVitality,
        lootState: value.lootState,
        custody: value.custody,
        frontierAccess: value.frontierAccess,
        footholdProgress: value.footholdProgress,
        swordSequence: value.swordSequence,
      });
      priorSummary = summary;
    }
    requireCondition(
      value.residentPhase !== "rejected",
      "resident Clause generation was rejected during the journey",
    );
    requireCondition(value.phase !== "failed", "the boar killed the wayfarer");

    if (value.phase === "completed") {
      completed = value;
      await setHeld(new Set());
      if (performance.now() - startedAt >= minimumJourneyMillis) break;
      await Bun.sleep(20);
      continue;
    }

    if (value.lootState === "available") {
      dodgeKey = null;
      await setHeld(movementToward(value, 1.2, -1.0, 0.18));
    } else if (value.lootState === "acquired") {
      dodgeKey = null;
      if (value.custody === "player-1") {
        await setHeld(movementToward(value, -2.0, -1.0, 0.18));
      } else {
        await setHeld(new Set());
      }
    } else if (value.enemyCombatStatus === "alive") {
      if (value.pressure === "telegraph" && value.pressureClock <= 32) {
        dodgeKey ??= choosePerpendicularDodge(value);
        await setHeld(new Set([dodgeKey]));
      } else if (value.pressure === "charging") {
        dodgeKey ??= choosePerpendicularDodge(value);
        await setHeld(new Set([dodgeKey]));
      } else if (
        value.pressure === "overrun-recovery" ||
        value.pressure === "hit-recovery"
      ) {
        dodgeKey = null;
        const distance = Math.hypot(
          value.playerX - value.boarX,
          value.playerZ - value.boarZ,
        );
        if (distance > 1.65) {
          await setHeld(movementToward(value, value.boarX, value.boarZ, 1.45));
        } else {
          await setHeld(new Set());
          if (
            value.swordClock === 0 &&
            value.swordSequence !== lastAttackSequence
          ) {
            lastAttackSequence = value.swordSequence;
            await press("KeyJ");
          }
        }
      } else {
        dodgeKey = null;
        await setHeld(new Set());
      }
    } else {
      await setHeld(new Set());
    }
    await Bun.sleep(12);
  }

  await setHeld(new Set());
  const result = await snapshot();
  completed ??= result.phase === "completed" ? result : null;
  requireCondition(completed !== null, `journey ended in ${result.phase}`);
  requireCondition(result.enemyVitality === 0, "the boar did not die");
  requireCondition(result.lootState === "acquired", "the ashen key was not acquired");
  requireCondition(result.custody === "player-1", "the player never received key custody");
  requireCondition(
    result.frontierAccess === "temporary-open",
    `first breach admitted ${result.frontierAccess} instead of temporary access`,
  );
  requireCondition(result.footholdProgress === 1, "first breach did not advance foothold progress");
  requireCondition(result.footholdRequirement === 3, "frontier requirement changed");
  requireCondition(result.orderViolations === 0, "Admission preceded its CandidateDelta");
  requireCondition(result.candidateReceipts > 0, "no CandidateDelta receipt was observed");
  requireCondition(result.admissionReceipts > 0, "no Admission receipt was observed");
  requireCondition(
    result.orderedAdmissionPairs > 0,
    "no complete CandidateDelta-before-Admission operation pair remained observable",
  );
  requireCondition(
    performance.now() - startedAt >= minimumJourneyMillis,
    "journey did not remain active for 30 seconds",
  );
  requireCondition(result.frames >= 30, `only ${result.frames} admitted frames observed`);
  requireCondition(
    observedHeartbeats >= 10,
    `only ${observedHeartbeats} distinct worker heartbeats observed`,
  );

  await press("KeyR");
  let resetAfterBreach: Snapshot | null = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await snapshot();
    if (
      value.phase === "playing" &&
      value.frontierAccess === "sealed" &&
      value.footholdProgress === 1
    ) {
      resetAfterBreach = value;
      break;
    }
    await Bun.sleep(20);
  }
  requireCondition(
    resetAfterBreach !== null,
    "reset did not re-seal temporary access while preserving foothold progress",
  );

  console.log(JSON.stringify({ result, resetAfterBreach, observedHeartbeats, trace }));
} finally {
  socket?.close();
  chrome.kill();
}

function debugPortUrl(): string {
  return `http://127.0.0.1:${debugPort}`;
}
