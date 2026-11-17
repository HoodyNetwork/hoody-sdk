// Vitest: a Notes row's Put on Board puts that note on the Board (a notes tile on its own page),
// not the whole Notes app. Where this Hub serves the Board, the row menu's entry opens the Board's Add link with the
// note's ids.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Kit from '@kit';
import page from './page';
import strings from './strings.en.json';

const S = vi.hoisted(() => ({ went: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    usePageLink: (id: string) => (id === 'board' ? { kind: 'hub' } : real.usePageLink(id)),
    useGo: () => {
      const go = real.useGo();
      return (to: string, opts?: Parameters<typeof go>[1]) => { if (to.startsWith('/board')) S.went.push(to); else go(to, opts); };
    },
  };
});

const USER = 'a1b2c3d4e5f6a7b8c9d0e1f2';

describe('Notes: Put on Board for one note', () => {
  it('the row menu puts that note on the Board: a notes tile on its page', async () => {
    await renderPage(page, {});
    const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Put on Board' }));
    expect(S.went).toHaveLength(1);
    const q = new URLSearchParams(S.went[0]!.slice('/board?'.length));
    expect(q.get('add')).toBe('notes-1');
    expect(q.get('open')).toBe('node');
    expect(q.get('user')).toBe(USER);
    expect(q.get('node')).toMatch(/^[0-9a-z]{24,28}$/);
    expect(q.get('cid')).toMatch(/^[0-9a-z]{24}$/);
  });
});
