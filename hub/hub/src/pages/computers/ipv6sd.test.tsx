// IPv6 is not part of Hoody, so the server panel never reads or words it, even when the API row says
// ipv6_enabled. And the Home widget's programs link keeps the kit's row gap between its words and the
// "N need a look" pill (they touched before).
import { chooseComputer, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen } from '@app/testing';
import { factsOf } from './parts/ServerDetail.logic';
import sdStrings from './parts/ServerDetail.strings.en.json';
import page from './page';

describe('server panel: no IPv6', () => {
  it('a row with ipv6_enabled gives no IPv6 fact, and the panel has no IPv6 words', () => {
    const f = factsOf({
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      server: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'node-7', specs: { additional: { ipv4_count: 2, ipv6_enabled: true } } },
    });
    expect(f).not.toHaveProperty('ipv6');
    expect(f).toMatchObject({ ipv4Count: 2 });
    expect(Object.values(sdStrings).filter((v) => /ipv6/i.test(v))).toEqual([]);
  });
});

const host = { ...page, load: () => import('./widget') };
const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;

describe('computers widget: programs link spacing', () => {
  it('the need-a-look pill sits in the gapped row with the link words, not glued to them', async () => {
    await renderPage(host);
    await act(async () => {
      chooseComputer(named('atlas'));
    });
    const words = await screen.findByText(/^Programs: \d+ running$/, undefined, { timeout: 8000 });
    const pill = await screen.findByText((_, el) => !!el && el.children.length === 0 && /^\d+ needs? a look$/.test(el.textContent ?? ''));
    const row = words.closest('span[class*="footLink"]');
    expect(row).not.toBeNull();
    expect(row!.contains(pill)).toBe(true);
  }, 30000);
});
