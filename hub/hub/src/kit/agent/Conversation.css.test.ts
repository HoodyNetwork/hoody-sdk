// Vitest: two cascade facts of the moved composer styles, pinned because they decide a colour by source order.
// `.warnText` comes after `.composerNote`, so a warning note is drawn in the warning colour (the other way round,
// the note's muted colour outranks it and no warning looks like one);
// `.bad` comes after `.counter`, so the over-limit counter is red (the other way round it is not).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'Conversation.module.css'), 'utf8');
const at = (sel: string) => css.search(new RegExp(`^\\${sel}\\b`, 'm'));

describe('Conversation.module.css source order', () => {
  it('.warnText is after .composerNote', () => {
    expect(at('.composerNote')).toBeGreaterThan(-1);
    expect(at('.warnText')).toBeGreaterThan(at('.composerNote'));
  });
  it('.bad is after .counter', () => {
    expect(at('.bad')).toBeGreaterThan(at('.counter'));
  });
});
