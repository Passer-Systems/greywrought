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

The service runs as the dedicated `greywrought` user with privilege escalation
disabled, home directories hidden, a read-only system, a private temporary
directory, and its existing writable `/var/lib/greywrought` state directory.
HTTPS responses add HSTS, deny embedding, and restrict objects, base URLs, and
form destinations without imposing a new script policy on the game.

Development and preview now use local worlds by default. This keeps localhost
out of production's allowlist and prevents development from changing live saves.
