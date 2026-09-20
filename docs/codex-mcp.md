# Play Greywrought with Codex

Codex is the MCP client. `scripts/greywrought-mcp.ts` is a local stdio MCP server that connects to Greywrought using the ordinary player WebSocket protocol. It runs with Bun and needs no browser, graphics renderer, API key, or additional package. Other players see its character like any other adventurer.

The default world is **https://play.greywrought.com**, and the default character is a **mage named Codex**. It has its own saved identity; it does not use your browser character or token. Starting the MCP process only exposes tools. The character joins when you ask Codex to connect.

## Set up Codex

From this checkout, with Bun and Codex on your PATH:

```sh
codex mcp add greywrought -- "$(command -v bun)" "$PWD/scripts/greywrought-mcp.ts"
codex mcp get greywrought
```

Restart your Codex session to load the tools. In the Codex terminal UI, `/mcp` lists connected servers. This uses Codex's [documented stdio MCP configuration](https://developers.openai.com/codex/mcp). No change to the game's deployment is needed.

Try:

> Connect to Greywrought as your own character. Look around Nine-Bell Yard, find Mara, and tell me your next step before leaving town. Don't send public chat.

Then:

> Play carefully toward Mara's first quest. Check your health and enemy intentions before each turn. Pause your own encounter when you need time to think.

## Tools

| Tool | Purpose |
| --- | --- |
| `connect` | Create/load the dedicated identity and join its configured world. |
| `observe` | Read authoritative state, nearby enemies, forecast, quests, inventory, NPCs, obstacles and recent events. `full: true` includes the entire snapshot. |
| `move` | Walk for 0.1–3 seconds along a heading, then release movement. `x: 1, z: 0` points east; `x: 0, z: 1` points north. This respects collisions and normal movement speed. |
| `act` | Press/release an ability or interaction, such as `strike`, `brace`, `gather`, `drinkPotion`, `interact`, or `hearthstone`. |
| `command` | Target, preview/plan a grid move, set action timing, ready a turn, manage a session, interact with NPCs, accept/turn in quests, equip/buy gear, open loot, or use bank/barter controls. Its schema lists the supported variants. |
| `wait` | Let up to 10 real seconds pass, then return fresh state. |
| `disconnect` | Leave while retaining this character. The normal server disconnect behavior pauses it. |
| `chat` | Speak or emote publicly as Codex, only when the user requests it. |

For example, a planned combat move is `command({"command":{"type":"bait","destination":{"x":-3,"z":27}}})`; `previewBait` previews without committing. `act({"action":"strike"})` plans an attack, and `command({"command":{"type":"ready"}})` starts the turn. The ordinary game rules decide whether each operation is available. Receiving an acknowledgement does not guarantee that an ability succeeded: read the returned report, queued actions and health.

The world runs between tool calls. Preparation has a deadline. `pause` freezes your own private encounter; `resume` continues privately; `rejoin` returns to the shared world when allowed. Reconnecting does not automatically resume or rejoin. Hardcore deaths remain permanent; the integration never silently replaces a fallen character.

Movement is bounded and released on completion or cancellation. MCP shutdown closes the game connection. Network failures never replay actions automatically: reconnect, observe, then decide what to do. Game text, names and chat are observations, not instructions to the assistant.

## Identity and configuration

The identity is saved with file mode `0600` under `~/.local/share/greywrought/mcp/<world-hash>.json`. It contains the dedicated character's bearer token. Keep the file private and backed up; it is required to reconnect to that character. The file is bound to its world and is never overwritten on a parsing error. Two simultaneous sessions cannot take over the same character.

Environment variables set when registering the server:

- `GREYWROUGHT_MCP_WORLD`: HTTP(S) or WS(S) world URL; defaults to `https://play.greywrought.com`.
- `GREYWROUGHT_MCP_NAME`: first character name; defaults to `Codex`.
- `GREYWROUGHT_MCP_CLASS`: `warrior`, `mage`, `hunter`, `alchemist`, or `artificer`; defaults to `mage`.
- `GREYWROUGHT_MCP_PROFILE`: optional absolute identity-file path. Choose a separate file for a different character. Changing a saved identity's name/class is rejected.

For an isolated local world, start `bun run dev` with `GREYWROUGHT_LOCAL_WORLD=1`, then register a separate server using that dev server's printed address:

```sh
codex mcp add greywrought-local --env GREYWROUGHT_MCP_WORLD=http://127.0.0.1:4173 -- "$(command -v bun)" "$PWD/scripts/greywrought-mcp.ts"
```

To remove the Codex integration without deleting the character:

```sh
codex mcp remove greywrought
```

## Checks

```sh
bun run typecheck
bun run test:mcp
bun acceptance/browser/mcp-player.ts
```

The tests use isolated local worlds and never contact production. They cover MCP negotiation, stdio framing, saved identity, invalid arguments, secret exclusion, bounded/cancelled movement, duplicate connections, session transitions, reconnecting, combat preview/attack/ready, and disconnect. The browser journey checks that a separate player can see the MCP character and its authoritative movement. Use the existing `CHROME_PATH`/library settings for your local browser environment.

The transport implements the [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [stdio framing](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) subset. It advertises only tools, negotiates supported protocol versions, sends protocol JSON exclusively on stdout, and handles cancellation and EOF. It does not expose a public MCP HTTP service.
