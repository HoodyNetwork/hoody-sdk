// Vitest: Get notified lists every kind of notice as a setting row (event, then where it goes) in one group per
// kind, so "by email" is a value of the row, never a stray tag after a sentence.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { GROUPS } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('Get notified: what you get notified about', () => {
  it('each group is a named group of rows, and each row says where that notice goes', async () => {
    await renderPage(page, { path: '/notifications/learn' });
    await screen.findByRole('heading', { name: strings['h.kinds.h'] });
    for (const g of GROUPS) {
      const group = await screen.findByRole('group', { name: strings[`h.group.${g.id}`] });
      for (const item of g.items) {
        const label = within(group).getByText(strings[`h.item.${item}`]);
        const row = label.closest('[data-kind-row]');
        expect(row, item).not.toBeNull();
        const where = g.mail.includes(item) ? strings['h.goes.hubEmail'] : strings['h.goes.hub'];
        expect(within(row as HTMLElement).getByText(where)).toBeInTheDocument();
      }
    }
  });
});
