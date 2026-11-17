// FAQ landing: a location `#faq-<id>` opens the question, scrolls its scroller,
// focuses its trigger and marks it "here", once per history entry, and only once the question can be reached. While it
// cannot (a modal open, a list pane hidden) landing waits and retries on the kit's own signals: a size or visibility change
// of the target, the close of a kit overlay, an expand commit. It records the entry as landed only when focus is on the trigger.
import { createBrowserHistory, createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, type ReactNode, useState } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hubHref, hubNavigate } from '../../app/hrefs';
import { ConfirmDialog } from '../overlays/Overlays';
import { PageNavHoldContext, type PageNavHold } from '../nav';
import { notifyOverlayClosed, OverlayClosedNotice, overlaysBusy } from '../overlays/shared';
import { Faq, FaqLink, type FaqItem } from './Faq';

const ITEMS: FaqItem[] = [
  { id: 'rate', q: 'What is the rate?', a: 'Five percent of what a referral pays.' },
  { id: 'hold', q: 'Why is a payout held?', a: 'Payouts are held for 60 days.' },
  { id: 'eligible', q: 'Which purchases count?', a: 'Any delivered server purchase counts.' },
];

const scrolls: Array<{ el: Element; opts: ScrollToOptions }> = [];
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

beforeEach(() => {
  scrolls.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: Element, opts: ScrollToOptions) {
      scrolls.push({ el: this, opts });
    },
  });
});

afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, 'scrollTo', original);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
          <div id="hub-main">
            <h1 tabIndex={-1} data-hub-title="">
              Page
            </h1>
            {el()}
          </div>
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

const question = (id: string) => screen.getByRole('button', { name: ITEMS.find((i) => i.id === id)!.q });
const entry = (r: { state: { location: { state: unknown } } }) => (r.state.location.state as { __TSR_key?: string }).__TSR_key;

/** A ResizeObserver and an IntersectionObserver the test fires by hand. */
function fakeObservers() {
  const live = new Set<{ fire: () => void }>();
  class Obs {
    private cb: () => void;
    private self = { fire: () => this.cb() };
    constructor(cb: () => void) {
      this.cb = cb;
      live.add(this.self);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      live.delete(this.self);
    }
  }
  vi.stubGlobal('ResizeObserver', Obs);
  vi.stubGlobal('IntersectionObserver', Obs);
  return { fire: () => act(async () => live.forEach((o) => o.fire())), count: () => live.size };
}

function Toggle() {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown((v) => !v)}>
        toggle faq
      </button>
      {shown && <Faq faq={{ items: ITEMS }} />}
    </>
  );
}

describe('Faq landing', () => {
  it('a location #faq-<id> opens the question, scrolls #hub-main, focuses the trigger and marks it here', async () => {
    await mount('/p#faq-hold', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(question('hold')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('hold'));
    expect(screen.getByText('Payouts are held for 60 days.')).toBeVisible();
    expect(document.getElementById('faq-hold')).toHaveAttribute('data-hub-here');
    expect(document.getElementById('faq-rate')).not.toHaveAttribute('data-hub-here');
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]!.el).toBe(document.getElementById('hub-main'));
    expect(question('rate')).toHaveAttribute('aria-expanded', 'false');
  });

  it("scrolls the item's nearest scrolling ancestor (an inspector scrolls itself), not #hub-main", async () => {
    function Inspector() {
      return (
        <div data-testid="inspector" style={{ overflowY: 'auto' }}>
          <Faq faq={{ items: ITEMS }} titleLevel={3} />
        </div>
      );
    }
    const probe = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    await mount('/p#faq-eligible', () => <Inspector />);
    await settle();
    probe.mockRestore();
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]!.el).toBe(screen.getByTestId('inspector'));
  });

  it('no smooth scroll under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    await mount('/p#faq-rate', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(scrolls[0]?.opts.behavior).toBe('auto');
  });

  it('a press on a FaqLink on the page navigates to the anchor and lands: opened, focused, one new entry', async () => {
    const router = await mount('/p', () => (
      <>
        <FaqLink item={ITEMS[2]!}>Which purchases count</FaqLink>
        <Faq faq={{ items: ITEMS }} />
      </>
    ));
    const before = entry(router);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Which purchases count' })));
    await settle();
    expect(router.state.location.hash).toBe('faq-eligible');
    expect(entry(router)).not.toBe(before);
    expect(question('eligible')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('eligible'));
  });

  it('the same link twice pushes two entries and lands twice', async () => {
    const router = await mount('/p', () => (
      <>
        <FaqLink item={ITEMS[0]!}>How it works</FaqLink>
        <Faq faq={{ items: ITEMS }} />
      </>
    ));
    const link = () => screen.getByRole('link', { name: 'How it works' });
    await act(async () => fireEvent.click(link()));
    await settle();
    const first = entry(router);
    expect(document.activeElement).toBe(question('rate'));
    expect(scrolls).toHaveLength(1);
    // The person moves on (focus and the open question) and presses the same link again.
    await act(async () => fireEvent.click(question('rate')));
    link().focus();
    await act(async () => fireEvent.click(link()));
    await settle();
    expect(entry(router)).not.toBe(first);
    expect(scrolls).toHaveLength(2);
    expect(question('rate')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('rate'));
  });

  it('a press at the anchor of a page that is no longer the live one pushes nothing (the page hold)', async () => {
    let hidden = false;
    const hold: PageNavHold = { location: null, owns: () => !hidden, hidden: () => hidden };
    const router = await mount('/p#faq-rate', () => (
      <PageNavHoldContext.Provider value={hold}>
        <FaqLink item={ITEMS[0]!}>How it works</FaqLink>
        <Faq faq={{ items: ITEMS }} />
      </PageNavHoldContext.Provider>
    ));
    await settle();
    const before = entry(router);
    hidden = true;
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'How it works' })));
    await settle();
    expect(entry(router)).toBe(before);
    hidden = false;
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'How it works' })));
    await settle();
    expect(entry(router)).not.toBe(before);
  });

  it('lands once per entry: a later render does not pull focus back', async () => {
    await mount('/p#faq-rate', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(document.activeElement).toBe(question('rate'));
    question('eligible').focus();
    await act(async () => fireEvent.click(question('eligible')));
    await settle();
    expect(document.activeElement).toBe(question('eligible'));
    expect(scrolls).toHaveLength(1);
  });

  it('the landed mark lives on the entry itself: after 100 landed entries, Back to the first lands nowhere again', async () => {
    const router = await mount('/p?n=0#faq-rate', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(scrolls).toHaveLength(1);
    for (let i = 1; i < 100; i++) {
      await act(async () => {
        await router.navigate({ href: `/p?n=${i}#faq-rate` } as never);
      });
    }
    expect(scrolls).toHaveLength(100);
    question('eligible').focus();
    await act(async () => router.history.go(-99));
    await settle();
    expect(scrolls).toHaveLength(100);
    expect(document.activeElement).toBe(question('eligible'));
  });

  it('in a browser history the mark is written into the browser entry without telling the router (no reload, no scroll restore over the landing)', async () => {
    window.history.replaceState(null, '', '/p#faq-rate');
    const writes = vi.spyOn(History.prototype, 'replaceState');
    const history = createBrowserHistory();
    const told = vi.fn();
    try {
      const router = createRouter({
        routeTree: createRootRoute({
          component: () => (
            <Bridge>
              <div id="hub-main">
                <Faq faq={{ items: ITEMS }} />
              </div>
            </Bridge>
          ),
        }),
        history,
      });
      await act(async () => {
        render(<RouterProvider router={router} />);
        await router.load();
      });
      await settle();
      history.subscribe(told);
      expect(scrolls).toHaveLength(1);
      expect(window.history.state.faqLanded).toEqual(['faq-rate']);
      // Written by the prototype's replaceState (the router's wrapper would tell the router), merged with the entry's own state.
      // (The router's own writes pass its state object itself; ours is a merged copy.)
      const ours = writes.mock.calls.filter(([st]) => (st as { faqLanded?: string[] } | null)?.faqLanded && st !== router.history.location.state);
      expect(ours).toHaveLength(1);
      expect(ours[0]?.[0]).toMatchObject({ faqLanded: ['faq-rate'], __TSR_key: window.history.state.__TSR_key });
      expect(window.history.state.__TSR_key).toBe((router.history.location.state as { __TSR_key?: string }).__TSR_key);
      // A section drawn again on that entry finds the mark in the browser's own state.
      await act(async () => fireEvent.click(question('eligible')));
      await settle();
      expect(scrolls).toHaveLength(1);
      expect(told).not.toHaveBeenCalled();
    } finally {
      history.destroy();
      writes.mockRestore();
    }
  });

  it('a mount of the section on an entry that has landed lands nowhere again (the mark is in the entry, not in the section)', async () => {
    const router = await mount('/p#faq-rate', () => (
      <>
        <Toggle />
      </>
    ));
    await settle();
    expect(scrolls).toHaveLength(1);
    expect((router.history.location.state as { faqLanded?: string[] }).faqLanded).toEqual(['faq-rate']);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'toggle faq' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'toggle faq' })));
    await settle();
    expect(scrolls).toHaveLength(1);
  });

  it('an unknown id does nothing and leaves the URL; so does a page whose state shows no FAQ', async () => {
    const router = await mount('/p#faq-nope', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(router.state.location.hash).toBe('faq-nope');
    expect(ITEMS.every((i) => question(i.id).getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(scrolls).toHaveLength(0);
    expect(document.activeElement).not.toBe(question('rate'));
  });

  it('a hash that is not a FAQ one is left alone', async () => {
    await mount('/p#connect', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(scrolls).toHaveLength(0);
    expect(ITEMS.every((i) => question(i.id).getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('only the faq- prefix names a question: a hash that merely ends in an item id lands nowhere', async () => {
    await mount('/p#xxxxrate', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(scrolls).toHaveLength(0);
    expect(ITEMS.every((i) => question(i.id).getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('#faq names the section: scrolled to and its title focused', async () => {
    await mount('/p#faq', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Questions' }));
    expect(scrolls).toHaveLength(1);
  });

  it('data that arrives later lands then: the item mounts after the location is already there', async () => {
    let show: (v: boolean) => void = () => undefined;
    function Late() {
      const [ready, setReady] = useState(false);
      show = setReady;
      return ready ? <Faq faq={{ items: ITEMS }} /> : <p>loading</p>;
    }
    await mount('/p#faq-hold', () => <Late />);
    await settle();
    expect(scrolls).toHaveLength(0);
    await act(async () => show(true));
    await settle();
    expect(question('hold')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('hold'));
  });

  it('an item that is added to a mounted FAQ lands when it appears', async () => {
    let grow: (v: number) => void = () => undefined;
    function Growing() {
      const [n, setN] = useState(1);
      grow = setN;
      return <Faq faq={{ items: ITEMS.slice(0, n) }} />;
    }
    await mount('/p#faq-hold', () => <Growing />);
    await settle();
    expect(scrolls).toHaveLength(0);
    await act(async () => grow(3));
    await settle();
    expect(document.activeElement).toBe(question('hold'));
  });
});

describe('Faq landing waits for a reachable target', () => {
  // The FAQ mounts while a modal is already open (data arriving behind it): the page is hidden from the person.
  let reveal: (v: boolean) => void = () => undefined;
  function Behind() {
    const [open, setOpen] = useState(true);
    const [ready, setReady] = useState(false);
    reveal = setReady;
    return (
      <>
        {ready && <Faq faq={{ items: ITEMS }} />}
        <ConfirmDialog isOpen={open} onOpenChange={setOpen} title="Leave?" confirmLabel="Leave" onConfirm={() => setOpen(false)} body="Are you sure?" />
      </>
    );
  }

  it('behind an open modal it does not land; after the modal closes and the kit says so, it lands and focus is on the question', async () => {
    await mount('/p#faq-rate', () => <Behind />);
    await settle(40);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => reveal(true));
    await settle(40);
    // The page is hidden from the person under the modal: nothing opened, nothing scrolled, focus stays in the dialog.
    expect(document.getElementById('faq-rate')).not.toBeNull();
    expect(scrolls).toHaveLength(0);
    expect(document.getElementById('faq-rate')!.querySelector('button')).toHaveAttribute('aria-expanded', 'false');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await settle(400);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // No FAQ render happened since: only the overlay's close notice (after its exit) can bring the landing back.
    await act(async () => notifyOverlayClosed());
    await settle(40);
    expect(question('rate')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('rate'));
    expect(scrolls).toHaveLength(1);
  });

  it('the retry after an overlay closed waits two frames and a task: the overlay\'s own focus restore comes first', async () => {
    fakeObservers();
    function Pane() {
      return (
        <div data-testid="pane" style={{ display: 'none' }}>
          <Faq faq={{ items: ITEMS }} />
        </div>
      );
    }
    await mount('/p#faq-rate', () => <Pane />);
    await settle();
    expect(scrolls).toHaveLength(0);
    // Shown with no render and no observer callback: only the notice can bring the landing back.
    screen.getByTestId('pane').style.display = 'block';
    notifyOverlayClosed();
    expect(scrolls).toHaveLength(0);
    await settle(40);
    expect(scrolls).toHaveLength(1);
    expect(document.activeElement).toBe(question('rate'));
  });

  it.each(['faq-rate', 'faq'])('while a kit modal is still mounted (its exit, with the page already unhidden) no observer callback lands on #%s; its close notice does', async (hash) => {
    const obs = fakeObservers();
    let close: () => void = () => undefined;
    // What the modal leaves for the exit: it is mounted, but React Aria has already lifted the page's hiding.
    function Exiting() {
      const [shown, setShown] = useState(true);
      close = () => setShown(false);
      return shown ? <OverlayClosedNotice /> : null;
    }
    await mount(`/p#${hash}`, () => (
      <>
        <Exiting />
        <Faq faq={{ items: ITEMS }} />
      </>
    ));
    await settle(40);
    await obs.fire();
    await settle(40);
    // The overlay's focus scope still owns focus and would take it back: nothing opened, scrolled or focused, and not recorded.
    const landedOn = () => (hash === 'faq' ? document.querySelector('[data-faq-title]') : question('rate'));
    expect(scrolls).toHaveLength(0);
    expect(document.activeElement).not.toBe(landedOn());
    // The modal has just unmounted, its focus restore a frame away: an observer callback in that window lands nothing either.
    await act(async () => close());
    await obs.fire();
    expect(scrolls).toHaveLength(0);
    expect(document.activeElement).not.toBe(landedOn());
    await settle(40);
    expect(document.activeElement).toBe(landedOn());
    expect(scrolls).toHaveLength(1);
  });

  it('a FAQ drawn while a closed modal is still settling lands when the window ends: the notice came before it subscribed', async () => {
    let show: () => void = () => undefined;
    let close: () => void = () => undefined;
    function Page() {
      const [modal, setModal] = useState(true);
      const [faq, setFaq] = useState(false);
      close = () => setModal(false);
      show = () => setFaq(true);
      return (
        <>
          {modal && <OverlayClosedNotice />}
          {faq && <Faq faq={{ items: ITEMS }} />}
        </>
      );
    }
    await mount('/p#faq-rate', () => <Page />);
    await act(async () => close());
    await act(async () => show());
    expect(scrolls).toHaveLength(0);
    await settle(60);
    expect(question('rate')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('rate'));
    expect(scrolls).toHaveLength(1);
  });

  it('a FAQ inside a modal waits like everything else while any modal is busy: landing is for the page, an overlay reads it through a peek', async () => {
    await mount('/p#faq-rate', () => (
      <div role="dialog" aria-label="Help">
        <OverlayClosedNotice />
        <Faq faq={{ items: ITEMS }} />
      </div>
    ));
    await settle(40);
    expect(scrolls).toHaveLength(0);
    expect(question('rate')).toHaveAttribute('aria-expanded', 'false');
  });

  it('a hash naming a FAQ inside an open modal leaves nothing pending when the modal closes with it: idle again, and a section drawn later on that entry lands', async () => {
    let closeWith: () => void = () => undefined;
    function Page() {
      const [modal, setModal] = useState(true);
      closeWith = () => setModal(false);
      return modal ? (
        <div role="dialog" aria-label="Help">
          <OverlayClosedNotice />
          <Faq faq={{ items: ITEMS }} />
        </div>
      ) : (
        <Faq faq={{ items: ITEMS }} />
      );
    }
    await mount('/p#faq-rate', () => <Page />);
    await settle(40);
    expect(scrolls).toHaveLength(0);
    // The modal and the FAQ in it go together: its observers, notice and idle waiters go with the section, and the counters balance.
    await act(async () => closeWith());
    await settle(80);
    expect(overlaysBusy()).toBe(false);
    expect(question('rate')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(question('rate'));
    expect(scrolls).toHaveLength(1);
  });

  it('a list pane hidden by CSS alone (a narrow-to-wide change fires no render) lands when the observers see it shown', async () => {
    const obs = fakeObservers();
    function Pane() {
      return (
        <div data-testid="pane" style={{ display: 'none' }}>
          <Faq faq={{ items: ITEMS }} titleLevel={3} />
        </div>
      );
    }
    await mount('/p#faq-hold', () => <Pane />);
    await settle();
    expect(scrolls).toHaveLength(0);
    expect(obs.count()).toBeGreaterThan(0);
    // It never reveals the pane itself.
    expect(screen.getByTestId('pane').style.display).toBe('none');
    screen.getByTestId('pane').style.display = 'block';
    await obs.fire();
    await settle();
    expect(document.activeElement).toBe(question('hold'));
    expect(scrolls).toHaveLength(1);
  });

  it('a hidden attribute or an inert ancestor makes it wait the same way', async () => {
    function Wrapped() {
      return (
        <div data-testid="w" hidden>
          <Faq faq={{ items: ITEMS }} />
        </div>
      );
    }
    const obs = fakeObservers();
    await mount('/p#faq-hold', () => <Wrapped />);
    await settle();
    expect(scrolls).toHaveLength(0);
    screen.getByTestId('w').hidden = false;
    await obs.fire();
    await settle();
    expect(document.activeElement).toBe(question('hold'));
  });

  it('is recorded as landed only when the trigger has focus: a refused focus retries on the next expand commit', async () => {
    const real = HTMLElement.prototype.focus;
    let refuse = true;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, o?: FocusOptions) {
      if (refuse && this.getAttribute('aria-expanded') !== null && this.closest('#faq-rate')) return;
      real.call(this, o);
    });
    await mount('/p#faq-rate', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    expect(document.activeElement).not.toBe(question('rate'));
    expect(scrolls).toHaveLength(1);
    refuse = false;
    await act(async () => fireEvent.click(question('eligible')));
    await settle();
    expect(document.activeElement).toBe(question('rate'));
    // Scrolled and marked once, however often it retried.
    expect(scrolls).toHaveLength(1);
  });

  it('cleans every observer and listener up on unmount', async () => {
    const obs = fakeObservers();
    function Pane() {
      return (
        <div style={{ display: 'none' }}>
          <Faq faq={{ items: ITEMS }} />
        </div>
      );
    }
    await mount('/p#faq-hold', () => <Pane />);
    await settle();
    expect(obs.count()).toBeGreaterThan(0);
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    expect(obs.count()).toBe(0);
    // A close notice after the unmount lands on nothing.
    await act(async () => notifyOverlayClosed());
    await settle();
    expect(scrolls).toHaveLength(0);
  });
});

describe('the here mark after its section is gone', () => {
  it('unmounting the section ends the mark (and its timer) at once', async () => {
    await mount('/p#faq-hold', () => <Toggle />);
    await settle();
    const hold = document.getElementById('faq-hold')!;
    expect(hold).toHaveAttribute('data-hub-here');
    fireEvent.click(screen.getByRole('button', { name: 'toggle faq' }));
    expect(document.getElementById('faq-hold')).toBeNull();
    expect(hold).not.toHaveAttribute('data-hub-here');
  });

  it('a mark whose timer fires after the window is gone (a torn-down test environment) ends without throwing', async () => {
    await mount('/p#faq-hold', () => <Faq faq={{ items: ITEMS }} />);
    await settle();
    const hold = document.getElementById('faq-hold')!;
    expect(hold).toHaveAttribute('data-hub-here');
    vi.stubGlobal('window', undefined);
    try {
      // The mark's own timer ends it: waiting for the attribute to go is waiting for that timer.
      await vi.waitFor(() => expect(hold).not.toHaveAttribute('data-hub-here'), { timeout: 3000, interval: 50 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
