#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_root"
operation="${1:-play}"
if (( $# )); then shift; fi

case "$operation" in
  build)
    exec cargo build --locked --features desktop --bin greywrought-desktop --target-dir build/desktop-target -j 2 "$@"
    ;;
  play)
    for library in x11 xcursor xi xrandr xkbcommon vulkan; do
      library_dir="$(pkg-config --variable=libdir "$library")"
      export LD_LIBRARY_PATH="$library_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    done
    export LD_LIBRARY_PATH="/run/opengl-driver/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    exec "$project_root/build/desktop-target/debug/greywrought-desktop" --root "$project_root" "$@"
    ;;
  *)
    printf 'Usage: native-dev.sh build|play [arguments]\n' >&2
    exit 2
    ;;
esac
