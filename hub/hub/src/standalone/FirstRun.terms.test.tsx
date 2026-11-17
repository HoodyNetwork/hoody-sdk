// Signup.tsx inside FirstRun: the "Create your account" card says what creating an account agrees to, with a link to
// the Terms and one to the Privacy Policy (core/site.ts). The sign-in card says the same of its provider buttons, which
// can make an account too, and only where it shows them. The states with no form carry neither.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import { LEGAL } from '@core/site';
import { webAddress } from '@kit/controls/Link';
import { SITE } from '../pages/billing/plans-compare-logic';
import { HUB_FILE_BUILD } from './build';
import strings from './strings.en.json';

const ORIGIN = 'https://api.example.test:8443';
const SENTENCE = 'By creating an account, you agree to our Terms and Privacy Policy.';
const PROVIDER_SENTENCE = 'By continuing, you agree to our Terms and Privacy Policy.';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  config: vi.fn<() => Promise<{ open: boolean; invite: boolean; providers: readonly ('github' | 'google')[] } | null>>(),
  device: vi.fn(),
  set: vi.fn(),
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('@core/signin', async (orig) => ({ ...(await orig<typeof SignIn>()), readSignupConfig: m.config }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.config.mockResolvedValue({ open: true, invite: false, providers: [] });
  m.device.mockReturnValue({ stop: vi.fn() });
  m.set.mockReturnValue('set');
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

const legalLine = () => [...document.querySelectorAll('p')].find((p) => (p.textContent ?? '').startsWith('By creating an account'));
const providerLine = () => [...document.querySelectorAll('p')].find((p) => (p.textContent ?? '').startsWith('By continuing'));
const legalLinks = () => screen.queryAllByRole('link').filter((a) => [LEGAL.terms, LEGAL.privacy].includes(a.getAttribute('href') as never));
const after = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

async function signIn() {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create an account$/ })).toBeInTheDocument(); });
}
async function openSignup() {
  await signIn();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Create an account$/ })); });
  await waitFor(() => { expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account'); });
}

describe('the Terms and Privacy line on the one-file Hub', () => {
  it('the addresses are absolute https, one copy for the whole Hub', () => {
    for (const url of [LEGAL.terms, LEGAL.privacy]) {
      expect(url).toMatch(/^https:\/\/[a-z.]+\/[a-z-]+\/$/);
      expect(webAddress(url)).toBe(url);
    }
    expect(LEGAL.terms).not.toBe(LEGAL.privacy);
    expect(SITE.terms).toBe(LEGAL.terms);
    expect(SITE.privacy).toBe(LEGAL.privacy);
  });

  it('"Create your account" carries the sentence under Create account, both links opening in a new tab', async () => {
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Create account$/ })).not.toBeDisabled(); });
    const line = legalLine();
    expect(line?.textContent).toBe(SENTENCE);
    const terms = screen.getByRole('link', { name: /^Terms/ });
    const privacy = screen.getByRole('link', { name: /^Privacy Policy/ });
    expect(terms).toHaveAttribute('href', LEGAL.terms);
    expect(privacy).toHaveAttribute('href', LEGAL.privacy);
    for (const a of [terms, privacy]) {
      expect(line?.contains(a)).toBe(true);
      expect(a).toHaveAttribute('target', '_blank');
      // In a line of muted text a link is told apart by more than its colour: underlined at rest.
      expect(a).toHaveAttribute('data-underlined');
      expect(a.getAttribute('rel') ?? '').toMatch(/noopener/);
    }
    expect(after(screen.getByRole('button', { name: /^Create account$/ }), line as Element)).toBe(true);
    expect(after(line as Element, screen.getByRole('button', { name: /^I already have an account$/ }))).toBe(true);
  });

  it('the sentence stands above the provider buttons, which make an account too', async () => {
    m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
    await openSignup();
    const github = await screen.findByRole('button', { name: /^Continue with GitHub/ });
    const line = legalLine();
    expect(line?.textContent).toBe(SENTENCE);
    expect(after(line as Element, github)).toBe(true);
  });

  it('the sign-in card says it under its provider buttons, both links opening in a new tab', async () => {
    m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
    await signIn();
    const google = await screen.findByRole('button', { name: /^Continue with Google/ });
    expect(legalLine()).toBeUndefined();
    const line = providerLine();
    expect(line?.textContent).toBe(PROVIDER_SENTENCE);
    expect(after(google, line as Element)).toBe(true);
    const terms = screen.getByRole('link', { name: /^Terms/ });
    const privacy = screen.getByRole('link', { name: /^Privacy Policy/ });
    expect(terms).toHaveAttribute('href', LEGAL.terms);
    expect(privacy).toHaveAttribute('href', LEGAL.privacy);
    for (const a of [terms, privacy]) {
      expect(line?.contains(a)).toBe(true);
      expect(a).toHaveAttribute('target', '_blank');
      // In a line of muted text a link is told apart by more than its colour: underlined at rest.
      expect(a).toHaveAttribute('data-underlined');
      expect(a.getAttribute('rel') ?? '').toMatch(/noopener/);
    }
  });

  for (const [provider, name] of [['github', 'GitHub'], ['google', 'Google']] as const) {
    it(`the sign-in card with ${name} alone says the same general sentence`, async () => {
      m.config.mockResolvedValue({ open: true, invite: false, providers: [provider] });
      await signIn();
      await screen.findByRole('button', { name: new RegExp(`^Continue with ${name}`) });
      expect(providerLine()?.textContent).toBe(PROVIDER_SENTENCE);
      expect(legalLinks()).toHaveLength(2);
      for (const l of legalLinks()) expect(l).toHaveAttribute('data-underlined');
    });
  }

  it('the sentence names no provider, so a provider added or removed later cannot make it wrong', async () => {
    expect(strings['prov.legal']).not.toMatch(/\{\{provider|GitHub|Google/);
    expect(Object.keys(strings).filter((k) => k.startsWith('prov.legal'))).toEqual(['prov.legal']);
    m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
    await signIn();
    const shown = (await screen.findAllByRole('button', { name: /^Continue with / })).map((b) => (b.textContent ?? '').replace(/^Continue with /, '').trim());
    expect(shown.length).toBeGreaterThan(1);
    for (const name of shown) expect(providerLine()?.textContent).not.toContain(name);
  });

  it('a sign-in card with no provider button has neither sentence nor the links', async () => {
    await signIn();
    expect(legalLine()).toBeUndefined();
    expect(providerLine()).toBeUndefined();
    expect(legalLinks()).toEqual([]);
  });

  it('"Create your account" keeps its one sentence: the provider one is not repeated there', async () => {
    m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
    await openSignup();
    await screen.findByRole('button', { name: /^Continue with GitHub/ });
    expect(legalLine()?.textContent).toBe(SENTENCE);
    expect(providerLine()).toBeUndefined();
    expect(legalLinks()).toHaveLength(2);
  });

  it('sign-up closed shows no form and no sentence', async () => {
    m.config.mockResolvedValue({ open: false, invite: false, providers: [] });
    await openSignup();
    await screen.findByText(/^Hoody is not taking new accounts/);
    expect(legalLine()).toBeUndefined();
    expect(legalLinks()).toEqual([]);
  });
});
