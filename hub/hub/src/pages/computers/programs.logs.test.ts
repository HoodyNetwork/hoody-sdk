// The Programs tab's Logs cell follows the shell's page link:
// a Hub link is a router Link to that program's output (logsLinkFor); a hidden Logs page drops the
// control (there is no classic page to fall back to).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import page from './page';
import strings from './strings.en.json';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    usePageLink: (id: string) => (id === 'logs' && link.current !== undefined ? link.current : kit.usePageLink(id)),
  };
});

const webRow = async () => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=programs' });
  const table = await screen.findByRole('table', { name: strings['prog.title'] });
  return within(table).findByRole('row', { name: /^web/ });
};
const logsName = new RegExp(strings['prog.logs']);

describe('computers: Programs tab Logs cell', () => {
  afterEach(() => {
    link.current = undefined;
    vi.restoreAllMocks();
  });

  it("a Hub link is a router link to the program's output (logsLinkFor)", async () => {
    link.current = { kind: 'hub', href: '/logs' };
    const row = await webRow();
    expect(within(row).getByRole('link', { name: logsName })).toHaveAttribute('href', expect.stringMatching(/\/logs\?computer=atlas\.00a1&src=programs&program=1$/));
  });

  it('a hidden Logs page drops the Logs cell', async () => {
    link.current = null;
    const row = await webRow();
    expect(within(row).queryByRole('link', { name: logsName })).toBeNull();
    expect(within(row).queryByRole('button', { name: logsName })).toBeNull();
  });
});
