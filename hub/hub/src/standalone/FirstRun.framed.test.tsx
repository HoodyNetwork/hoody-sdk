// FirstRun.tsx in a page shown inside another page: only the card's frame, one sentence and "Open in a new tab". No
// field, no sign-in way, no config read, no "Sign out here": nothing can be typed or sent from the frame (device.ts and
// token.ts refuse there too, before any request: their own tests).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as Session from '@core/session';
import type { Start } from './boot';

const m = vi.hoisted(() => ({ framed: true as boolean | 'throws', clear: vi.fn(), purge: vi.fn(), read: vi.fn(), device: vi.fn() }));
vi.mock('@core/session', async (orig) => ({
  ...(await orig<typeof Session>()),
  isFramed: () => { if (m.framed === 'throws') throw new Error('no shared.js'); return m.framed; },
  clearAuthTokens: m.clear,
  purgeOutgoingSession: m.purge,
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');
const { readPage } = await import('@core/session');

const ORIGIN = 'https://api.hoody.test';
const starts: Array<Exclude<Start, { kind: 'app' }>> = [
  { kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } },
  { kind: 'first-run', step: 'blocked', why: 'signed_in', choice: { origin: ORIGIN, asked: 'default' } },
  { kind: 'first-run', step: 'blocked', why: 'storage', choice: null },
];

beforeEach(() => {
  m.clear.mockReset();
  m.purge.mockReset();
  m.read.mockReset();
  m.device.mockReset();
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

describe('the sign-in card in a frame', () => {
  for (const framed of [true, 'throws'] as const) {
    it(`framed (${framed === true ? 'the check says so' : 'the check throws'}): the frame refusal only, in every state`, () => {
      m.framed = framed;
      for (const start of starts) {
        render(<FirstRun start={start} />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open this page on its own');
        expect(screen.getByText('This page is shown inside another page. Sign-in is off here.')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /^Open in a new tab$/ });
        expect(link).toHaveAttribute('target', '_blank');
        expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /^Sign out here$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Sign in/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Use an access key/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Other ways to sign in/ })).toBeNull();
        expect(screen.queryByText(/^New to Hoody\?/)).toBeNull();
        cleanup();
      }
      expect(m.read).not.toHaveBeenCalled();
      expect(m.device).not.toHaveBeenCalled();
      expect(m.clear).not.toHaveBeenCalled();
      expect(m.purge).not.toHaveBeenCalled();
    });
  }

  it('on its own page: "Sign out here" signs out and reloads', async () => {
    m.framed = false;
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    // The fixture world holds Ada's session, so the card is drawn for it: the press ends that session through the
    // sign-out purge, named with the session drawn (FirstRun.signout.test.tsx covers the cases with none shown).
    const page = readPage();
    expect(page).not.toBeNull();
    render(<FirstRun start={starts[1]!} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Sign out here$/ })); });
    expect(m.purge).toHaveBeenCalledTimes(1);
    expect(m.purge).toHaveBeenCalledWith(page, { reason: 'signout' });
    expect(m.clear).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
