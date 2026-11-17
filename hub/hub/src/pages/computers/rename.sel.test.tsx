// `?sel=` is the computer's handle, `name.last4` (logic.ts handleOf). A rename changes the name and leaves the
// link's old name behind (this tab's own rename, one made in another tab, a bookmark). The selection then resolves by
// the id's last four when exactly one listed computer ends with them, and the page puts the current handle into the
// URL in place (replace: no new history entry, the other keys kept). Before: the detail drew "no longer here".
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import { computers } from './fixtures';
import { findByHandle, handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';
import type { Computer } from './types';

const c = (id: string, name: string): Computer => ({ ...computers[0]!, id, name });
const A = c('0123456789abcdef0123a1b2', 'alpha');
const B = c('fedcba9876543210fedcc3d4', 'beta');
const A2 = c('aaaaaaaaaaaaaaaaaaaaa1b2', 'gamma');

describe('findByHandle: a handle whose name is out of date', () => {
  it('the exact handle still names its computer', () => {
    expect(findByHandle([A, B], 'alpha.a1b2')).toBe(A);
    expect(findByHandle([A, B], 'alpha')).toBe(A);
  });

  it('an old name with the id tail of exactly one listed computer names that computer', () => {
    expect(findByHandle([A, B], 'before-rename.a1b2')).toBe(A);
    expect(findByHandle([A, B], 'old.name.c3d4')).toBe(B);
  });

  it('an exact handle wins over a computer that only shares the tail', () => {
    expect(findByHandle([A2, A], 'alpha.a1b2')).toBe(A);
    expect(findByHandle([A, A2], 'gamma.a1b2')).toBe(A2);
  });

  it('a tail two listed computers share names neither; a tail that is not four characters names none', () => {
    expect(findByHandle([A, A2, B], 'before-rename.a1b2')).toBeUndefined();
    expect(findByHandle([A], 'before-rename.')).toBeUndefined();
    expect(findByHandle([A], 'before-rename.b2')).toBeUndefined();
    expect(findByHandle([A], 'before-rename.3a1b2')).toBeUndefined();
    expect(findByHandle([A, B], 'before-rename.ffff')).toBeUndefined();
    expect(findByHandle([A, B], 'before-rename')).toBeUndefined();
  });
});

describe('computers: a link that holds the name from before a rename', () => {
  const atlas = computers.find((x) => x.name === 'atlas')!;
  const tail = atlas.id.slice(-4);

  it('opens the renamed computer, never "no longer here", and the URL takes its current handle in place', async () => {
    expect(computers.filter((x) => x.id.endsWith(tail))).toHaveLength(1);
    const r = await renderPage(page, { path: `/computers?sel=${encodeURIComponent(`before-rename.${tail}`)}&tab=ports` });
    const before = r.router.history.length;
    await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 });
    expect(screen.queryByText(strings['detail.gone'])).toBeNull();
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ sel: handleOf(atlas), tab: 'ports' }));
    expect(r.router.history.length).toBe(before);
  }, 40000);

  const stale = encodeURIComponent(`before-rename.${tail}`);

  it('an alias ask in such a link is dropped, never carried to the computer the tail found', async () => {
    const r = await renderPage(page, { path: `/computers?sel=${stale}&alias=8080` });
    await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 });
    await waitFor(() => expect(r.router.state.location.search).toEqual({ sel: handleOf(atlas) }));
    await new Promise((res) => setTimeout(res, 500));
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);

  it('a take-a-snapshot ask in such a link is dropped the same way', async () => {
    const r = await renderPage(page, { path: `/computers?sel=${stale}&tab=backups&take=1` });
    await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 });
    await waitFor(() => expect(r.router.state.location.search).toEqual({ sel: handleOf(atlas), tab: 'backups' }));
    await new Promise((res) => setTimeout(res, 1500));
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);

  it('the take ask in a link with the current name still opens its drawer (the control)', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(atlas))}&tab=backups&take=1` });
    expect(await screen.findByRole('dialog', {}, { timeout: 20000 })).toBeInTheDocument();
  }, 40000);

  it('the same asks in a link with the current name still open (the control)', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(atlas))}&alias=8080` });
    expect(await screen.findByRole('dialog', {}, { timeout: 20000 })).toBeInTheDocument();
  }, 40000);

  it('a link whose tail no listed computer has still says the computer is no longer here', async () => {
    expect(computers.some((x) => x.id.endsWith('ffff'))).toBe(false);
    const r = await renderPage(page, { path: '/computers?sel=before-rename.ffff' });
    expect(await screen.findByText(strings['detail.gone'], {}, { timeout: 20000 })).toBeInTheDocument();
    expect(r.router.state.location.search).toMatchObject({ sel: 'before-rename.ffff' });
  }, 40000);
});
