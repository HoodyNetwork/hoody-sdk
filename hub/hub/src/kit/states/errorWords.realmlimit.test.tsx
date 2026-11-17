// The Realm limit's refusal: one sentence on every surface, with Upgrade (Billing) after it; no Upgrade on the top
// plan or for a sign-in that cannot open Billing. A refusal, so never pending and never "nothing was sent".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RealmCapView } from '@core';

let account = true;
let cap: RealmCapView = { k: 'none' };
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), can: (c: string) => c !== 'account' || account, realmCapShown: () => cap }));

const { REALM_LIMIT_CODE, errorInfo } = await import('@core');
const { ERROR_WORD_KEYS, errorWords } = await import('./errorWords');
const { default: strings } = await import('./strings.en.json');

const info = (e: Record<string, unknown>) => errorInfo(e, { page: 'computers', now: new Date('2026-11-17T12:00:00Z') });
const refusal = () => info({ status: 400, code: REALM_LIMIT_CODE, data: { max: 5, used: 5 } });

beforeEach(() => { account = true; cap = { k: 'none' }; });

describe('the Realm limit refusal', () => {
  it('keeps its code and reads as a refusal with the way to more realms', () => {
    cap = { k: 'use', used: 5, max: 5, reached: true, upgrade: true };
    expect(refusal().code).toBe(REALM_LIMIT_CODE);
    expect(refusal().outcome).toBe('failed');
    expect(errorWords(refusal())).toEqual({ key: 'err.realmLimit', link: { href: '/billing', label: 'realmLimit.upgrade' } });
    expect(ERROR_WORD_KEYS).toContain('err.realmLimit');
  });
  it('the one sentence; no number, no price, no plan name', () => {
    const s = strings['err.realmLimit'];
    expect(s).toBe('Your account has reached its realm limit. Use an existing realm.');
    expect(s).not.toMatch(/\d|Free|Plus|Pro|bare/i);
    expect(strings['realmLimit.upgrade']).toBe('Upgrade for more realms');
  });
  it('the limit not known (no cap, or no max): the sentence alone, never a guessed Upgrade', () => {
    expect(errorWords(refusal())).toEqual({ key: 'err.realmLimit' });
    cap = { k: 'reached', reached: true, upgrade: false };
    expect(errorWords(refusal())).toEqual({ key: 'err.realmLimit' });
  });
  it('the top plan at its limit: the sentence alone', () => {
    cap = { k: 'use', used: 1000, max: 1000, reached: true, upgrade: false };
    expect(errorWords(refusal())).toEqual({ key: 'err.realmLimit' });
  });
  it('a sign-in that cannot open Billing: the sentence alone', () => {
    cap = { k: 'use', used: 5, max: 5, reached: true, upgrade: true };
    account = false;
    expect(errorWords(refusal())).toEqual({ key: 'err.realmLimit' });
  });
  it('a lost answer stays pending whatever its code', () => {
    expect(errorWords(info({ kind: 'pending', code: REALM_LIMIT_CODE })).key).toBe('err.pending');
  });
});

describe('the Realm limit refusal as a surface draws it', () => {
  it('the sentence, then the Upgrade link to Billing', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { errorSentenceNode } = await import('./ErrorDetails');
    cap = { k: 'limit', max: 50, reached: true, upgrade: true };
    render(<p>{errorSentenceNode(refusal())}</p>);
    expect(screen.getByText(/Your account has reached its realm limit\. Use an existing realm\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade for more realms' })).toHaveAttribute('href', '/billing');
  });
});
