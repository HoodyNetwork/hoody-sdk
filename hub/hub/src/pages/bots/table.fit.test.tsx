// Vitest: the Bots tables use the kit's measured columns. A 'fit' column is at least as wide as the words
// its cells show (a translation longer than its old fixed width gets the room instead of being cut), its declared width
// stays its floor, the name/task/notes column takes the rest, and the widths add up to the table. jsdom has no layout:
// the table's width is given, and a long translation is put into the page's own string table for the test.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderPage as renderPageRaw, screen, waitFor } from '@app/testing';
import { localSetting } from '@core';
import { fitWidth } from '@kit';
import page from './page';
import strings from './strings.en.json';

const ROOM = 1600;
let measured = 0;
const atWidth = (width: number) =>
  class {
    constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
    observe() {
      measured += 1;
      this.cb([{ contentRect: { width } }]);
    }
    unobserve() {}
    disconnect() {}
  };

const table = strings as Record<string, string>;
const saved: Record<string, string> = {};
/** Puts a long translation into the page's strings for one test (restored after it). */
const long = (key: string, text: string) => {
  saved[key] ??= table[key]!;
  table[key] = text;
};

// These tests read the dense table: the page opens on cards, so each render picks List (the remembered choice; a
// render starts with clean storage, so it is set once the page is up).
const present = () => localSetting('hub.v3.table.present.bots');
const renderPage = async (...a: Parameters<typeof renderPageRaw>) => {
  const r = await renderPageRaw(...a);
  await act(async () => void present().set('list'));
  return r;
};
afterEach(() => void present().set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) table[k] = v;
  for (const k of Object.keys(saved)) delete saved[k];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The drawn table of `grid` (the one whose header row names `head`): each column's header and px width, in order. */
function columnsOf(head: string) {
  const grid = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => th.textContent?.trim().startsWith(head)));
  if (!grid) throw new Error(`no table with a ${head} column`);
  const heads = [...grid.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
  const widths = [...grid.querySelectorAll('colgroup col')].map((c) => Number.parseFloat((c as HTMLElement).style.width));
  const width = (name: string) => widths[heads.findIndex((h) => h.startsWith(name))] ?? Number.NaN;
  return { heads, widths, width };
}
const settled = async (head: string) => {
  await waitFor(() => expect(measured).toBeGreaterThan(0));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  await waitFor(() => expect(columnsOf(head).widths.every((w) => Number.isFinite(w))).toBe(true));
  return columnsOf(head);
};

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('Bots: measured columns', () => {
  it('the Link column takes a long translation of its word whole, and the Bot name takes the rest', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    long('ui.on', 'On, answering on every chat app');
    await renderPage(page, { path: '/bots' });
    await screen.findAllByText('On, answering on every chat app', undefined, { timeout: 10000 });
    const t = await settled(strings['col.link']);
    expect(t.width(strings['col.link'])).toBeGreaterThanOrEqual(fitWidth(['On, answering on every chat app']));
    // These Bots span computers, so the list groups by computer and draws no Computer column.
    expect(screen.queryByRole('columnheader', { name: strings['col.computer'] })).toBeNull();
    expect(t.width(strings['col.model'])).toBeGreaterThanOrEqual(140);
    const name = t.width(strings['col.name']);
    expect(name).toBeGreaterThan(Math.max(...t.widths.filter((w) => w !== name)));
  }, 30000);

  it('one computer: the Computer column is back with its 154 px floor, and a long name gets the room to show whole', async () => {
    // The default fixture spans computers, so
    // the list groups by computer and the first test above does not measure this column. One computer draws it.
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { state: 'longComputer', path: '/bots' });
    await screen.findAllByText('production-worker-01', undefined, { timeout: 10000 });
    const t = await settled(strings['col.link']);
    expect(screen.getByRole('columnheader', { name: strings['col.computer'] })).toBeInTheDocument();
    const computer = t.width(strings['col.computer']);
    expect(computer).toBeGreaterThanOrEqual(154);
    // The name, the flag and the cell's padding all fit: the fit measure of "<flag> production-worker-01" plus the 22 px of the link's own room.
    expect(computer).toBeGreaterThanOrEqual(fitWidth(['production-worker-01'], { extra: 22 }));
    // The other columns keep their floors, and the Bot name still takes the rest.
    expect(t.width(strings['col.model'])).toBeGreaterThanOrEqual(140);
    const name = t.width(strings['col.name']);
    expect(name).toBeGreaterThan(Math.max(...t.widths.filter((w) => w !== name)));
  }, 30000);

  it('one computer with a short name: the column keeps its 154 px floor', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { state: 'oneComputer', path: '/bots' });
    const t = await settled(strings['col.link']);
    expect(t.width(strings['col.computer'])).toBe(154);
  }, 30000);

  it('the Link keys table: Addresses takes its long words whole, Notes takes the rest', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    long('keys.anyAddress', 'Any address on the internet, from anywhere');
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
    await screen.findAllByText('Any address on the internet, from anywhere', undefined, { timeout: 10000 });
    const t = await settled(strings['keys.col.addresses']);
    expect(t.width(strings['keys.col.addresses'])).toBeGreaterThanOrEqual(fitWidth(['Any address on the internet, from anywhere']));
    expect(t.width(strings['keys.col.expires'])).toBeGreaterThanOrEqual(130);
    const notes = t.width(strings['keys.col.notes']);
    expect(notes).toBeGreaterThan(t.width(strings['keys.col.addresses']));
  }, 30000);

  it('the Work table: Where keeps its floor, and the task takes the rest', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work` });
    const t = await settled(strings['work.col.task']);
    expect(t.width(strings['work.col.where'])).toBeGreaterThanOrEqual(160);
    expect(t.width(strings['work.col.started'])).toBeGreaterThanOrEqual(110);
    const task = t.width(strings['work.col.task']);
    expect(task).toBeGreaterThan(Math.max(...t.widths.filter((w) => w !== task)));
  }, 30000);

  it('the Finished Work table: Started, its last cell (no row actions), is its words plus that cell\'s 4 px wider end', async () => {
    // The fit measure pads 12 + 12, a last cell with no actions after it ends 16 px in.
    // The clock is set so the finished task (started 2026-10-22) reads "11 months ago": words wider than Started's 110 px
    // floor, so the fit decides the width (the fixtures' own clock is fixed; the real date would make this vary).
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2027, 8, 20, 12) });
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work&finished=1` });
    const grid = await screen.findByRole('table', { name: strings['work.finishedTitle'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const heads = [...grid.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
    const at = heads.findIndex((h) => h.startsWith(strings['work.col.started']));
    expect(at, 'Started is the last column').toBe(heads.length - 1);
    const width = Number.parseFloat((grid.querySelectorAll('colgroup col')[at] as HTMLElement).style.width);
    const texts = [...grid.querySelectorAll('tbody tr')].map((tr) => tr.children[at]?.textContent ?? '').filter(Boolean);
    expect(texts).toContain('11 months ago');
    expect(width).toBeGreaterThanOrEqual(fitWidth(texts, { extra: 4 }));
  }, 30000);
});
