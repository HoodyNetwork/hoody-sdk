// Vitest: the Details panel's Status shows only what the header
// does not: the facts are a kit Facts list (Last active, Identifier), State and Computer are not repeated there (the header
// shows both), and the link keeps its own button row (a Facts list holds no control). The panel itself, its Close and the
// keyboard's way in and out are details.toggle.test.tsx's.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = () => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&details=1` });
const panel = () => screen.findByRole('complementary', { name: strings['rail.details'] });

describe('the Details panel status', () => {
  it('is a Facts list of the two things the header lacks: when it was last active, and its identifier', async () => {
    await open();
    const side = await panel();
    const dl = side.querySelector<HTMLElement>(`dl[aria-label="${strings['rail.status']}"]`);
    expect(dl, 'a Facts list named Status').not.toBeNull();
    expect(Array.from((dl as HTMLElement).querySelectorAll('dt')).map((x) => x.textContent)).toEqual([strings['rail.lastActive'], strings['rail.id']]);
  }, 30000);

  it('does not repeat the state or the computer: the header shows them, the panel does not', async () => {
    await renderPage(page, { state: 'working', path: `/bots?sel=${encodeURIComponent(CHIEF)}&details=1` });
    const side = await panel();
    const header = (await screen.findByRole('heading', { level: 2, name: 'Chief' })).closest('header') as HTMLElement;
    // The header names the computer and says what the Bot is doing...
    expect(within(header).getByText(/atlas/)).toBeInTheDocument();
    expect(within(header).getByText(strings['status.working'])).toBeInTheDocument();
    // ...so the panel does not say either again.
    expect(within(side).queryByText('State')).toBeNull();
    expect(within(side).queryByText('Computer')).toBeNull();
    expect(within(side).queryByText(strings['status.working'])).toBeNull();
    expect(within(side).queryByText(/atlas/)).toBeNull();
  }, 30000);

  it('keeps the link row outside the Facts list, as a button named for what it opens', async () => {
    const { router } = await open();
    const side = await panel();
    const dl = side.querySelector<HTMLElement>(`dl[aria-label="${strings['rail.status']}"]`) as HTMLElement;
    const link = await within(side).findByRole('button', { name: strings['rail.linkOpen'].replace('{{status}}', strings['link.status.active']) });
    expect(dl.contains(link)).toBe(false);
    expect(within(side).getByText(strings['rail.link'])).toBeInTheDocument();
    await userEvent.click(link);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).tab).toBe('link'));
  }, 30000);

  it('still has its three headed parts: Status, Tasks and Settings', async () => {
    await open();
    const side = await panel();
    for (const k of ['rail.status', 'rail.tasks', 'rail.settings'] as const) expect(await within(side).findByRole('heading', { name: strings[k] })).toBeInTheDocument();
  }, 30000);
});
