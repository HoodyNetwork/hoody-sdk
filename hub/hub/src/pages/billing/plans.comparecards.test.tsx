// Compare plans in less room than every column needs, with three plans on sale: the three plans and Bare metal are
// four values in each card (Free is not compared). Every card keeps its last field, Bare metal.
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';
import type * as Kit from '@kit';

const fx = vi.hoisted(() => ({ plans: [] as unknown[] }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePlans: () => ({ data: fx.plans, isPending: false, isError: false, error: null, refetch: () => {} }),
}));
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  return { ...kit, useContainerNarrow: () => true };
});

const res = { cpu_cores: 2, ram_gb: 4, disk_limit_gb: 60, disk_io_read_mib: 400, disk_io_write_mib: 400, network_limit_mbps: 500, max_computers: 7, snapshots_per_computer: 9, ai_multiplier: 4 };
const plan = (id: string, title: string, sort: number, cents: number) => ({
  id: `${id}-v1`, family_id: id, price_cents_per_month: cents, hold_days: 7, ai_tier: 'plus', sort_order: sort, max_proxy_aliases: 6, max_bot_urls: 3,
  text: { title, type_label: 'Shared server' },
  resources: res,
});

beforeEach(() => {
  fx.plans = [plan('fam-a', 'Alpha', 1, 1300), plan('fam-b', 'Beta', 2, 3750), plan('fam-c', 'Gamma', 3, 6100)];
});

describe('Compare plans as cards, three plans on sale', () => {
  it('every card names all four: each plan and Bare metal, in the columns order, and no Free', async () => {
    await renderPage(page, { path: '/billing' });
    const region = await screen.findByRole('region', { name: strings['plans.cmp.title'] }, { timeout: 15_000 });
    const tb = await within(region).findByRole('table', {}, { timeout: 15_000 });
    const cards = [...tb.querySelectorAll('tbody tr')].map((tr) => tr.textContent ?? '');
    const names = ['Alpha', 'Beta', 'Gamma', strings['plans.bareMetal']];
    for (const label of [strings['col.price'], strings['buy.resComputers'], strings['plans.hardware'], strings['plans.cmp.vms']]) {
      const card = cards.find((c) => c.startsWith(label)) ?? '';
      let from = label.length;
      for (const name of names) {
        const at = card.indexOf(name, from);
        expect(at, `${label}: ${name} in "${card}"`).toBeGreaterThanOrEqual(0);
        from = at + name.length;
      }
    }
    const price = cards.find((c) => c.startsWith(strings['col.price'])) ?? '';
    expect(price).toContain('$61 a month');
    expect(cards.find((c) => c.startsWith(strings['plans.hardware']))).toContain(strings['plans.cmp.dedicated']);
    expect(cards.find((c) => c.startsWith(strings['plans.cmp.vms']))).toContain(strings['plans.cmp.vmsBare']);
  });
});
