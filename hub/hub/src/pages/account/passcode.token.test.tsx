// Vitest: a token session has no passcode: no section, and a link to a lock sheet
// opens nothing. The page's capture() answers a token page here; the engine below it is left as it is.
import { renderPage, screen } from '@app/testing';
import type * as Core from '@core';
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

describe('passcode in a token session', () => {
  it('shows no passcode section and opens no lock sheet from a link', async () => {
    as.token = true;
    await renderPage(page, { path: '/account?sheet=lock-set' });
    await screen.findByRole('heading', { name: strings['2fa.title'] }, { timeout: 8000 });
    expect(screen.queryByRole('heading', { name: strings['lock.title'] })).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('an account session shows it (the same page, capture answering the account page)', async () => {
    as.token = false;
    await renderPage(page);
    expect(await screen.findByRole('heading', { name: strings['lock.title'] }, { timeout: 8000 })).toBeInTheDocument();
  });
});
