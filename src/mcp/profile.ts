import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { normalizedCharacterName, type CharacterArchetype, type LocalCharacter } from '../host/character-profile.js';

export const archetypes = ['warrior', 'mage', 'hunter', 'alchemist', 'artificer'] as const;
export interface PlayerProfile { version: 1; worldUrl: string; character: LocalCharacter; token: string; }
export function worldUrl(source = 'https://play.greywrought.com'): string {
  const url = new URL(source);
  if (url.username || url.password || url.search || url.hash) throw new Error('World URL must not contain credentials, a query, or a fragment.');
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Use an HTTP(S) or WebSocket world URL.');
  if (url.pathname === '/') url.pathname = '/world';
  if (url.pathname !== '/world') throw new Error('The game endpoint is /world.');
  return url.href;
}
export function defaultProfilePath(url: string): string {
  const key = new Bun.CryptoHasher('sha256').update(url).digest('hex').slice(0, 16);
  return join(homedir(), '.local', 'share', 'greywrought', 'mcp', key + '.json');
}
export async function loadProfile(path: string, url: string, name = 'Codex', archetype: CharacterArchetype = 'mage'): Promise<PlayerProfile> {
  if (normalizedCharacterName(name) !== name || !archetypes.includes(archetype)) throw new Error('Choose a valid character name and class.');
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as PlayerProfile;
    const c = value?.character;
    if (value.version !== 1 || value.worldUrl !== url || !c || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id)
      || typeof c.name !== 'string' || normalizedCharacterName(c.name) !== c.name || !archetypes.includes(c.archetype)
      || !Number.isSafeInteger(c.createdAtMillis) || c.createdAtMillis < 0 || typeof value.token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(value.token)) {
      throw new Error('Invalid profile or profile belongs to another world.');
    }
    if (c.name !== name || c.archetype !== archetype) throw new Error('Saved character name/class differs from configuration. Use its original settings or a separate profile file.');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot load the MCP character profile; it has been preserved. ' + (error instanceof SyntaxError ? 'Invalid JSON.' : (error as Error).message));
  }
  const value: PlayerProfile = { version: 1, worldUrl: url, character: { id: crypto.randomUUID(), name, archetype, createdAtMillis: Date.now() }, token: crypto.randomUUID() + crypto.randomUUID() };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Never overwrite an existing identity, including another process's new file.
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value) + '\n'); } finally { await file.close(); }
  return value;
}
