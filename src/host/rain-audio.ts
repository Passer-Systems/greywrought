/** A soft stereo patter with scattered drops and a continuous, subdued wash. */
export function createRainAudio(context: BaseAudioContext, output: AudioNode) {
  const seconds = 8, frames = context.sampleRate * seconds;
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 8137 + channel * 3011, low = 0, mid = 0, splash = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const decay = Math.exp(-1 / (context.sampleRate * .008));
    for (let i = 0; i < frames; i++) {
      const white = random() * 2 - 1;
      low = low * .985 + white * .015;
      mid = mid * .75 + white * .25;
      if (random() < 18 / context.sampleRate) splash = .12 + random() * .2;
      splash *= decay;
      data[i] = low * .7 + mid * .4 + white * (.035 + splash);
    }
    // A periodic crossfade keeps the loop join continuous.
    const seam = Math.floor(context.sampleRate * .04);
    const start = data.slice(0, seam);
    for (let i = 0; i < seam; i++) {
      const t = i / (seam - 1);
      data[frames - seam + i] = data[frames - seam + i]! * (1 - t) + start[i]! * t;
    }
  }
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
  source.buffer = buffer; source.loop = true; source.loopStart = .04;
  filter.type = 'lowpass'; filter.frequency.value = 3600; filter.Q.value = .5;
  gain.gain.value = 0;
  source.connect(filter); filter.connect(gain); gain.connect(output); source.start();
  let previousLevel = -1, previousCutoff = -1;
  return {
    update(intensity: number, shelter: 'outdoors' | 'cave' | 'underwater', audible: boolean) {
      const attenuation = shelter === 'underwater' ? .035 : shelter === 'cave' ? .12 : 1;
      const level = audible ? intensity * .4 * attenuation : 0;
      const cutoff = shelter === 'underwater' ? 320 : shelter === 'cave' ? 950 : 3600;
      if (level !== previousLevel) { gain.gain.setTargetAtTime(level, context.currentTime, audible ? .35 : .025); previousLevel = level; }
      if (cutoff !== previousCutoff) { filter.frequency.setTargetAtTime(cutoff, context.currentTime, .3); previousCutoff = cutoff; }
      return level;
    },
    dispose() { source.stop(); source.disconnect(); filter.disconnect(); gain.disconnect(); },
  };
}
