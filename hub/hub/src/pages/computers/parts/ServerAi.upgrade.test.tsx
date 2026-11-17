// A server card's AI foot offers "Get more AI" only near or at a lane's limit, and
// only where the card does not already carry its room upgrade (one per card). Who may see it is the kit piece's gate.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpolate } from '@kit';
import kitStrings from '@kit/strings.en.json';
import { links as billingLinks } from '../../billing/links';
import strings from '../strings.en.json';
import type { ServersAi } from '../types';
import { ServerAiFoot } from './ServerAi';

const gate = vi.hoisted(() => ({ purchase: true }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  return { ...core, useCan: (cap: string) => cap === 'financial.subscriptions.purchase' && gate.purchase, isFramed: () => false };
});
afterEach(() => {
  gate.purchase = true;
});

const read = (pct: number | null): { data: ServersAi; error: null } => ({
  data: { truncated: false, byId: { s1: { ok: true, lanes: [{ lane: 'chat', off: false, pct, resets: null }] } } },
  error: null,
});
const more = () => screen.queryByRole('link', { name: new RegExp(strings['srv.upgradeAi']) });

describe('ServerAiFoot: Get more AI', () => {
  it('a lane at 80 %: near, to the AI plans', () => {
    render(<ServerAiFoot id="s1" read={read(80)} />);
    expect(more()).toHaveAttribute('data-upgrade', 'near');
    expect(more()).toHaveAttribute('href', billingLinks.plans);
    expect(more()?.textContent).toBe(interpolate(kitStrings['upgrade.near'], { label: strings['srv.upgradeAi'] }));
  });

  it('a lane at its limit: full', () => {
    render(<ServerAiFoot id="s1" read={read(100)} />);
    expect(more()).toHaveAttribute('data-upgrade', 'full');
  });

  it('below 75 % there is none', () => {
    render(<ServerAiFoot id="s1" read={read(70)} />);
    expect(more()).toBeNull();
  });

  it('a card that already shows its room upgrade gets none (one per card)', () => {
    render(<ServerAiFoot id="s1" read={read(100)} room={{ available: 'plan', prominence: 'full' }} />);
    expect(more()).toBeNull();
  });

  it('a session that may not buy gets none', () => {
    gate.purchase = false;
    render(<ServerAiFoot id="s1" read={read(100)} />);
    expect(more()).toBeNull();
  });
});

// On a Servers card the room upgrade (Get more room) is the AI footer's last cell, after the
// lanes, in every state of the AI read, and it stays the card's one upgrade.
describe('ServerAiFoot: Get more room in the last cell', () => {
  const room = () => screen.queryByRole('link', { name: new RegExp(strings['srv.upgrade']) });
  const near = { available: 'plan', prominence: 'near' } as const;

  it('comes after the lanes, as the footer\'s last element', () => {
    const { container } = render(<ServerAiFoot id="s1" read={read(80)} room={near} />);
    const link = room();
    expect(link).toHaveAttribute('data-upgrade', 'near');
    expect(link).toHaveAttribute('href', billingLinks.plans);
    expect(more()).toBeNull();
    const foot = container.firstElementChild!;
    expect(foot.lastElementChild?.contains(link)).toBe(true);
    const lane = screen.getByText(strings['aiu.lane.chat']);
    expect(lane.compareDocumentPosition(link!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['a failed read', { data: undefined, error: { kind: 'forbidden' } }],
    ['a read still out', { data: undefined, error: null }],
    ['a server the read left out', { data: { truncated: false, byId: {} }, error: null }],
  ] as const)('shows with %s', (_, r) => {
    render(<ServerAiFoot id="s1" read={r} room={near} />);
    expect(room()).toHaveAttribute('data-upgrade', 'near');
  });

  it('none when the room has no upgrade', () => {
    render(<ServerAiFoot id="s1" read={read(70)} room={{ available: 'none', prominence: 'quiet' }} />);
    expect(room()).toBeNull();
  });
});
