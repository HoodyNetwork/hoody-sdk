// Vitest: Delete note on the page. The row menu's Delete opens a confirm that names the note and its computer and sends
// nothing by itself; Delete note sends ONE delete of that note; an unknown answer offers only Check again (a read), on
// the dialog and again from the row menu, and is never sent a second time; a refusal closes the dialog with the note
// still listed.
import { useMemo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import kit from '@kit/forms/forms.strings.en.json';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import type * as Kit from '@kit';
import type { Settled } from './api';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const NB = 'b2c3d4e5f6a7b8c9d0e1f2a3'; // the fixture Notes' notebook (fixtureApi.ts)

// The delete and its read-back, counted at the Api. `remove` / `present` null: the fixtures' own answer.
const S = vi.hoisted(() => ({
  removes: [] as Array<[string, string, string]>,
  presents: [] as Array<[string, string, string]>,
  remove: null as null | (() => unknown),
  present: null as null | (() => unknown),
  toasts: [] as Array<{ title: string; tone?: string; body?: string }>,
}));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof Data>();
  return {
    ...m,
    useApi: () => {
      const api = m.useApi();
      return useMemo(
        () => ({
          ...api,
          remove: async (...a: Parameters<typeof api.remove>) => {
            S.removes.push([a[0].id, a[1], a[2]]);
            return S.remove ? (S.remove() as Settled) : api.remove(...a);
          },
          present: async (...a: Parameters<typeof api.present>) => {
            S.presents.push([a[0].id, a[1], a[2]]);
            return S.present ? (S.present() as Settled) : api.present(...a);
          },
        }),
        [api],
      );
    },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, showToast: (c: { title: string; tone?: string; body?: string }) => { S.toasts.push(c); return `toast-${S.toasts.length}`; } };
});
beforeEach(() => { S.removes.length = 0; S.presents.length = 0; S.remove = null; S.present = null; S.toasts.length = 0; });

const lost = (): Settled => ({ ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } });
const notFound = (): Settled => ({ ok: false, err: { kind: 'not_found', status: 404, code: 'not_found', data: { code: 'not_found', message: 'Node not found.' } } });
const forbidden = (): Settled => ({ ok: false, err: { kind: 'private', status: 403, code: 'forbidden', data: { code: 'forbidden', message: 'You do not have permission to delete this node.' } } });

/** A delete toast's title for the note titled `title`, as view.tsx builds it. */
const said = (key: 'toast.deleted' | 'toast.deleteGone', title: string) => strings[key].replace('{{note}}', strings['delete.noteNamed'].replace('{{title}}', title));

const table = () => screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
const rowOf = async (title: RegExp) => within(await table()).findByRole('row', { name: title }, { timeout: 8000 });
const theDialog = () => screen.findByRole('alertdialog', { name: strings['delete.title'] }, { timeout: 8000 });
const noDialog = () => waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), { timeout: 8000 });

/** Opens the row menu of the note and presses its Delete (the item ends with "…": it opens a dialog). */
async function pressDelete(title: RegExp) {
  await userEvent.click(within(await rowOf(title)).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['action.delete']}`) }));
  return theDialog();
}

describe('Notes: Delete note', () => {
  it('asks first, naming the note and its computer; Cancel sends nothing', async () => {
    await renderPage(page, {});
    const dialog = await pressDelete(/Weekly plan/);
    expect(dialog.textContent).toContain(strings['delete.body'].replace('{{title}}', 'Weekly plan').replace('{{computer}}', 'atlas'));
    expect(S.removes).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await noDialog();
    expect(S.removes).toEqual([]);
    expect(await rowOf(/Weekly plan/)).toBeInTheDocument();
  });

  it('Delete note sends one delete of that note; the note leaves the list and a toast says so', async () => {
    await renderPage(page, {});
    const dialog = await pressDelete(/Weekly plan/);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.go'] }));
    await noDialog();
    expect(S.removes).toHaveLength(1);
    expect(S.removes[0]?.[0]).toBe(atlas.id);
    expect(S.removes[0]?.[1]).toBe(NB);
    expect(S.removes[0]?.[2]).toMatch(/^[0-9a-z]{24}$/);
    await waitFor(() => expect(within(screen.getByRole('table', { name: strings.table })).queryByRole('row', { name: /Weekly plan/ })).toBeNull(), { timeout: 8000 });
    expect(await rowOf(/Deploy checklist/)).toBeInTheDocument();
    expect(S.toasts).toEqual([{ title: said('toast.deleted', 'Weekly plan'), tone: 'ok' }]);
    expect(S.presents).toEqual([]);
  });

  it('an unknown answer: only Check again (a read), on the dialog and from the row menu again; never a second delete', async () => {
    S.remove = lost;
    S.present = lost;
    await renderPage(page, {});
    const dialog = await pressDelete(/Reading list/);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.go'] }));
    const check = await within(dialog).findByRole('button', { name: kit['outcome.check'] }, { timeout: 8000 });
    expect(dialog.textContent).toContain(strings['delete.pending']);
    expect(within(dialog).getByRole('button', { name: strings['delete.go'] })).toBeDisabled();
    // The read cannot tell: the dialog stays as it is.
    await userEvent.click(check);
    await waitFor(() => expect(S.presents).toHaveLength(1));
    expect(S.presents[0]).toEqual(S.removes[0]);
    expect(await theDialog()).toBeInTheDocument();
    // Closed, the note's Delete opens the same record: Check again, and no Delete note to press.
    await userEvent.click(within(await theDialog()).getByRole('button', { name: 'Cancel' }));
    await noDialog();
    const again = await pressDelete(/Reading list/);
    expect(within(again).getByRole('button', { name: strings['delete.go'] })).toBeDisabled();
    // Now Notes says the note is not there: the record ends, the dialog goes, and nothing was sent twice.
    S.present = notFound;
    await userEvent.click(await within(again).findByRole('button', { name: kit['outcome.check'] }));
    await noDialog();
    expect(S.removes).toHaveLength(1);
    expect(S.toasts.some((x) => x.title === said('toast.deleteGone', 'Reading list'))).toBe(true);
    expect(S.toasts.some((x) => x.title === said('toast.deleted', 'Reading list'))).toBe(false);
  });

  it('a refusal of Notes closes the dialog and the note stays listed', async () => {
    S.remove = forbidden;
    await renderPage(page, {});
    const dialog = await pressDelete(/Trip ideas/);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['delete.go'] }));
    await noDialog();
    expect(S.removes).toHaveLength(1);
    expect(S.presents).toEqual([]);
    expect(await rowOf(/Trip ideas/)).toBeInTheDocument();
    expect(S.toasts.some((x) => x.tone === 'ok')).toBe(false);
  });
});
