#!/bin/bash -p
# gate-slot.sh <cmd...>: runs <cmd> in one of the machine's six vitest gate slots and tells everything below it
# that the slot is held (HUB_GATE_SLOT_HELD=1), so check.ts's web-scenarios gate takes no second one (gate-slot.ts).
# Already held (HUB_GATE_SLOT_HELD=1) or no slot directory: runs <cmd> directly. Waits at most 300 s for a slot.
#   /bin/bash -p hub/scripts/term/gate-slot.sh bun scripts/term/check.ts --page keys
# Started as `/bin/bash -p gate-slot.sh` (or executed directly: the #! line has -p). A plain `bash gate-slot.sh` is refused: that shell
# would already have run the caller's BASH_ENV / ENV / exported functions before this line.
case $- in *p*) ;; *) printf 'gate-slot: refused: TERM_NETNS_NOT_PRIVILEGED_SHELL (run it as /bin/bash -p %s)\n' "${BASH_SOURCE[0]}" >&2; exit 3 ;; esac
set -euo pipefail
# The OS boundary first (netns.sh, network, processes, files): outside it this script
# re-runs itself inside one; when that cannot be made it does not run at all (exit 3).
NETNS="$(/usr/bin/dirname "${BASH_SOURCE[0]}")/netns.sh"
/bin/bash -p "$NETNS" --confined || exec /bin/bash -p "$NETNS" /bin/bash -p "${BASH_SOURCE[0]}" "$@"
[ $# -gt 0 ] || { echo "gate-slot: name the command" >&2; exit 2; }
# The slot base: HUB_GATE_SLOTS as netns.sh exported it (from the caller, else the host file
# ~/.config/hoody-hub-term/gate-slots); none = no slots. One line says which.
BASE="${HUB_GATE_SLOTS:-}"
# Pinned programs.
if [ "${HUB_GATE_SLOT_HELD:-}" = 1 ]; then exec "$@"; fi
if [ -z "$BASE" ] || [ ! -d "$(/usr/bin/dirname "$BASE")" ]; then echo "gate-slot: no slots" >&2; exec "$@"; fi
echo "gate-slot: slots $BASE.<0-5>.lock" >&2
export HUB_GATE_SLOT_HELD=1
exec /usr/bin/flock -w 300 "$BASE.$((RANDOM % 6)).lock" "$@"
