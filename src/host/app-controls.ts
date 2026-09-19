interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function createAppControls(entry: HTMLElement, settings: HTMLElement) {
  const installedDisplay = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installed = (installedDisplay.matches && !document.fullscreenElement) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let pendingInstall: InstallPromptEvent | null = null;
  let installing = false;
  let changingFullscreen = false;
  let disposed = false;
  let message = '';
  const removeListeners: Array<() => void> = [];
  const style = document.createElement('style');
  style.textContent = `
    .app-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .app-controls button { padding:8px 12px; border:1px solid #b29c65; border-radius:3px; background:#26302ded; color:#f3e6c7; font:var(--ui-font-body) system-ui,sans-serif; cursor:pointer; }
    .app-controls button:hover { background:#465044; }
    .app-controls button:focus-visible { outline:2px solid #ffe3a0; outline-offset:2px; }
    .app-controls button:disabled { opacity:.65; cursor:default; }
    .app-controls [hidden] { display:none; }
    .app-controls-status { flex-basis:100%; margin:0; max-width:360px; color:#f3e6c7; font:var(--ui-font-body)/1.45 system-ui,sans-serif; }
    .app-controls-entry { position:absolute; top:12px; right:12px; z-index:10; justify-content:flex-end; max-width:calc(100% - 24px); padding:8px; border-radius:4px; background:#101917e8; }
    .app-controls-settings { margin-top:16px; padding-top:12px; border-top:1px solid #86734b; }
  `;
  document.head.append(style);
  function listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    removeListeners.push(() => target.removeEventListener(type, handler));
  }
  const views = [entry, settings].map((host, index) => {
    const root = document.createElement('section');
    root.className = `app-controls app-controls-${index === 0 ? 'entry' : 'settings'}`;
    root.setAttribute('aria-label', 'App and display');
    const install = document.createElement('button');
    install.type = 'button'; install.dataset.appInstall = ''; install.textContent = 'Install Greywrought';
    const fullscreen = document.createElement('button');
    fullscreen.type = 'button'; fullscreen.dataset.appFullscreen = '';
    const status = document.createElement('p');
    status.className = 'app-controls-status'; status.setAttribute('role', 'status');
    root.append(install, fullscreen, status); host.append(root);
    listen(install, 'click', () => { void requestInstall(); });
    listen(fullscreen, 'click', () => { void toggleFullscreen(); });
    return {root, install, fullscreen, status};
  });
  function render(): void {
    if (disposed) return;
    const fullscreenSupported = document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function';
    for (const view of views) {
      view.install.hidden = installed;
      view.install.disabled = installing;
      view.fullscreen.hidden = !fullscreenSupported;
      view.fullscreen.disabled = changingFullscreen;
      view.fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
      view.fullscreen.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
      view.status.textContent = message;
      view.status.hidden = !message;
      view.root.hidden = installed && !fullscreenSupported && !message;
    }
  }
  function guidance(): string {
    return ios
      ? 'To install Greywrought, open Share, choose Add to Home Screen, then Add. If that option is missing, open this page in Safari.'
      : 'Open your browser menu and look for Install Greywrought, Install app, or Add to Home Screen. If none appears, you can keep playing here.';
  }
  async function requestInstall(): Promise<void> {
    if (installing || installed || disposed) return;
    const prompt = pendingInstall;
    if (!prompt) { message = guidance(); render(); return; }
    pendingInstall = null;
    installing = true; message = ''; render();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (disposed) return;
      if (choice.outcome === 'accepted') { installed = true; message = 'Greywrought was added to your apps.'; }
      else message = 'Installation cancelled. You can keep playing here or install later from your browser menu.';
    } catch {
      if (!disposed) message = guidance();
    } finally { installing = false; render(); }
  }
  async function toggleFullscreen(): Promise<void> {
    if (changingFullscreen || disposed) return;
    changingFullscreen = true; message = ''; render();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      if (!disposed) message = 'Fullscreen could not be changed. Try again, or use your browser’s fullscreen control.';
    } finally { changingFullscreen = false; render(); }
  }
  listen(window, 'beforeinstallprompt', event => {
    event.preventDefault(); pendingInstall = event as InstallPromptEvent; render();
  });
  listen(window, 'appinstalled', () => {
    installed = true; pendingInstall = null; message = 'Greywrought was added to your apps.'; render();
  });
  listen(installedDisplay, 'change', () => {
    if (installedDisplay.matches && !document.fullscreenElement && !changingFullscreen) { installed = true; pendingInstall = null; message = ''; }
    render();
  });
  listen(document, 'fullscreenchange', () => render());
  render();
  return {
    dispose(): void {
      disposed = true; pendingInstall = null;
      for (const remove of removeListeners) remove();
      for (const view of views) view.root.remove();
      style.remove();
    },
  };
}
