// Vitest: the change sheets and sections need a known, not-suspended account. The core's identity
// (the boot GET /users/auth/me, flipped in place by a 403 ACCOUNT_BANNED) counts as well as the page's own read: a
// failed page read never makes a suspended account look ordinary, and a stale one never hides the core's flip.
import { identity, setIdentity } from '@core/ctx';
import { act, renderPage, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const S = strings;
const flipBanned = (): void => act(() => setIdentity({ ...(identity() as NonNullable<ReturnType<typeof identity>>), banned: true }));
const sessions = () => screen.findByRole('heading', { name: S['s.title'] }, { timeout: 8000 });

describe('account eligibility from the core identity', () => {
  it('page read failed, core says suspended: no sheet from a link, sessions only', async () => {
    await renderPage(page, { state: 'identity-error', path: '/account?sheet=password' });
    await sessions();
    flipBanned();
    expect(await screen.findByText(S['suspended.title'])).toBeInTheDocument();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: S['lock.title'] })).toBeNull();
    expect(screen.queryByRole('heading', { name: S['pw.title'] })).toBeNull();
  });

  it('page read failed, core says suspended: no passcode sheet from a link', async () => {
    await renderPage(page, { state: 'identity-error', path: '/account?sheet=lock-set' });
    await sessions();
    flipBanned();
    expect(await screen.findByText(S['suspended.title'])).toBeInTheDocument();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('page read says not suspended, core flipped to suspended: sessions only', async () => {
    await renderPage(page, { path: '/account' });
    expect(await screen.findByRole('heading', { name: S['pw.title'] }, { timeout: 8000 })).toBeInTheDocument();
    flipBanned();
    expect(await screen.findByText(S['suspended.title'])).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: S['pw.title'] })).toBeNull();
  });

  it('page read failed and the core holds no identity: nothing is known, so no sheet opens', async () => {
    const r = await renderPage(page, { state: 'identity-error', path: '/account' });
    await sessions();
    act(() => setIdentity(null));
    await act(async () => { await r.router.navigate({ to: page.path as never, search: { sheet: 'password' } as never }); });
    expect(r.router.state.location.search).toMatchObject({ sheet: 'password' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('page read failed, core says not suspended: the sheet still opens (nothing lost for an ordinary account)', async () => {
    await renderPage(page, { state: 'identity-error', path: '/account?sheet=password' });
    expect(await screen.findByRole('dialog', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(S['suspended.title'])).toBeNull();
  });
});
