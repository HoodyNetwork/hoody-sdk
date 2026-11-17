// A Band's or Notice's mark is a sign, never the name of its tone. The caller may pass any kit icon; one the terminal
// draws nothing for (a page or object mark: database, key) must not leave only the mark's accessible label on screen:
// that label is the tone's name, and AI Memory's place band would read "│ neutral Realm Personal · stored on atlas".
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { ICON_GLYPHS } from '../icons.glyphs';
import type { IconName } from '../icons';
import { Band, Notice } from './Band';
import { RealmBand } from '../agent/RealmBand';

const NAMES = Object.keys(ICON_GLYPHS) as IconName[];
const TONE_WORD = /\b(neutral|warn|danger|calm|info|error)\b/;

async function rows(node: ReactNode, height: number): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box dir="column" width={60}>{node}</Box></FocusRoot>, { width: 60, height });
  const frame = await t.settle();
  t.renderer.destroy();
  return frame.split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
}

for (const tone of ['neutral', 'warn', 'danger'] as const) {
  test(`Band ${tone}: with any icon the mark is a sign or the icon's own word, never the tone's name`, async () => {
    const out = await rows(NAMES.map((n) => <Band key={n} tone={tone} size="table" icon={n}>Kept on atlas</Band>), NAMES.length + 4);
    expect(out.length).toBe(NAMES.length);
    for (const r of out) expect(r).not.toMatch(TONE_WORD);
    // An icon with no sign here falls back to the tone's own mark.
    const own = { neutral: 'i', warn: '!', danger: '✗' }[tone];
    expect(out[NAMES.indexOf('database')]).toBe(`${own} Kept on atlas`);
  });
}

for (const level of ['calm', 'warn'] as const) {
  test(`Notice ${level}: with any icon the mark is never the level's name`, async () => {
    const out = await rows(NAMES.map((n) => <Notice key={n} level={level} icon={n}>Kept on atlas</Notice>), NAMES.length + 4);
    expect(out.length).toBe(NAMES.length);
    for (const r of out) expect(r).not.toMatch(TONE_WORD);
  });
}

test('RealmBand (AI Memory): the place line starts with the mark, not "neutral"', async () => {
  const out = await rows(<RealmBand realm="Personal" computer="atlas" host={{ kind: 'state', state: 'leader', host: 'atlas' }} memory />, 8);
  expect(out.join('\n')).not.toMatch(TONE_WORD);
  expect(out[0]).toMatch(/^│ i Realm Personal/);
});
