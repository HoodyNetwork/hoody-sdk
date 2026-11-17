// Vitest: the Needs-you actions are the kit secondary (Home's one primary is the Ask submit),
// and a hidden page drops only its own line's action.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const hidden = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    // One Bot waiting (the shell's count; the test shell has none), so the strip has two lines.
    useShellData: () => ({ ...(kit.useShellData as () => object)(), botsWaiting: 1 }),
    usePageLink: (id: string) => (hidden.has(id) ? null : { kind: 'hub', href: `/${id}` }),
    usePageVisible: (id: string) => !hidden.has(id),
  };
});

afterEach(() => hidden.clear());

async function strip() {
  const title = await screen.findByRole('heading', { name: strings['needs.title'] }, { timeout: 8000 });
  return within(title.closest('section')!);
}

describe('needs-you actions', () => {
  it('both lines show a secondary action', async () => {
    await renderPage(page, { state: 'attention' });
    const s = await strip();
    expect(await s.findByRole('link', { name: strings['needs.computers.action'] })).toHaveAttribute('data-variant', 'secondary');
    expect(s.getByRole('link', { name: strings['needs.bots.action'] })).toHaveAttribute('data-variant', 'secondary');
  });

  it('with Computers hidden, the Bot line keeps its action and the computer line has none', async () => {
    hidden.add('computers');
    await renderPage(page, { state: 'attention' });
    const s = await strip();
    expect(await s.findByRole('link', { name: strings['needs.bots.action'] })).toHaveAttribute('data-variant', 'secondary');
    expect(s.queryByRole('link', { name: strings['needs.computers.action'] })).toBeNull();
  });
});
