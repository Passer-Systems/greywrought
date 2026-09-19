import type { ForestActor } from './frostwood-assets.js';

const clips: Readonly<Record<string, string>> = {
  dance: 'Dance', wave: 'Wave', greet: 'Wave', hello: 'Wave', bye: 'Wave',
  cheer: 'Cheer', congrats: 'Cheer', victory: 'Cheer', train: 'Train',
};

export function createSocialAnimation() {
  let lastSequence: number | null = null;
  let sittingPlayed = false;
  return (actor: ForestActor, sitting: boolean, emote: { readonly name: string; readonly sequence: number } | null | undefined): boolean => {
    if (sitting) {
      if (!sittingPlayed) actor.play('SitDown', false);
      sittingPlayed = true; lastSequence = null;
      return true;
    }
    sittingPlayed = false;
    if (!emote) { lastSequence = null; return false; }
    const clip = clips[emote.name];
    if (!clip) return false;
    if (lastSequence !== emote.sequence) {
      actor.play(clip, emote.name === 'dance').reset().play();
      lastSequence = emote.sequence;
    }
    return actor.action?.getClip().name === clip && actor.action.isRunning();
  };
}
