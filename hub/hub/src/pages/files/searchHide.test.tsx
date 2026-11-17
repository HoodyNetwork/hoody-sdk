// Jump to leaves out Files' places with no computer in the realm: the page asks
// for a computer, so only Transfers is drawn. Read against the real deep index, and through the reader the shell loads
// (manifest searchHide) in the page's own context.
import { renderPage, screen } from '@app/testing';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import page from './page';
import useFilesSearchHide, { filesHide } from './searchHide';

const mine = DEEP.filter((e) => e.page === 'files');
const shown = (h: ReturnType<typeof filesHide>) => mine.filter((e) => !hidesTail(h, e.to));

describe('Files in Jump to', () => {
  it('no computer (the whole list read): only the Transfers tab', () => {
    expect(mine.some((e) => e.kind === 'faq') && mine.some((e) => e.kind === 'tab' && e.to === '')).toBe(true);
    expect(shown(filesHide({ rows: 0, failed: false, complete: true }))).toEqual(mine.filter((e) => e.to === '?tab=transfers'));
    expect(shown(filesHide({ rows: 0, failed: false, complete: true }))).toHaveLength(1);
  });

  it('computers, a list still read, a list not read whole, or a failed read: every place', () => {
    for (const list of [
      { rows: 2, failed: false, complete: true },
      { rows: null, failed: false, complete: false },
      { rows: 0, failed: false, complete: false },
      { rows: 0, failed: true, complete: true },
      { rows: 3, failed: true, complete: true },
    ]) expect(filesHide(list), JSON.stringify(list)).toBeNull();
  });

  const Probe = () => <output>{JSON.stringify(useFilesSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    ['none', JSON.stringify({ only: ['?tab=transfers'] })],
    ['', 'null'],
  ])('the reader answers in state "%s": %s', async (state, want) => {
    await renderPage(probe, state ? { state } : {});
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
