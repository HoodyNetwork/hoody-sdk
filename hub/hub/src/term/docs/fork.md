# The OpenTUI fork

The terminal build draws with OpenTUI 0.8.4 (`@opentui/core`, `@opentui/react`, and a native library). The Hub needs
changes to it. This page says what the changes are, how each kind of run gets them, and how to patch and upgrade.

## One engine for every run

Tests, goldens, scenarios, `render.ts`, `dev.ts` and the ship build all load the same engine: the patched fork,
version `0.8.4-hoody.3`, as installed in `node_modules`. Nothing rewrites the engine's source at load or at build.
The packages come from npm tarballs in `hub/vendor/opentui/0.8.4-hoody.3/`: core, react, the Linux x64 and Linux
arm64 native packages, and a `SHA256SUMS` file. `hub/vendor/opentui/README.md` says how the Hub installs them.

## What the loader still edits (not OpenTUI)

`scripts/term/fork-deltas.ts`, TanStack only:

| Edit | Rewrites | Why |
|---|---|---|
| `libDomJsx` | Libraries that draw HTML tags (TanStack Router's error screens) | Their tags go through the compat runtime (import specifiers only). |
| `historyBlockers` | TanStack history | Navigation blockers run without a `document`. |

Then `src/term/env/strict-probes.ts` answers library probes of browser globals (`rewriteProbes`, rules in
`PROBE_RULES`), in the loader and in the ship plugin alike. An edit or probe that no longer matches its source throws
`TERM_FORK_DELTA` / `TERM_PROBE_STALE`; it never becomes a silent no-op.

## The patch series

The fork is a series of patches over the OpenTUI 0.8.4 source (https://github.com/anomalyco/opentui, tag `v0.8.4`).
The series is published in [`hub/vendor/opentui/patches/`](../../../vendor/opentui/patches/), beside the tarballs it
builds, so a checkout can rebuild the engine ("Building the patched engine" below). No script runs those steps yet:
see [not-built.md](not-built.md).

| Patch | Packages | Adds |
|---|---|---|
| `0001-react-host-text-filter.patch` | react | `setHostTextFilter`. Fail closed. |
| `0002-react-loose-text.patch` | react | Loose text becomes a text block. |
| `0003-ansi16-sgr.patch` | native, core | `colorMode`: real SGR 30-37 / 90-97 for 16-colour terminals. |
| `0004-no-color.patch` | native, core | `mono` mode: no colour written at all. |
| `0005-osc8-hyperlinks.patch` | native, core | OSC 8 hyperlinks with URL checks. URL bound 2048. |
| `0006-inverse-once.patch` | native, core tests | Inverse applied once. |
| `0007-hoody-version.patch` | every `package.json` | Version `0.8.4-hoody.1`. |
| `0008-web-line-breaks.patch` | native | Word wrap breaks only where the web does: never after `.` `,` `;` `:` or an opening bracket, nor after a word-initial `-` or between `-` and a digit (`utf8.asciiPunctLineBreak`; word motion unchanged). |
| `0009-hoody-version-2.patch` | every `package.json` | Version `0.8.4-hoody.2`. |
| `0010-yoga-wrap-single-flex.patch` | native | Yoga: a wrapping container skips the single-flexible-child shortcut, so the item breaks lines on its flex basis (CSS Flexbox 9.3) instead of being squeezed onto the line before. |
| `0011-core-flex-basis-percent-position-type.patch` | core | `flexBasis` takes a percentage (`"100%"` starts a line of its own in a wrapping row); `positionType` getter. |
| `0012-text-measure-drawn-width.patch` | native, core tests | A text is measured again at the width Yoga draws its box at (rounding can make it a cell off the measured width), so the box is as tall as the lines it draws. |
| `0013-hoody-version-3.patch` | every `package.json` | Version `0.8.4-hoody.3`. |

Rules of the series:

- Apply all, in order, with `patch -p1` from the root of the OpenTUI 0.8.4 source tree. Each patch builds on the
  ones before it.
- `packages/core/src/native-abi.generated.ts` is generated (`bun run generate:abi` in `packages/core`, with Zig on
  the path). The patches carry the generated file. After any further change to `opentui.h`, regenerate it. Never
  edit it by hand.

## The version line

The fork's packages are versioned `0.8.4-hoody.N`, never `0.8.4`. A lockfile or a copied `node_modules` can then
never mix the fork with the npm build of the same number.

- `build.ts` refuses to build unless core, react, the native package and core's pin on it are one `0.8.4-hoody.N`
  (`TERM_ENGINE_VERSION`).
- The built bundle refuses to start on an engine without the host text filter and the link check
  (`TERM_ENGINE_UNPATCHED`).

`build.ts` reads the engine where the Hub resolves it (no separate engine directory, no `--engine` flag) and
records the linked versions in the artifact check: the reconciler must satisfy `@opentui/react`'s dependency range and
React the reconciler's peer range.

## Building the patched engine

1. Unpack the OpenTUI v0.8.4 release archive and run `bun install --frozen-lockfile` at its root (Bun 1.4.1, the
   version its `package.json` names). Install before applying the series: from 0007 on, core pins its native
   packages to `0.8.4-hoody.N`, and no registry holds those. Then apply the series (above) in order, with
   `patch -p1` at the tree root.
2. Re-pack the native build's dependency archive. 0010 adds `zig-deps/yoga-wrap-single-flex.patch` and the archive's
   new sha256 in `zig-deps.sha256`, but a patch cannot carry the archive itself (`zig-deps.tar.gz`, binary). With the
   same flags as upstream's `update-zig-deps.sh`, in `packages/native/src/vendor`:

   ```sh
   v=$PWD; x=$(mktemp -d)
   tar -xzf zig-deps.tar.gz -C "$x"
   (cd "$x/yoga" && patch -p1 < "$v/zig-deps/yoga-wrap-single-flex.patch")
   find "$x" -type d -exec chmod 0755 {} +; find "$x" -type f -exec chmod 0644 {} +
   LC_ALL=C tar --sort=name --mtime='UTC 2020-01-01' --owner=0 --group=0 --numeric-owner -C "$x" \
     -cf "$x.tar" ghostty uucode-ghostty uucode-opentui yoga
   gzip -n -9 "$x.tar" && mv "$x.tar.gz" zig-deps.tar.gz
   sh update-zig-deps.sh --check
   ```

3. In `packages/native`, unpack that archive into `packages/native/zig-deps/` with
   `sh ./scripts/prepare-zig-deps.sh` (not `bun run prepare:zig`, which also builds FFmpeg). Then build the native
   library with Zig 0.17.0, calling `zig build -Doptimize=ReleaseFast` directly (`bun run build` there always builds
   FFmpeg first), while `.cache/ffmpeg/prefix/` holds no FFmpeg build for the target: Zig links FFmpeg whenever one
   is there. The slim library links no FFmpeg code, so its licence stays MIT. It lands in
   `packages/native/lib/x86_64-linux/`. linux-arm64 is the same build with `-Dlibrary-target=aarch64-linux-gnu.2.17`
   and lands in `lib/aarch64-linux/`.
4. In `packages/core`: `bun ./scripts/build.ts --native --skip-zig --skip-symbols` (without `--skip-symbols` it reads
   the commit id, and the release archive is not a checkout), then `bun run build:lib`. Then `bun run build` in
   `react`, `keymap`, `ssh` and `qrcode`.
5. Core's step makes only the host's native package: on linux-x64,
   `packages/core/node_modules/@opentui/core-linux-x64`. linux-arm64's is a copy of that folder named
   `core-linux-arm64`, with the library from `lib/aarch64-linux/`, `linux-x64` changed to `linux-arm64` in its
   `package.json` (name, description) and `README.md`, and `"cpu": ["arm64"]`. In each native package: check with
   `nm` that the library has no `avcodec_` or `avformat_` symbol, strip it with `llvm-objcopy --strip-unneeded` (GNU
   `objcopy` cannot read aarch64), remove `LICENSE-FFMPEG`, `FFMPEG-SOURCE.md` and `LICENSE-ZLIB`, and set
   `"license": "MIT"` in its `package.json`.
6. Check that every package is one `0.8.4-hoody.N`, then run `npm pack --ignore-scripts` in each native package and
   in the `dist` folders of core and react (`bun pm pack` fails there on `workspace:*` devDependencies).
7. Put the tarballs in `hub/vendor/opentui/<version>/` with a `SHA256SUMS`, point the Hub's `package.json` at them
   and run `bun install`.

Run the fork's tests with `NODE_ENV=test` and without `TERM_PROGRAM` in the environment (`env -u TERM_PROGRAM`):
some engine tests read it.

## Changing a patch

1. Start from a clean OpenTUI 0.8.4 tree with the series applied up to the patch before yours.
2. Make the change. Add or change a test in the fork that fails without it.
3. Regenerate the ABI file if `opentui.h` changed.
4. Re-create your patch and every later patch that touches the same lines in `hub/vendor/opentui/patches/`.
5. Raise N in the version with upstream's own release script (`prepare-release.ts 0.8.4-hoody.N --no-install`, in
   the OpenTUI tree's scripts directory).
6. Rebuild, repack, vendor, install.
7. Update the capability check in `scripts/term/build/engine-check.ts` if the Hub now needs a new export.

## Upgrading to a newer OpenTUI

1. Check out the new upstream tag.
2. Apply the series. Fix each patch that no longer applies.
3. Run the fork's own tests, then the Hub's `tests` gate against the new build.
4. Vendor the new tarballs, point `package.json` at them, run the page gate and the ship gate.
5. Update `HOODY_ENGINE_VERSION` in `scripts/term/build/engine-check.ts`: it pins `0.8.4-hoody.N`.
6. Update the version in this page and in `hub/vendor/opentui/README.md`.

The fork is a patch series over a pinned release, not a branch, because a series shows each change and its reason
and re-applies to a new tag.

## Where OpenTUI is allowed

Only files under `src/term/prim` import OpenTUI. Graph rule R5 fails anything else. When a prim is missing, add
it to `src/term/prim`. Do not reach around.
