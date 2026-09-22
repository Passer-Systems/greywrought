# Public game access

The public game is served at `https://play.greywrought.com/` through Cloudflare.
The origin host allows TCP 80/443 only from Cloudflare's published IPv4 and
IPv6 networks. Origin UDP 443 is closed; HTTP/3 at Cloudflare's edge remains
available. SSH remains public with key authentication and no password login.
The world service and Caddy's administration listener bind to loopback only.

`greywrought:ops/cloudflare-networks.txt` records the ranges retrieved on
2026-09-21 from `https://www.cloudflare.com/ips-v4` and
`https://www.cloudflare.com/ips-v6`. Review those sources when updating the
allowlist. This trusts Cloudflare's network, not a specific Cloudflare account;
it is not tenant-specific authenticated origin access or a complete DDoS guarantee.

`greywrought:ops/apply-web-ingress.sh` installs the adjacent Caddy configuration
and firewall rules on `greywrought-dev`. It saves the previous rules and Caddy
configuration under `/var/backups/greywrought-ingress.*` and arms a ten-minute
automatic recovery timer. After checking a new SSH session, public HTTPS and
WebSocket access, and rejection of direct-origin HTTPS, stop
`greywrought-ingress-rollback.timer`. The backup's `restore.sh` also permits
manual recovery. Caddy uses HTTP-01 certificate renewal through Cloudflare;
TLS-ALPN validation is disabled because certificate authorities cannot reach
the origin directly. Keep port 80 reachable from Cloudflare and do not block
`/.well-known/acme-challenge/` at the edge. Renewal has not been forced as part
of this change.

## Game connections

The production service explicitly requires the browser Origin
`https://play.greywrought.com`. Missing, `null`, localhost, and other Origins
are rejected. This prevents unwanted browser origins from opening game sockets;
Origin is not authentication because custom clients can supply it themselves.
Character access still requires the existing bearer token, stored only as a
SHA-256 hash by the server. Existing tokens and save files remain valid.

Caddy overwrites `X-Greywrought-Client-IP` with Cloudflare's `CF-Connecting-IP`.
With `GREYWROUGHT_TRUST_PROXY=1`, the world server accepts that address only from
a loopback peer and requires a valid single IP. Otherwise it uses the socket's
actual peer address. The firewall restriction is a prerequisite for trusting
Cloudflare's header; do not expose Caddy directly while retaining this setup.

Each client address permits 60 connection attempts per minute, 32 concurrent
sockets, and 40 new characters per ten minutes. Reconnecting an existing
character does not consume a new-character allowance. Address records expire
when idle and are capped at 4096. Each socket permits at most 300 incoming
messages per second before being closed, including malformed, unjoined, and
priority messages. The existing 120 gameplay commands/second, three chat
messages/second, 16 KiB payload limit, join timeout, backpressure limit, and
disconnect grace still apply. These are abuse bounds, not new gameplay limits.
Limits reset when the service restarts and do not defeat distributed clients.

Movement previews retain only the latest pending request per connection and run
at most five times per second per player, with one preview processed per 50 ms
server tick. This caps preview simulations at twenty per second across the
world; superseded requests resolve without leaving the latest hover blank.
Successful resume/rejoin controls share a four-per-second limit. Explicit pause
and movement release remain available; pausing an already paused encounter is a
no-op. Saves coalesce while a write is in flight instead of retaining a separate
serialized world for every request, and shutdown awaits the final save.

The service runs as the dedicated `greywrought` user with privilege escalation
disabled, home directories hidden, a read-only system, a private temporary
directory, and its existing writable `/var/lib/greywrought` state directory.
HTTPS responses add HSTS, deny embedding, and restrict objects, base URLs, and
form destinations without imposing a new script policy on the game.

Development and preview now use local worlds by default. This keeps localhost
out of production's allowlist and prevents development from changing live saves.

## Client authority

Clients request actions; the server owns simulation time, movement, damage,
inventory, quest rewards, loot claims, and returning from private encounters.
Commands operate on the character bound to the authenticated socket. They cannot
select another actor or upload a replacement world save. Movement consumes server
simulation time, and movement plans are checked against server range and terrain.
Unknown target identifiers are ignored without throwing through the connection.

The security socket tests in `greywrought:src/server/world-service.test.ts`
exercise wrong-token joins and lookups, forged actor and chat attribution,
identity rebinding, unauthenticated actions, repeated command sequences, invalid
quantities and movement fields, and malformed target IDs. Chat is rendered as
text; `greywrought:acceptance/browser/security-access.ts` checks markup containing
event handlers in an actual browser. These checks did not reproduce account
takeover. Whoever possesses a character's bearer token can use it; this prototype
does not provide password recovery or token revocation.

Verification for this pass covered the socket security suite, the focused target
regression, local browser entry/chat/reconnect, timed combat hover and execution,
backup retention, and an isolated restore. A broader run of
`greywrought:src/game/adventure.test.ts` also reported long-combat timing failures;
those gameplay tests remain a separate follow-up, not a passing claim here.

Origins describe a site's scheme, host, and port, not a player's IP address.
The previous localhost access was an explicit development allowlist, not a CORS
wildcard. A custom client can claim an allowed Origin, so origin checks never
replace token ownership or server-side action validation. Being able to ping or
connect to the public game does not itself provide access to another character.

## Backups and recovery

The authoritative save is `/var/lib/greywrought/world.json`, readable only by the
game service user and root. It is outside Caddy's web root. File-based storage
does not itself expose data, and changing databases would not replace these
access checks. Existing deployment snapshots are retained separately.

`greywrought-backup.timer` runs hourly on the game server. The root-owned
`greywrought:ops/backup-world.sh` takes a compressed copy of one atomically written
save and retains seven days under `/var/backups/greywrought/hourly`. The service
cannot overwrite those backups. Each backup contains both character ownership
hashes and world progress; restore them together.

Tom's `greywrought-backup-pull.timer` copies the latest backup over authenticated
SSH into `~/.local/state/greywrought-backups`, retaining thirty days with private
directory/file permissions. It runs hourly while this machine is available and
catches up when its user service manager starts. It is an additional copy on a
different machine, not an always-on managed backup service. A server save was
restored into an isolated copy and successfully loaded by the game server;
production remained online during that check. DigitalOcean's provider-level
backup setting has not been verified.

The source units and scripts are in `greywrought:ops/greywrought-backup*` and
`greywrought:ops/pull-world-backup.sh`. On the game server, install the backup
script as `/usr/local/libexec/greywrought-backup`, create
`/var/backups/greywrought` with mode 0700, install the service/timer under
`/etc/systemd/system`, and enable `greywrought-backup.timer`. On Tom's machine,
install the pull script as `~/.local/libexec/greywrought-pull-backup`, install the
pull service/timer under `~/.config/systemd/user`, and enable the user timer.

To restore production, stop `greywrought-world.service`, preserve the current
save, decompress the selected backup into a temporary file beside the save,
set ownership to `greywrought:greywrought` and mode 0600, then atomically rename
it to `/var/lib/greywrought/world.json` before starting the service. Load the
candidate with an isolated server first, and retain the previous save until
health and character entry succeed. Never restore over a running writer.
