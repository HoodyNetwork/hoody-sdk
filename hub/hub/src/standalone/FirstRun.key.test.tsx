// FirstRun.tsx + TokenSignIn.tsx: the focus on the access key's way. Its form focuses the key field; the confirm card
// has no field, so the card's new title takes the focus; Cancel brings the form back with the focus in the key field.
// The token-auth globals are TokenSignIn.test.tsx's, every request answered at once.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type { HubConfigRead } from '@core/origin';
import { HUB_FILE_BUILD } from './build';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  set: vi.fn(),
  device: vi.fn(),
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ORIGIN = 'https://api.example.test:8443';
const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };
const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const R1 = '1'.repeat(24);
const UID = '64f0c0ffee0000000000aaaa';
const NAMES = ['apiCall', 'parseTokenIntrospection', 'installTokenSession', 'readAuthRev', 'classifyStoredAuth', 'realmApiDomain', 'standaloneApiHeld', 'isFramedPage'] as const;

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.set.mockReturnValue('set');
  m.device.mockReturnValue({ stop: vi.fn() });
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
  const g = globalThis as unknown as Record<string, unknown>;
  g.apiCall = (_m: string, path: string) => Promise.resolve(path === '/auth/tokens/me' ? { data: 'intro' } : { data: { id: UID, username: 'owner' } });
  g.parseTokenIntrospection = () => ({ id: 't1', alias: 'shared', perms: { computers: { read: true }, projects: { read: true } }, expiresAt: null, realmIds: [R1], allowNoRealm: false, isEnabled: true });
  g.installTokenSession = () => ({ ok: true });
  g.readAuthRev = () => 'r0';
  g.classifyStoredAuth = () => 'none';
  g.realmApiDomain = () => 'api.example.test';
  g.standaloneApiHeld = () => true;
  g.isFramedPage = () => false;
});
afterEach(() => {
  cleanup();
  // The next test's fixture boot refuses while shared.js-looking globals are installed.
  for (const n of NAMES) delete (globalThis as unknown as Record<string, unknown>)[n];
});

const press = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
// The kit Form disables its fields while a request is out, and a browser then drops the focus to <body>. jsdom keeps
// the focus on a disabled field and its blur() does nothing there, so a test drops it just BEFORE the press.
const drop = () => {
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);
};

describe('the access key way: focus', () => {
  it('the confirm card has no field: its title takes the focus; Cancel brings the key field back with the focus', async () => {
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
    await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
    await press(/^Other ways to sign in/);
    await press(/^Use an access key$/);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Access key/));
    fireEvent.change(screen.getByLabelText(/^Access key/), { target: { value: TOKEN } });
    drop();
    await press(/^Check the key$/);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Open the Hub with this key?' }));
    });
    await press(/^Cancel$/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in with an access key');
    expect(document.activeElement).toBe(screen.getByLabelText(/^Access key/));
  });
});
