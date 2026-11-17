// Plans: each plan column holds its facts as label | value rows, the same rows in the same
// order in every column, so the eye reads across. The cards hold no table and there is no second set of cards: the one
// table of the view is the Compare plans section under them (plans.comparetable.test.tsx).
// The frame is the hand-off's plan, else the biggest plan on sale; "Suggested for you" only for the hand-off.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({ plans: [] as unknown[], subs: null as unknown[] | null }));
vi.mock('./data', async (orig) => {
  const o = await orig<Record<string, unknown>>();
  const realSubs = o.useSubs as () => unknown;
  return {
    ...o,
    usePlans: () => ({ data: fx.plans, isPending: false, isError: false, refetch: () => undefined }),
    // A test that sets fx.subs reads that list of paid servers; the others keep the fixtures'.
    useSubs: () => (fx.subs ? { data: { subs: fx.subs, partial: null }, isPending: false, isError: false, refetch: () => undefined } : realSubs()),
  };
});

const res = { cpu_cores: 2, ram_gb: 4, disk_limit_gb: 60, disk_io_read_mib: 400, disk_io_write_mib: 400, network_limit_mbps: 500, max_computers: 3, snapshots_per_computer: 3, ai_multiplier: 4 };
const plan = (id: string, title: string, sort: number, over: Record<string, unknown> = {}, r: Record<string, unknown> = {}) => ({
  id: `${id}-v1`, family_id: id, price_cents_per_month: 1000 + sort, hold_days: 7, ai_tier: 'plus', sort_order: sort, max_proxy_aliases: 6, max_bot_urls: 3,
  text: { title, type_label: 'Shared server', description: `${title} is for trying things out.` },
  ...over, resources: { ...res, ...r },
});
const column = (name: string) => screen.getByRole('group', { name });
/** One column's rows: [label, value] in document order. */
const rows = (name: string) =>
  [...column(name).querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')?.textContent ?? '', d.querySelector('dd')?.textContent ?? '']);
const value = (name: string, label: string) => {
  const dt = within(column(name)).getByText(label, { selector: 'dt' });
  return dt.nextElementSibling as HTMLElement;
};

beforeEach(() => {
  fx.subs = null;
  fx.plans = [plan('fam-a', 'Alpha', 1, { ai_tier: 'free', max_bot_urls: 0 }, { ai_multiplier: 1, snapshots_per_computer: undefined }), plan('fam-b', 'Beta', 2)];
});

describe('the facts as rows in each column', () => {
  it('the same labels in the same order in every plan column: computers first, the AI allowance last', async () => {
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Alpha' }, { timeout: 15_000 }); // the file's first test loads the lazy page, slow on a busy host
    const labels = (n: string) => rows(n).map(([l]) => l);
    expect(labels('Alpha')).toEqual(labels('Beta'));
    expect(labels('Beta')).toEqual([
      strings['buy.resComputers'],
      strings['buy.resCpu'],
      strings['buy.resRam'],
      strings['buy.resDisk'],
      // A row of copy the catalogue does not carry: the kind of hardware. Where the server can run is the card's own
      // regions part, under the rows.
      strings['plans.hardware'],
      strings['plans.aiLabel'],
    ]);
    // Shared hardware on every shared plan, in the same words: no claim about who else is on the machine.
    expect(value('Beta', strings['plans.hardware'])).toHaveTextContent(new RegExp(`^${strings['plans.shared']}$`));
    expect(value(strings['plans.free'], strings['plans.hardware'])).toHaveTextContent(new RegExp(`^${strings['plans.shared']}$`));
    expect(Object.keys(strings).filter((k) => /sharedPaid/.test(k))).toEqual([]);
    // The detail rows a card no longer shows are rows of the Compare plans table under the cards.
    const tableLabels = [...within(screen.getByRole('region', { name: strings['plans.cmp.title'] })).getByRole('table').querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('th, td')?.textContent ?? '',
    );
    for (const k of ['buy.resDiskIo', 'buy.resSnapshots', 'buy.resNetwork', 'buy.resAliases', 'buy.resBotUrls'] as const) {
      expect(labels('Beta')).not.toContain(strings[k]);
      expect(tableLabels).toContain(strings[k]);
    }
    const regionsOf = (n: string) => column(n).querySelector<HTMLElement>('[data-plan-part="regions"]');
    const paid = regionsOf('Beta')!;
    expect(paid, 'a paid plan lists its locations in the card').not.toBeNull();
    // The API's list for the plan (the regions read; fixtures: three with room, one full): only those with room are named.
    const tags = await within(paid).findByRole('list', { name: strings['plans.regions'] });
    expect(within(tags).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Frankfurt, Germany'), expect.stringContaining('Helsinki, Finland'), expect.stringContaining('Singapore')]);
    expect(within(paid).queryByText(/New York/)).toBeNull();
    // Free has no choice of region, and says so in the same place.
    const free = regionsOf(strings['plans.free'])!;
    expect(free).not.toBeNull();
    expect(within(free).getByText(strings['plans.regionsNone'])).toBeInTheDocument();
    expect(within(free).queryByRole('list')).toBeNull();
    expect(value('Beta', strings['buy.resComputers'])).toHaveTextContent(/^3$/);
    // The plan cards hold no table (their facts are label | value rows); the Compare plans section under them is the
    // page's one table.
    expect(document.querySelector('[data-section="plans"]')?.querySelector('table, [role="table"]') ?? null).toBeNull();
    expect(screen.getAllByRole('table')).toEqual([within(screen.getByRole('region', { name: strings['plans.cmp.title'] })).getByRole('table')]);
  });
  it('the plan fills: Free and the smaller plans calm, the biggest plan the plan fill', async () => {
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Alpha' });
    expect(column(strings['plans.free'])).toHaveAttribute('data-fill', 'calm');
    expect(column('Alpha')).toHaveAttribute('data-fill', 'calm');
    expect(column('Beta')).toHaveAttribute('data-fill', 'plan');
  });
  it('the AI row: the tier and its multiple in words over bars, every card on the one scale of the largest multiple', async () => {
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Alpha' });
    // Free's multiple is 1 by definition; a plan below ×2 shows its tier's (Alpha is on the Free tier); Beta ×4 ends the scale.
    const bars = (name: string, label: string) => {
      const img = within(value(name, strings['plans.aiLabel'])).getByRole('img', { name: label });
      return [...img.children].map((c) => /scaleLit/.test(c.className));
    };
    expect(value(strings['plans.free'], strings['plans.aiLabel'])).toHaveTextContent(/^Free 1×$/);
    expect(bars(strings['plans.free'], strings['plans.aiScaleBase'])).toEqual([true, false, false, false]);
    expect(value('Alpha', strings['plans.aiLabel'])).toHaveTextContent(/^Free 1×$/);
    expect(bars('Alpha', strings['plans.aiScaleBase'])).toEqual([true, false, false, false]);
    expect(value('Beta', strings['plans.aiLabel'])).toHaveTextContent(/^Plus 4×$/);
    expect(bars('Beta', 'Free AI: 4 times the Free plan')).toEqual([true, true, true, true]);
  });
  it('the AI row names no limit: only the tier and the multiple, in the words and the bars\' names', () => {
    for (const k of ['plans.aiLabel', 'plans.aiTierMult', 'plans.aiMult', 'plans.aiScale', 'plans.aiScaleBase'] as const) {
      expect(strings[k]).not.toMatch(/token|request|credit|limit|\d/i);
    }
  });
  it('a dash is named: 0 is not included, a missing field is not listed', async () => {
    fx.plans = [plan('fam-a', 'Alpha', 1, {}, { max_computers: 0, cpu_cores: undefined }), plan('fam-b', 'Beta', 2)];
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Alpha' });
    expect(within(value('Alpha', strings['buy.resComputers'])).getByRole('img', { name: strings['plans.notIncluded'] })).toHaveTextContent('—');
    expect(value('Beta', strings['buy.resComputers'])).toHaveTextContent('3');
    expect(within(value('Alpha', strings['buy.resCpu'])).getByRole('img', { name: strings['plans.notListed'] })).toBeInTheDocument();
  });
  it('the computers count explains itself: a tip on the number, reachable by keyboard, saying they share the server', async () => {
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Beta' });
    const cell = value('Beta', strings['buy.resComputers']);
    const tip = within(cell).getByRole('button');
    expect(tip).toHaveTextContent('3');
    const user = userEvent.setup();
    tip.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(strings['plans.computersTip_other'].replace('{{count}}', '3'))).toBeVisible();
    // The limit, never a promise of room left: a full server could not create one more.
    for (const k of ['plans.computersTip_one', 'plans.computersTip_other'] as const) expect(strings[k]).toMatch(/^This server holds up to \{\{count\}\} computers?\./);
  });
  it('plans given out of order: the catalogue order, each column with its own values', async () => {
    fx.plans = [plan('fam-b', 'Beta', 2, { ai_tier: 'pro' }, { cpu_cores: 8, ai_multiplier: 10 }), plan('fam-a', 'Alpha', 1, {}, { cpu_cores: 2, snapshots_per_computer: undefined })];
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Alpha' });
    const names = [...document.querySelectorAll('[data-section="plans"] [data-kit="plan-card"]:not([data-wide])')].map((c) => c.getAttribute('aria-label'));
    expect(names).toEqual([strings['plans.free'], 'Alpha', 'Beta']);
    expect(value('Alpha', strings['buy.resCpu'])).toHaveTextContent('2');
    expect(value('Beta', strings['buy.resCpu'])).toHaveTextContent('8');
    expect(value('Beta', strings['plans.aiLabel'])).toHaveTextContent(/^Pro 10×$/);
    // Ten steps: the scale ends at Beta's ×10, Alpha's ×4 lights four.
    const lit = (name: string) => [...within(value(name, strings['plans.aiLabel'])).getByRole('img').children].filter((c) => /scaleLit/.test(c.className)).length;
    expect([lit('Alpha'), lit('Beta')]).toEqual([4, 10]);
  });
  it('one column per plan with its price and one Get button, no description and no type label', async () => {
    await renderPage(page, {});
    const beta = await screen.findByRole('group', { name: 'Beta' });
    expect(within(beta).getByText('$10.02')).toBeInTheDocument();
    // The price is said once: the line under it says only where it is paid from, with no second amount.
    expect(within(beta).getByText(strings['plans.fromWallet'])).toBeInTheDocument();
    expect(beta.textContent?.match(/\$10\.02/g)).toHaveLength(1);
    expect(screen.queryByText('Beta is for trying things out.')).toBeNull();
    expect(within(beta).queryByText('Shared server')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Choose Beta' })).toHaveLength(1);
  });
  it('the Get button opens the plan\'s checkout', async () => {
    const { router } = await renderPage(page, {});
    await screen.findByRole('group', { name: 'Beta' });
    await userEvent.click(within(column('Beta')).getByRole('button', { name: 'Choose Beta' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'buy', plan: 'fam-b-v1' }));
  });
});

describe('highlight', () => {
  // The framed plan column (the Bare metal band, the grid's wide card, always wears the frame too).
  const framedCards = () => [...document.querySelectorAll('[data-kit="plan-card"][data-tone="accent"]:not([data-wide])')].map((e) => e.getAttribute('aria-label'));
  it('no hand-off: the biggest plan on sale alone is framed, none is "Suggested for you", and only its Choose is primary', async () => {
    await renderPage(page, {});
    await screen.findByRole('group', { name: 'Beta' });
    expect(framedCards()).toEqual(['Beta']);
    expect(screen.queryByText(strings.suggested)).toBeNull();
    // One accent per screen (CONTRIBUTING.md, "Design rules"): the framed plan's action is the one primary.
    expect(within(column('Beta')).getByRole('button', { name: 'Choose Beta' })).toHaveAttribute('data-variant', 'primary');
    expect(within(column('Alpha')).getByRole('button', { name: 'Choose Alpha' })).toHaveAttribute('data-variant', 'secondary');
  });
  it('the hand-off plan alone is framed, and it says Suggested for you', async () => {
    await renderPage(page, { path: '/billing?plan=fam-a' });
    await screen.findByRole('group', { name: 'Alpha' });
    expect(framedCards()).toEqual(['Alpha']);
    expect(within(column('Alpha')).getByText(strings.suggested)).toBeInTheDocument();
    expect(within(column('Beta')).queryByText(strings.suggested)).toBeNull();
  });
  it('the hand-off plan that also holds the person\'s servers draws ONE mark naming both; the other cards keep theirs', async () => {
    // Two marks on one card wrap under the name and push its price below its neighbours': one pill says both.
    fx.subs = [
      { id: 's1', state: 'active', plan_id: 'fam-a-v1', server_name: 'n1' },
      { id: 's2', state: 'active', plan_id: 'fam-a-v1', server_name: 'n2' },
      { id: 's3', state: 'active', plan_id: 'fam-b-v1', server_name: 'n3' },
    ];
    await renderPage(page, { path: '/billing?plan=fam-a' });
    await screen.findByRole('group', { name: 'Alpha' });
    const marks = (n: string) => column(n).querySelector<HTMLElement>('[data-plan-part="marks"]')!;
    const alpha = marks('Alpha');
    expect(alpha.children).toHaveLength(1);
    expect(alpha).toHaveTextContent(strings['plans.suggestedYours_other'].replace('{{count}}', '2'));
    expect(alpha).toHaveTextContent(/Suggested/);
    expect(within(alpha).queryByText(strings.suggested)).toBeNull();
    // Beta is not the hand-off: its count pill alone, as before.
    const beta = marks('Beta');
    expect(beta.children).toHaveLength(1);
    expect(beta).toHaveTextContent(strings['plans.yours_one'].replace('{{count}}', '1'));
  });
});
