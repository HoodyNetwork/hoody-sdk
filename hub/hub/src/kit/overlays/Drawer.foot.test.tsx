// Vitest: the Drawer footer's reason line (visible, at the footer's start, an Outcome
// takes its place) and primaryOnPhone (the sticky footer mirrors a guided setup's primary only under 600 px of body,
// and marks the body so the step hides its own; `primary` wins).
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../controls/Button';
import { Drawer } from './Overlays';

function phoneViewport(phone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({ matches: phone && q.includes('width < 600px'), media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const footer = () => document.querySelector('footer') as HTMLElement | null;

describe('Drawer reason line', () => {
  it('shows the reason at the footer start, before Cancel and the primary', () => {
    render(
      <Drawer resizeKey="t-reason" isOpen onOpenChange={() => undefined} title="Add a key" reason="Paste a key first." primary={<Button variant="primary" isDisabled>Add key</Button>}>
        body
      </Drawer>,
    );
    const foot = footer() as HTMLElement;
    const reason = within(foot).getByText('Paste a key first.');
    expect(reason).toHaveAttribute('data-drawer-reason');
    const add = within(foot).getByRole('button', { name: 'Add key' });
    expect(reason.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a reason alone makes a footer (with Cancel)', () => {
    render(
      <Drawer resizeKey="t-reason2" isOpen onOpenChange={() => undefined} title="Connect" reason="Nothing to do yet.">
        body
      </Drawer>,
    );
    expect(within(footer() as HTMLElement).getByText('Nothing to do yet.')).toBeInTheDocument();
    expect(within(footer() as HTMLElement).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('an outcome takes the reason line\'s place', () => {
    render(
      <Drawer resizeKey="t-reason3" isOpen onOpenChange={() => undefined} title="Add a key" reason="Paste a key first." outcome={<span>Saved</span>}>
        body
      </Drawer>,
    );
    expect(screen.queryByText('Paste a key first.')).toBeNull();
    expect(within(footer() as HTMLElement).getByText('Saved')).toBeInTheDocument();
  });
});

describe('Drawer reason under an outcome that draws nothing', () => {
  it('outcome={saved && <p/>} while not saved keeps the reason line', () => {
    render(
      <Drawer resizeKey="t-out" isOpen onOpenChange={() => undefined} title="Connect" reason="Connect checks the token once." outcome={false} primary={<Button variant="primary">Connect</Button>}>
        <div>step</div>
      </Drawer>,
    );
    expect(screen.getByText('Connect checks the token once.')).toBeInTheDocument();
  });
});

describe('Drawer primaryOnPhone', () => {
  const setup = (extra: Record<string, unknown> = {}) =>
    render(
      <Drawer resizeKey="t-pop" isOpen onOpenChange={() => undefined} title="Connect Telegram" primaryOnPhone={<Button variant="primary">Connect</Button>} {...extra}>
        <div>step</div>
      </Drawer>,
    );

  it('on a wide drawer the footer does not carry it and the body is not marked', () => {
    phoneViewport(false);
    setup();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(document.querySelector('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary');
    expect(footer()).toBeNull();
  });

  it('under 600 px the sticky footer mirrors it and the body is marked for the step', () => {
    phoneViewport(true);
    setup();
    expect(within(footer() as HTMLElement).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(document.querySelector('[data-drawer-body]')).toHaveAttribute('data-foot-primary', '');
  });

  it('a primary wins over primaryOnPhone: nothing is mirrored, the body is not marked', () => {
    phoneViewport(true);
    setup({ primary: <Button variant="primary">Save</Button> });
    const foot = footer() as HTMLElement;
    expect(within(foot).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(within(foot).queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(document.querySelector('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary');
  });

  it('a custom footer wins: nothing is mirrored and the body is never marked, so the step keeps its own primary', () => {
    phoneViewport(true);
    setup({ footer: <span>custom foot</span> });
    const foot = footer() as HTMLElement;
    expect(within(foot).getByText('custom foot')).toBeInTheDocument();
    expect(within(foot).queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(document.querySelector('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary');
  });

  it('when it mirrors on a wide screen (a drawer drawn narrow) the footer takes the phone layout too', () => {
    phoneViewport(false);
    const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(520);
    setup({ reason: 'Connect checks the token once.' });
    expect(document.querySelector('[data-drawer-body]')).toHaveAttribute('data-foot-primary', '');
    expect(within(footer() as HTMLElement).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(document.querySelector('[data-foot-primary]')?.closest('[data-narrow]')).not.toBeNull();
    cw.mockRestore();
  });

  it('a primaryOnPhone that draws nothing (false while not ready) mirrors nothing and never marks the body', () => {
    phoneViewport(true);
    setup({ primaryOnPhone: false });
    expect(document.querySelector('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary');
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('an empty list (no actions mapped) or a list of nothing mirrors nothing and never marks the body', () => {
    phoneViewport(true);
    for (const none of [[], [false, null], <>{false}</>, <>{[]}</>]) {
      const { unmount } = setup({ primaryOnPhone: none });
      expect(document.querySelector('[data-drawer-body]')).not.toHaveAttribute('data-foot-primary');
      unmount();
    }
  });
});
