// Vitest: Board > Add a program > a computer's apps, as results of the frame's one search field:
//   - a result answers the words it was asked for: while the field holds other words (before they are asked), Enter
//     in the field or a press on a result opens nothing; once they are asked, Enter opens the first result;
//   - "Choose options before opening" holds across an app's Options and Cancel: the next press shows Options again;
//   - Results says "No program named" only once every place answered for the words: still looking while the apps
//     ready to install are read, and scoped to the places that answered when one could not be read.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { loadLauncher } from '../apps/links';
import { resetBoardsForTests } from './data';
import page from './page';
import { findTile, toKind } from './parts/browse.testkit';
import boardStrings from './strings.en.json';

const B = boardStrings as Record<string, string>;
// The launcher's own words (the apps page's strings, which this page does not import).
const OPTIONS_FIRST = 'Choose options before opening';
const CANCEL = 'Cancel';
const SEARCH = B['picker.searchPrograms']!;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

// Every launch the launcher sends, and how the apps ready to install answer (a test may hold or fail them).
const S = vi.hoisted(() => ({ sent: [] as { name: string }[], catalog: 'ok' as 'ok' | 'pending' | 'failed' }));
type Query = { data: unknown; error: unknown; isPending: boolean; isError: boolean; isSuccess: boolean; status: string };
type Mutation = { mutateAsync: (a: { name: string }) => Promise<unknown> };
vi.mock('../apps/data', async (orig) => {
  const real = await orig<{ useOpenApp: () => Mutation; useCatalog: (...a: unknown[]) => Query }>();
  return {
    ...real,
    useOpenApp: () => {
      const m = real.useOpenApp();
      return { ...m, mutateAsync: (a: { name: string }) => { S.sent.push(a); return m.mutateAsync(a); } };
    },
    useCatalog: (...args: unknown[]) => {
      const r = real.useCatalog(...args);
      if (S.catalog === 'pending') return { ...r, data: undefined, error: null, isPending: true, isError: false, isSuccess: false, status: 'pending' };
      if (S.catalog === 'failed') return { ...r, data: undefined, error: new Error('down'), isPending: false, isError: true, isSuccess: false, status: 'error' };
      return r;
    },
  };
});

beforeAll(async () => { await page.load(); await loadLauncher(); }, 180_000);

beforeEach(() => {
  S.sent.length = 0;
  S.catalog = 'ok';
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

async function toComputer() {
  const user = userEvent.setup();
  await renderPage(page);
  await user.click((await screen.findAllByRole('button', { name: /Add a program/ })).find((b) => b.textContent?.includes('Add a program'))!);
  await user.click(await screen.findByRole('row', { name: /^atlas/ }));
  await findTile(/Terminal/);
  return user;
}
const apps = () => screen.getByRole('group', { name: 'Apps' });
const field = () => screen.getByRole('searchbox', { name: SEARCH });
/** The words typed, then the Apps kind opened (its results only: no Opened recently card), and its first result. */
async function appsFor(user: ReturnType<typeof userEvent.setup>, words: string, first: RegExp) {
  await user.type(field(), words);
  await waitFor(() => toKind(/^Apps/), { timeout: 4000 });
  // Past the pause before the words are asked: the cards on show then answer them.
  await new Promise((r) => setTimeout(r, 400));
  return (await within(apps()).findAllByRole('row', { name: first }, { timeout: 4000 }))[0]!;
}

describe('Add a program: app results', () => {
  it('Enter or a press opens nothing while the field holds words not asked yet; a result of the words asked opens', async () => {
    const user = await toComputer();
    const old = await appsFor(user, 'htop', /^htop/);
    // New words, then Enter and a press on a card at once: the cards on show still answer "htop".
    fireEvent.change(field(), { target: { value: 'jupyter' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    if (old.isConnected) fireEvent.click(old);
    await new Promise((r) => setTimeout(r, 400));
    expect(S.sent).toEqual([]);
    // Asked: a result for the words in the field opens.
    await user.click((await within(apps()).findAllByRole('row', { name: /^JupyterLab/ }, { timeout: 4000 }))[0]!);
    await waitFor(() => expect(S.sent.map((x) => x.name)).toEqual(['JupyterLab']));
  });

  it('"Choose options before opening" holds across Options and Cancel: the next press shows Options, not a launch', async () => {
    const user = await toComputer();
    const card = await appsFor(user, 'htop', /^htop/);
    await user.click(within(apps()).getByRole('switch', { name: OPTIONS_FIRST }));
    await user.click(card);
    await user.click(await within(apps()).findByRole('button', { name: CANCEL }));
    await user.click((await within(apps()).findAllByRole('row', { name: /^htop/ }, { timeout: 4000 }))[0]!);
    expect(await within(apps()).findByRole('button', { name: CANCEL })).toBeInTheDocument();
    expect(S.sent).toEqual([]);
  });

  it('while the apps ready to install are read, Results is still looking: no "No program named"', async () => {
    S.catalog = 'pending';
    const user = await toComputer();
    await user.type(field(), 'zzqx');
    expect(await screen.findByText(fill(B['browse.looking']!, { q: 'zzqx' }), {}, { timeout: 4000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByText(fill(B['browse.none']!, { q: 'zzqx' }))).toBeNull();
  });

  it('a place that could not be read scopes the sentence to the places that answered', async () => {
    S.catalog = 'failed';
    const user = await toComputer();
    await user.type(field(), 'zzqx');
    expect(await screen.findByText(fill(B['browse.noneIncomplete']!, { q: 'zzqx' }), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(fill(B['browse.none']!, { q: 'zzqx' }))).toBeNull();
  });

  it('once every place answered for the words, Results says "No program named" and that they were searched', async () => {
    const user = await toComputer();
    await user.type(field(), 'zzqx');
    expect(await screen.findByText(fill(B['browse.none']!, { q: 'zzqx' }), {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
