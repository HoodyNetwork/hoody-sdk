// Vitest: Referrals has its own entry in the sidebar, so its header starts at the title. A trail back to Account is for
// a screen reached only through another page; here it would be a second way to say where the sidebar already shows the
// person is. Checked for a member and for an account that cannot join (the two header wordings).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

describe('Referrals header', () => {
  for (const state of [undefined, 'notEligible'] as const) {
    it(`${state ?? 'member'}: the title, with no trail above it and no link back to Account`, async () => {
      await renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
      // The subtitle shows once the page itself, not its loading frame, draws the header.
      const header = (await screen.findByText(strings[state ? 'subtitle.plain' : 'subtitle'])).closest('header') as HTMLElement;
      expect(within(header).getByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument();
      expect(screen.queryByLabelText(kitStrings.breadcrumbs)).toBeNull();
      expect(header.querySelector('a[href*="account"]')).toBeNull();
    });
  }
});
