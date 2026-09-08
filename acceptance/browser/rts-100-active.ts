import { CLAUSE_COMMIT } from "../../scripts/clause-pin.js";

const runStartedMillis = performance.now();
const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9262;
const gamePort = 4196;
const profileOnly = Bun.argv.includes("--profile");
const gameUrl = `http://127.0.0.1:${gamePort}/?measure=1${profileOnly ? "&profile=1" : ""}`;
const fixture = "build/measurement/100-active-source.clause";
const candidateOnly = Bun.argv.includes("--candidate-only");
const sourceCpuProfile = Bun.argv.includes("--source-cpu-profile");
const cpuProfile = Bun.argv.includes("--cpu-profile") || sourceCpuProfile;
const observeProfile = Bun.argv.includes("--observe");
requireCondition(!candidateOnly || profileOnly, "--candidate-only requires --profile");
requireCondition(!sourceCpuProfile || !candidateOnly, "--source-cpu-profile requires source edits");
const output = profileOnly
  ? "build/measurement/100-active-profile.json"
  : "build/measurement/100-active.json";
const windowMillis = 2_500;
const rendererMode = "hardware";
const rendererFlags = ["--enable-gpu"];

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { samples: sorted.length, median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? null };
}

function lifecycleDurations(events: readonly Record<string, any>[], startName: string, endName: string): number[] {
  const starts = new Map<number, number>();
  const durations: number[] = [];
  for (const event of events) {
    if (event.metric !== "lifecycle" || typeof event.operationId !== "number") continue;
    if (event.event === startName) starts.set(event.operationId, event.workerEpochMillis);
    if (event.event === endName && starts.has(event.operationId)) {
      durations.push(event.workerEpochMillis - starts.get(event.operationId)!);
    }
  }
  return durations;
}

const baseSource = await Bun.file("src/world/embodied-encounter.clause").text();
const companySource = await Bun.file("acceptance/performance/company-100.clause").text();
const originalUnits = ["warrior-1", "artificer-1", "rogue-1", "priest-1", "ranger-1"];
let withoutOriginalUnits = baseSource;
for (const id of originalUnits) {
  const blocks = new RegExp(`^${id}\\n(?:[ \\t][^\\n]*(?:\\n|$)|\\n)+`, "gm");
  if (!blocks.test(withoutOriginalUnits)) throw new Error(`missing grouped source unit ${id}`);
  withoutOriginalUnits = withoutOriginalUnits.replace(blocks, block => {
    const membership = block.split("\n").filter(line => line.startsWith("  member of: "));
    return membership.length ? `${id}\n${membership.join("\n")}\n` : "";
  });
}
const source = withoutOriginalUnits + "\n" + companySource;
await Bun.write(fixture, source);
if (Bun.argv.includes("--write-fixture")) {
  console.log(fixture);
  process.exit(0);
}
const sourceCheckStarted = performance.now();
const sourceCheck = Bun.spawn(["build/clause-authoring-target/debug/clause-workbench", "check-source", fixture],
  { stdout: "pipe", stderr: "pipe" });
const sourceCheckResult = { exitCode: await sourceCheck.exited,
  durationMillis: performance.now() - sourceCheckStarted,
  stdout: await new Response(sourceCheck.stdout).text(), stderr: await new Response(sourceCheck.stderr).text() };
await Bun.write("build/measurement/100-active-source-check.json", JSON.stringify(sourceCheckResult, null, 2));
if (sourceCheckResult.exitCode !== 0) {
  await Bun.write(output, JSON.stringify({ schema: "greywrought-100-active-v1", phase: "source-admission",
    clausePin: CLAUSE_COMMIT, fixture, sourceCheckResult,
    sourceSha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
    verdict: { sourceAdmission: false, activeActors: null, rendering: null, realTime: null, checkedEdits: null } }, null, 2));
}
requireCondition(sourceCheckResult.exitCode === 0, "100-actor source failed its pinned source check");
const server = Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: { ...process.env, GREYWROUGHT_PORT: String(gamePort), GREYWROUGHT_RESIDENT_SOURCE: fixture },
  stdout: "pipe",
  stderr: "inherit",
});
const chrome = Bun.spawn({
  cmd: [
    chromePath, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=/tmp/greywrought-cdp-measure-${process.pid}`,
    "--window-size=1280,900", ...rendererFlags, "about:blank",
  ],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
let diagnosticSnapshot: (() => Promise<unknown>) | null = null;
try {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${gamePort}/`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  requireCondition(tabResponse.ok, "measurement Chrome tab did not open");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "measurement tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const workerTargets = new Map<string, string>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === "Target.attachedToTarget" && message.params.targetInfo.type === "worker") {
      workerTargets.set(message.params.targetInfo.url, message.params.sessionId);
    }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("measurement CDP socket timed out"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params, sessionId }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => { throw new Error(`measurement CDP timeout in ${method}`); }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const message = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text);
    return message.result?.result?.value as T;
  };
  diagnosticSnapshot = () => evaluate(`({dataset:{...document.body.dataset}, events:window.__GREYWROUGHT_MEASUREMENTS__, gameEvents:window.__GREYWROUGHT_GAME_EVENTS__})`);
  const waitFor = async <T>(expression: string, accept: (value: T) => boolean, label: string, attempts = 400): Promise<T> => {
    let value = await evaluate<T>(expression);
    for (let attempt = 0; attempt < attempts && !accept(value); attempt += 1) {
      await Bun.sleep(25);
      value = await evaluate<T>(expression);
    }
    requireCondition(accept(value), `${label} did not settle: ${JSON.stringify(value)}`);
    return value;
  };
  const click = (id: string) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

  await call("Runtime.enable");
  await call("Page.enable");
  if (cpuProfile) {
    const result = await call("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    requireCondition(!result.error, "measurement could not attach worker profiler");
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: gameUrl });
  await waitFor<string>("document.body?.dataset.gamePhase || ''", (value) => value === "ready", "measurement world ready");
  await waitFor<string>("document.body?.dataset.companyAssetStatus || ''", (value) => value === "ready", "100 company models loaded");
  await Bun.sleep(1_000);

  const browser = await evaluate<Record<string, unknown>>(`(() => {
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl');
    const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return { userAgent:navigator.userAgent, hardwareConcurrency:navigator.hardwareConcurrency,
      renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      viewport:[innerWidth,innerHeight], dpr:devicePixelRatio };
  })()`);
  if (rendererMode === "hardware") {
    requireCondition(typeof browser.renderer === "string" &&
      !/unavailable|swiftshader|llvmpipe|software/i.test(browser.renderer),
      "hardware measurement has no hardware renderer: " + JSON.stringify(browser));
  }
  const rawWindows: Array<Record<string, unknown>> = [];
  const projection = () => evaluate<Record<string, any>>("window.__GREYWROUGHT_GAME_EVENTS__.findLast(e=>e.phase==='projection')");
  const observe = async (label: string): Promise<void> => {
    // The browser uses a bounded ring for long-lived opt-in sessions. Reset at
    // each explicit observation boundary so eviction cannot invalidate an
    // absolute index captured after a slow SwiftShader warm-up.
    await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
    const before = await projection();
    const start = Date.now();
    await Bun.sleep(windowMillis);
    const events = await evaluate<Record<string, any>[]>("window.__GREYWROUGHT_MEASUREMENTS__.slice()");
    const durationMillis = Date.now() - start;
    const after = await projection();
    const actorProof = Object.keys(before.positions).map(id => ({ id,
      beforePosition: before.positions[id], afterPosition: after.positions[id],
      beforeCooldown: before.cooldowns[id], afterCooldown: after.cooldowns[id],
      sourceAdvanceSeconds: before.cooldowns[id] - after.cooldowns[id],
      distance: Math.hypot(after.positions[id][0] - before.positions[id][0], after.positions[id][1] - before.positions[id][1]) }));
    const raf = events.filter((event) => event.metric === "raf-interval").map((event) => event.durationMillis);
    const projectionDurations = events.filter((event) => event.metric === "projection-to-hud").map((event) => event.durationMillis);
    const transport = events.filter((event) => event.metric === "worker-to-main").map((event) => event.durationMillis);
    const candidates = lifecycleDurations(events, "candidate-requested", "candidate-produced");
    const admissionDurations = lifecycleDurations(events, "admission-requested", "admission-accepted");
    const receivedCandidateRequests = events.filter(
      (event) => event.metric === "lifecycle" && event.event === "candidate-requested",
    ).length;
    const admissions = events.filter(
      (event) => event.metric === "lifecycle" && event.event === "admission-accepted",
    );
    const firstAdmission = admissions[0];
    const lastAdmission = admissions.at(-1);
    const contiguous = firstAdmission !== undefined && admissions.length > 1 && admissions.every((event, index) =>
      event.activeGeneration === firstAdmission.activeGeneration &&
      event.operationId === firstAdmission.operationId + index);
    const admittedClock = contiguous && firstAdmission !== undefined && lastAdmission !== undefined ? {
      intervals: admissions.length - 1,
      fixedTickAdvanceMillis: (admissions.length - 1) * 16,
      workerWallMillis: lastAdmission.workerEpochMillis - firstAdmission.workerEpochMillis,
      sourceSecondsPerWallSecond: (admissions.length - 1) * 16 /
        (lastAdmission.workerEpochMillis - firstAdmission.workerEpochMillis),
    } : null;
    rawWindows.push({ label, durationMillis, events, actorProof, before, after, summary: {
      projectedUnits: actorProof.length,
      activeUnits: actorProof.filter(actor => actor.sourceAdvanceSeconds > 0).length,
      movingUnits: actorProof.filter(actor => actor.distance > 0).length,
      measuredSourceSecondsPerWallSecond: distribution(actorProof.map(actor => actor.sourceAdvanceSeconds / (durationMillis / 1000))),
      rafIntervalsMillis: distribution(raf),
      observedFps: raf.length / (durationMillis / 1_000),
      projectionToHudMillis: distribution(projectionDurations),
      workerToMainMillis: distribution(transport),
      candidateRuntimeMillis: distribution(candidates),
      admissionMillis: distribution(admissionDurations),
      receivedCandidateRequests,
      receivedCandidateRequestsPerWallSecond: receivedCandidateRequests / (durationMillis / 1_000),
      admittedClock,
    }});
  };

  const candidateProfiles: Array<Record<string, unknown>> = [];
  let workerSession: string | undefined;
  if (cpuProfile) {
    workerSession = [...workerTargets].find(([url]) => url.includes("resident-worker"))?.[1];
    requireCondition(typeof workerSession === "string", "resident worker CPU profile did not attach");
    for (const method of sourceCpuProfile ? ["Profiler.enable"] : ["Profiler.enable", "Profiler.start"]) {
      const result = await call(method, {}, workerSession);
      requireCondition(!result.error, `resident worker ${method} failed: ${JSON.stringify(result.error)}`);
    }
  }
  if (profileOnly) {
    await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
    candidateProfiles.push(await waitFor<Record<string, unknown>>(
      `window.__GREYWROUGHT_MEASUREMENTS__.find(event=>event.metric==='runtime-profile'&&event.boundary==='candidate') || {}`,
      (value) => value.boundary === "candidate" && typeof value.wallMillis === "number",
      "100-actor candidate profile",
    ));
  } else {
    await observe("100-active-movement-and-cooldown");
  }
  if (profileOnly && observeProfile) await observe("100-active-movement-and-cooldown");
  if (workerSession && !sourceCpuProfile) {
    const result = await call("Profiler.stop", {}, workerSession);
    requireCondition(Boolean(result.result?.profile), "resident worker CPU profile was not retained");
    await Bun.write("build/measurement/100-active-worker.cpuprofile", JSON.stringify(result.result.profile));
    await call("Target.detachFromTarget", { sessionId: workerSession });
  }
  await evaluate(`(() => {
    const catalog=document.getElementById('scalar-effect-catalog');
    const option=[...catalog.options].find(candidate=>candidate.textContent.startsWith('?cooldown - ?dt ·'));
    if(!option) throw new Error('measurement effect absent');
    catalog.value=option.value; catalog.dispatchEvent(new Event('change'));
  })()`);
  if (sourceCpuProfile && workerSession) {
    const result = await call("Profiler.start", {}, workerSession);
    requireCondition(!result.error, "source-edit CPU profile did not start");
  }
  const edits: Array<Record<string, unknown>> = [];
  const editExpressions = candidateOnly
    ? []
    : profileOnly
    ? ["?cooldown - (?dt * 2.0)"]
    : ["?cooldown - (?dt * 2.0)", "?cooldown - ?dt", "?cooldown - (?dt * 2.0)"];
  for (const expression of editExpressions) {
    const beforeProjection = await projection();
    await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
    const before = await evaluate<Record<string, unknown>>(`({
      generation:Number(document.body.dataset.residentGeneration),
      expression:document.getElementById('scalar-effect-expression').value,
      phase:document.body.dataset.encounterPhase
    })`);
    await evaluate(`document.getElementById('scalar-effect-expression').value=${JSON.stringify(expression)}`);
    await click("edit-double-damage");
    const visible = await waitFor<Record<string, any>>(
      `(window.__GREYWROUGHT_GAME_EVENTS__||[]).findLast(e=>e.phase==='live-edit-visible'&&e.generation>${Number(before.generation)}) || {}`,
      (value) => Number.isFinite(value.elapsedMillis),
      `visible edit ${expression}`,
      profileOnly ? 2_000 : 800,
    );
    const afterProjection = await projection();
    const formations = Object.values(visible.continuity?.formations ?? {})
      .flatMap(page => Object.values(page as Record<string, Record<string, any>>));
    const identityProof = Object.entries(beforeProjection.unitReferents).map(([id, raw]) => {
      const prior = raw as Record<string, any>;
      const next = afterProjection.unitReferents[id];
      return { id, prior, next, carried: formations.some(formation =>
        formation.old === prior.identity.value && formation.new === next.identity.value &&
        /^[0-9a-f]{64}$/.test(formation.occurrence)) };
    });
    edits.push({ before, expression, beforeProjection, afterGeneration: visible.generation, clickToVisibleMillis: visible.elapsedMillis,
      nativeCompilerMillis: visible.compilerMillis, wasmTransferMillis: visible.runtimeMillis,
      continuity: visible.continuity, identityProof, projection: afterProjection,
      events: await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.slice()") });
  }

  if (sourceCpuProfile && workerSession) {
    const result = await call("Profiler.stop", {}, workerSession);
    requireCondition(Boolean(result.result?.profile), "source-edit worker CPU profile was not retained");
    await Bun.write("build/measurement/100-active-source-worker.cpuprofile", JSON.stringify(result.result.profile));
    await call("Target.detachFromTarget", { sessionId: workerSession });
  }
  const cgroupPath = (await Bun.file("/proc/self/cgroup").text()).trim().split(":").at(-1) ?? "";
  const cgroupRoot = `/sys/fs/cgroup${cgroupPath}`;
  const readLimit = async (name: string) => (await Bun.file(`${cgroupRoot}/${name}`).exists())
    ? (await Bun.file(`${cgroupRoot}/${name}`).text()).trim() : "unavailable";
  const conditions = { browser, fixedTickMillis: 16, renderAspirationMillis: 16.67, warmupMillis: 1_000, windowMillis,
    rendererMode, rendererFlags, clausePin: CLAUSE_COMMIT,
    baseCommit: profileOnly ? "9236c1c797820c46ebab2e60cb96a4255fab73c5" : "5bdc0e83458a52764285a40a005f35b595ec3d8e",
    fixture, sourceSha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"), sourceCheckResult };
  const cgroup = { path: cgroupPath, cpuMax: await readLimit("cpu.max"), memoryHigh: await readLimit("memory.high"),
    memoryMax: await readLimit("memory.max"), pidsMax: await readLimit("pids.max") };
  if (profileOnly) {
    const editProfiles = edits.flatMap((edit) => (edit.events as Array<Record<string, unknown>>)
      .filter((event) => event.metric === "runtime-profile"));
    requireCondition(candidateProfiles.length === 1, "100-actor candidate profile was not retained");
    if (!candidateOnly) {
      requireCondition(editProfiles.some((profile) => profile.boundary === "source-edit"),
        "100-actor source-edit profile was not retained");
      requireCondition(edits.every((edit) =>
        (edit.identityProof as Array<{carried: boolean}>).length === 100 &&
        (edit.identityProof as Array<{carried: boolean}>).every((actor) => actor.carried)),
      "100-actor source-edit profile lost identity continuity");
    }
    const artifact = { schema: "greywrought-100-active-profile-v1", windows: rawWindows, durationMillis: performance.now() - runStartedMillis,
      recordedAt: new Date().toISOString(), conditions, cgroup, candidateProfiles, edits };
    await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({ output, candidateProfiles, edits: edits.map((edit) => ({ expression: edit.expression,
      clickToVisibleMillis: edit.clickToVisibleMillis, nativeCompilerMillis: edit.nativeCompilerMillis,
      wasmTransferMillis: edit.wasmTransferMillis,
      profiles: (edit.events as Array<Record<string, unknown>>).filter((event) => event.metric === "runtime-profile") })) }, null, 2));
  } else {
    const summary = rawWindows[0]!.summary as Record<string, any>;
    const verdict = {
      activeActors: summary.projectedUnits === 100 && summary.activeUnits === 100 && summary.movingUnits === 100,
      rendering: summary.observedFps >= 59 && summary.rafIntervalsMillis.p95 <= 20,
      realTime: summary.measuredSourceSecondsPerWallSecond.median >= 0.95 && summary.measuredSourceSecondsPerWallSecond.median <= 1.05,
      checkedEdits: edits.every(edit => Number(edit.clickToVisibleMillis) <= 250 &&
        (edit.identityProof as Array<{carried: boolean}>).length === 100 &&
        (edit.identityProof as Array<{carried: boolean}>).every(actor => actor.carried)),
    };
    const artifact = { schema: "greywrought-100-active-v1", durationMillis: performance.now() - runStartedMillis,
      recordedAt: new Date().toISOString(), conditions, cgroup, windows: rawWindows, edits, verdict };
    await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({ output, windows: rawWindows.map((window) => ({ label: window.label, summary: window.summary })),
      edits: edits.map(edit => ({ expression: edit.expression, clickToVisibleMillis: edit.clickToVisibleMillis,
        nativeCompilerMillis: edit.nativeCompilerMillis, wasmTransferMillis: edit.wasmTransferMillis })), verdict }, null, 2));
    requireCondition(Object.values(verdict).every(Boolean), "100-active combined performance threshold failed; samples retained");
  }
} catch (error) {
  await Bun.write("build/measurement/100-active-failure.json", JSON.stringify({ error: String(error),
    snapshot: await diagnosticSnapshot?.().catch(snapshotError => ({ error: String(snapshotError) })) }, null, 2));
  throw error;
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
  await Promise.all([chrome.exited, server.exited]);
}
