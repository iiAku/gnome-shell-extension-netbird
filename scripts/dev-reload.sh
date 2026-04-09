#!/usr/bin/env bash
# Quick reload loop for NetBird Status extension development.
#
# Caveats:
#   - Nested GNOME Shell only works from X11 or a TTY, not from within a Wayland session.
#   - If you're on Wayland, use `make install` and log out / back in instead.
#   - This script is best-effort: it tries to detect the environment and fall back gracefully.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Rebuilding and installing extension"
make install

SESSION_TYPE="${XDG_SESSION_TYPE:-unknown}"

if [[ "$SESSION_TYPE" == "wayland" ]]; then
    cat <<EOF
==> Detected Wayland session.

Nested GNOME Shell cannot run from inside a Wayland session reliably.
Either:
  1. Log out and back in, then: gnome-extensions enable netbird-status@iiaku
  2. Switch to a TTY (Ctrl+Alt+F3) and run this script again.
  3. Reboot into an X11 session if available.

Tailing extension logs in the meantime:
EOF
    exec make logs
fi

echo "==> Launching nested GNOME Shell (Ctrl+C or close window to exit)"
export MUTTER_DEBUG_DUMMY_MODE_SPECS="1280x720"
exec dbus-run-session -- gnome-shell --nested --wayland
