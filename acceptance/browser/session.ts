import { mkdir } from "node:fs/promises";

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
interface Reply {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly error?: { readonly message: string };
  readonly result?: {
    readonly result?: { readonly value?: unknown };
    readonly data?: string;
    readonly exceptionDetails?: unknown;
  };
}

export async function openBrowser(label: string) {
  const port = Number(Bun.env.GREYWROUGHT_DEBUG_PORT ?? 9297);
  const url = Bun.env.GREYWROUGHT_GAME_URL ?? "http://127.0.0.1:4173/";
  const output = `${process.cwd()}/build/browser/${label}-${process.pid}`;
  await mkdir(output, { recursive: true });
  const chrome = Bun.spawn([
    Bun.env.CHROME_PATH ?? "google-chrome", "--headless=new", "--no-sandbox",
    "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check",
    "--password-store=basic", "--enable-unsafe-swiftshader",
    ...(Bun.env.GREYWROUGHT_SOFTWARE_RENDERING === "1" ? ["--use-angle=swiftshader"] : []),
    `--remote-debugging-port=${port}`, `--user-data-dir=${output}/profile`,
    "--window-size=1440,900", "about:blank",
  ], { stdout: Bun.file(`${output}/chrome.log`), stderr: Bun.file(`${output}/chrome-errors.log`) });
  let socket: WebSocket | undefined;
  const errors: unknown[] = [];
  const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
      await Bun.sleep(100);
    }
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json() as { webSocketDebuggerUrl: string };
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as Reply;
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params);
      if (message.id !== undefined) {
        const handler = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) handler?.reject(new Error(message.error.message));
        else handler?.resolve(message);
      }
    };
    await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error("Browser connection failed")); });
    async function call(method: string, params: object = {}): Promise<Reply> {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 15_000);
        pending.set(id, {
          resolve: reply => { clearTimeout(timer); resolve(reply); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
        socket!.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate<T>(expression: string): Promise<T> {
      const reply = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      check(reply.result?.exceptionDetails === undefined, `Browser evaluation failed: ${JSON.stringify(reply.result?.exceptionDetails)}`);
      return reply.result?.result?.value as T;
    }
    async function waitFor(expression: string, timeout = 15_000): Promise<void> {
      const deadline = performance.now() + timeout;
      while (performance.now() < deadline) {
        check(errors.length === 0, `Browser exception: ${JSON.stringify(errors[0])}`);
        if (await evaluate<boolean>(expression)) return;
        await Bun.sleep(75);
      }
      await shot("timeout");
      const state = await evaluate('({ state: {...document.body.dataset}, feedback: document.getElementById("entry-roster-feedback")?.textContent })');
      throw new Error(`Browser condition timed out: ${expression}; ${JSON.stringify(state)}`);
    }
    async function key(code: string, down: boolean) {
      await call("Input.dispatchKeyEvent", {
        type: down ? "keyDown" : "keyUp", code,
        key: code === "Space" ? " " : code === "Tab" ? "Tab" : code.startsWith("Key") ? code.slice(3).toLowerCase() : code.startsWith("Digit") ? code.slice(5) : code,
      });
    }
    async function press(code: string) { await key(code, true); await key(code, false); }
    async function shot(name: string) {
      const reply = await call("Page.captureScreenshot", { format: "png" });
      if (reply.result?.data) await Bun.write(`${output}/${name}.png`, Buffer.from(reply.result.data, "base64"));
    }
    async function enter() {
      await waitFor('["account", "creator", "roster"].includes(document.body.dataset.entryRoute)');
      await evaluate(`(() => {
        if(document.body.dataset.entryRoute==='account') { document.getElementById('entry-display-name').value='Playtest'; document.getElementById('entry-account-form').requestSubmit(); }
        if(document.body.dataset.entryRoute==='creator') { document.getElementById('entry-character-name').value='Wayfarer'; document.getElementById('entry-character-form').requestSubmit(); }
        document.getElementById('entry-enter-world').click();
      })()`);
      await waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.gamePhase === "town"');
      await waitFor('document.body.dataset.rigState === "ready"');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    }
    const read = () => evaluate<Record<string, string>>('({...document.body.dataset})');
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Page.navigate", { url });
    return { url, output, errors, call, evaluate, waitFor, key, press, shot, enter, read,
      async close() { socket?.close(); chrome.kill(); await chrome.exited; },
    };
  } catch (error) { socket?.close(); chrome.kill(); await chrome.exited; throw error; }
}
