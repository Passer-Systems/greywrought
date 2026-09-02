export type PresentationAudioCue =
  | "shield-activate"
  | "shield-absorb"
  | "shield-reflect"
  | "melee-swing"
  | "melee-hit"
  | "bolt-cast"
  | "bolt-launch"
  | "bolt-impact"
  | "boar-charge"
  | "boar-hit"
  | "boar-death"
  | "cannon-charge"
  | "cannon-fire"
  | "loot"
  | "objective"
  | "gate"
  | "ui-confirm";

interface AudioBuses {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly rain: GainNode;
  readonly effects: GainNode;
}

export interface PresentationAudio {
  context: AudioContext | null;
  buses: AudioBuses | null;
  musicTimer: number | null;
  musicBeat: number;
  started: boolean;
  volume: number;
}

const minimumGain = 0.0001;

export function createPresentationAudio(): PresentationAudio {
  return {
    context: null,
    buses: null,
    musicTimer: null,
    musicBeat: 0,
    started: false,
    volume: 1,
  };
}

function connectBuses(context: AudioContext): AudioBuses {
  const master = context.createGain();
  const music = context.createGain();
  const rain = context.createGain();
  const effects = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = 1;
  music.gain.value = 0.17;
  rain.gain.value = 0.085;
  effects.gain.value = 0.46;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;
  music.connect(master);
  rain.connect(master);
  effects.connect(master);
  master.connect(compressor).connect(context.destination);
  return { master, music, rain, effects };
}

function makeNoise(context: AudioContext, seconds: number, seed: number): AudioBuffer {
  const frameCount = Math.ceil(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = seed >>> 0;
  let previous = 0;
  for (let index = 0; index < samples.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 0xffffffff * 2 - 1;
    previous = previous * 0.36 + white * 0.64;
    samples[index] = previous;
  }
  return buffer;
}

function startRain(context: AudioContext, rainBus: GainNode): void {
  const noise = makeNoise(context, 3.7, 0x7f4a7c15);
  const makeLayer = (
    frequency: number,
    q: number,
    gainValue: number,
    pan: number,
    playbackRate: number,
  ): void => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = gainValue;
    panner.pan.value = pan;
    source.connect(filter).connect(gain).connect(panner).connect(rainBus);
    source.start();
  };
  makeLayer(940, 0.34, 0.5, -0.35, 0.91);
  makeLayer(3900, 0.55, 0.32, 0.42, 1.07);
  makeLayer(6100, 0.75, 0.13, 0.05, 1.23);
}

function note(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType = "triangle",
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(minimumGain, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.035, duration * 0.15));
  gain.gain.exponentialRampToValueAtTime(minimumGain, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function scheduleFantasyBeat(audio: PresentationAudio): void {
  const context = audio.context;
  const music = audio.buses?.music;
  if (context === null || music === undefined || context.state !== "running") return;
  const start = context.currentTime + 0.018;
  const melody = [293.66, 349.23, 440, 523.25, 440, 392, 329.63, 261.63];
  const bass = [73.42, 65.41, 55, 65.41];
  const step = audio.musicBeat % melody.length;
  note(context, music, melody[step]!, start, 0.46, 0.34, step % 3 === 0 ? "sine" : "triangle");
  note(context, music, melody[step]! * 2, start + 0.015, 0.24, 0.075, "sine");
  if (step % 2 === 0) {
    const root = bass[Math.floor(audio.musicBeat / 2) % bass.length]!;
    note(context, music, root, start, 0.88, 0.24, "triangle");
    note(context, music, root * 1.5, start + 0.035, 0.7, 0.11, "sine");
  }
  if (step === 0 || step === 4) {
    note(context, music, melody[step]! / 2, start, 1.75, 0.105, "sawtooth");
  }
  audio.musicBeat += 1;
}

function startSoundscape(audio: PresentationAudio): void {
  const context = audio.context;
  const buses = audio.buses;
  if (context === null || buses === null || audio.started) return;
  audio.started = true;
  startRain(context, buses.rain);
  scheduleFantasyBeat(audio);
  audio.musicTimer = window.setInterval(() => scheduleFantasyBeat(audio), 430);
  document.body.dataset.audioUnlocked = "true";
  document.body.dataset.placeholderMusic = "playing";
  document.body.dataset.rainAudio = "playing";
}

export function setPresentationAudioVolume(
  audio: PresentationAudio,
  volume: number,
): void {
  audio.volume = Math.max(0, Math.min(1, volume));
  const context = audio.context;
  const master = audio.buses?.master;
  if (context !== null && master !== undefined) {
    master.gain.setTargetAtTime(audio.volume, context.currentTime, 0.055);
  }
}

export function unlockPresentationAudio(audio: PresentationAudio): void {
  try {
    audio.context ??= new AudioContext();
    audio.buses ??= connectBuses(audio.context);
    setPresentationAudioVolume(audio, audio.volume);
    const start = (): void => startSoundscape(audio);
    if (audio.context.state === "suspended") {
      void audio.context.resume().then(start);
    } else {
      start();
    }
  } catch {
    document.body.dataset.audioUnlocked = "unavailable";
  }
}

function pitchedSweep(
  context: AudioContext,
  destination: AudioNode,
  from: number,
  to: number,
  duration: number,
  peak: number,
  type: OscillatorType = "triangle",
  delay = 0,
): void {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(20, from), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  gain.gain.setValueAtTime(minimumGain, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.018, duration * 0.18));
  gain.gain.exponentialRampToValueAtTime(minimumGain, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function noiseBurst(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  duration: number,
  peak: number,
  delay = 0,
): void {
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = makeNoise(context, duration + 0.04, 0x5c91a117 + Math.round(start * 1000));
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.7;
  gain.gain.setValueAtTime(Math.max(minimumGain, peak), start);
  gain.gain.exponentialRampToValueAtTime(minimumGain, start + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

export function playPresentationAudioCue(
  audio: PresentationAudio,
  cue: PresentationAudioCue,
): void {
  const context = audio.context;
  const effects = audio.buses?.effects;
  if (context === null || effects === undefined || context.state !== "running" || audio.volume <= 0) return;
  switch (cue) {
    case "shield-activate":
      pitchedSweep(context, effects, 280, 760, 0.22, 0.22, "sine");
      pitchedSweep(context, effects, 420, 980, 0.3, 0.12, "triangle", 0.025);
      break;
    case "shield-absorb":
      noiseBurst(context, effects, 520, 0.19, 0.26);
      pitchedSweep(context, effects, 340, 150, 0.24, 0.18, "sine");
      break;
    case "shield-reflect":
      noiseBurst(context, effects, 2100, 0.18, 0.22);
      pitchedSweep(context, effects, 620, 1760, 0.34, 0.3, "triangle");
      pitchedSweep(context, effects, 930, 2640, 0.28, 0.17, "sine", 0.035);
      break;
    case "melee-swing":
      noiseBurst(context, effects, 1550, 0.11, 0.18);
      pitchedSweep(context, effects, 430, 150, 0.13, 0.15, "sawtooth");
      break;
    case "melee-hit":
      noiseBurst(context, effects, 230, 0.16, 0.28);
      pitchedSweep(context, effects, 180, 72, 0.18, 0.22, "triangle");
      break;
    case "bolt-cast":
      pitchedSweep(context, effects, 360, 920, 0.42, 0.16, "sine");
      pitchedSweep(context, effects, 540, 1320, 0.38, 0.09, "triangle", 0.04);
      break;
    case "bolt-launch":
      noiseBurst(context, effects, 2500, 0.14, 0.16);
      pitchedSweep(context, effects, 1120, 540, 0.28, 0.27, "sawtooth");
      break;
    case "bolt-impact":
      noiseBurst(context, effects, 980, 0.2, 0.3);
      pitchedSweep(context, effects, 720, 110, 0.3, 0.24, "triangle");
      break;
    case "boar-charge":
      pitchedSweep(context, effects, 105, 48, 0.56, 0.32, "sawtooth");
      noiseBurst(context, effects, 125, 0.48, 0.22, 0.06);
      break;
    case "boar-hit":
      pitchedSweep(context, effects, 170, 92, 0.24, 0.26, "sawtooth");
      noiseBurst(context, effects, 340, 0.12, 0.18);
      break;
    case "boar-death":
      pitchedSweep(context, effects, 138, 42, 0.9, 0.36, "sawtooth");
      noiseBurst(context, effects, 105, 0.78, 0.28, 0.16);
      break;
    case "cannon-charge":
      pitchedSweep(context, effects, 92, 580, 0.82, 0.24, "sawtooth");
      break;
    case "cannon-fire":
      noiseBurst(context, effects, 1900, 0.24, 0.3);
      pitchedSweep(context, effects, 1640, 210, 0.32, 0.31, "square");
      break;
    case "loot":
      pitchedSweep(context, effects, 660, 990, 0.14, 0.2, "sine");
      pitchedSweep(context, effects, 880, 1320, 0.2, 0.18, "sine", 0.1);
      break;
    case "objective":
      note(context, effects, 523.25, context.currentTime, 0.46, 0.2, "triangle");
      note(context, effects, 659.25, context.currentTime + 0.12, 0.5, 0.2, "triangle");
      note(context, effects, 783.99, context.currentTime + 0.24, 0.72, 0.22, "triangle");
      break;
    case "gate":
      pitchedSweep(context, effects, 130, 260, 0.68, 0.22, "triangle");
      noiseBurst(context, effects, 160, 0.45, 0.15);
      break;
    case "ui-confirm":
      pitchedSweep(context, effects, 480, 640, 0.1, 0.12, "sine");
      break;
  }
}

export function disposePresentationAudio(audio: PresentationAudio): void {
  if (audio.musicTimer !== null) window.clearInterval(audio.musicTimer);
  audio.musicTimer = null;
  if (audio.context !== null) void audio.context.close();
  audio.context = null;
  audio.buses = null;
  audio.started = false;
}
