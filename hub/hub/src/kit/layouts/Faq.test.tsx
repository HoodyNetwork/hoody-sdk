// The page FAQ: the section and its items, the router-built href, a press on the page and the
// peek (a press inside an overlay, or on a question that cannot be reached). Landing and its retries: Faq.landing.test.tsx.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode, useState } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubHref, hubNavigate } from '../../app/hrefs';
import { ConfirmDialog, Drawer } from '../overlays/Overlays';
import { GalleryFaq } from '../gallery/layouts';
import { Faq, FaqLink, type FaqItem } from './Faq';

afterEach(() => vi.restoreAllMocks());

const ITEMS: FaqItem[] = [
  { id: 'rate', q: 'What is the rate?', a: 'Five percent of what a referral pays.' },
  { id: 'hold', q: 'Why is a payout held?', a: 'Payouts are held for 60 days.', action: { label: 'Program rules', href: '/guide' } },
  { id: 'eligible', q: 'Which purchases count?', a: 'Any delivered server purchase counts.' },
];

/** The kit's routing of a link (the app's AriaBridge): a hub path goes through the router. */
function Bridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AriaRouterProvider navigate={(to) => hubNavigate(to, (href) => void router.navigate({ href } as never))} useHref={hubHref}>
      {children}
    </AriaRouterProvider>
  );
}

async function mount(path: string, el: () => ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <Bridge>
          <h1 tabIndex={-1} data-hub-title="">
            Page
          </h1>
          {el()}
        </Bridge>
      ),
    }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const settle = (ms = 5) =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, ms));
  });

const question = (name: RegExp | string) => screen.getByRole('button', { name });

describe('Faq: the section', () => {
  it('is one section titled Questions, with a heading level lower for each question (page root: 2 and 3)', async () => {
    await mount('/', () => <Faq faq={{ items: ITEMS }} />);
    const title = screen.getByRole('heading', { level: 2, name: 'Questions' });
    expect(title.closest('section')).toHaveAttribute('id', 'faq');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(ITEMS.map((i) => i.q));
  });

  it('inside a list pane or inspector the levels are 3 and 4', async () => {
    await mount('/', () => <Faq faq={{ items: ITEMS }} titleLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Questions' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(ITEMS.length);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('puts the anchor id on every item and keeps them all closed', async () => {
    await mount('/', () => <Faq faq={{ items: ITEMS }} />);
    for (const i of ITEMS) {
      const root = document.getElementById(`faq-${i.id}`);
      expect(root).not.toBeNull();
      expect(question(i.q)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('a closed answer is out of the tab order, and open it shows its text and its action as a link', async () => {
    await mount('/', () => <Faq faq={{ items: ITEMS }} />);
    expect(screen.queryByRole('link', { name: /Program rules/ })).toBeNull();
    await act(async () => fireEvent.click(question(/Why is a payout held/)));
    expect(question(/Why is a payout held/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Payouts are held for 60 days.')).toBeVisible();
    const action = screen.getByRole('link', { name: /Program rules/ });
    expect(action).toHaveAttribute('href', '#/guide');
  });

  it('Tab walks the questions and skips what is closed; Enter opens one', async () => {
    const user = userEvent.setup();
    await mount('/', () => <Faq faq={{ items: ITEMS }} />);
    await user.tab();
    expect(document.activeElement).toBe(question(ITEMS[0]!.q));
    await user.tab();
    expect(document.activeElement).toBe(question(ITEMS[1]!.q));
    await user.keyboard('{Enter}');
    expect(question(ITEMS[1]!.q)).toHaveAttribute('aria-expanded', 'true');
  });

  // The check runs before any hook, so no router is needed to see the throw.
  it('throws in dev when it has no items (an empty FAQ is refused)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Faq faq={{ items: [] }} />)).toThrow(/items/);
  });

  it('throws in dev for two items with one id (the anchor must be unique)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Faq faq={{ items: [ITEMS[0]!, { ...ITEMS[1]!, id: 'rate' }] }} />)).toThrow(/duplicate item id "rate"/);
  });
});

describe('FaqLink: the href', () => {
  it('is the page path and search with #faq-<id>, built by the router (a search value with a special character is serialized its way)', async () => {
    const router = await mount('/p?name=a%26b%20c&n=1', () => <FaqLink item={ITEMS[0]!}>How it works</FaqLink>);
    const link = screen.getByRole('link', { name: 'How it works' });
    const built = router.buildLocation({ to: '/p', search: router.state.location.search, hash: 'faq-rate' } as never).href;
    expect(link).toHaveAttribute('href', `#${built}`);
    // Not a concatenation: the ampersand and the space of the value travel escaped, the hash is last.
    expect(built).toContain('%26');
    expect(built).not.toMatch(/a&b/);
    expect(built.endsWith('#faq-rate')).toBe(true);
  });

  it('keeps the current search when there is none, and an escaped path as it is', async () => {
    const router = await mount('/ai/c/sess_01HX.y%3Az-9', () => <FaqLink item={ITEMS[0]!}>How</FaqLink>);
    const built = router.buildLocation({ to: router.state.location.pathname, search: {}, hash: 'faq-rate' } as never).href;
    expect(screen.getByRole('link', { name: 'How' })).toHaveAttribute('href', `#${built}`);
  });
});

describe('FaqLink on the page', () => {
  it('a press with the question on the page navigates to its anchor (a pushed entry), no peek', async () => {
    const router = await mount('/p?x=1', () => (
      <>
        <FaqLink item={ITEMS[0]!}>How it works</FaqLink>
        <Faq faq={{ items: ITEMS }} />
      </>
    ));
    const before = router.state.location.state.__TSR_key;
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'How it works' })));
    await settle();
    expect(router.state.location.hash).toBe('faq-rate');
    expect(router.state.location.search).toMatchObject({ x: 1 });
    expect(router.state.location.state.__TSR_key).not.toBe(before);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a Cmd or Ctrl press keeps the browser default: no peek and no client navigation', async () => {
    const router = await mount('/p', () => (
      <>
        <FaqLink item={ITEMS[0]!}>How it works</FaqLink>
        <Faq faq={{ items: ITEMS }} />
      </>
    ));
    const link = screen.getByRole('link', { name: 'How it works' });
    const open = vi.fn();
    vi.stubGlobal('open', open);
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...mod });
      link.dispatchEvent(ev);
    }
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.hash).toBe('');
    vi.unstubAllGlobals();
  });

  it('a Cmd or Ctrl press on a link whose question cannot be reached opens no peek either', async () => {
    const router = await mount('/p', () => <FaqLink item={ITEMS[1]!}>Why held</FaqLink>);
    const link = screen.getByRole('link', { name: 'Why held' });
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...mod }));
    }
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.hash).toBe('');
  });

  it('a question that cannot be reached (the page shows no FAQ) opens a peek with the whole answer and its action', async () => {
    const router = await mount('/p', () => <FaqLink item={ITEMS[1]!}>Why held</FaqLink>);
    const link = screen.getByRole('link', { name: 'Why held' });
    await act(async () => fireEvent.click(link));
    await settle();
    const peek = screen.getByRole('dialog', { name: 'Answer' });
    expect(within(peek).getByText('Payouts are held for 60 days.')).toBeInTheDocument();
    expect(within(peek).getByRole('link', { name: /Program rules/ })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
  });

  it("a question under an inert ancestor (the page under a modal) or hidden is not reachable: the press peeks", async () => {
    const router = await mount('/p', () => (
      <>
        <FaqLink item={ITEMS[0]!}>How it works</FaqLink>
        <div hidden>
          <Faq faq={{ items: ITEMS }} />
        </div>
      </>
    ));
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'How it works' })));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Answer' })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
  });

  it("the peek's action closes the popover, then navigates to its route", async () => {
    const router = await mount('/p', () => <FaqLink item={ITEMS[1]!}>Why held</FaqLink>);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Why held' })));
    await settle();
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Answer' })).getByRole('link', { name: /Program rules/ })));
    await settle(30);
    expect(screen.queryByRole('dialog', { name: 'Answer' })).toBeNull();
    expect(router.state.location.pathname).toBe('/guide');
  });

  it('Escape closes the peek and focus returns to the link', async () => {
    const user = userEvent.setup();
    await mount('/p', () => <FaqLink item={ITEMS[1]!}>Why held</FaqLink>);
    const link = screen.getByRole('link', { name: 'Why held' });
    await user.click(link);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Answer' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await settle(30);
    expect(screen.queryByRole('dialog', { name: 'Answer' })).toBeNull();
    expect(document.activeElement).toBe(link);
  });
});

describe('FaqLink inside an overlay: always a peek, never a navigation, no action', () => {
  function Host({ faq = true }: { faq?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <>
        {faq && <Faq faq={{ items: ITEMS }} />}
        <ConfirmDialog
          isOpen={open}
          onOpenChange={setOpen}
          title="Join the program"
          confirmLabel="Join"
          onConfirm={() => undefined}
          body={<FaqLink item={ITEMS[1]!}>Why is it held</FaqLink>}
        />
      </>
    );
  }

  it('a press opens the peek with the whole answer and no action, and does not navigate', async () => {
    const router = await mount('/p', () => <Host />);
    await settle();
    const dialog = screen.getByRole('alertdialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('link', { name: 'Why is it held' })));
    await settle();
    const peek = screen.getByRole('dialog', { name: 'Answer' });
    expect(within(peek).getByText('Payouts are held for 60 days.')).toBeInTheDocument();
    expect(within(peek).queryByRole('link')).toBeNull();
    expect(router.state.location.hash).toBe('');
  });

  it('Escape closes only the peek: focus is back on the link and the dialog is still open', async () => {
    const user = userEvent.setup();
    await mount('/p', () => <Host />);
    await settle();
    const link = within(screen.getByRole('alertdialog')).getByRole('link', { name: 'Why is it held' });
    await user.click(link);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Answer' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await settle(30);
    expect(screen.queryByRole('dialog', { name: 'Answer' })).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(link);
  });

  it("a dirty Drawer is not asked to close by the peek's Escape (its leave guard does not fire)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    function Page() {
      return (
        <Drawer resizeKey="test-faq-peek" isOpen onOpenChange={onOpenChange} title="Edit" dirty discardText="Discard changes?">
          <input aria-label="Name" defaultValue="x" />
          <FaqLink item={ITEMS[1]!}>Why is it held</FaqLink>
        </Drawer>
      );
    }
    await mount('/p', () => <Page />);
    await settle();
    const link = screen.getByRole('link', { name: 'Why is it held' });
    await user.click(link);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Answer' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await settle(30);
    expect(screen.queryByRole('dialog', { name: 'Answer' })).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    // No discard ask appeared: the drawer never saw a close request.
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(document.activeElement).toBe(link);
  });
});

describe('the gallery entry', () => {
  it('shows the section, a FaqLink on the page that jumps to its question, and a FaqLink in a ConfirmDialog that peeks', async () => {
    const router = await mount('/_kit', () => <GalleryFaq />);
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'What is the rate?' })));
    await settle();
    expect(router.state.location.hash).toBe('faq-rate');
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Join' })[0]!));
    await settle();
    const dialog = screen.getByRole('alertdialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('link', { name: 'Why are payouts held?' })));
    await settle();
    expect(within(screen.getByRole('dialog', { name: 'Answer' })).getByText(/held for 60 days/)).toBeInTheDocument();
    expect(router.state.location.hash).toBe('faq-rate');
  });
});
