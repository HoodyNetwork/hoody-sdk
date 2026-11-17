// Vitest: the running tasks on the Work tab are a data view: newest first, a count, and a search over the task, what it waits on
// and the computer (its box is found by its placeholder: every kit search box is named "Search", and the Bots list has one too), kept in the address under a `w` prefix so it does not clash with the page's own keys.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (extra = '') => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work${extra}` });
const table = async () => within(await screen.findByRole('table', { name: strings['work.title'] }));
const tasks = (t: ReturnType<typeof within>): string[] =>
  t
    .getAllByRole('row')
    .map((r: HTMLElement) => r.textContent ?? '')
    .filter((x: string) => /Read deploy log|Draft reply to a reader/.test(x));

describe('running tasks', () => {
  it('list the newest first with a count', async () => {
    await open();
    const t = await table();
    await t.findByText('Read deploy log');
    expect(tasks(t).map((x: string) => (/Read deploy log/.test(x) ? 'a1' : 'a2'))).toEqual(['a1', 'a2']);
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
  });

  it('search finds a task by what it waits on and never writes it to the address', async () => {
    const { router } = await open();
    const t = await table();
    await t.findByText('Read deploy log');
    // One paste, not a keystroke per letter: each key re-renders the whole Bots page and writes the address (15 s under load).
    await userEvent.click(screen.getByPlaceholderText(strings['work.search']));
    await userEvent.paste('shop repository');
    await waitFor(() => expect(t.queryByText('Read deploy log')).toBeNull());
    expect(t.getByText('Draft reply to a reader')).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).wq).toBeUndefined();
    expect(router.state.location.href).not.toContain('shop');
  }, 30000);

  it('a search from the address with no match says so and offers to clear it', async () => {
    await open('&wq=zzz');
    expect(await screen.findByText(strings['work.noMatch'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument();
  });
});
