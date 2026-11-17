// Vitest: a key's Revoke and Rotate dialogs are bound to that key. A link read that no longer has the key (revoked from
// another page, the link replaced) closes the dialog, so Confirm never sends for a key that is gone; a dialog whose key
// is still there stays open.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import { queryClient } from '@core';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (extra: string) => `/bots?sel=${encodeURIComponent(CHIEF)}${extra}`;
type Keys = Array<{ id: string; name: string }>;

/** The page's link read, and a way to set the Bot's keys in it. */
function linkRead() {
  const q = queryClient.getQueryCache().findAll().find((x) => Array.isArray((x.state.data as Record<string, { keys?: unknown[] }> | undefined)?.[CHIEF]?.keys));
  expect(q, 'the link read').toBeDefined();
  const keys = () => ((q!.state.data as Record<string, { keys: Keys }>)[CHIEF]!.keys);
  const setKeys = (next: Keys) => act(() => {
    queryClient.setQueryData(q!.queryKey, (d: Record<string, Record<string, unknown>>) => ({ ...d, [CHIEF]: { ...d[CHIEF], keys: next } }));
  });
  return { keys, setKeys };
}

async function openOnFirstKey(item: string, title: string) {
  await renderPage(page, { path: at('&tab=link') });
  const table = await screen.findByRole('table', { name: /^\d+ keys?$/ });
  const read = linkRead();
  const first = read.keys()[0]!;
  const row = within(table).getByRole('row', { name: new RegExp(first.name) });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${item}`) }));
  await screen.findByRole('alertdialog', { name: title });
  return { read, first };
}

describe('a key that goes away while its dialog is open', () => {
  it.each([
    ['Revoke', strings['key.revoke'], strings['key.revokeTitle']],
    ['Rotate', strings['key.rotate'], strings['key.rotateTitle']],
  ])('%s closes when the key is gone', async (_n, item, title) => {
    const { read, first } = await openOnFirstKey(item, title);
    read.setKeys(read.keys().filter((k) => k.id !== first.id));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: title })).toBeNull());
  });

  it('Revoke stays open while its key is still there', async () => {
    const { read, first } = await openOnFirstKey(strings['key.revoke'], strings['key.revokeTitle']);
    read.setKeys(read.keys().filter((k) => k.id === first.id));
    await act(async () => new Promise((res) => setTimeout(res, 50)));
    expect(screen.getByRole('alertdialog', { name: strings['key.revokeTitle'] })).toBeInTheDocument();
  });
});
