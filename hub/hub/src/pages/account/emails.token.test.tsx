// Vitest: the Support replies switch in a shared-access (token) session. The setting is the account's own and the
// API takes its change from the account's own sign-in only, so there the switch is off, its help says why, and a press
// sends nothing; an account session can change it. The page's capture() answers a token page here.
import { renderPage, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const as = vi.hoisted(() => ({ token: true }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, capture: (...a: Parameters<typeof core.capture>) => {
    const c = core.capture(...a);
    return as.token ? { ...c, page: { ...(c.page ?? {}), kind: 'token' } } : c;
  } };
});

const support = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector('[data-section="emails"]')).not.toBeNull(), { timeout: 8000 });
  return within(document.querySelector<HTMLElement>('[data-section="emails"]')!).findByRole('switch', { name: strings['mail.support'] }, { timeout: 8000 });
};

describe('Support replies in a token session', () => {
  it('is off, says why, and a press changes nothing', async () => {
    as.token = true;
    const user = userEvent.setup();
    await renderPage(page, {});
    const sw = await support();
    expect(sw).toBeChecked();
    expect(sw).toBeDisabled();
    expect(sw).toHaveAccessibleDescription(strings['mail.supportHelpToken']);
    await user.click(sw);
    expect(sw).toBeChecked();
    expect(within(document.querySelector<HTMLElement>('[data-section="emails"]')!).queryByRole('status')).toBeNull();
  });

  it('an account session can press it', async () => {
    as.token = false;
    await renderPage(page, {});
    const sw = await support();
    await waitFor(() => expect(sw).toBeEnabled(), { timeout: 8000 });
    expect(sw).toHaveAccessibleDescription(strings['mail.supportHelp']);
  });
});
