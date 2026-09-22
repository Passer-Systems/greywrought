#!/usr/bin/env bash
set -euo pipefail
umask 077

source_file=${1:-/var/lib/greywrought/world.json}
backup_dir=${2:-/var/backups/greywrought/hourly}
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9 || exit 0

stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
name="world-$stamp.json.gz"
temporary=$(mktemp "$backup_dir/.world.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
# The world service replaces its save with rename, so this open reads one save.
gzip -c -- "$source_file" > "$temporary"
gzip -t -- "$temporary"
mv -- "$temporary" "$backup_dir/$name"
ln -s -- "$name" "$temporary"
mv -Tf -- "$temporary" "$backup_dir/latest.json.gz"
find "$backup_dir" -maxdepth 1 -type f -name 'world-*.json.gz' -mmin +10080 -delete
echo "Saved $backup_dir/$name"
