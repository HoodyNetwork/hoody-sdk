// Shared access in a terminal: once a stop of a share this page cannot manage may have gone through, the row says only
// that it couldn't confirm the stop; "Not managed here." is not stacked above it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function clickText(text: string, nth = 0): Promise<string> {
  const lines = s!.frame.split('\n');
  let seen = 0;
  for (let y = 0; y < lines.length; y++) {
    let x = lines[y]!.indexOf(text);
    while (x >= 0) {
      if (seen++ === nth) { await s!.click(x + 1, y); return s!.settle(); }
      x = lines[y]!.indexOf(text, x + 1);
    }
  }
  throw new Error(`no "${text}" in\n${s!.frame}`);
}

// 120x40: at 80x24 the page's pending toast sits over this column.
for (const [cols, rows] of [[120, 40]] as const) {
  test(`${cols}x${rows}: a held stop of an unmanaged share shows its own note only`, async () => {
    s = await renderPage({ page: 'keys', fx: 'sharedStopPending', path: '/keys/shared', cols, rows });
    await s.settle();
    await clickText(`[${strings['share.stop']}]`);
    await clickText('[Stop sharing]');
    await clickText('[Cancel]');
    const frame = await s.settle();
    expect(frame).toContain(strings['share.stopUnknown']);
    // The held row: its line pair holds the unknown note and not the unmanaged one.
    const lines = frame.split('\n');
    const at = lines.findIndex((l) => l.includes(strings['share.stopUnknown']));
    expect(lines.slice(Math.max(0, at - 2), at + 1).join('\n'), frame).not.toContain(strings['share.notManagedShort']);
  }, 120_000);
}
