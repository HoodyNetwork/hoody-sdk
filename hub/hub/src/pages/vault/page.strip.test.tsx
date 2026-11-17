// Vitest: the Vault header as every other page's, with no joined strip
// below it: "Use with your agent" sits in the header's actions on its own, More is the header's own
// ⋯ (PageHeader `menu`), apart from it, and New entry stays the primary. An empty vault has no More.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Vault header', () => {
  it('puts More in the header ⋯ slot, apart from "Use with your agent": no joined strip', async () => {
    await renderPage(page, { path: '/vault' });
    const more = await screen.findByRole('button', { name: strings['action.more'] }, { timeout: 10000 });
    const header = more.closest('header') as HTMLElement;
    expect(header, 'More is in the page header').not.toBeNull();
    // The header's own ⋯ slot, as every page with a page menu.
    expect(more.closest('[data-head-menu]'), 'More sits in the header ⋯ slot').not.toBeNull();
    // No joined strip in the header.
    expect(header.querySelector('[data-button-strip]')).toBeNull();
    const agent = [...header.querySelectorAll('button')].find((b) => /agent/i.test(b.textContent ?? b.getAttribute('aria-label') ?? ''));
    expect(agent, 'the kit\'s "Use with your agent" is in the header').toBeDefined();
    expect(agent?.closest('[data-head-menu]')).toBeNull();
    expect(agent?.parentElement).not.toBe(more.parentElement);
    // New entry is still the header's primary.
    expect(screen.getByRole('button', { name: strings['action.new'] }).closest('header')).toBe(header);
  });
});
