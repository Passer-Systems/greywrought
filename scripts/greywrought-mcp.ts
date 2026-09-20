import { McpServer } from '../src/mcp/protocol.js';
import { GameTools } from '../src/mcp/tools.js';
import { archetypes, defaultProfilePath, worldUrl } from '../src/mcp/profile.js';
import type { CharacterArchetype } from '../src/host/character-profile.js';

// stdout is exclusively newline-delimited MCP JSON-RPC, including at startup.
const url = worldUrl(Bun.env.GREYWROUGHT_MCP_WORLD);
const archetype = Bun.env.GREYWROUGHT_MCP_CLASS ?? 'mage';
if (!archetypes.includes(archetype as CharacterArchetype)) throw new Error('Invalid GREYWROUGHT_MCP_CLASS.');
const game = new GameTools({ url, profilePath: Bun.env.GREYWROUGHT_MCP_PROFILE ?? defaultProfilePath(url),
  name: Bun.env.GREYWROUGHT_MCP_NAME ?? 'Codex', archetype: archetype as CharacterArchetype });
const server = new McpServer(game, message => process.stdout.write(JSON.stringify(message) + '\n'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.close(); process.exit(0); });
const decoder = new TextDecoder();
const input = Bun.stdin.stream().getReader();
let buffer = '';
try {
  while (true) {
    const { value: chunk, done } = await input.read();
    if (done) break;
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (line) server.receive(line);
    }
    if (buffer.length > 65536) throw new Error('MCP input line exceeds 64 KiB.');
  }
} finally { input.releaseLock(); server.close(); await server.settled(); }
