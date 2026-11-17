// Jump to leaves out Support's questions where the page says it is not open: with
// no account access (signed out, a token session) it draws only why. Read against the real deep index, and through
// the reader the shell loads (manifest searchHide) in the page's own context.
import { renderPage, screen } from '@app/testing';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import page from './page';
import useSupportSearchHide, { supportHide } from './searchHide';

const mine = DEEP.filter((e) => e.page === 'support');

describe('Support in Jump to', () => {
  it('no account access: none of its places; access: every place', () => {
    expect(mine.length).toBeGreaterThan(2);
    expect(mine.filter((e) => !hidesTail(supportHide(false), e.to))).toEqual([]);
    expect(supportHide(true)).toBeNull();
  });

  it('no account access: New ticket goes too (it opens a sheet the page does not draw), the page link stays', () => {
    const named = supportHide(false)?.commands ?? [];
    expect(named).toEqual((page.commands ?? []).filter((c) => c.to?.includes('?')).map((c) => c.id));
    expect(named).toEqual(['new']);
  });

  const Probe = () => <output>{JSON.stringify(useSupportSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    ['token', JSON.stringify({ only: [], commands: ['new'] })],
    ['', 'null'],
  ])('the reader in state "%s": %s', async (state, want) => {
    await renderPage(probe, state ? { state } : {});
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
