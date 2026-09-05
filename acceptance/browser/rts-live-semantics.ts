const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9250;
const gamePort = 4184;
const gameUrl = `http://127.0.0.1:${gamePort}/`;
const fixture = "build/acceptance/m4-live-source.clause";

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await Bun.write(fixture, await Bun.file("src/world/embodied-encounter.clause").arrayBuffer());
const server = Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: {
    ...process.env,
    GREYWROUGHT_PORT: String(gamePort),
    GREYWROUGHT_RESIDENT_SOURCE: fixture,
  },
  stdout: "pipe",
  stderr: "inherit",
});
const chrome = Bun.spawn({
  cmd: [
    chromePath,
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=/tmp/greywrought-cdp-live-${process.pid}`,
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await fetch(gameUrl)).ok) break;
    } catch {}
    await Bun.sleep(25);
  }
  let chromeReady = false;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) {
        chromeReady = true;
        break;
      }
    } catch {}
    await Bun.sleep(25);
  }
  requireCondition(chromeReady, "live-semantics Chrome debugging port did not open");
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: "PUT",
    signal: AbortSignal.timeout(10_000),
  });
  requireCondition(tabResponse.ok, "live-semantics Chrome could not open a blank tab");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "live-semantics tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  const browserErrors: string[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
      browserErrors.push(message.params?.args?.map((argument: any) =>
        String(argument?.value ?? argument?.description ?? "console argument")
      ).join(" ") || "console error");
    }
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("live-semantics CDP WebSocket timeout"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => {
        pending.delete(id);
        throw new Error(`live-semantics CDP timeout in ${method}; errors=${browserErrors.join(" | ") || "none"}`);
      }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.result?.exceptionDetails !== undefined) {
      throw new Error(result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails.text);
    }
    return (result.result?.result?.value ?? null) as T;
  };
  const screenshot = async (path: string): Promise<void> => {
    await call("Page.setWebLifecycleState", { state: "frozen" });
    try {
      const result = await call("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      });
      const data = result.result?.data;
      requireCondition(typeof data === "string", "live-semantics screenshot omitted bytes");
      await Bun.write(path, Buffer.from(data, "base64"));
    } finally {
      await call("Page.setWebLifecycleState", { state: "active" });
    }
  };
  const waitFor = async <T>(expression: string, accept: (value: T) => boolean, label: string, attempts = 320): Promise<T> => {
    let value: T = await evaluate<T>(expression);
    for (let attempt = 0; attempt < attempts && !accept(value); attempt += 1) {
      await Bun.sleep(25);
      value = await evaluate<T>(expression);
    }
    requireCondition(accept(value), `${label} did not settle: ${JSON.stringify(value)}; errors=${browserErrors.join(" | ") || "none"}`);
    return value;
  };
  const click = (id: string) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  const latestProjection = () => evaluate<Record<string, any>>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1) || {}",
  );

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: gameUrl });
  await waitFor<string>("document.body?.dataset.gamePhase || ''", (value) => value === "ready", "initial company");
  const initialRuntimeIdentity = await (await fetch(`${gameUrl}runtime-identity`)).json() as {
    serverPid: number;
    residentPid: number;
  };
  requireCondition(initialRuntimeIdentity.serverPid === server.pid, "fixture server identity did not match harness child");
  const pageTimeOrigin = await evaluate<number>("performance.timeOrigin");
  const navigationCount = await evaluate<number>("performance.getEntriesByType('navigation').length");

  // Record a real heal before the edited strike so both explanation controls
  // have actual accepted Steps, not merely compiler metadata.
  await click("begin-encounter");
  await waitFor<string>("document.body.dataset.encounterPhase || ''", (value) => value === "Battle joined", "battle start");
  await click("target-moonwell");
  await click("roster-priest-1");
  await waitFor<string>("document.body.dataset.selectedCount || ''", (value) => value === "1", "Priest selection");
  await click("command-heal");
  await waitFor<number>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns?.['priest-1'] || 0",
    (value) => value > 0,
    "accepted heal",
  );
  await evaluate("document.getElementById('live-semantics-panel').open=true");
  const healControl = await evaluate<{ top: number; bottom: number; width: number }>(
    "(() => { const r=document.getElementById('explain-heal').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width}; })()",
  );
  requireCondition(healControl.top >= 0 && healControl.bottom <= 900 && healControl.width > 0, `heal explanation control is clipped: ${JSON.stringify(healControl)}`);
  await click("explain-heal");
  const healExplanation = await waitFor<string>(
    "document.getElementById('explanation-status').textContent || ''",
    (value) => value.includes("party-heal @") && value.includes("vitality:"),
    "visible executed heal explanation",
  );
  requireCondition(healExplanation.includes("→"), `heal explanation omitted actual values: ${healExplanation}`);
  await waitFor<boolean>(
    "((window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns?.['priest-1'] ?? 1)<=0",
    Boolean,
    "Priest cooldown before party strike",
  );

  await click("select-all");
  await waitFor<string>("document.body.dataset.selectedCount || ''", (value) => value === "5", "company selection");
  await click("target-cinder-1");
  await waitFor<string>("document.body.dataset.targetId || ''", (value) => value === "cinder-1", "exact cinder target");
  await click("command-attack");
  await waitFor<number>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1'] ?? 100",
    (value) => value === 9,
    "original five-contributor strike",
  );
  await waitFor<boolean>(
    "Object.values((window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.cooldowns || {}).every(v=>v<=0)",
    Boolean,
    "party cooldown expiry",
  );
  // A non-default selection makes continuity independently observable instead
  // of comparing the edited world with the source's initially selected party.
  await click("roster-priest-1");
  await waitFor<string>("document.body.dataset.selectedCount || ''", (value) => value === "1", "pre-edit Priest-only selection");
  const beforeEdit = await latestProjection();

  await evaluate(`(() => {
    const catalog=document.getElementById('scalar-effect-catalog');
    const option=[...catalog.options].find(candidate=>candidate.textContent.startsWith('0.0 - ?damage ·'));
    if(!option) throw new Error('compiler catalog omitted party damage effect');
    catalog.value=option.value; catalog.dispatchEvent(new Event('change'));
    if(!option.dataset.handler || !option.dataset.effect || !option.dataset.artifact) throw new Error('catalog option omitted exact identity');
  })()`);

  await click("edit-double-damage");
  await waitFor<string>("document.body.dataset.liveEditState || ''", (value) => value === "unchanged-preserved", "no-op edit");
  let afterOperation = await latestProjection();
  requireCondition(afterOperation.generation === beforeEdit.generation && afterOperation.workbenchGeneration === beforeEdit.workbenchGeneration, "no-op edit changed generation");
  requireCondition(afterOperation.vitality["cinder-1"] === 9 && afterOperation.target === "cinder-1", "no-op edit changed running target state");

  await evaluate("document.getElementById('scalar-effect-expression').value='0.0 - ('");
  await click("edit-double-damage");
  await waitFor<string>("document.body.dataset.liveEditState || ''", (value) => value === "rejected-preserved", "rejected edit");
  afterOperation = await latestProjection();
  requireCondition(afterOperation.generation === beforeEdit.generation && afterOperation.workbenchGeneration === beforeEdit.workbenchGeneration, "rejected edit changed generation");
  requireCondition(afterOperation.vitality["cinder-1"] === 9 && afterOperation.target === "cinder-1", "rejected edit changed running target state");

  await evaluate("document.getElementById('scalar-effect-expression').value='0.0 - (?damage * 2.0)'");
  await click("edit-double-damage");
  await waitFor<string>("document.body.dataset.liveEditState || ''", (value) => value === "fenced", "settled changed edit fence");
  // Capture the actual settled edit boundary. Two normal 16 ms world steps can
  // occur between the preceding projection probe and the worker fence.
  const beforeChanged = await latestProjection();
  await click("command-attack");
  const visibleEditMillis = await waitFor<number>(
    "Number(document.body.dataset.liveEditState==='continued' ? document.body.dataset.liveEditMillis : NaN)",
    Number.isFinite,
    "same-page checked live edit",
    800,
  );
  const afterEdit = await evaluate<Record<string, any>>(
    `(window.__GREYWROUGHT_GAME_EVENTS__||[]).find(e=>e.phase==='projection'&&e.generation>${beforeChanged.generation}) || {}`,
  );
  requireCondition(afterEdit.generation > beforeEdit.generation && afterEdit.workbenchGeneration > beforeEdit.workbenchGeneration, "changed edit did not allocate paired generations");
  requireCondition(afterEdit.vitality["cinder-1"] === 9 && afterEdit.target === "cinder-1", "changed edit reset exact target/health");
  requireCondition(JSON.stringify(afterEdit.selected) === JSON.stringify(beforeChanged.selected), "changed edit reset selection");
  requireCondition(JSON.stringify(afterEdit.positions) === JSON.stringify(beforeChanged.positions), "changed edit reset unaffected positions");
  requireCondition(Object.values(afterEdit.cooldowns as Record<string, number>).every((value) => value <= 0), "changed edit reset unaffected cooldowns");
  for (const kind of ["wards", "burns"] as const) {
    for (const [id, before] of Object.entries(beforeChanged[kind] as Record<string, number>)) {
      const after = afterEdit[kind][id] as number;
      requireCondition(
        Math.abs(after - before) <= 0.02,
        `changed edit reset ${kind}.${id}: ${before} -> ${after}; first-carried=${JSON.stringify(afterEdit)}`,
      );
    }
  }
  const liveEvent = await evaluate<Record<string, any>>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).findLast(e=>e.phase==='live-edit-visible') || {}",
  );
  requireCondition(Object.keys(liveEvent.continuity?.formations ?? {}).length > 0, "live edit omitted explicit continuity map");
  requireCondition(/"occurrence":"[0-9a-f]{64}"/.test(JSON.stringify(liveEvent.continuity)), "live edit omitted continuing occurrence tokens");
  requireCondition(Number.isFinite(liveEvent.elapsedMillis) && Number.isFinite(liveEvent.runtimeMillis), "live edit omitted visible/runtime latency");
  requireCondition(await evaluate<number>("performance.timeOrigin") === pageTimeOrigin, "live edit restarted the page");
  requireCondition(await evaluate<number>("performance.getEntriesByType('navigation').length") === navigationCount, "live edit navigated the page");
  const continuedRuntimeIdentity = await (await fetch(`${gameUrl}runtime-identity`)).json() as {
    serverPid: number;
    residentPid: number;
  };
  requireCondition(
    continuedRuntimeIdentity.serverPid === initialRuntimeIdentity.serverPid &&
      continuedRuntimeIdentity.residentPid === initialRuntimeIdentity.residentPid,
    `live edit restarted compiler/server: ${JSON.stringify(initialRuntimeIdentity)} -> ${JSON.stringify(continuedRuntimeIdentity)}`,
  );

  await click("select-all");
  await waitFor<string>("document.body.dataset.selectedCount || ''", (value) => value === "5", "post-edit company selection");
  await click("command-attack");
  await waitFor<number>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1'] ?? 9",
    (value) => value === -173,
    "edited double-damage strike",
  );
  await click("explain-attack");
  const attackExplanation = await waitFor<string>(
    "document.getElementById('explanation-status').textContent || ''",
    (value) => value.includes("party-attack @") && value.includes("9 → -173"),
    "visible executed attack explanation",
  );
  requireCondition(attackExplanation.includes("laws ") || attackExplanation.includes("party-attack @"), "attack explanation omitted source origins");
  await click("intervene-attack");
  const intervention = await waitFor<Record<string, any>>(
    "(window.__GREYWROUGHT_GAME_EVENTS__||[]).findLast(e=>e.phase==='diagnostic'&&e.intervention) || {}",
    (value) => value.intervention?.found === true,
    "finite recorded-event intervention",
  );
  requireCondition(intervention.intervention.cost === 5, `unexpected minimum intervention cost: ${JSON.stringify(intervention.intervention)}`);
  requireCondition(intervention.intervention.exhausted === false, "found intervention was mislabeled exhausted");
  requireCondition(intervention.boundedIntervention.exhausted === true && intervention.boundedIntervention.completed === false, "bounded prefix did not distinguish exhaustion");
  const interventionText = await evaluate<string>("document.getElementById('intervention-status').textContent || ''");
  requireCondition(interventionText.includes("Finite domain: 5") && interventionText.includes("bound 32") && interventionText.includes("Order:"), `intervention UI omitted domain/bound/order: ${interventionText}`);
  requireCondition(interventionText.includes("predicted target vitality 9"), `intervention UI omitted checked predicted outcome: ${interventionText}`);

  const workshop = await evaluate<{ top: number; bottom: number; width: number; panelBottom: number }>(
    "(() => { const panel=document.getElementById('objective-panel'); const workshop=document.getElementById('live-semantics-panel'); workshop.scrollIntoView({block:'nearest'}); const r=workshop.getBoundingClientRect(); const p=panel.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,panelBottom:p.bottom}; })()",
  );
  requireCondition(workshop.top >= 0 && workshop.bottom <= workshop.panelBottom && workshop.bottom <= 900 && workshop.width > 0, `battle workshop is clipped: ${JSON.stringify(workshop)}`);
  await screenshot("build/acceptance/m4-live-semantics.png");

  // No-op remains a no-op after a prior accepted edit; the last CET1 must not
  // be retransmitted under the continuing generation.
  await click("edit-double-damage");
  await waitFor<string>("document.body.dataset.liveEditState || ''", (value) => value === "unchanged-preserved", "post-change no-op");
  const afterFinalNoop = await latestProjection();
  requireCondition(afterFinalNoop.generation === afterEdit.generation && afterFinalNoop.workbenchGeneration === afterEdit.workbenchGeneration, "post-change no-op reused an old witness");

  const persistedSource = await Bun.file(fixture).text();
  requireCondition(persistedSource.includes("0.0 - (?damage * 2.0)"), "compiler-produced edited Clause source was not persisted");
  requireCondition(browserErrors.length === 0, `live-semantics browser errors: ${browserErrors.join(" | ")}`);
  console.log(`RTS live semantics passed: server ${initialRuntimeIdentity.serverPid}/resident ${initialRuntimeIdentity.residentPid} unchanged; no-op/rejected preserved; checked edit visible in ${visibleEditMillis.toFixed(2)} ms (runtime transfer ${Number(liveEvent.runtimeMillis).toFixed(2)} ms); 9→-173; explanations and minimum-five intervention rendered`);
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
