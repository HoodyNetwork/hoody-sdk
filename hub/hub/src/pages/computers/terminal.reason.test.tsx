// The head's Open terminal, on a computer with no terminal address, is off and says why (as the row menu does).
import { describe, expect, it, vi } from 'vitest';
import type * as Urls from './urls';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

vi.mock('./urls', async (importOriginal) => ({ ...(await importOriginal<typeof Urls>()), programUrl: () => '' }));

describe('computers: Open terminal with no terminal address', () => {
  it('is off in the head and says why', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const b = await screen.findByRole('button', { name: new RegExp(`^${strings['menu.openTerminal']}`) }, { timeout: 30000 });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(strings['menu.noTerminal']);
  }, 60000);
});
