// ForkPending `faqItem`: with the host's question, each row that can be checked ends with a FaqLink to it, and the toast of
// a fork that is gone or can't be confirmed carries it; no other toast does, a fork being made has none, and without the prop nothing links.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FaqItem } from '../layouts/Faq';
import { ForkPending } from './ForkPending';
import type { ForkOutcome, ForkRowView } from './source';
import strings from './ForkPending.strings.en.json';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; faq?: { item: unknown; label: string } }>);
vi.mock('../states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
beforeEach(() => { toasts.length = 0; });
afterEach(() => cleanup());

const FAQ: FaqItem = { id: 'forkUnconfirmed', q: 'Why is a fork not confirmed?', a: 'Check again only reads.' };
const row = (o: Partial<ForkRowView> = {}): ForkRowView => ({ k1: 'hx-1', parent: 's', turn: 1, bad: false, hidden: false, mine: false, ...o });

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
}
const links = () => screen.queryAllByRole('link', { name: strings['fp.more'] });

describe('ForkPending faqItem', () => {
  it('every row that can be checked ends with one FaqLink to the question; a fork being made has none', async () => {
    await mount(() => <ForkPending rows={[row(), row({ k1: 'hx-2', turn: null }), row({ k1: 'hx-3', mine: true }), row({ k1: 'hx-4', hidden: true })]} check={vi.fn()} hidden="label" faqItem={FAQ} />);
    expect(links()).toHaveLength(3);
    expect(screen.getByText(new RegExp(strings['fp.making']))).toBeTruthy();
    expect(links()[0]!.getAttribute('href')).toContain('#faq-forkUnconfirmed');
  });

  it('without the prop no row links (the line-only fallback)', async () => {
    await mount(() => <ForkPending rows={[row()]} check={vi.fn()} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it.each([['gone'], ['unconfirmed']] as const)('a Check that finds the fork %s: the warn toast carries the question', async (reason) => {
    const check = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'refused', words: 'w', reason }));
    await mount(() => <ForkPending rows={[row()]} check={check} faqItem={FAQ} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', faq: { item: FAQ, label: strings['fp.more'] } });
  });

  it.each([['none'], ['untracked'], ['notRemembered']] as const)('a Check that ends %s: the toast carries no question', async (reason) => {
    const check = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'refused', words: 'w', reason }));
    await mount(() => <ForkPending rows={[row()]} check={check} faqItem={FAQ} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]!.faq).toBeUndefined();
    expect(toasts[0]!.tone).toBe('info');
  });

  it('gone without the prop: the warn toast as before, no question', async () => {
    const check = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'refused', words: 'w', reason: 'gone' }));
    await mount(() => <ForkPending rows={[row()]} check={check} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn' });
    expect(toasts[0]!.faq).toBeUndefined();
  });
});
