#!/bin/bash -p
# netns.sh: the OS boundary of every test entry. The JavaScript
# fences (test-net-guard.ts, net-guard-node.mjs) are early diagnostics only: native code, alternate runtime exports and
# unfenced executables never go through them. This boundary is the kernel's, in four parts:
#   - environment: the command starts with an environment rebuilt from named keys only (env -i; KEEP below), in a
#     privileged-mode shell (bash -p: no BASH_ENV, ENV, imported functions, SHELLOPTS); descriptors above 2 are closed;
#   - network: a new network namespace whose only interface is loopback (up, so loopback fakes still serve);
#   - processes: a new pid namespace with its own /proc (no /proc/<pid>/root or /fd of a process outside);
#   - files: a new mount namespace whose root is a fresh tmpfs holding ONLY: /usr /etc /bin /sbin /lib* read-only, a
#     minimal /dev (null zero full random urandom tty, its own devpts instance: no host terminal, fresh /dev/shm), fresh
#     /tmp /run and $HOME, the working directory read-write (the repository root, hub/../..: only the repository, never
#     the directory it was cloned into), every node_modules tree
#     module resolution from hub can reach (hub and its ancestors, at their real paths) read-only, the runtime executable (bun) read-only, and the host's
#     optional slot lock FILES (HUB_GATE_SLOTS, HUB_TERM_IO_LOCK), and the sibling-tree SOURCE files listed in netns-read.list
#     and in the optional host list /etc/hoody-hub-term/read-list
#     (read-only). Every other path (other homes, the other content of the directory holding the repository (for a clone
#     under $HOME: the caller's other files there; in it exist only the paths above that lie there and the directories
#     leading to them), the rest of the monorepo (the roots of netns-read.list) and its .env files and databases, the rest of
#     /var/tmp, sockets under /run, /tmp, $HOME) does not exist inside.
#
#   /bin/bash -p netns.sh <cmd...>          run <cmd> inside the boundary (already inside: exec it directly)
#   /bin/bash -p netns.sh --fresh <cmd...>  always build a new boundary (nested when already inside; the proofs use it)
#   /bin/bash -p netns.sh --confined        exit 0 when this process is already inside one
#
# Shape: env -i <KEEP> unshare -rnmpf (root of a user namespace, plus network, mount and pid namespaces) -> as pid 1:
# `ip link set lo up`, the tmpfs root, then a second user namespace mapping our own uid/gid back and chrooted into it
# (files, locks and process ownership look as outside). Pid 1 forwards TERM/INT/HUP/QUIT to the command and exits with
# its status (pid 1 of a pid namespace ignores a signal it has no handler for). No privilege is needed. There is NO
# fallback: when any step fails, or the result is not confined, the command does not run (exit 3, fixed reason code).
# "Inside" is read from the kernel (/proc/self/net/dev and /proc/self/mountinfo), never from an environment variable.
# Every executable is pinned by absolute path, except the runtime (bun): it is looked up on the caller's PATH with every
# directory inside the working directory left out (lookup_path), so a confined run cannot plant a `bun` that a later start runs
# outside the boundary (node_modules/.bin is on PATH under `bun run`).
#
# Read-only inside the working directory: this script, netns-read.list and what runs BEFORE the chroot (netns-roots.ts and its
# imports: GUARDED below, pinned to netns-roots.ts's import closure by netns.term.test.ts), so a confined command cannot
# change what the next run executes outside the boundary with the network.
#
# Not covered: what the working directory itself holds (it is read-write inside: a pathname
# socket someone put there is reachable), /etc (system configuration, read-only), and the kernel's abstract sockets of
# OTHER network namespaces (unreachable by construction: abstract sockets are per network namespace). The rest of the working directory
# stays writable, so the boundary does not hold against code that persists something a later run executes OUTSIDE it
# (package.json scripts, configs, gate scripts started outside): it confines a run, it does not make the working directory
# trustworthy after running untrusted code. Known limit of GUARDED: only each file is bound, so a directory between the
# repository root and a guarded file (hub/, hub/hub, hub/scripts, hub/scripts/term) can still be renamed from inside and
# a replacement netns.sh written in its place (the repository root itself is a mount point inside and cannot be moved).
# Closing that needs the boundary to run from a copy outside the working directory (not done; netns.term.test.ts records the limit).
case $- in *p*) ;; *) printf 'netns: refused: TERM_NETNS_NOT_PRIVILEGED_SHELL (run it as /bin/bash -p %s)\n' "${BASH_SOURCE[0]}" >&2; exit 3 ;; esac
set -euo pipefail
SELF="$(/usr/bin/realpath -e -- "${BASH_SOURCE[0]}")"
HERE="${SELF%/*}"
HUB="$(/usr/bin/realpath -e -- "$HERE/../..")"
TREE="$(/usr/bin/realpath -e -- "$HUB/../..")"
TAG=hub-term-root
# Hub-relative files bound read-only inside: the boundary itself, its read list, and netns-roots.ts with every module it
# imports (it runs outside the chroot, at the --inner step).
GUARDED=(scripts/term/netns.sh scripts/term/netns-read.list scripts/term/netns-roots.ts scripts/lib.ts
  src/app/search-proofs-run.ts src/app/search-proofs.ts)

refuse() { printf 'netns: refused: %s\n' "$1" >&2; exit 3; }

# A host file of /etc/hoody-hub-term (read-roots, read-list) is used only when its directory and the file are each not a
# link, owned by root (the owner of /usr/bin/env) and not group- or world-writable, and the file is a readable regular
# file; scripts/lib.ts hostFileState() is the same rule. Prints ok, absent (no directory or file: silent) or refused.
# Known limit: inside a user namespace every unmapped id (real root and any other user) shows as the same overflow id,
# so there the owner test only rules out the mapped user's own files. The verdict that counts is therefore taken on the
# host, before unshare, and passed to --inner; the check inside only narrows it further.
host_file_state() {
  local f d r m
  f="$1"; d="${f%/*}"
  r="$(/usr/bin/stat -c '%u' -- /usr/bin/env 2>/dev/null || true)"
  [ -n "$r" ] || { echo refused; return; }
  if [ ! -e "$d" ] && [ ! -L "$d" ]; then echo absent; return; fi
  [ -d "$d" ] && [ ! -L "$d" ] || { echo refused; return; }
  m="$(/usr/bin/stat -c '%u %a' -- "$d" 2>/dev/null || true)"
  case "$m" in "$r "*[0145][0145]) ;; *) echo refused; return ;; esac
  if [ ! -e "$f" ] && [ ! -L "$f" ]; then echo absent; return; fi
  [ -f "$f" ] && [ ! -L "$f" ] && [ -r "$f" ] || { echo refused; return; }
  m="$(/usr/bin/stat -c '%u %a' -- "$f" 2>/dev/null || true)"
  case "$m" in "$r "*[0145][0145]) echo ok ;; *) echo refused ;; esac
}

# The environment a boundary starts with: these names only (values re-checked by the JS fence: net-policy ENV_RULES).
# Pinned equal to net-policy.mjs ENV_KEEP (minus the runtime option variables, set again inside by our own scripts)
# plus HOME, TERMSHOT, COLORTERM and HUB_NETNS_REEXEC (netns.term.test.ts 'keep list').
KEEP=(PATH HOME NODE_ENV TZ LANG LC_ALL TERM COLORTERM FORCE_COLOR NO_COLOR CI TMPDIR TERMSHOT HUB_NETNS_REEXEC
  UPDATE_GOLDEN SECRETS_PAGE_TIMEOUT_MS SECRETS_CASES GRAPH_FIXTURES_DIR TERM_SETTLE_STILL TERM_HOLD_LONG TERM_CHILD_GRACE_MS
  TERM_IDLE_DEBUG TERM_IDLE_FILE TERM_CACHE TERM_COLOUR HUB_CACHE_DIR HUB_WORK_DIR HUB_GATE_SLOTS HUB_GATE_SLOT_HELD HUB_TERM_IO_LOCK
  HUB_NET_FENCE HUB_SCENARIO HUB_PAGE HUB_CHECK_PAGE HUB_SDK_ROOT HUB_SDK_DRIFT HUB_OPS_REGEN HUB_API_CATALOG_REGEN
  HUB_STORAGE_REGEN HUB_VOICE_CODES_REGEN HUB_API_SYNC HUB_BOARD_SYNC HUB_BENCH HUB_PERF HUB_PERF_RUNS HUB_PERF_CPU
  HUB_FX_OUT HUB_SCENARIO_OUT HUB_ANATOMY_DONE HUB_AGENT_SRC HUB_AGENT_SPEC HUB_API_DOCS HUB_API_SDK HUB_BOARD_KITS
  HUB_BOARD_SDK HUB_BOT_SDK HUB_FILES_OPENAPI HUB_FILES_REGISTRY HUB_FILES_VALIDATION HUB_LIMITS_KITS HUB_RUNOPEN_SDK
  HUB_RUNOPEN_RUN_MODEL HUB_SHARE_API_SRC OVERLAY_DIR OVERLAY_SRC HUB_TERM_CACHE HUB_TRANSFORM_CACHE)

# Confined = this process's network namespace has only `lo`, AND its root is this script's tmpfs (mountinfo: mount
# point "/", filesystem tmpfs, source TAG).
confined() {
  local line name n=0
  { read -r _; read -r _; while read -r line; do name="${line%%:*}"; name="${name// /}"; [ "$name" = lo ] || return 1; n=$((n + 1)); done; } < /proc/self/net/dev || return 1
  [ "$n" -ge 1 ] || return 1
  local mp rest fs src
  while read -r _ _ _ _ mp rest; do
    [ "$mp" = / ] || continue
    rest="${rest#* - }"; read -r fs src _ <<< "$rest"
    [ "$fs" = tmpfs ] && [ "$src" = "$TAG" ] && return 0
  done < /proc/self/mountinfo
  return 1
}

# Every descriptor above stderr closed (an inherited connected socket would skip the namespace).
close_fds() {
  local p n fds=()
  for p in /proc/self/fd/*; do n="${p##*/}"; fds+=("$n"); done
  for n in "${fds[@]}"; do if [ "$n" -gt 2 ]; then exec {n}>&-; fi; done 2>/dev/null || true
}

# A path the boundary may hand inside: under the working directory, or under the fresh /tmp.
inside_ok() { case "$1" in "$TREE"|"$TREE"/*|/tmp|/tmp/*) return 0 ;; *) return 1 ;; esac; }

# The caller's PATH without relative entries and without any directory that resolves inside the working directory: the only PATH the
# runtime is looked up on (it runs before the chroot, at the --inner step).
lookup_path() {
  local - d r out="" IFS=:
  set -f
  for d in ${PATH:-/usr/bin:/bin}; do
    case "$d" in /*) ;; *) continue ;; esac
    r="$(/usr/bin/realpath -m -- "$d")"
    case "$r" in "$TREE"|"$TREE"/*) continue ;; esac
    out="${out:+$out:}$d"
  done
  printf '%s' "${out:-/usr/bin:/bin}"
}

# A node_modules the walk below would bind from outside the working directory (a link into another tree, or a working
# copy's parent): its real path must be a directory named node_modules, outside what the boundary makes fresh or hides
# (/proc /sys /dev /run /boot /etc), not HOME itself and not a directory holding the working directory. Anything
# else (a link to another repository, to /run or /proc, to HOME) would put the host's own files inside, over the fresh ones.
nm_target_ok() { # <real path>
  local t="$1"
  [ "${t##*/}" = node_modules ] && [ -d "$t" ] && [ ! -L "$t" ] || return 1
  case "$t/" in /proc/*|/sys/*|/dev/*|/run/*|/boot/*|/etc/*) return 1 ;; esac
  [ -z "${HOME:-}" ] || [ "$t" != "${HOME%/}" ] || return 1
  case "$TREE/" in "$t/"*) return 1 ;; esac
  return 0
}

ro_bind() { # <host path> <root>
  local src="$1" dst="$2$1"
  if [ -L "$src" ]; then /usr/bin/mkdir -p "${dst%/*}"; /usr/bin/ln -s "$(/usr/bin/readlink "$src")" "$dst"; return; fi
  [ -d "$src" ] || return 0
  /usr/bin/mkdir -p "$dst"
  /usr/bin/mount --rbind "$src" "$dst" || refuse TERM_NETNS_MOUNT_FAILED
  /usr/bin/mount -o remount,bind,ro "$dst" || refuse TERM_NETNS_MOUNT_FAILED
}

case "${1:-}" in
  --confined) confined; exit ;;
  --inner)
    # As pid 1 of the new pid namespace, root of the first user namespace, in the new network and mount namespaces.
    shift; U="$1"; G="$2"; WD="$3"; RT="$4"; BUNP="$5"; HOSTV="$6"; shift 6
    /usr/bin/ip link set lo up 2>/dev/null || refuse TERM_NETNS_LO_DOWN
    case "$TREE" in /tmp|/tmp/*) refuse TERM_NETNS_TREE_IN_TMP ;; esac
    R=/tmp
    /usr/bin/mount --make-rprivate / 2>/dev/null || true
    /usr/bin/mount -t tmpfs -o mode=755,size=64m "$TAG" "$R" || refuse TERM_NETNS_MOUNT_FAILED
    for d in /usr /etc /bin /sbin /lib /lib32 /lib64 /libx32; do [ -e "$d" ] && ro_bind "$d" "$R"; done
    /usr/bin/mkdir -p "$R/dev" "$R/proc" "$R/tmp" "$R/run" "$R$TREE"
    # /dev: a fresh tmpfs holding only the plain character devices (each bound alone), a pty instance of its own (every
    # devpts mount is a new instance: no other session's terminal is listed or openable), the /proc fd links and a fresh
    # /dev/shm. The command keeps the terminal it was started on through its own descriptors and /dev/tty.
    /usr/bin/mount -t tmpfs -o mode=755,size=1m none "$R/dev" || refuse TERM_NETNS_MOUNT_FAILED
    for n in null zero full random urandom tty; do
      [ -c "/dev/$n" ] || continue
      : > "$R/dev/$n"
      /usr/bin/mount --bind "/dev/$n" "$R/dev/$n" || refuse TERM_NETNS_MOUNT_FAILED
    done
    /usr/bin/mkdir -p "$R/dev/pts" "$R/dev/shm"
    /usr/bin/mount -t devpts -o newinstance,ptmxmode=0666,mode=0620 devpts "$R/dev/pts" || refuse TERM_NETNS_MOUNT_FAILED
    /usr/bin/ln -s pts/ptmx "$R/dev/ptmx"
    /usr/bin/ln -s /proc/self/fd "$R/dev/fd"
    /usr/bin/ln -s /proc/self/fd/0 "$R/dev/stdin"; /usr/bin/ln -s /proc/self/fd/1 "$R/dev/stdout"; /usr/bin/ln -s /proc/self/fd/2 "$R/dev/stderr"
    /usr/bin/mount -t tmpfs -o mode=1777,size=256m none "$R/dev/shm" 2>/dev/null || refuse TERM_NETNS_MOUNT_FAILED
    /usr/bin/mount -t proc proc "$R/proc" || refuse TERM_NETNS_PROC_FAILED
    /usr/bin/mount -t tmpfs -o mode=1777,size=1g none "$R/tmp" || refuse TERM_NETNS_MOUNT_FAILED
    /usr/bin/mount -t tmpfs -o mode=755,size=16m none "$R/run" || refuse TERM_NETNS_MOUNT_FAILED
    /usr/bin/mount --rbind "$TREE" "$R$TREE" || refuse TERM_NETNS_MOUNT_FAILED
    for f in "${GUARDED[@]}"; do
      p="$HUB/$f"
      [ -f "$p" ] && [ ! -L "$p" ] || refuse "TERM_NETNS_GUARD_MISSING $f"
      /usr/bin/mount --bind "$R$p" "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
      /usr/bin/mount -o remount,bind,ro "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
    done
    # node_modules: every tree module resolution from hub can reach (hub and each ancestor), at its real path, read-only
    # when outside the working directory (a link into another tree, or a working copy's parent); the working directory's own stay as they are.
    # One leading anywhere nm_target_ok refuses stops the run (TERM_NETNS_NODE_MODULES_REFUSED <link>, exit 3).
    a="$HUB"
    while :; do
      nm="$a/node_modules"
      if [ -e "$nm" ]; then
        real="$(/usr/bin/realpath -e -- "$nm")" || refuse "TERM_NETNS_NODE_MODULES_REFUSED $nm"
        if ! inside_ok "$real"; then
          nm_target_ok "$real" || refuse "TERM_NETNS_NODE_MODULES_REFUSED $nm"
          ro_bind "$real" "$R"
        fi
      fi
      [ "$a" = / ] && break
      a="${a%/*}"; [ -n "$a" ] || a=/
    done
    # HOME exists, empty: a fresh tmpfs over it, also when it lies inside the working directory (a caller's credentials there are
    # hidden too). A HOME holding the working directory (a clone under it) gets no tmpfs, which would cover the
    # repository's bind: it stays a directory of the fresh root in which only bound paths exist (the repository; the
    # runtime file, a node_modules tree, a read-list entry or a lock file when one lies under HOME) and the directories
    # leading to them, none of the caller's other files. A HOME that IS the working directory shows the repository.
    if [ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ]; then
      case "$TREE/" in "${HOME%/}/"*) /usr/bin/mkdir -p "$R$HOME" ;;
        *) /usr/bin/mkdir -p "$R$HOME"; /usr/bin/mount -t tmpfs -o mode=700,size=16m none "$R$HOME" || refuse TERM_NETNS_MOUNT_FAILED ;;
      esac
    fi
    # The runtime executable itself (bun lives in the caller's home), read-only, at its real path and at the path it was
    # found under: that FILE only, never its directory (beside it may sit other tools).
    RTR=""; [ -n "$RT" ] && RTR="$(/usr/bin/realpath -e -- "$RT" 2>/dev/null || true)"
    for p in "$RT" "$RTR"; do
      [ -n "$p" ] && [ -f "$RTR" ] || continue
      inside_ok "$p" && continue
      case "$p" in /usr/*|/bin/*|/sbin/*|/lib*) continue ;; esac
      [ -e "$R$p" ] && continue
      /usr/bin/mkdir -p "$R${p%/*}"; : > "$R$p"
      /usr/bin/mount --bind "$RTR" "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
      /usr/bin/mount -o remount,bind,ro "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
    done
    # Sibling-tree source the conformance tests read (netns-read.list, read-only; see its header for the rules).
    # Its entries are `<root>:<path>`; the roots are scripts/lib.ts READ_ROOT_NAMES, printed by netns-roots.ts (run with
    # an empty environment, from /) with the path the host file /etc/hoody-hub-term/read-roots gives each: an absolute
    # real path other than /, or empty when the file names none (that root's entries are not shown). A root is a
    # literal (letters, digits, `._/-`) and is quoted in the glob below: only the list entry's own pattern expands.
    LIST="$HERE/netns-read.list"
    [ -f "$LIST" ] && [ ! -L "$LIST" ] || refuse TERM_NETNS_READ_LIST_MISSING
    # The host's own entries, for sibling trees that only this host has. Its lines go through the same loop and checks
    # as netns-read.list. Used only when the host verdict (HOSTV, taken before unshare) and the check here both say ok
    # (host_file_state); anything else adds no entries, with one stderr line when the file is there but refused.
    HOST_LIST=/etc/hoody-hub-term/read-list
    HOST_LINES=""
    case "$HOSTV" in *list=ok*) hl="$(host_file_state "$HOST_LIST")" ;; *list=absent*) hl=absent ;; *) hl=refused ;; esac
    case "$hl" in
      ok) HOST_LINES="$(/usr/bin/cat -- "$HOST_LIST" 2>/dev/null || true)" ;;
      absent) ;;
      *) printf 'netns: %s not used (owner, mode or type)\n' "$HOST_LIST" >&2 ;;
    esac
    # read-roots: the same rule; refused = the default (no roots), netns-roots.ts told so by HUB_TERM_READ_ROOTS=off.
    RRV=off
    case "$HOSTV" in *roots=ok*) [ "$(host_file_state /etc/hoody-hub-term/read-roots)" = ok ] && RRV=on ;; esac
    declare -A ROOT=()
    rout="$(cd / && /usr/bin/env -i HUB_TERM_READ_ROOTS="$RRV" "$BUNP" "$HERE/netns-roots.ts")" || refuse TERM_NETNS_ROOTS_FAILED
    while IFS=$'\t' read -r name root; do
      [ -n "$name" ] || continue
      case "$name" in *[!a-z]*) refuse TERM_NETNS_ROOTS_FAILED ;; esac
      if [ -z "$root" ]; then ROOT[$name]=""; continue; fi
      case "$root" in /?*) ;; *) refuse TERM_NETNS_ROOTS_FAILED ;; esac
      case "$root" in *..*|*'//'*|*/|*[[:space:]]*) refuse TERM_NETNS_ROOTS_FAILED ;; esac
      case "$root" in *[!A-Za-z0-9._/-]*) refuse TERM_NETNS_ROOTS_FAILED ;; esac
      ROOT[$name]="$root"
    done <<< "$rout"
    [ "${#ROOT[@]}" -gt 0 ] || refuse TERM_NETNS_ROOTS_FAILED
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in ''|'#'*) continue ;; [a-z]*:?*) ;; *) refuse "TERM_NETNS_READ_LIST_BAD $line" ;; esac
      name="${line%%:*}"; rel="${line#*:}"
      case "$name" in *[!a-z]*) refuse "TERM_NETNS_READ_LIST_BAD $line" ;; esac
      [ -n "${ROOT[$name]+x}" ] || refuse "TERM_NETNS_READ_LIST_BAD $line"
      case "$rel" in /*|*..*|*'//'*|*[[:space:]]*) refuse "TERM_NETNS_READ_LIST_BAD $line" ;; esac
      [ -n "${ROOT[$name]}" ] || continue
      shopt -s nullglob; matches=( "${ROOT[$name]}"/$rel ); shopt -u nullglob
      for p in "${matches[@]}"; do
        [ -L "$p" ] && continue
        [ "$(/usr/bin/realpath -e -- "$p" 2>/dev/null || true)" = "$p" ] || continue
        case "${p##*/}" in .env*|*.pem|*.key|id_*|*.sqlite*|*[Ss]ecret*|*[Cc]redential*) continue ;; esac
        if [ -d "$p" ]; then ro_bind "$p" "$R"
        elif [ -f "$p" ]; then
          # A file under the working directory is already here through its read-write bind: never truncate it.
          /usr/bin/mkdir -p "$R${p%/*}"; [ -e "$R$p" ] || : > "$R$p"
          /usr/bin/mount --bind "$p" "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
          /usr/bin/mount -o remount,bind,ro "$R$p" || refuse TERM_NETNS_MOUNT_FAILED
        fi
      done
    done < <(/usr/bin/cat -- "$LIST"; printf '\n%s\n' "$HOST_LINES")
    /usr/bin/mkdir -p "$R/run/user/$U"
    # Optional slot locks (the vitest slots named by HUB_GATE_SLOTS, the IO lock named by HUB_TERM_IO_LOCK): each lock FILE is bound in, so a
    # slot taken inside excludes runs outside (one inode); the directories holding them stay outside.
    GS="${HUB_GATE_SLOTS:-}"; GSL=(); [ -z "$GS" ] || GSL=("$GS".0.lock "$GS".1.lock "$GS".2.lock "$GS".3.lock "$GS".4.lock "$GS".5.lock)
    IOL=(); case "${HUB_TERM_IO_LOCK:-}" in /*) IOL=("$HUB_TERM_IO_LOCK") ;; esac
    for f in "${GSL[@]}" "${IOL[@]}"; do
      [ -d "${f%/*}" ] || continue
      [ -f "$f" ] || : >> "$f" 2>/dev/null || continue
      [ -f "$f" ] && [ ! -L "$f" ] || continue
      /usr/bin/mkdir -p "$R${f%/*}"; [ -e "$R$f" ] || : > "$R$f"
      /usr/bin/mount --bind "$f" "$R$f" || refuse TERM_NETNS_MOUNT_FAILED
    done
    for v in TMPDIR HUB_WORK_DIR HUB_CACHE_DIR HUB_TERM_CACHE OVERLAY_DIR OVERLAY_SRC; do
      val="${!v:-}"; [ -z "$val" ] || inside_ok "$val" || refuse "TERM_NETNS_PATH_OUTSIDE_TREE $v"
    done
    # The command, as ourselves, chrooted, as a child of this pid 1 (stdin kept); signals forwarded; its status ours.
    /usr/bin/unshare --user --map-user="$U" --map-group="$G" --root="$R" --wd="$WD" -- /bin/bash -p "$SELF" --final "$@" <&0 &
    child=$!
    for s in TERM INT HUP QUIT; do trap "kill -$s $child 2>/dev/null" "$s"; done
    while :; do
      rc=0; wait "$child" || rc=$?
      kill -0 "$child" 2>/dev/null || exit "$rc"
    done ;;
  --final)
    shift
    confined || refuse TERM_NETNS_NOT_CONFINED
    [ $# -gt 0 ] || refuse TERM_NETNS_NO_COMMAND
    exec "$@" ;;
esac

FRESH=0
if [ "${1:-}" = --fresh ]; then FRESH=1; shift; fi
[ $# -gt 0 ] || refuse TERM_NETNS_NO_COMMAND
close_fds
if [ "$FRESH" = 0 ] && confined; then exec "$@"; fi
/usr/bin/unshare -rnmpf --kill-child /bin/true 2>/dev/null || refuse TERM_NETNS_UNAVAILABLE
WD="$(pwd -P)"
inside_ok "$WD" || refuse TERM_NETNS_CWD_OUTSIDE_TREE
# The runtime executable: the command's own program when it is an absolute path outside the system directories, else
# bun as found on the given PATH without the working directory's directories (a shell entry that starts `bun ...` inside).
RT=""
case "$1" in /usr/*|/bin/*|/sbin/*) ;; /*) RT="$1" ;; esac
if [ -z "$RT" ]; then RT="$(PATH="$(lookup_path)" type -P bun 2>/dev/null || true)"; fi
# The runtime that prints the read list's roots (netns-roots.ts, before the chroot): bun, the same lookup.
BUNP="$(PATH="$(lookup_path)" type -P bun 2>/dev/null || true)"
[ -n "$BUNP" ] || refuse TERM_NETNS_ROOTS_FAILED
BUNP="$(/usr/bin/realpath -e -- "$BUNP")"
# The machine's gate slots (gate-slot.sh/.ts, bound in above): HUB_GATE_SLOTS, else the one line of the host file
# $HOME/.config/hoody-hub-term/gate-slots, read here before the chroot and exported inside; neither = no slots. No default.
# One check for both sources, the same as gate-slot.ts slotBase(): the value exactly as given (nothing trimmed), an
# absolute path of [A-Za-z0-9_./@+,=~-], at most 1024 characters, no "..". Anything else is refused.
gss=""; gsv=""
if [ -n "${HUB_GATE_SLOTS:-}" ]; then gss=HUB_GATE_SLOTS; gsv="$HUB_GATE_SLOTS"
else
  unset HUB_GATE_SLOTS
  GSF="${HOME:-/nonexistent}/.config/hoody-hub-term/gate-slots"
  if [ -f "$GSF" ] && [ ! -L "$GSF" ]; then gss="$GSF"; IFS= read -r gsv < "$GSF" || true; fi
fi
if [ -n "$gss" ]; then
  case "$gsv" in /*) ;; *) refuse "TERM_NETNS_GATE_SLOTS_INVALID $gss" ;; esac
  case "$gsv" in *..*|*[!A-Za-z0-9_./@+,=~-]*) refuse "TERM_NETNS_GATE_SLOTS_INVALID $gss" ;; esac
  [ "${#gsv}" -le 1024 ] || refuse "TERM_NETNS_GATE_SLOTS_INVALID $gss"
  export HUB_GATE_SLOTS="$gsv"
fi
ENVV=()
for k in "${KEEP[@]}"; do if [ -n "${!k+x}" ]; then ENVV+=("$k=${!k}"); fi; done
# The host files' verdict, taken here with real ids (see host_file_state); the inner step uses only what is ok here.
HOSTV="roots=$(host_file_state /etc/hoody-hub-term/read-roots),list=$(host_file_state /etc/hoody-hub-term/read-list)"
case "$HOSTV" in *roots=refused*) printf 'netns: %s not used (owner, mode or type)\n' /etc/hoody-hub-term/read-roots >&2 ;; esac
exec /usr/bin/env -i "${ENVV[@]}" /usr/bin/unshare -rnmpf --kill-child -- /bin/bash -p "$SELF" --inner "$(/usr/bin/id -u)" "$(/usr/bin/id -g)" "$WD" "$RT" "$BUNP" "$HOSTV" "$@"
