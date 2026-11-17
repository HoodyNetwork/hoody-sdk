// Vitest: the link's own confirms (Panic, Revoke all, Turn off) are bound to the link they were opened over. A link
// deleted and made again from another session has another id, and the change is sent to whatever link is current: the
// dialog closes, and it does not come back when the Bot has a link again. A refresh that reads the same link keeps it.
import { beforeAll, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { queryClient } from '@core';
import page from './page';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
type Link = Record<string, unknown> & { id: string };
type Links = Record<string, Link | null>;

/** The page's link read, and a way to put another link (or none) under the Bot. */
function linkRead() {
  const q = queryClient.getQueryCache().findAll().find((x) => Array.isArray((x.state.data as Record<string, { keys?: unknown[] }> | undefined)?.[CHIEF]?.keys));
  expect(q, 'the link read').toBeDefined();
  const now = () => (q!.state.data as Links)[CHIEF] ?? null;
  const set = (next: Link | null) =>
    act(() => {
      queryClient.setQueryData(q!.queryKey, (d: Links) => ({ ...d, [CHIEF]: next }));
    });
  return { now, set };
}
const settle = () => act(async () => new Promise((res) => setTimeout(res, 50)));

const headOf = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('header') as HTMLElement;
const KINDS = [
  ['Panic', strings['addr.title'], strings['panic.button'], strings['panic.confirmTitle']],
  ['Turn off', strings['addr.title'], strings['addr.turnOff'], strings['link.offTitle']],
  ['Revoke all', strings['keys.heading'], strings['keys.revokeAll'], strings['keys.revokeAllTitle'].replace('{{name}}', 'Chief')],
] as const;

async function openConfirm(section: string, item: string, title: string) {
  await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
  await userEvent.click(within(await headOf(section)).getByRole('button', { name: 'More actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${item}`) }));
  await screen.findByRole('alertdialog', { name: title });
  const read = linkRead();
  const first = read.now();
  expect(first, 'the Bot has a link').not.toBeNull();
  return { read, first: first! };
}

describe('a link confirm whose link is replaced while it is open', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);

  it.each(KINDS)('%s closes when the link under the Bot has another id', async (_n, section, item, title) => {
    const { read, first } = await openConfirm(section, item, title);
    read.set({ ...first, id: 'bu_made_again' });
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: title })).toBeNull());
  }, 30000);

  it.each(KINDS)('%s does not come back when the link went away and another was made', async (_n, section, item, title) => {
    const { read, first } = await openConfirm(section, item, title);
    read.set(null);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: title })).toBeNull());
    read.set({ ...first, id: 'bu_made_again' });
    await screen.findByRole('heading', { name: strings['addr.title'] });
    await settle();
    expect(screen.queryByRole('alertdialog', { name: title })).toBeNull();
  }, 30000);

  it.each(KINDS)('%s stays open over a refresh that reads the same link', async (_n, section, item, title) => {
    const { read, first } = await openConfirm(section, item, title);
    read.set({ ...first });
    await settle();
    expect(screen.getByRole('alertdialog', { name: title })).toBeInTheDocument();
  }, 30000);
});
