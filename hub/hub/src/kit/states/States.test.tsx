import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextButton } from '../controls/Link';
import { CardScope, CardScopeReset } from '../layouts/CardEdge';
import { ListPaneContext, useListPane } from '../layouts/pane';
import { Dialog } from '../overlays/Dialog';
import { RailPane } from '../layouts/RailPane';
import { EmptyPlace, EmptyState, ErrorState, OutcomeBanner, Skeleton, Spinner } from './States';

describe('EmptyState', () => {
  it('page size: title as a heading, one sentence, the action and a hint', () => {
    render(<EmptyState title="Your computers live here" body="The first one is free." action={<button type="button">Get a computer</button>} hint="N to get one" />);
    expect(screen.getByRole('heading', { name: 'Your computers live here' })).toBeInTheDocument();
    expect(screen.getByText('The first one is free.')).toBeInTheDocument();
    expect(screen.getByText('N to get one')).toBeInTheDocument();
  });

  it('compact: one line with one action and no heading', () => {
    render(<EmptyState size="compact" title="No Bots yet" body="ignored" action={<TextButton>New Bot</TextButton>} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('ignored')).toBeNull();
    expect(screen.getByText('No Bots yet').closest('p')).toContainElement(screen.getByRole('button', { name: 'New Bot' }));
  });
});

describe('EmptyState card and place', () => {
  const box = () => document.querySelector('[data-empty-place]');
  it('the page size is the slanted card, centred unless something says otherwise', () => {
    render(<EmptyState title="No scripts yet" />);
    expect(box()?.getAttribute('data-empty-place')).toBe('center');
    expect(box()?.hasAttribute('data-card-cut')).toBe(true);
    expect(box()?.querySelector(':scope > svg[data-card-edge]')).not.toBeNull();
  });
  it('inside a list\'s place it takes the frame, and its own place wins over the nearest one', () => {
    render(
      <EmptyPlace place="frame">
        <EmptyState title="In a list" />
        <EmptyState title="Its own" place="center" />
      </EmptyPlace>,
    );
    const [a, b] = [...document.querySelectorAll('[data-empty-place]')];
    expect(a?.getAttribute('data-empty-place')).toBe('frame');
    expect(b?.getAttribute('data-empty-place')).toBe('center');
  });
  it('the small size is plain in a panel, and a card where it takes a list\'s frame', () => {
    const { unmount } = render(<EmptyState title="Nothing here" size="sm" />);
    expect(box()).toBeNull();
    expect(document.querySelector('[data-card-edge]')).toBeNull();
    unmount();
    render(<EmptyState title="Nothing here" size="sm" place="frame" />);
    expect(box()?.getAttribute('data-empty-place')).toBe('frame');
    expect(box()?.hasAttribute('data-card-cut')).toBe(true);
  });
  it('the one-line size never becomes a card', () => {
    render(<EmptyState title="No Bots yet" size="compact" place="frame" />);
    expect(box()).toBeNull();
  });
  it('inside a card it is never a card of its own, even in a list\'s place', () => {
    render(
      <CardScope>
        <EmptyState title="Inside" />
        <EmptyState title="Inside a frame" place="frame" />
      </CardScope>,
    );
    expect(box()).toBeNull();
    expect(document.querySelector('[data-card-cut]')).toBeNull();
    expect(document.querySelector('[data-card-edge]')).toBeNull();
    expect(screen.getByText('Inside')).toBeTruthy();
  });
  it('in a rail, an empty state with no size is the small plain look, even in its list\'s frame; an explicit md is still a card', () => {
    render(
      <RailPane label="Chats">
        <EmptyState title="No chats" />
        <EmptyPlace place="frame">
          <EmptyState title="No chats in the list" />
        </EmptyPlace>
        <EmptyState title="Asked for md" size="md" />
      </RailPane>,
    );
    const boxes = [...document.querySelectorAll('[data-empty-place]')];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toContainElement(screen.getByText('Asked for md'));
    for (const t of ['No chats', 'No chats in the list']) {
      const el = screen.getByText(t).parentElement!;
      expect(el.className, t).toMatch(/\bsm\b|_sm_/);
      expect(el.className, t).not.toMatch(/\bmd\b|_md_/);
    }
  });
  it('outside a rail nothing changes: no size is the md card', () => {
    render(<EmptyState title="Page" />);
    expect(screen.getByText('Page').parentElement!.className).toMatch(/\bmd\b|_md_/);
    expect(box()?.getAttribute('data-empty-place')).toBe('center');
  });
  it('an overlay is a new surface: no list frame, list pane or rail look reaches into it', () => {
    function Pane() {
      return <span data-testid="pane">{JSON.stringify(useListPane())}</span>;
    }
    render(
      <RailPane label="Chats">
        <ListPaneContext.Provider value={{ list: true, rail: true }}>
          <EmptyPlace place="frame">
            <CardScopeReset>
              <EmptyState title="In the overlay" />
              <Pane />
            </CardScopeReset>
          </EmptyPlace>
        </ListPaneContext.Provider>
      </RailPane>,
    );
    const el = screen.getByText('In the overlay').parentElement!;
    expect(el.className).toMatch(/\bmd\b|_md_/);
    expect(el.getAttribute('data-empty-place')).toBe('center');
    expect(screen.getByTestId('pane').textContent).toBe('{}');
  });
  it('a Dialog opened from a rail\'s list frame draws its sizeless empty state as the page card at the centre', () => {
    render(
      <RailPane label="Chats">
        <EmptyPlace place="frame">
          <Dialog isOpen onOpenChange={() => undefined} title="Pick">
            <EmptyState title="Nothing to pick" />
          </Dialog>
        </EmptyPlace>
      </RailPane>,
    );
    const el = screen.getByText('Nothing to pick').parentElement!;
    expect(el.className).toMatch(/\bmd\b|_md_/);
    expect(el.getAttribute('data-empty-place')).toBe('center');
  });
});

describe('ErrorState', () => {
  it('compact: an alert line with a Try again text button', () => {
    const retry = vi.fn();
    render(<ErrorState size="compact" title="Couldn't load Bots" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load Bots");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('compact while retrying: Try again is disabled', () => {
    render(<ErrorState size="compact" onRetry={() => undefined} retrying />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('page size keeps its default wording and a secondary link', () => {
    render(<ErrorState onRetry={() => undefined} secondary={<a href="#/status">Open status</a>} />);
    expect(screen.getByRole('heading', { name: "This didn't load" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open status' })).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('announces loading once and draws the asked rows with stable widths', () => {
    const { container, rerender } = render(<Skeleton variant="table" rows={3} columns={2} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    const widths = () => [...container.querySelectorAll<HTMLElement>('[style]')].map((e) => e.style.width);
    const first = widths();
    expect(first).toHaveLength(6);
    rerender(<Skeleton variant="table" rows={3} columns={2} />);
    expect(widths()).toEqual(first);
    for (const w of first) expect(parseInt(w, 10)).toBeGreaterThanOrEqual(40);
  });

  it('widget variant draws a title and at most three lines', () => {
    const { container } = render(<Skeleton variant="widget" rows={8} />);
    expect(container.querySelectorAll('[style]')).toHaveLength(3);
  });
});

describe('Spinner', () => {
  it('draws three dots, no glyph, and announces its label', () => {
    render(<Spinner label="Loading models" />);
    const el = screen.getByRole('status', { name: 'Loading models' });
    expect(el.textContent).toBe('');
    expect(el.children).toHaveLength(3);
  });

  it('size lg is the same three dots in a larger frame; the default stays the inline size', () => {
    render(
      <>
        <Spinner label="inline" />
        <Spinner label="loader" size="lg" />
      </>,
    );
    const inline = screen.getByRole('status', { name: 'inline' });
    const big = screen.getByRole('status', { name: 'loader' });
    expect(big.children).toHaveLength(3);
    expect(big.className).toContain('spinnerLg');
    expect(inline.className).not.toContain('spinnerLg');
  });

  it('size lg is a loader, not a word-sized mark: a 64 px frame of 12 px dots, 8 px apart (read from source)', () => {
    const css = readFileSync(join(import.meta.dirname, 'Spinner.module.css'), 'utf8');
    const body = (sel: string) => new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(body('.spinnerLg')).toMatch(/gap:\s*var\(--sp-2\);/);
    expect(body('.spinnerLg')).toMatch(/width:\s*var\(--sp-10\);/);
    expect(body('.spinnerLg')).toMatch(/height:\s*var\(--sp-10\);/);
    expect(body('.spinnerLg .spinnerDot')).toMatch(/width:\s*var\(--sp-3\);/);
    expect(body('.spinnerLg .spinnerDot')).toMatch(/height:\s*var\(--sp-3\);/);
  });
});

describe('markers for hub:shots', () => {
  it('skeleton and outcome carry data markers', () => {
    const { container } = render(
      <>
        <Skeleton immediate />
        <OutcomeBanner kind="pending" />
      </>,
    );
    expect(container.querySelector('[data-skeleton]')).not.toBeNull();
    expect(container.querySelector('[data-outcome="pending"]')).not.toBeNull();
  });
});

// A page's own title is never followed by a generic default body
// that can contradict it ("Access refused" + "couldn't reach the server").
describe('default bodies are for the generic case only', () => {
  const ERROR_BODY = "The Hub couldn't reach the server. Your data is safe; try again in a moment.";

  it('ErrorState with no title keeps the generic title and body', () => {
    render(<ErrorState />);
    expect(screen.getByText(ERROR_BODY)).toBeInTheDocument();
  });

  it('ErrorState with only a title renders the title alone', () => {
    render(<ErrorState title="Access refused" />);
    expect(screen.getByRole('heading', { name: 'Access refused' })).toBeInTheDocument();
    expect(screen.queryByText(ERROR_BODY)).toBeNull();
  });

  it('body={null} drops the default even without a title', () => {
    render(<ErrorState body={null} />);
    expect(screen.queryByText(ERROR_BODY)).toBeNull();
  });

  it('OutcomeBanner stale/failed with only a title renders the title alone', () => {
    const { container } = render(<OutcomeBanner kind="stale" title="An unpaid balance stopped this" />);
    expect(container.querySelectorAll('[data-outcome] span').length).toBe(0);
    expect(screen.getByText('An unpaid balance stopped this')).toBeInTheDocument();
  });

  it('OutcomeBanner pending keeps its C9 guidance (never send it again) under a page title; body={null} drops it', () => {
    const { unmount } = render(<OutcomeBanner kind="pending" title="Stopping htop may have gone through" />);
    expect(screen.getByText(/Don't send it again/)).toBeInTheDocument();
    unmount();
    render(<OutcomeBanner kind="pending" title="Stopping htop may have gone through" body={null} />);
    expect(screen.queryByText(/Don't send it again/)).toBeNull();
  });
});

describe('OutcomeBanner: a pending Dismiss warns first', () => {
  it('pending: the close asks "Stop tracking this?"; Cancel keeps it, confirming calls onDismiss once', async () => {
    const onDismiss = vi.fn();
    render(<OutcomeBanner kind="pending" onCheck={() => undefined} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('Stop tracking only if you know it did not go through');
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop tracking anyway' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('done and failed close at once, with no dialog', () => {
    const done = vi.fn();
    const failed = vi.fn();
    render(
      <>
        <OutcomeBanner kind="done" onDismiss={done} />
        <OutcomeBanner kind="failed" onDismiss={failed} />
      </>,
    );
    for (const b of screen.getAllByRole('button', { name: 'Hide this note' })) fireEvent.click(b);
    expect(done).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('dismissWarned: a page that asks first itself gets no second warning', () => {
    const onDismiss = vi.fn();
    render(<OutcomeBanner kind="pending" onDismiss={onDismiss} dismissWarned />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('OutcomeBanner: the pending Dismiss warning closes safely', () => {
  it('Escape and a click outside never confirm; focus returns to the close button', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<OutcomeBanner kind="pending" onCheck={() => undefined} onDismiss={onDismiss} />);
    const close = screen.getByRole('button', { name: 'Stop tracking' });

    await user.click(close);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveFocus());

    await user.click(close);
    await screen.findByRole('alertdialog');
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDismiss).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveFocus());
  });
});
