import type { AdventureSnapshot } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";

const cueNames = ["strike", "hit", "brace", "potion", "gather", "purchase", "windup", "alarm", "defeat", "extraction"] as const;
type Cue = typeof cueNames[number];
const preferenceKey = "greywrought.adventure.audio.v1";
interface Preferences { music: number; effects: number; muted: boolean; }
export interface AdventureAudio {
  unlock(): Promise<void>;
  update(snapshot: AdventureSnapshot, paused: boolean): void;
  reset(): void;
  dispose(): void;
}

function preferences(): Preferences {
  const defaults = { music: 0.22, effects: 0.65, muted: false };
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    if (typeof stored !== "object" || stored === null) return defaults;
    const p = stored as Partial<Preferences>;
    const volume = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
    return { music: volume(p.music, defaults.music), effects: volume(p.effects, defaults.effects), muted: p.muted === true };
  } catch { return defaults; }
}

/** Create once for the page; reset the comparison baseline when choosing a character. */
export function createAdventureAudio(): AdventureAudio {
  const prefs = preferences();
  const music = document.createElement("audio");
  music.id = "adventure-music";
  music.src = publicUrl("assets/audio/frost-waltz.mp3");
  music.loop = true;
  music.preload = "metadata";
  music.hidden = true;
  document.body.append(music);
  let context: AudioContext | undefined;
  let effects: GainNode | undefined;
  let loaded: Promise<void> | undefined;
  const buffers = new Map<Cue, AudioBuffer>();
  const playing = new Set<AudioBufferSourceNode>();
  let previous: AdventureSnapshot | undefined;
  let paused = true;
  let unlocked = false;
  let disposed = false;
  let musicStarting = false;
  let lastWarning = -Infinity;
  const panel = document.createElement("fieldset");
  panel.id = "adventure-audio-controls";
  panel.style.cssText = "display:grid;gap:8px;margin:14px 0 0;padding:10px;border:1px solid #86734b;border-radius:8px;text-align:left;font-size:13px";
  panel.innerHTML = `<legend>Sound</legend>
    <label style="display:flex;align-items:center;gap:10px">Music <input data-volume="music" aria-label="Music volume" type="range" min="0" max="100" style="flex:1;min-width:70px"><output data-level="music"></output></label>
    <label style="display:flex;align-items:center;gap:10px">Effects <input data-volume="effects" aria-label="Effects volume" type="range" min="0" max="100" style="flex:1;min-width:70px"><output data-level="effects"></output></label>
    <label style="display:flex;align-items:center;gap:8px"><input data-mute type="checkbox"> Mute all sound</label>
    <small style="line-height:1.4">“Frost Waltz” by <a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100516" target="_blank" rel="noopener noreferrer" style="color:inherit">Kevin MacLeod (incompetech.com)</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" style="color:inherit">CC BY 4.0</a><br>Sound effects: Kenney · CC0</small>`;
  document.querySelector("#pause-panel > div")?.append(panel);
  const listeners = new AbortController();
  function stopEffects(): void {
    for (const source of playing) source.stop();
    playing.clear();
  }
  function sync(): void {
    music.volume = prefs.music;
    music.muted = prefs.muted;
    if (effects && context) effects.gain.setTargetAtTime(prefs.muted ? 0 : prefs.effects, context.currentTime, 0.025);
    if (disposed || !unlocked || paused || document.hidden || prefs.muted || prefs.music === 0) {
      music.pause();
    } else if (music.paused && !musicStarting) {
      musicStarting = true;
      void music.play().catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Adventure soundtrack playback unavailable", error);
      }).finally(() => { musicStarting = false; });
    }
    document.body.dataset.adventureAudioMuted = String(prefs.muted);
  }
  function save(): void {
    try { localStorage.setItem(preferenceKey, JSON.stringify(prefs)); } catch {}
    sync();
  }
  for (const bus of ["music", "effects"] as const) {
    const input = panel.querySelector<HTMLInputElement>(`[data-volume="${bus}"]`)!;
    const output = panel.querySelector<HTMLOutputElement>(`[data-level="${bus}"]`)!;
    input.value = String(Math.round(prefs[bus] * 100));
    output.value = `${input.value}%`;
    input.addEventListener("input", () => {
      prefs[bus] = Number(input.value) / 100;
      output.value = `${input.value}%`;
      save();
    }, { signal: listeners.signal });
  }
  const mute = panel.querySelector<HTMLInputElement>("[data-mute]")!;
  mute.checked = prefs.muted;
  mute.addEventListener("change", () => { prefs.muted = mute.checked; save(); }, { signal: listeners.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopEffects();
    sync();
  }, { signal: listeners.signal });
  music.addEventListener("error", () => console.warn("Adventure soundtrack failed to load", music.error), { signal: listeners.signal });

  async function unlock(): Promise<void> {
    if (disposed) return;
    try {
      context ??= new AudioContext();
      if (!effects) {
        effects = context.createGain();
        effects.connect(context.destination);
      }
      // Both autoplay-sensitive operations begin directly in the input handler.
      const resumed = context.resume();
      unlocked = true;
      sync();
      await resumed;
      document.body.dataset.adventureAudioUnlocked = String(context.state === "running");
      loaded ??= Promise.all(cueNames.map(async cue => {
        const response = await fetch(publicUrl(`assets/audio/${cue}.ogg`));
        if (!response.ok) throw new Error(`${cue}: HTTP ${response.status}`);
        const buffer = await context!.decodeAudioData(await response.arrayBuffer());
        if (!disposed) buffers.set(cue, buffer);
      })).then(() => { document.body.dataset.adventureAudioSamples = String(buffers.size); }).catch(error => {
        loaded = undefined;
        console.warn("Adventure sound effects failed to load", error);
      });
      await loaded;
    } catch (error) {
      console.warn("Adventure audio could not start", error);
    }
  }
  function play(cue: Cue): void {
    const buffer = buffers.get(cue);
    if (!context || !effects || !buffer || context.state !== "running" || paused || document.hidden || disposed || prefs.muted || prefs.effects === 0 || playing.size >= 6) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(effects);
    playing.add(source);
    source.onended = () => { playing.delete(source); source.disconnect(); };
    source.start();
    document.body.dataset.adventureAudioCue = cue;
    document.body.dataset.adventureAudioCueCount = String(Number(document.body.dataset.adventureAudioCueCount ?? 0) + 1);
  }
  function update(snapshot: AdventureSnapshot, isPaused: boolean): void {
    if (disposed) return;
    if (paused !== isPaused) { paused = isPaused; if (paused) stopEffects(); sync(); }
    const before = previous;
    previous = snapshot;
    if (!before || paused || document.hidden) return;
    if (snapshot.phase === "lost" && before.phase !== "lost") { stopEffects(); play("defeat"); return; }
    if (snapshot.phase === "town" && before.phase === "expedition") { play("extraction"); return; }
    if (snapshot.phase !== before.phase || snapshot.phase === "lost") return;
    if (snapshot.player.attackSequence > before.player.attackSequence) play("strike");
    if (snapshot.player.guardSeconds > before.player.guardSeconds) play("brace");
    if (snapshot.potions < before.potions) play("potion");
    if (snapshot.potions > before.potions && snapshot.supplies < before.supplies) play("purchase");
    if (snapshot.resourceRemaining < before.resourceRemaining && snapshot.cargo > before.cargo) play("gather");
    if (snapshot.carriedSalvage > before.carriedSalvage || snapshot.carriedRelics > before.carriedRelics) play("gather");
    if (snapshot.player.health < before.player.health || snapshot.threats.some(t => t.health < (before.threats.find(old => old.id === t.id)?.health ?? t.health))) play("hit");
    const alarm = snapshot.threats.some(t => t.damage === 0 && t.actionSequence > (before.threats.find(old => old.id === t.id)?.actionSequence ?? t.actionSequence));
    const warning = snapshot.threats.some(t => t.active && t.phase === "preparation" && before.threats.find(old => old.id === t.id)?.phase !== "preparation" && Math.hypot(t.position.x - snapshot.player.position.x, t.position.z - snapshot.player.position.z) < Math.max(12, t.reach));
    if ((alarm || warning) && performance.now() - lastWarning >= 900) {
      play(alarm ? "alarm" : "windup");
      lastWarning = performance.now();
    }
  }
  sync();
  return {
    unlock, update,
    reset() { previous = undefined; lastWarning = -Infinity; stopEffects(); },
    dispose() {
      disposed = true;
      listeners.abort();
      stopEffects();
      music.pause();
      music.removeAttribute("src");
      music.load();
      music.remove();
      panel.remove();
      buffers.clear();
      if (context) void context.close();
    },
  };
}
