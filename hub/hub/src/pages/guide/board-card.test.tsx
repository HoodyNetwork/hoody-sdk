// Vitest: Guide rows: the Board card and recipe, the way back to the
// Welcome, the door picker's label, and the facts rail while the facts load.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// hidden: no destination at all; classic: served only by the classic Hub (the production fallback for a page not
// served in this load, e.g. Home -> /auth/home).
const hidden = vi.hoisted(() => new Set<string>());
const classic = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePageLink: (id: string) => (hidden.has(id) ? null : classic.has(id) ? { kind: 'classic', href: `/auth/${id}` } : { kind: 'hub', href: `/${id}` }),
  usePageVisible: (id: string) => !hidden.has(id) && !classic.has(id),
}));

afterEach(() => {
  hidden.clear();
  classic.clear();
});

const region = (name: string) => screen.findByRole('region', { name });
const href = (a: HTMLElement) => (a.getAttribute('href') ?? '').replace(/^#/, '');

describe('guide Board card and recipe', () => {
  it('Tools has a Board card that opens the Board', async () => {
    await renderPage(page, { path: '/guide#tools' });
    const tools = await region(strings['tools.title']);
    const body = within(tools).getByText(strings['tool.board']);
    const card = body.parentElement as HTMLElement;
    expect(card).toHaveTextContent(strings['tool.board.name']);
    expect(href(within(card).getByRole('link', { name: strings['action.open'] }))).toBe('/board');
  });

  it('the first recipe puts Agent and Browser side by side on a Board, and its link opens the Board', async () => {
    await renderPage(page, { path: '/guide#try' });
    const tryIt = await region(strings['try.title']);
    const body = within(tryIt).getByText(strings['recipe.1.board']);
    expect(href(within(body.parentElement as HTMLElement).getByRole('link', { name: strings['try.action'] }))).toBe('/board');
  });

  it('without a served Board: no Board card, and the first recipe keeps its browser-only text', async () => {
    hidden.add('board');
    await renderPage(page, { path: '/guide#try' });
    const tryIt = await region(strings['try.title']);
    expect(within(tryIt).getByText(strings['recipe.1.body'])).toBeInTheDocument();
    expect(within(tryIt).queryByText(strings['recipe.1.board'])).toBeNull();
    expect(within(await region(strings['tools.title'])).queryByText(strings['tool.board'])).toBeNull();
  });
});

describe('guide way back to the Welcome', () => {
  it('links "Show the welcome again" to the Home welcome', async () => {
    await renderPage(page);
    const ask = await region(strings['ask.title']);
    expect(href(within(ask).getByRole('link', { name: strings['welcome.again'] }))).toBe('/home?intro=1');
  });

  it('draws no welcome link when Home is not served', async () => {
    hidden.add('home');
    await renderPage(page);
    const ask = await region(strings['ask.title']);
    expect(within(ask).queryByRole('link', { name: strings['welcome.again'] })).toBeNull();
  });

  it('draws no welcome action when only the classic Home serves it (it would open the plain Home, not the Welcome)', async () => {
    classic.add('home');
    await renderPage(page);
    const ask = await region(strings['ask.title']);
    expect(within(ask).queryByText(strings['welcome.again'])).toBeNull();
  });
});

describe('guide door picker', () => {
  it('names the picker once, as its label, and lists the doors by name only', async () => {
    await renderPage(page, { path: '/guide?door=cli#connect' });
    const connect = await region(strings['connect.title']);
    const picker = within(connect).getByRole('button', { name: new RegExp(strings['door.select']) });
    expect(picker).toHaveTextContent(strings['door.cli']);
    expect(picker.textContent).not.toContain(`${strings['door.select']}:`);
    await userEvent.click(picker);
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toContain(strings['door.sdk']);
    expect(options.some((o) => (o.textContent ?? '').includes(`${strings['door.select']}:`))).toBe(false);
  });
});

describe('guide facts rail while loading', () => {
  it('shows a placeholder while the facts load, never an empty rail', async () => {
    await renderPage(page, { state: 'loading' });
    const rail = await screen.findByRole('complementary', { name: strings['rail.title'] });
    expect(rail.querySelector('[class*="skeleton" i], [aria-busy="true"], [role="status"]')).not.toBeNull();
  });
});
