#!/usr/bin/env bash
set -euo pipefail

runtime_root="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)"
library_path="$(<"$runtime_root/runtime-library-path")"
export LD_LIBRARY_PATH="$library_path${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$runtime_root/bin/greywrought-desktop" --root "$runtime_root" "$@"
