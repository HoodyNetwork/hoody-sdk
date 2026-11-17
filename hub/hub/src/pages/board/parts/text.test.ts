// Every key the Board builds at run time exists in strings.en.json, so none falls through to its raw name:
// program.<p> and program.<p>.desc, layout.<preset>, key.<side> / key.swap<Side> / key.resize<Side>,
// state.<computer state>, tile.dot.<frame state>.
import { describe, expect, it } from 'vitest';
import { TILE_PROGRAMS } from '../embed/catalog';
import { PRESETS } from '../model/tree';
import strings from '../strings.en.json';

const S = strings as Record<string, string>;
const SIDES = ['left', 'right', 'up', 'down'] as const;
const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);

describe('built string keys', () => {
  it.each([
    ['program', TILE_PROGRAMS.flatMap((p) => ['program.' + p, 'program.' + p + '.desc'])],
    ['layout', PRESETS.map((p) => 'layout.' + p)],
    ['keys', SIDES.flatMap((s) => ['key.' + s, 'key.swap' + cap(s), 'key.resize' + cap(s)])],
    // core's computerState answers these four.
    ['computer state', ['running', 'stopped', 'starting', 'attention'].map((s) => 'state.' + s)],
    ['frame state', ['loading', 'loaded', 'slow', 'stopped', 'unchecked'].map((s) => 'tile.dot.' + s)],
  ])('%s keys exist and are not empty', (_, keys) => {
    for (const k of keys) expect(S[k], k).toMatch(/\S/);
  });
});
