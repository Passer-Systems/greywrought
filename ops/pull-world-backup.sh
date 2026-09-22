#!/usr/bin/env bash
set -euo pipefail
umask 077
export PATH=/run/current-system/sw/bin:/usr/bin:/bin

backup_dir="$HOME/.local/state/greywrought-backups"
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9 || exit 0
temporary=$(mktemp "$backup_dir/.incoming.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
scp -q -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 \
  -i "$HOME/.ssh/greywrought-wiki-admin" \
  root@137.184.38.104:/var/backups/greywrought/hourly/latest.json.gz "$temporary"
gzip -t -- "$temporary"
stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
mv -- "$temporary" "$backup_dir/world-$stamp.json.gz"
find "$backup_dir" -maxdepth 1 -type f -name 'world-*.json.gz' -mmin +43200 -delete
echo "Copied protected world backup to $backup_dir"
