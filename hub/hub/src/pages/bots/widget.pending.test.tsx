// Vitest: the Home widget waits only on the Bots read. A computers read that is still running, or one that
// never ends, does not hide Bot rows that already work: they show, and a row whose computer has no name yet is named by its id.
import { render, screen, cleanup } from '@app/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotRow } from './data';
import type * as Data from './data';
import type * as Kit from '@kit';

const row = (o: Partial<BotRow>): BotRow => ({
  key: 'c-atlas~global~chief', id: 'chief', uid: 'u-1', name: 'Chief', role: '', realm: 'global', realmName: 'Global', computerId: 'c-atlas',
  status: 'idle', queued: 0, model: 'p/a', modelLabel: 'A', lastActivityAt: null, link: 'none', chatApps: [], chatsWaiting: 0, privacyOn: false, locked: false, ...o,
});
const reads = vi.hoisted(() => ({
  bots: { isPending: false, isError: false, data: [] as unknown[], refetch: () => undefined } as Record<string, unknown>,
  computers: { isPending: true, isError: false, data: undefined as unknown, refetch: () => undefined } as Record<string, unknown>,
}));
vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), useBots: () => reads.bots, useComputers: () => reads.computers }));
vi.mock('@kit', async (orig) => ({ ...(await orig<typeof Kit>()), useGo: () => () => undefined }));
const { default: BotsWidget } = await import('./widget');

afterEach(() => cleanup());

describe('the Bots widget while the computers read has not answered', () => {
  it('shows the Bot rows, not the skeleton', () => {
    reads.bots = { isPending: false, isError: false, data: [row({ status: 'waiting' })], refetch: () => undefined };
    reads.computers = { isPending: true, isError: false, data: undefined, refetch: () => undefined };
    render(<BotsWidget />);
    expect(screen.getByText('Chief')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('names a Bot on a computer it cannot name yet by the computer id\'s last four', () => {
    reads.bots = { isPending: false, isError: false, data: [row({}), row({ key: 'c-cinder~global~chief', computerId: 'c-cinder', uid: 'u-2' })], refetch: () => undefined };
    reads.computers = { isPending: true, isError: false, data: undefined, refetch: () => undefined };
    render(<BotsWidget />);
    expect(screen.getByText('Chief · tlas')).toBeInTheDocument();
    expect(screen.getByText('Chief · nder')).toBeInTheDocument();
  });

  it('still shows the skeleton while the Bots read itself runs', () => {
    reads.bots = { isPending: true, isError: false, data: undefined, refetch: () => undefined };
    reads.computers = { isPending: false, isError: false, data: [], refetch: () => undefined };
    const { container } = render(<BotsWidget />);
    expect(screen.queryByText('Chief')).toBeNull();
    expect(container.textContent).not.toContain('No Bots yet');
  });
});
