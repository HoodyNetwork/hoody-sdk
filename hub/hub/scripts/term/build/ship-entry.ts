// The ship bundle's entry: the engine capability check (engine-check.ts), then the live entry
// (src/term/entry.live.ts) with the bundle's own class styles. A bundle linked against stock OpenTUI refuses to start
// instead of drawing unfiltered text.
//
// Styles (src/term/app/styles.ts: REQUIRED by startTermHub): the build generates the CSS translator's table of every
// width band from the stylesheets, packs them into one file (build/style-pack.ts) and embeds it
// (build/plugin.ts STYLE_TABLES_MODULE). It is read on the first draw; a band is rebuilt when first used. mountTerminalHub here passes them,
// so the CLI never builds or passes styles; a caller's own `styles` still wins (tests, a debug build).
// Strict globals at LOAD, before any other module evaluates (the same first module as entry.ts and the test preload):
// a browser global read at a module's top level fails the start here, not only one read during a mount.
import '../../../src/term/env/install-strict';
import fs from 'node:fs';
import path from 'node:path';
import * as react from '@opentui/react';
import * as core from '@opentui/core';
// @ts-expect-error virtual module of the ship build (build/plugin.ts STYLE_TABLES_MODULE): the packed tables' path
import tableFiles from 'hub-term:style-tables';
import { assertPatchedEngine } from './engine-check';
import { assertPack, bandsOf } from './style-pack';
import { stylesFromBands, type TermStyles } from '../../../src/term/app/styles';
import * as live from '../../../src/term/entry.live';
import * as demo from '../../../src/term/entry.demo';

/** Defined by the ship build from the engine's package.json files (engineVersion, build.ts); absent = refused. */
declare const __HUB_ENGINE_VERSION__: string | undefined;
assertPatchedEngine(react, core, typeof __HUB_ENGINE_VERSION__ === 'string' ? __HUB_ENGINE_VERSION__ : '');

// A file import is a path relative to the bundle (absolute inside a compiled executable): resolve it from here, never
// from the working directory. Read on the first draw; a pack of another version is refused (TERM_STYLE_PACK_VERSION);
// each band's table is rebuilt once, when a terminal first has that width (stylesFromBands keeps its resolver).
const bands = bandsOf(() => { const p: unknown = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, tableFiles as string), 'utf8')); assertPack(p); return p; });
/** The bundle's class styles. */
export const SHIP_STYLES: TermStyles = stylesFromBands(bands.keyFor, bands.tableOf, 'ship-tables');

export * from '../../../src/term/entry.live';

/** The live mount with the bundle's styles unless the caller passes its own. */
export function mountTerminalHub(o: Omit<Parameters<typeof live.mountTerminalHub>[0], 'styles'> & { styles?: TermStyles }): ReturnType<typeof live.mountTerminalHub> {
  return live.mountTerminalHub({ ...o, styles: o.styles ?? SHIP_STYLES });
}

/** The demo mount (`hoody hub --demo`: a sample account in the host's memory), with the bundle's styles. */
export function mountDemoHub(o: Omit<Parameters<typeof demo.mountDemoHub>[0], 'styles'> & { styles?: TermStyles }): ReturnType<typeof demo.mountDemoHub> {
  return demo.mountDemoHub({ ...o, styles: o.styles ?? SHIP_STYLES });
}
