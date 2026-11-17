// Vitest: what Needs you announces. Its one polite line joins the items as whole sentences: each ends with exactly
// one period, whether its own words carry one (a held change) or not (a count).
import { describe, expect, it, vi } from 'vitest';
import { render } from '@app/testing';
import { NeedsYou } from './parts/NeedsYou';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }) };
});

describe('needs you: the announcement', () => {
  it('joins the items as sentences with one period each, never two', () => {
    const realm = { id: 'all', name: '', all: true };
    const { container } = render(
      <NeedsYou
        realm={realm}
        items={[
          { key: 'bots', count: 2, scope: 'realm', tone: 'warn' },
          { key: 'held:c7', count: 1, scope: 'account', tone: 'warn', held: { id: 'c7', kind: 'page', page: 'computers', href: '/computers' } },
          { key: 'changes', count: 1, scope: 'account', tone: 'warn' },
        ]}
      />,
    );
    const said = container.querySelector('[role="status"]')?.textContent ?? '';
    const held = strings['needs.held.pageAny'].replace('{{page}}', strings['needs.page.computers']);
    expect(said).toBe(`2 Bots are waiting for you. ${held} 1 change is being sent.`);
    expect(said).not.toContain('..');
  });
});
