#!/bin/bash -p
# Narrow web vitest run from any copy of the hub.
# The api root is taken from this script's own path (hub/scripts/term/ -> ../../..), never a fixed directory.
# - vite's cache goes to $HUB_CACHE_DIR, else a cache dir outside the checkout (never under node_modules);
# - `--configLoader runner` loads the config in-process, so vite writes no bundled config to node_modules/.vite-temp
#   (node_modules may be a symlink into another tree);
# - TMPDIR is a directory beside the cache; NODE_ENV=test.
# Usage: /bin/bash -p hub/scripts/term/vitest-narrow.sh hub/src/<file>.test.ts [more vitest args]   (narrow runs only, never
# the full suite). On a shared machine wrap it in a gate slot: /bin/bash -p hub/scripts/term/gate-slot.sh <this command>
# Started as `/bin/bash -p vitest-narrow.sh` (or executed directly: the #! line has -p). A plain `bash vitest-narrow.sh` is refused: that shell
# would already have run the caller's BASH_ENV / ENV / exported functions before this line.
case $- in *p*) ;; *) printf 'vitest-narrow: refused: TERM_NETNS_NOT_PRIVILEGED_SHELL (run it as /bin/bash -p %s)\n' "${BASH_SOURCE[0]}" >&2; exit 3 ;; esac
set -euo pipefail
# The OS boundary first (netns.sh, network, processes, files): outside it this script
# re-runs itself inside one; when that cannot be made it does not run at all (exit 3).
NETNS="$(/usr/bin/dirname "${BASH_SOURCE[0]}")/netns.sh"
/bin/bash -p "$NETNS" --confined || exec /bin/bash -p "$NETNS" /bin/bash -p "${BASH_SOURCE[0]}" "$@"
# Every program this script runs is pinned by absolute path, and nothing of the
# caller's runtime preloads ride along: NODE_OPTIONS / BUN_OPTIONS are SET to the fence's own options, never
# appended to (the privileged shell and netns.sh's env -i already dropped every caller startup hook).
NODE_BIN=/usr/bin/node; NICE_BIN=/usr/bin/nice
[ -x "$NODE_BIN" ] || { echo "vitest-narrow: $NODE_BIN missing" >&2; exit 2; }
API="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
[ -f "$API/hub/vite.config.mts" ] || { echo "vitest-narrow: $API/hub/vite.config.mts not found" >&2; exit 2; }
[ -e "$API/node_modules/vitest/vitest.mjs" ] || { echo "vitest-narrow: $API/node_modules/vitest missing (link or install node_modules beside hub/)" >&2; exit 2; }
[ $# -gt 0 ] || { echo "vitest-narrow: name the test file(s); a full run is not allowed here" >&2; exit 2; }
CACHE="${HUB_CACHE_DIR:-$(/usr/bin/dirname "$API")/tmp/vite-cache}"
/usr/bin/mkdir -p "$CACHE" "$CACHE-tmp"
cd "$API"
export HUB_CACHE_DIR="$CACHE"
export TMPDIR="$CACHE-tmp"
export NODE_ENV=test
# The network fence, installed here whoever calls this script: vitest and every node it starts
# import net-guard-node.mjs first, and any bun child preloads net-guard-runner.ts. Never left to an inherited
# NODE_OPTIONS: a caller with a clean environment gets the same fence as a gate runner.
FENCE="$API/hub/scripts/term"
export NODE_OPTIONS="--import $FENCE/net-guard-node.mjs --import $FENCE/node-test-env.mjs"
export BUN_OPTIONS="--preload=$FENCE/net-guard-runner.ts"
export HUB_NET_FENCE=runner
# Test-process isolation (separate from the fence): node-test-env.mjs, imported after the guard, keeps
# only the test keep-list of the environment and points HOME, XDG_* and HOODY_CONFIG_DIR at a fresh empty directory
# under hub/.term-cache/test-homes (removed when vitest exits; its workers reuse it).
# --fence-probe <js>: run <js> (an ES module) under exactly this environment instead of vitest (net-guard-proof.ts).
if [ "${1:-}" = "--fence-probe" ]; then exec "$NODE_BIN" --input-type=module -e "${2:?}"; fi
exec "$NICE_BIN" -n 15 "$NODE_BIN" --wasm-max-mem-pages=4096 node_modules/vitest/vitest.mjs run --config hub/vite.config.mts --configLoader runner "$@"
