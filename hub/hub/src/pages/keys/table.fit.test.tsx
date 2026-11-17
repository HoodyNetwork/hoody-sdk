// Vitest: the Keys tables use the kit's measured columns. A 'fit' column is at least as wide as the words
// its cells show (a translation longer than its old fixed width gets the room instead of being cut), its declared width
// stays its floor, the name (Keys) or realm (Shared, all realms) takes the rest. jsdom has no layout: the table's width is
// given, and a long translation is put into the page's own string table for the test.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { fitWidth, statusPillMetrics, textWidth } from '@kit';
import { shareColumns, utc } from './share-logic';
import page from './page';
import strings from './strings.en.json';

const ROOM = 1600;
/** One whole date in jsdom (no canvas here, so every glyph is 7.2 px and any date is as wide; the widest-digit floor itself is
 *  shared-endsfloor.test.tsx's). Ends' floor is this, plus the kit's 4 px for each table edge it is drawn at (DataTable
 *  Edges). Below date + pill the pill wraps above the date. */
const DATE = fitWidth([utc('2000-08-28T08:08:00Z')]);
/** The list switch across all realms: Made (the first column, a fit column: the kit adds the first cell's 4 px) + Stop
 *  (260, not fit: no pad) + Ends' floor (the date). Just there Made has given way and Ends is drawn first, so the room is
 *  Ends (date + 4) + Realm (120) + Stop: the same. */
const EDGE = 120 + 4 + 260 + DATE;
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
const long = (key: string, text: string) => {
  saved[key] ??= table[key]!;
  table[key] = text;
};
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) table[k] = v;
  for (const k of Object.keys(saved)) delete saved[k];
  vi.unstubAllGlobals();
});

/** The kit's edge padding on the column drawn under `head` (DataTable Edges): 4 px at the first edge and 4 at the last,
 *  Shared drawing no checkbox and no actions cell. */
const edgePads = (t: { heads: string[] }, head: string) => {
  const at = t.heads.findIndex((h) => h.startsWith(head));
  return (at === 0 ? 4 : 0) + (at === t.heads.length - 1 ? 4 : 0);
};

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

describe('Keys: measured columns', () => {
  it('Ends and Works in take long translations whole, Key keeps its floor, and the name takes what is left', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    long('never', 'No end date: it works until you stop it');
    long('allRealms', 'Every realm you have, now and later');
    await renderPage(page, { path: '/keys' });
    await screen.findAllByText('No end date: it works until you stop it', undefined, { timeout: 10000 });
    const t = await settled(strings['col.ends']);
    expect(t.width(strings['col.ends'])).toBeGreaterThanOrEqual(fitWidth(['No end date: it works until you stop it']));
    if (screen.queryAllByText('Every realm you have, now and later').length > 0) {
      expect(t.width(strings['col.works'])).toBeGreaterThanOrEqual(fitWidth(['Every realm you have, now and later']));
    }
    expect(t.width(strings['col.key'])).toBeGreaterThanOrEqual(110);
    // The name takes what the others leave: more than its pinned floor (220), and nothing runs past the table.
    expect(t.width(strings['col.name'])).toBeGreaterThan(220);
    expect(t.widths.reduce((a, w) => a + w, 0)).toBeLessThanOrEqual(ROOM);
  }, 30000);

  it('Shared access across all realms: Ends holds its whole date and a paused pill, Realm the rest', async () => {
    // Ends never stays at 120 px with its date cut, and Made, the first cell, is never measured 4 px
    // short (that cell starts 16 px in, not 12). A paused share is in this state (sharedManaged).
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { state: 'sharedManaged', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    const t = await settled(strings['share.colMade']);
    const at = (head: string) => t.heads.findIndex((h) => h.startsWith(head));
    const cellsOf = (head: string) => [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[at(head)]?.textContent ?? '').filter(Boolean);
    expect(screen.getAllByText(strings['state.paused']).length).toBeGreaterThan(0);
    const pill = textWidth([strings['state.paused']], statusPillMetrics()) + 8;
    const dates = cellsOf(strings['share.colEnds']).map((x) => x.replace(strings['state.paused'], '').trim());
    expect(dates.length).toBeGreaterThan(0);
    expect(t.width(strings['share.colEnds'])).toBeGreaterThanOrEqual(fitWidth(dates) + pill);
    expect(t.width(strings['share.colEnds']), 'Ends\' floor: its date and the kit\'s pad for each edge it is at').toBeGreaterThanOrEqual(DATE + edgePads(t, strings['share.colEnds']));
    expect(t.width(strings['share.colAction'])).toBe(260);
    expect(t.width(strings['share.colRealm'])).toBeGreaterThan(120);
  }, 30000);

  it('Shared access: Made, the first cell, is its words plus that cell\'s 4 px wider start (16 px, not 12)', async () => {
    // The fit measure pads 12 + 12, the first cell starts 16 px in.
    vi.stubGlobal('ResizeObserver', atWidth(ROOM));
    await renderPage(page, { state: 'sharedNamed', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    const t = await settled(strings['share.colMade']);
    const at = t.heads.findIndex((h) => h.startsWith(strings['share.colMade']));
    const made = [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[at]?.textContent ?? '').filter(Boolean);
    expect(made.length).toBeGreaterThan(0);
    expect(t.width(strings['share.colMade'])).toBeGreaterThanOrEqual(fitWidth(made, { extra: 4 }));
  }, 30000);

  // When a share ends is never dropped or cut. It is shown at least as wide as its date,
  // or the table is the two-line list. An Ends floor of date + pill must not drop Ends across all
  // realms instead of switching to the list, nor push Can out.
  const shared = async (room: number, state: string, realm?: 'all') => {
    vi.stubGlobal('ResizeObserver', atWidth(room));
    await renderPage(page, { state, ...(realm ? { realm } : {}), path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    if (document.querySelector('.listLines')) return undefined;
    return settled(strings['share.colAction']);
  };
  const has = (t: { heads: string[] }, head: string) => t.heads.some((h) => h.startsWith(head));

  it('Shared across all realms with 650 px: Ends is whole beside Realm and Stop, never dropped', async () => {
    const t = await shared(650, 'sharedManaged', 'all');
    expect(t, 'a table at 650 px').toBeDefined();
    expect(has(t!, strings['share.colEnds']), 'Ends is shown').toBe(true);
    expect(t!.width(strings['share.colEnds']), 'Ends\' floor: its date and the kit\'s pad for each edge it is at').toBeGreaterThanOrEqual(DATE + edgePads(t!, strings['share.colEnds']));
    expect(has(t!, strings['share.colRealm']) && has(t!, strings['share.colAction'])).toBe(true);
  }, 30000);

  it('Shared across all realms with 680 px (a 768 viewport): Made, Ends, Realm and Stop, Ends whole', async () => {
    const t = await shared(680, 'sharedManaged', 'all');
    expect(t, 'a table at 680 px').toBeDefined();
    for (const h of ['share.colMade', 'share.colEnds', 'share.colRealm', 'share.colAction']) expect(has(t!, table[h]!), `${h} is shown`).toBe(true);
    expect(t!.width(strings['share.colEnds']), 'Ends\' floor: its date and the kit\'s pad for each edge it is at').toBeGreaterThanOrEqual(DATE + edgePads(t!, strings['share.colEnds']));
  }, 30000);

  it('Shared across all realms with 800 px (an 880 viewport): Can stays, and Ends is whole', async () => {
    const t = await shared(800, 'sharedManaged', 'all');
    expect(t, 'a table at 800 px').toBeDefined();
    expect(has(t!, strings['share.colCan']), 'Can is shown').toBe(true);
    expect(t!.width(strings['share.colEnds']), 'Ends\' floor: its date and the kit\'s pad for each edge it is at').toBeGreaterThanOrEqual(DATE + edgePads(t!, strings['share.colEnds']));
  }, 30000);

  it('Shared in one realm with 700 px (a 768 viewport): Can stays, and Ends is whole', async () => {
    const t = await shared(700, 'sharedManaged');
    expect(t, 'a table at 700 px').toBeDefined();
    expect(has(t!, strings['share.colCan']), 'Can is shown').toBe(true);
    expect(t!.width(strings['share.colEnds']), 'Ends\' floor: its date and the kit\'s pad for each edge it is at').toBeGreaterThanOrEqual(DATE + edgePads(t!, strings['share.colEnds']));
  }, 30000);

  it('Shared across all realms at the list switch: a table of Ends, Realm and Stop, Made gone, and the floors that keep it so', async () => {
    // Between Made's drop and the list the table holds Ends, Realm and Stop; the switch counts Made, Stop and Ends. The
    // two are the same room only while Made's and Realm's floors are equal.
    const floor = (m: { width?: string; minWidth?: number }) => m.minWidth ?? (m.width ? Number.parseFloat(m.width) : 120);
    const all = shareColumns(false) as Record<string, { width?: string; minWidth?: number }>;
    expect(
      floor(all.made!),
      "Made's and Realm's floors must stay equal (both the default 120): the list switch counts Made, the table then needs Realm, so unequal floors drop Realm or Stop, or switch early",
    ).toBe(floor(all.realm!));
    const t = await shared(EDGE, 'sharedManaged', 'all');
    expect(t, `a table at ${EDGE} px, its list switch: if this is the list, Made's floor grew past Realm's (keep them equal)`).toBeDefined();
    for (const h of ['share.colEnds', 'share.colRealm', 'share.colAction']) {
      expect(has(t!, table[h]!), `${h} is shown at the switch: if not, Realm's floor grew past Made's (keep them equal)`).toBe(true);
    }
    expect(has(t!, strings['share.colMade']), 'Made gives way before the list').toBe(false);
    expect(edgePads(t!, strings['share.colEnds']), 'Ends is drawn first here (Stop last)').toBe(4);
    expect(t!.width(strings['share.colEnds']), 'Ends leads the row here: its date and the first cell\'s 4 px').toBeGreaterThanOrEqual(DATE + 4);
  }, 30000);

  it('Shared across all realms 1 px below the list switch: the two-line list, a paused share\'s end labelled and whole', async () => {
    expect(await shared(EDGE - 1, 'sharedManaged', 'all'), `the two-line list at ${EDGE - 1} px`).toBeUndefined();
    // A paused share's line 2 is labelled, its date whole: "Ends", then the time.
    const items = [...document.querySelectorAll('.listMeta > .listItem')];
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.querySelector('.listLabel')?.textContent).toBe(strings['share.colEnds']);
      expect(i.querySelector('.listValue')?.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    }
    expect(screen.getAllByText(strings['state.paused']).length).toBeGreaterThan(0);
  }, 30000);
});
