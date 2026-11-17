// An action that ends or backs out of the flow (Cancel, Back, Close, Not now) carries no forward glyph: the arrow is for
// actions that go somewhere or continue. An action spec says so with `dismiss: true`; the kit draws it with no glyph in
// an ActionBar, InlineActions and its disabled (ReasonButton) form. A scan keeps every back-out spec in the Hub saying
// it (the kit's own Cancel, Close and Back buttons pass `chip={false}` themselves).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineActions } from './ActionBar';

describe('dismiss: no forward glyph', () => {
  it('a dismiss action has no glyph; a plain secondary keeps it; a disabled dismiss too', () => {
    render(
      <InlineActions
        label="Answer"
        actions={[
          { id: 'cancel', label: 'Cancel', dismiss: true, onPress: () => undefined },
          { id: 'off', label: 'Not now', dismiss: true, disabledReason: 'Busy', onPress: () => undefined },
        ]}
        primary={{ id: 'go', label: 'Continue', onPress: () => undefined }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('button', { name: 'Not now' })).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('data-glyph', '');
  });
});

const SRC = join(import.meta.dirname, '..', '..', '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe('every back-out action spec says dismiss', () => {
  it('a spec whose id or label key names cancel, close, back, dismiss or not now (not a danger action: cancelling a run is an act) sets dismiss: true', () => {
    const misses: string[] = [];
    // Words that back out of a flow, as the last part of an id ('draft-cancel') or a label key ('acc.p.cancel', 'details.closeShort').
    const backOut = /(?:^|[-_.])(?:cancel|close|back|dismiss|not-?now)(?:short)?$|(?:Cancel|Close|Back|Dismiss|NotNow)(?:Short)?$/i;
    for (const dir of ['pages', 'kit', 'shell', 'standalone', 'ask']) {
      for (const file of walk(join(SRC, dir))) {
        const text = readFileSync(file, 'utf8');
        // Action spec literals: `{ id: '…', label: t('…'), … onPress … }` (either quote), which may span lines.
        for (const m of text.matchAll(/\{\s*id:\s*(['"])([^'"]*)\1,\s*label:\s*[^,{}]*?\(\s*(['"])([^'"]*)\3[^{}]*\}/g)) {
          const [whole, , id, , key] = m as unknown as [string, string, string, string, string];
          if (!/onPress/.test(whole) || /tone:\s*['"]danger['"]/.test(whole)) continue;
          if (!backOut.test(id) && !backOut.test(key)) continue;
          if (!/dismiss:\s*true/.test(whole)) misses.push(`${relative(SRC, file)}: ${id}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });
});
