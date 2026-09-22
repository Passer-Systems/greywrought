#!/usr/bin/env bash
set -euo pipefail

test "$(id -u)" = 0
test "$(hostname)" = greywrought-dev
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
networks="$source_dir/cloudflare-networks.txt"
python3 - "$networks" <<'PY'
import ipaddress, pathlib, sys
networks = [ipaddress.ip_network(line) for line in pathlib.Path(sys.argv[1]).read_text().splitlines()]
assert networks and {network.version for network in networks} == {4, 6}
assert all(network.is_global and network.prefixlen >= (12 if network.version == 4 else 28) for network in networks)
PY
ufw status | grep -q '^Status: active$'
caddy validate --config "$source_dir/Caddyfile" --adapter caddyfile
if systemctl is-active --quiet greywrought-ingress-rollback.timer; then
  echo 'An earlier ingress update is still awaiting verification.' >&2
  exit 1
fi

umask 077
backup=$(mktemp -d /var/backups/greywrought-ingress.XXXXXXXX)
cp -p /etc/ufw/user.rules /etc/ufw/user6.rules /etc/caddy/Caddyfile "$backup/"
cat > "$backup/restore.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cp -p '$backup/user.rules' /etc/ufw/user.rules
cp -p '$backup/user6.rules' /etc/ufw/user6.rules
ufw reload
cp -p '$backup/Caddyfile' /etc/caddy/Caddyfile
systemctl reload caddy
EOF
chmod 700 "$backup/restore.sh"
systemd-run --unit=greywrought-ingress-rollback --on-active=10m /bin/bash "$backup/restore.sh"

# Add the edge paths before removing the broad rules; SSH is left intact.
while IFS= read -r network; do
  ufw allow proto tcp from "$network" to any port 80,443 comment 'Cloudflare web ingress'
done < "$networks"
install -m 644 "$source_dir/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy
ufw --force delete allow 80/tcp
ufw --force delete allow 443/tcp
ufw --force delete allow 443/udp

echo "Recovery copy: $backup"
echo 'Verify fresh SSH, public HTTPS and WebSocket access, and blocked direct HTTPS.'
echo 'Then cancel recovery: systemctl stop greywrought-ingress-rollback.timer'
