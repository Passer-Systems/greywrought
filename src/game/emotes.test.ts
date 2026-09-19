import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { EMOTES, findEmote, emoteText } from './emotes.js';

test('classic slash aliases resolve without collisions and preserve original action prose', () => {
  const names = EMOTES.flatMap(emote => [emote.name, ...emote.aliases]);
  expect(new Set(names).size).toBe(names.length);
  for (const name of ['train', 'wave', 'cheer', 'dance', 'applaud', 'bow', 'salute', 'rofl', 'oom', 'healme']) expect(findEmote(name)).toBeDefined();
  expect(findEmote('/LOL')?.name).toBe('laugh');
  expect(emoteText(findEmote('wave')!, 'Mara')).toContain('Mara');
  expect(findEmote('nonsense')).toBeUndefined();
});

test('dance repeats, survives time, cancels on movement or sit; gestures expire and are transient', () => {
  const game = createAdventure();
  game.emote('dance');
  expect(game.snapshot.player.emote).toEqual({ name: 'dance', sequence: 1 });
  game.advance(4);
  expect(game.snapshot.player.emote?.name).toBe('dance');
  game.emote('dance');
  expect(game.snapshot.player.emote?.sequence).toBe(2);
  expect(createAdventure({save:game.save()}).snapshot.player.emote).toBeNull();
  game.setAction('forward', true); game.advance(0.1); game.setAction('forward', false);
  expect(game.snapshot.player.emote).toBeNull();
  game.emote('wave'); game.advance(3.1);
  expect(game.snapshot.player.emote).toBeNull();
  game.emote('dance'); game.sit();
  expect(game.snapshot.player.emote).toBeNull();
  expect(game.snapshot.player.sitting).toBe(true);
  game.emote('stand'); expect(game.snapshot.player.sitting).toBe(false);
  game.emote('dance'); game.emote('stand'); expect(game.snapshot.player.emote).toBeNull();
});
