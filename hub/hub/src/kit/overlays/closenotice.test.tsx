// Every kit overlay (Dialog, Drawer, Sheet) tells `onOverlayClosed` subscribers once per close, after its exit is
// over and the inert / aria-hidden it put on the page is lifted. The FAQ landing waits on it (a modal closing with no
// further FAQ render must still end the wait).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ConfirmDialog, Dialog, Drawer, Sheet } from './Overlays';
import { onOverlayClosed, onOverlaysIdle, overlaysBusy } from './shared';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const stops: Array<() => void> = [];
afterEach(() => {
  stops.splice(0).forEach((f) => f());
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

/** What the page looked like when the notice came: is the overlay still drawn, and is the page still hidden behind it. */
interface Seen {
  dialogDrawn: boolean;
  pageInert: boolean;
  pageHidden: boolean;
}
function listen() {
  const seen: Seen[] = [];
  stops.push(
    onOverlayClosed(() => {
      seen.push({
        dialogDrawn: document.querySelector('[role="dialog"], [role="alertdialog"]') !== null,
        pageInert: document.querySelector('[data-page]')?.closest('[inert]') != null,
        pageHidden: document.querySelector('[data-page]')?.closest('[aria-hidden="true"]') != null,
      });
    }),
  );
  return seen;
}

let setOpen: (open: boolean) => void = () => {};
const NONE = () => {};

/** One overlay of each kind, opened from a page. */
const KINDS: Array<[string, (open: boolean, set: (o: boolean) => void) => ReactElement]> = [
  ['Dialog', (open, set) => <Dialog isOpen={open} onOpenChange={set} title="Rename" primaryLabel="Save"><p>Body</p></Dialog>],
  ['ConfirmDialog', (open, set) => <ConfirmDialog isOpen={open} onOpenChange={set} title="Restart" onConfirm={NONE} />],
  ['Drawer', (open, set) => <Drawer resizeKey="test-closenotice" isOpen={open} onOpenChange={set} title="Edit"><p>Body</p></Drawer>],
  ['Sheet', (open, set) => <Sheet isOpen={open} onOpenChange={set} title="Filters"><p>Body</p></Sheet>],
];

function Page({ make, start = true }: { make: (open: boolean, set: (o: boolean) => void) => ReactElement; start?: boolean }) {
  const [open, set] = useState(start);
  setOpen = set;
  return (
    <>
      <div data-page="">
        <button>Open</button>
      </div>
      {make(open, set)}
    </>
  );
}

describe.each(KINDS)('%s: the close notice', (_name, make) => {
  it('is sent once per close, after the overlay is gone and the page is no longer hidden', async () => {
    const seen = listen();
    render(<Page make={make} />);
    await tick();
    expect(screen.queryByRole(_name === 'ConfirmDialog' ? 'alertdialog' : 'dialog')).not.toBeNull();
    // open overlay: the page is hidden behind it, and nothing was announced yet
    expect(seen).toHaveLength(0);
    expect(document.querySelector('[data-page]')?.closest('[inert], [aria-hidden="true"]')).not.toBeNull();
    act(() => setOpen(false));
    await tick();
    expect(seen).toEqual([{ dialogDrawn: false, pageInert: false, pageHidden: false }]);
    // nothing more comes by itself
    await tick();
    expect(seen).toHaveLength(1);
  });

  it('is sent when the overlay closes with no further render (Escape inside it)', async () => {
    const seen = listen();
    render(<Page make={make} />);
    await tick();
    const dialog = screen.getByRole(_name === 'ConfirmDialog' ? 'alertdialog' : 'dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.keyUp(dialog, { key: 'Escape' });
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it('is sent when the page unmounts an open overlay, once', async () => {
    const seen = listen();
    const view = render(<Page make={make} />);
    await tick();
    expect(seen).toHaveLength(0);
    view.unmount();
    await tick();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.dialogDrawn).toBe(false);
  });

  it('is not sent while it is open, nor for an overlay that never opened', async () => {
    const seen = listen();
    render(<Page make={make} start={false} />);
    await tick();
    expect(seen).toHaveLength(0);
    act(() => setOpen(true));
    await tick();
    expect(seen).toHaveLength(0);
  });

  it('is sent once under StrictMode (the double run of effects is no close)', async () => {
    const seen = listen();
    render(
      <StrictMode>
        <Page make={make} />
      </StrictMode>,
    );
    await tick();
    expect(seen).toHaveLength(0);
    // The development double run of the effect leaves the overlay counted as mounted, and no settling window running.
    expect(overlaysBusy()).toBe(true);
    const idle = vi.fn();
    stops.push(onOverlaysIdle(idle));
    act(() => setOpen(false));
    await tick();
    expect(seen).toHaveLength(1);
    // Once the window after the unmount has passed the overlay is idle, and the idle waiters went exactly once.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(overlaysBusy()).toBe(false);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('two closes in sequence give two notices', async () => {
    const seen = listen();
    render(<Page make={make} />);
    await tick();
    act(() => setOpen(false));
    await tick();
    expect(seen).toHaveLength(1);
    act(() => setOpen(true));
    await tick();
    expect(seen).toHaveLength(1);
    act(() => setOpen(false));
    await tick();
    expect(seen).toHaveLength(2);
  });

  it('waits for a running exit transition, and is sent when it ends', async () => {
    // A browser: elements have getAnimations; the exiting overlay has one running animation, finished when we say.
    let finish: () => void = () => {};
    const finished = new Promise<void>((r) => (finish = r));
    // React Aria only waits for animations on the document timeline.
    const timeline = typeof DocumentTimeline === 'undefined' ? null : Object.create(DocumentTimeline.prototype);
    (Element.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations = function (this: Element) {
      return this.hasAttribute('data-exiting') ? [{ playState: 'running', finished, timeline }] : [];
    };
    const seen = listen();
    render(<Page make={make} />);
    await tick();
    act(() => setOpen(false));
    await tick();
    // still exiting: drawn, and no notice yet
    expect(document.querySelector('[data-exiting]')).not.toBeNull();
    expect(seen).toHaveLength(0);
    await act(async () => {
      finish();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
    expect(seen).toEqual([{ dialogDrawn: false, pageInert: false, pageHidden: false }]);
  });
});

describe('two different overlays closing one after the other', () => {
  it('a Dialog then a Drawer give two notices', async () => {
    const seen = listen();
    let setA: (o: boolean) => void = () => {};
    let setB: (o: boolean) => void = () => {};
    function Both() {
      const [a, sa] = useState(true);
      const [b, sb] = useState(true);
      setA = sa;
      setB = sb;
      return (
        <>
          <div data-page="" />
          <Dialog isOpen={a} onOpenChange={sa} title="One"><p>one</p></Dialog>
          <Drawer resizeKey="test-closenotice-b" isOpen={b} onOpenChange={sb} title="Two"><p>two</p></Drawer>
        </>
      );
    }
    render(<Both />);
    await tick();
    act(() => setA(false));
    await tick();
    expect(seen).toHaveLength(1);
    act(() => setB(false));
    await tick();
    expect(seen).toHaveLength(2);
  });
});

describe('subscribers', () => {
  it('a subscriber that throws does not stop the others, and unsubscribing stops one', async () => {
    const calls: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stops.push(onOverlayClosed(() => { throw new Error('boom'); }));
    stops.push(onOverlayClosed(() => calls.push('b')));
    const off = onOverlayClosed(() => calls.push('c'));
    off();
    render(<Page make={KINDS[0]![1]} />);
    await tick();
    act(() => setOpen(false));
    await tick();
    expect(calls).toEqual(['b']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
