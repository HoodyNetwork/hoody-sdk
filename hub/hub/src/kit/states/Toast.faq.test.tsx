// Toast `faq` (the DialogFaq shape): a FaqLink under the body that opens the answer in a peek (a toast is an alertdialog,
// so the link never navigates), and a toast that carries one stays until closed, so the peek is never left without it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FaqItem } from '../layouts/Faq';
import { Toaster, closeToast, showToast } from './Toast';

const ITEM: FaqItem = { id: 'forkUnconfirmed', q: 'Why is a fork not confirmed?', a: 'Check again only reads; it never sends the fork again.' };
const open: string[] = [];
const show = (...args: Parameters<typeof showToast>) => { const k = showToast(...args); open.push(k); return k; };
afterEach(() => { for (const k of open.splice(0)) act(() => closeToast(k)); cleanup(); });

async function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Toaster /> }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('Toast faq', () => {
  it('draws the FaqLink under the body, inside the toast, and a press opens the whole answer in a peek without navigating', async () => {
    const router = await mount();
    act(() => { show({ title: 'Could not fork from reply 2', body: 'The chat is gone.', tone: 'warn', faq: { item: ITEM, label: 'About unconfirmed forks' } }); });
    const toast = await screen.findByRole('alertdialog');
    const link = within(toast).getByRole('link', { name: 'About unconfirmed forks' });
    expect(link.closest('[data-toast-faq]')).not.toBeNull();
    const before = router.state.location.href;
    await act(async () => { fireEvent.click(link); });
    expect(await screen.findByText(ITEM.a)).toBeInTheDocument();
    expect(router.state.location.href).toBe(before);
  });

  it('a toast with a faq stays past its timeout; the same toast without one closes', async () => {
    await mount();
    act(() => { show({ title: 'With the answer', tone: 'warn', faq: { item: ITEM, label: 'About unconfirmed forks' } }, 30); });
    act(() => { show({ title: 'Without it', tone: 'warn' }, 30); });
    expect(screen.getByText('With the answer')).toBeInTheDocument();
    await wait(200);
    expect(screen.getByText('With the answer')).toBeInTheDocument();
    expect(screen.queryByText('Without it')).toBeNull();
  });

  it('without a faq no link and no faq block is drawn', async () => {
    await mount();
    act(() => { show({ title: 'Could not fork this chat', body: 'The chat is gone.', tone: 'warn' }); });
    const toast = await screen.findByRole('alertdialog');
    expect(within(toast).queryByRole('link')).toBeNull();
    expect(toast.querySelector('[data-toast-faq]')).toBeNull();
  });
});
