// Vitest: the guide draws no link into a page this load does not serve.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const hidden = vi.hoisted(() => new Set<string>());
// usePageLink is mocked where it is defined: the kit's PageLinkTo imports it from there, not from '@kit'.
vi.mock('@shell/pageLinks', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePageLink: (id: string) => (hidden.has(id) ? null : { kind: 'hub', href: `/${id}` }),
}));
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePageVisible: (id: string) => !hidden.has(id),
}));

afterEach(() => hidden.clear());

// The view is drawn once one of its own section headings shows. The h1 is no sign of it: the router draws the page's
// title as the h1 over the loading lines while the view loads, and the page boundary has no section heading.
const drawn = () => screen.findByRole('heading', { level: 2, name: strings['tools.title'] });

const hubLinks = (...paths: string[]) =>
  [...document.querySelectorAll('a')].filter((a) => paths.some((p) => (a.getAttribute('href') ?? '').replace(/^#/, '').startsWith(p)));

describe('guide with hidden pages', () => {
  it('draws no link to keys, computers or bots when none is served', async () => {
    await renderPage(page);
    await drawn();
    expect(hubLinks('/keys', '/computers', '/bots').length).toBeGreaterThan(0);
    hidden.add('keys').add('computers').add('bots');
    document.body.innerHTML = '';
    await renderPage(page);
    await drawn();
    expect(hubLinks('/keys', '/computers', '/bots')).toHaveLength(0);
  });
});
