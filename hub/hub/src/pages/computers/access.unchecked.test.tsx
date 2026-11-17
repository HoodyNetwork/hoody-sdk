// The API can say it couldn't check a computer's proxy rules: proxy_permissions_scope 'unknown' and
// has_proxy_permissions null (the API's computer reads). The page shows "Couldn't check", never Open (as if
// 'none' or false) and never Locked, in the list's padlock, its popover and the Overview's Access fact.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import { access } from './logic';
import page from './page';
import strings from './strings.en.json';

describe("computers: proxy access the API couldn't check", () => {
  // Precedence: a known scope wins (the API sends 'unknown' with null, never a known scope with null); then 'unknown'
  // or null is unchecked; then the boolean alone; nothing at all is unknown.
  const scopes = ['computer', 'project', 'both', 'none', 'unknown', undefined] as const;
  const flags = [true, false, null, undefined] as const;
  const expected = (sc: (typeof scopes)[number], has: (typeof flags)[number]) =>
    sc === 'computer' || sc === 'project' || sc === 'both' ? { state: 'set', scope: sc }
    : sc === 'none' ? { state: 'open' }
    : sc === 'unknown' || has === null ? { state: 'unchecked' }
    : has === true ? { state: 'set', scope: 'unknown' }
    : has === false ? { state: 'open' }
    : { state: 'unknown' };
  it.each(scopes.flatMap((sc) => flags.map((has) => [sc, has] as const)))(
    'scope %s with has_proxy_permissions %s: a known scope wins, then unknown or null is unchecked, then the boolean',
    (sc, has) => {
      const c = { ...(sc !== undefined && { proxy_permissions_scope: sc }), ...(has !== undefined && { has_proxy_permissions: has }) };
      expect(access(c)).toEqual(expected(sc, has));
    },
  );
  it("the API's own couldn't-check answer ('unknown' with null) is unchecked, never open or locked", () => {
    expect(access({ proxy_permissions_scope: 'unknown', has_proxy_permissions: null })).toEqual({ state: 'unchecked' });
    expect(access({ proxy_permissions_scope: 'unknown', has_proxy_permissions: false })).toEqual({ state: 'unchecked' });
    expect(access({ proxy_permissions_scope: 'unknown', has_proxy_permissions: true })).toEqual({ state: 'unchecked' });
    expect(access({ has_proxy_permissions: null })).toEqual({ state: 'unchecked' });
  });

  it("the list's padlock and its popover say Couldn't check", async () => {
    await renderPage(page, { path: '/computers', state: 'scopeUnknown' });
    const lock = await screen.findByRole('button', { name: interpolate(strings['access.aria'], { name: 'atlas', state: strings['access.unchecked'] }) }, { timeout: 8000 });
    await userEvent.click(lock);
    const pop = await screen.findByRole('dialog', { name: strings['access.title'] });
    expect(pop).toHaveTextContent(strings['access.unchecked']);
    expect(pop).toHaveTextContent(interpolate(strings['access.unchecked.body'], { name: 'atlas' }));
    // The next step is to try again, never to reload the whole page.
    expect(strings['access.unchecked.body']).not.toMatch(/reload/i);
    expect(strings['access.unchecked.body']).toMatch(/Try again in a moment\.$/);
    expect(pop).not.toHaveTextContent(strings['access.open']);
    // The Access cell's own word, beside the padlock.
    const row = lock.closest('[data-row-id]') as HTMLElement;
    expect(within(row).getByText(strings['access.short.unchecked'])).toBeInTheDocument();
  }, 40000);

  it("the Overview's Access fact says Couldn't check, not Shared by link", async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1', state: 'scopeUnknown' });
    // The Access section's one line (who can open its programs); changing it is on the Permissions tab.
    const term = await screen.findByText(strings['ov.who'], { selector: 'dt' }, { timeout: 8000 });
    const fact = term.nextElementSibling as HTMLElement;
    expect(within(fact).getByText(strings['access.word.unchecked'])).toBeInTheDocument();
    expect(fact).not.toHaveTextContent(strings['access.word.open']);
  }, 40000);
});
