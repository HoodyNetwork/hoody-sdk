// Vitest: the setup panel and the Start something tiles say what to do next. A disabled Redeem says why, a blocked
// setup names where to write, a refused code says what to try, and the Keys tile starts with its verb like the others.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }) };
});

describe('home: the invite code', () => {
  it('Redeem with an empty field cannot act and says why; typed, it can', async () => {
    await renderPage(page, { state: 'invite', realm: 'all' });
    const box = await screen.findByLabelText(strings['setup.invite.field']);
    const redeem = () => screen.getByRole('button', { name: strings['setup.invite.redeem'] });
    expect(redeem().getAttribute('aria-disabled')).toBe('true');
    expect(redeem()).toHaveAccessibleDescription(strings['setup.invite.typeFirst']);
    await userEvent.type(box, 'abc123');
    expect(redeem().getAttribute('aria-disabled')).not.toBe('true');
    expect(redeem()).toBeEnabled();
  });
});

describe('home: words with a next step', () => {
  it('a blocked setup names the Support page, and a refused code says what to try', () => {
    expect(strings['setup.blocked.support']).toMatch(/Write to us from the Support page\.$/);
    expect(strings['setup.blocked.code']).toMatch(/Check the code, or ask whoever gave it to you for another\.$/);
    expect(strings['setup.invite.typeFirst']).toBe('Type the code first.');
  });

  it('the Keys tile starts with its verb like the other tiles, and the AI page is named as the menu names it', () => {
    expect(strings['actions.keys']).toBe('Open Keys and tokens');
    expect(strings['actions.ai.page']).toBe(strings['needs.page.ai']);
  });
});
