# Vendored OpenTUI engine (patched fork)

`0.8.4-hoody.<N>/` holds the npm tarballs of the patched OpenTUI the terminal Hub runs: `@opentui/core`,
`@opentui/react` and the native packages for linux-x64 and linux-arm64 (slim build: no FFmpeg, licence MIT; each
tarball carries its licence files). Every terminal path loads these bytes: tests, goldens, scenarios, `dev.ts` and the
ship bundle. `SHA256SUMS` pins them. `patches/` holds the patch series they are built from.

- **Declared** in the Hub's `package.json` (the folder above `hub/`): `@opentui/core`, `@opentui/react` and
  `@opentui/core-linux-x64` as `file:` devDependencies on these tarballs, and core and core-linux-x64 again in
  `overrides`, so `@opentui/react`'s dependency on core and core's optional dependency on its native package resolve
  to these files, never to the npm registry. `react-reconciler` comes in through `@opentui/react`.
- **linux-arm64**: nothing installs it. `scripts/term/build.ts --target linux-arm64` reads it from here, checks it
  against `SHA256SUMS` and bundles its library (`build/platforms.ts`, `vendoredNativeDir`). It has not been run on an
  arm64 machine yet.
- **Never edit** a tarball. A new build is a new directory `0.8.4-hoody.<N+1>/`, then the `package.json` paths, then a
  full terminal run.
- **Checked**: `scripts/term/build.ts` refuses an engine that is not one `0.8.4-hoody.N` build, and the bundle refuses
  to start without that version (`build/engine-check.ts`).

## How the tarballs are made

- **Source**: the OpenTUI v0.8.4 release (https://github.com/anomalyco/opentui, tag `v0.8.4`). The release archive
  this build started from had sha256 `12aa2672332980ef641f74d1c763f8cf5c5684290a00b4a7298e75d71cfb78ad`.
- **Patches**: `patches/0001-*.patch` to `patches/0013-*.patch`, applied in order with `patch -p1` from the root of
  the source tree. Each builds on the ones before it.
- **Build**: native library with Zig 0.17.0 and no FFmpeg, packages built and packed with `npm pack`, as
  `src/term/docs/fork.md` ("Building the patched engine") says step by step.

What the fork changes in OpenTUI 0.8.4: `src/term/docs/fork.md`.
