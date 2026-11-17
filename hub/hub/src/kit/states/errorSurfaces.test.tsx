import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineRoute, errorInfo, setPageResolver } from '@core';
import { Outcome, OutcomeSlot } from '../forms/Outcome';
import { FormFooter } from '../forms/more';
import { Band } from './Band';
import { ErrorDetails, errorText } from './ErrorDetails';
import { ErrorState, OutcomeBanner } from './States';
import { Toaster, closeToast, showErrorToast } from './Toast';
import kitStrings from '../strings.en.json';

const now = new Date('2026-10-24T14:00:00Z');
// Core keeps a route only when defineRoute declared it (as the keys page does), and never an API message.
defineRoute({ method: 'DELETE', path: '/projects/:id/ssh-keys/:keyId', scope: 'base' });
const rejection = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'SSH key not found',
  traceId: '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6',
  route: 'DELETE /projects/{id}/ssh-keys/{keyId}',
  data: { token: 'eyJsecret' },
};
const info = errorInfo(rejection, { page: 'keys', now });
const MAPPED_404 = 'It no longer exists, or it was moved.';

const openDetails = () => fireEvent.click(screen.getByRole('button', { name: 'Details' }));

describe('ErrorDetails', () => {
  it('shows the facts as labelled lines and never the rejection\'s data or message', () => {
    render(<ErrorDetails error={info} />);
    openDetails();
    const lines = [
      ['Result', 'Failed'],
      ['Status', '404'],
      ['Code', 'NOT_FOUND'],
      ['Trace id', '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6'],
      ['Request', 'DELETE /projects/{id}/ssh-keys/{keyId}'],
      ['Time', '2026-10-24T14:00:00.000Z'],
      ['Page', 'keys'],
    ] as const;
    for (const [label, value] of lines) {
      const dt = screen.getByText(label, { selector: 'dt' });
      expect(dt.nextElementSibling).toHaveTextContent(value);
    }
    expect([...document.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(lines.map(([l]) => l));
    expect(document.body.textContent).not.toContain('eyJsecret');
    expect(document.body.textContent).not.toContain('SSH key not found');
  });

  it('f0k7: the Page line is the registered page\'s title, linked in the Hub; an unnamed page stays its id, unlinked', () => {
    setPageResolver({ title: (id) => (id === 'keys' ? 'SSH keys' : null), href: (id) => (id === 'keys' ? '#/keys' : null) });
    try {
      const { unmount } = render(<ErrorDetails error={info} />);
      openDetails();
      const page = screen.getByText('Page', { selector: 'dt' }).nextElementSibling as HTMLElement;
      expect(page).toHaveTextContent('SSH keys');
      expect(within(page).getByRole('link', { name: 'SSH keys' })).toHaveAttribute('href', '#/keys');
      expect(errorText(info)).toContain('Page: SSH keys');
      unmount();
      render(<ErrorDetails error={errorInfo(rejection, { page: 'gone', now })} />);
      openDetails();
      const other = screen.getByText('Page', { selector: 'dt' }).nextElementSibling as HTMLElement;
      expect(other).toHaveTextContent('gone');
      expect(within(other).queryByRole('link')).toBeNull();
    } finally {
      setPageResolver(null);
    }
  });

  it('Copy details for support copies exactly the shown lines', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorDetails error={info} />);
    openDetails();
    const shown = [...document.querySelectorAll('dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`).join('\n');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy details for support' }));
    });
    expect(writeText).toHaveBeenCalledWith(shown);
    expect(shown).toBe(errorText(info));
  });

  it('says no answer arrived when there is no status, and "none" for a missing trace id', () => {
    render(<ErrorDetails error={errorInfo(new TypeError('Failed to fetch'), { page: 'keys', now })} />);
    openDetails();
    expect(screen.getByText('Status', { selector: 'dt' }).nextElementSibling).toHaveTextContent('none (no answer arrived)');
    expect(screen.getByText('Trace id', { selector: 'dt' }).nextElementSibling).toHaveTextContent('none');
  });

  it('button mode opens the same lines in a dialog', () => {
    render(<ErrorDetails error={info} mode="button" />);
    openDetails();
    const dialog = screen.getByRole('dialog', { name: 'Error details' });
    expect(within(dialog).getByText('NOT_FOUND')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy details for support' })).toBeInTheDocument();
  });
});

describe('ErrorState error=', () => {
  it('the body is the mapped sentence under the page\'s title, with Details', () => {
    render(<ErrorState title="Couldn't delete the key" error={rejection} />);
    expect(screen.getByRole('heading', { name: "Couldn't delete the key" })).toBeInTheDocument();
    expect(screen.getByText(MAPPED_404)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });
  it('a page body still wins; without error nothing changes', () => {
    const { unmount } = render(<ErrorState title="T" body="Own words" error={rejection} />);
    expect(screen.queryByText(MAPPED_404)).toBeNull();
    expect(screen.getByText('Own words')).toBeInTheDocument();
    unmount();
    render(<ErrorState title="T" />);
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });
  it('compact keeps one line and opens Details as a dialog', () => {
    render(<ErrorState size="compact" title="Couldn't load keys" error={rejection} />);
    openDetails();
    expect(screen.getByRole('dialog', { name: 'Error details' })).toBeInTheDocument();
  });
  it('f0k7: a realm 403 reads as the general 403 (core keeps no API message to tell it apart)', () => {
    render(<ErrorState title="Couldn't open it" error={{ status: 403, code: 'INSUFFICIENT_PERMISSIONS', message: 'Project is not in requested realm' }} />);
    expect(screen.getByText("You don't have permission to do this in this realm.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('requested realm');
  });
});

describe('OutcomeBanner error= and its close', () => {
  it('failed: mapped body, Details, and the close says Hide this note', () => {
    const hide = vi.fn();
    render(<OutcomeBanner kind="failed" title="Couldn't delete the key" error={rejection} onDismiss={hide} />);
    expect(screen.getByText(MAPPED_404)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    const close = screen.getByRole('button', { name: 'Hide this note' });
    // The accessible name is the visible text: no aria-label that could drift from it.
    expect(close).toHaveTextContent('Hide this note');
    expect(close).not.toHaveAttribute('aria-label');
    fireEvent.click(close);
    expect(hide).toHaveBeenCalledTimes(1);
  });
  it('pending (C9): keeps the may-have-gone-through words, never the mapped failure, and the close is Stop tracking', () => {
    render(<OutcomeBanner kind="pending" error={{ pending: true, status: 500, code: 'INTERNAL_SERVER_ERROR' }} onDismiss={() => undefined} />);
    expect(screen.queryByText('The server had a problem. Try again in a moment.')).toBeNull();
    // The kit's own pending guidance stays the body, not a sentence from the map.
    expect(screen.getByText(kitStrings['outcome.pending.body'])).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/failed/i);
    const close = screen.getByRole('button', { name: 'Stop tracking' });
    expect(close).toHaveTextContent('Stop tracking');
    expect(close).not.toHaveAttribute('aria-label');
    fireEvent.click(close);
    expect(screen.getByRole('alertdialog', { name: 'Stop tracking this?' })).toBeInTheDocument();
  });
  it('pending Details read "May have gone through", never Failed', () => {
    render(<OutcomeBanner kind="pending" error={{ pending: true, status: 504 }} />);
    openDetails();
    expect(screen.getByText('Result', { selector: 'dt' }).nextElementSibling).toHaveTextContent('May have gone through');
  });
});

describe('Outcome line, OutcomeSlot and Band error=', () => {
  it('the mapped sentence beats the page\'s raw message; Details opens a dialog that never shows it', () => {
    render(<Outcome outcome={{ kind: 'failed', message: 'SSH key not found' }} error={rejection} />);
    expect(screen.getByText(MAPPED_404)).toBeInTheDocument();
    expect(screen.queryByText('SSH key not found')).toBeNull();
    openDetails();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('NOT_FOUND')).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('SSH key not found');
  });
  it('done shows no Details', () => {
    render(<Outcome outcome="done" error={rejection} />);
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });
  it('OutcomeSlot passes it on', () => {
    render(
      <OutcomeSlot outcome="failed" error={rejection}>
        <button type="button">Delete</button>
      </OutcomeSlot>,
    );
    expect(screen.getByText(MAPPED_404)).toBeInTheDocument();
  });
  it('Band keeps the page sentence and adds Details', () => {
    render(
      <Band tone="danger" error={rejection}>
        Couldn't refresh the list
      </Band>,
    );
    expect(screen.getByText("Couldn't refresh the list")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });
});

describe('showErrorToast', () => {
  const keys: string[] = [];
  afterEach(() => {
    for (const k of keys.splice(0)) act(() => closeToast(k));
  });
  it('an error toast: the page title, the mapped line, Details', () => {
    render(<Toaster />);
    act(() => {
      keys.push(showErrorToast("Couldn't delete the key", rejection));
    });
    const toast = screen.getByText("Couldn't delete the key").closest('[data-outcome]') as HTMLElement;
    expect(toast).toHaveAttribute('data-outcome', 'failed');
    expect(within(toast).getByText(MAPPED_404)).toBeInTheDocument();
    fireEvent.click(within(toast).getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog', { name: 'Error details' })).toBeInTheDocument();
  });
  it('C9: a pending rejection becomes the unknown toast with the pending words', () => {
    render(<Toaster />);
    act(() => {
      keys.push(showErrorToast("Couldn't delete the key", { pending: true, status: 502 }));
    });
    // The page's failure title is never shown over what may have gone through.
    expect(screen.queryByText("Couldn't delete the key")).toBeNull();
    const toast = screen.getByText(kitStrings['outcome.pending.title']).closest('[data-outcome]') as HTMLElement;
    expect(toast).toHaveAttribute('data-outcome', 'pending');
    expect(within(toast).getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
  });
});

describe('the surface\'s kind wins, C9 first', () => {
  const keysOf: string[] = [];
  afterEach(() => {
    for (const k of keysOf.splice(0)) act(() => closeToast(k));
  });
  it('a page-pending banner never reads Failed, even when the rejection carries no pending flag', () => {
    render(<OutcomeBanner kind="pending" error={{ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }} />);
    openDetails();
    expect(screen.getByText('Result', { selector: 'dt' }).nextElementSibling).toHaveTextContent('May have gone through');
  });
  it('the Outcome line follows its own kind in Details too', () => {
    render(<Outcome outcome="pending" variant="block" error={{ status: 500 }} />);
    openDetails();
    expect(within(screen.getByRole('dialog')).getByText('Result', { selector: 'dt' }).nextElementSibling).toHaveTextContent('May have gone through');
  });
  it('an answered change whose answer could not be read (SCRUB_FAILED) is the unknown toast', () => {
    render(<Toaster />);
    act(() => {
      keysOf.push(showErrorToast("Couldn't save", { code: 'SCRUB_FAILED' }, { pendingTitle: 'Saving' }));
    });
    const toast = screen.getByText('Saving').closest('[data-outcome]') as HTMLElement;
    expect(toast).toHaveAttribute('data-outcome', 'pending');
  });
  it('a still-running 409 is the unknown toast; a read (change: false) is not', () => {
    render(<Toaster />);
    act(() => {
      keysOf.push(showErrorToast("Couldn't save", { status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }, { pendingTitle: 'Saving' }));
      keysOf.push(showErrorToast('Loading', { status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }, { change: false }));
    });
    expect(screen.getByText('Saving').closest('[data-outcome]')).toHaveAttribute('data-outcome', 'pending');
    expect(screen.getByText('Loading').closest('[data-outcome]')).toHaveAttribute('data-outcome', 'failed');
  });
  it('ErrorState offers no Try again for a rejection that may have gone through', () => {
    render(<ErrorState title="Couldn't save" error={{ pending: true, status: 502 }} onRetry={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
  it('stale, not sent and cancelled toasts are not shown as failures', () => {
    render(<Toaster />);
    act(() => {
      keysOf.push(showErrorToast('A', { kind: 'stale', stale: true }));
      keysOf.push(showErrorToast('B', { kind: 'not_sent', notSent: true }));
      keysOf.push(showErrorToast('C', { cancelled: true }));
    });
    for (const n of ['A', 'B', 'C']) {
      expect(screen.getByText(n)).toBeInTheDocument();
      expect(screen.getByText(n).closest('[data-outcome="failed"]')).toBeNull();
    }
  });
  it('C9: a rejection core knows may have gone through stays pending under any kind the page shows', () => {
    render(<Outcome outcome="failed" variant="block" error={{ pending: true, status: 502 }} onRetry={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
    openDetails();
    expect(within(screen.getByRole('dialog')).getByText('Result', { selector: 'dt' }).nextElementSibling).toHaveTextContent('May have gone through');
  });
  it('a done banner shows no Details', () => {
    render(<OutcomeBanner kind="done" error={rejection} />);
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });
  it('Details keep the time the error was first seen, across mounts', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const e = { status: 500 };
      vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
      const { unmount } = render(<ErrorDetails error={e} />);
      unmount();
      vi.setSystemTime(new Date('2026-10-24T11:00:00Z'));
      render(<ErrorDetails error={e} />);
      openDetails();
      expect(screen.getByText('Time', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2026-10-24T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pending facts govern the whole surface, C9', () => {
  const pendingFacts = { pending: true, status: 502 };
  const keysOf: string[] = [];
  afterEach(() => {
    for (const k of keysOf.splice(0)) act(() => closeToast(k));
  });
  it('the Outcome line under a failed kind shows the pending title, Check again and no close or Try again', () => {
    render(
      <Outcome
        outcome={{ kind: 'failed', message: 'The operation failed' }}
        title="Couldn't delete the key"
        detail="Check the name"
        variant="block"
        error={pendingFacts}
        onCheck={() => undefined}
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    const line = screen.getByText('It may have gone through. Check before you try again.').closest('[data-outcome]') as HTMLElement;
    expect(line).toHaveAttribute('data-outcome', 'pending');
    expect(line.textContent).not.toMatch(/didn.t go through|Couldn't delete|operation failed|Check the name/);
    expect(within(line).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(within(line).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(line).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
  it('OutcomeSlot hides its send actions when the facts say pending', () => {
    render(
      <OutcomeSlot outcome="failed" error={pendingFacts} toastOnLeave={false}>
        <button type="button">Delete again</button>
      </OutcomeSlot>,
    );
    expect(screen.queryByRole('button', { name: 'Delete again' })).toBeNull();
  });
  it('FormFooter offers Check again instead of Save when the facts say pending', () => {
    render(<FormFooter dirty outcome="failed" error={pendingFacts} onCheck={() => undefined} onSubmit={() => undefined} submitLabel="Save" toastOnLeave={false} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
  it('OutcomeBanner under a failed kind is the pending banner: title, Check again, Stop tracking and its warning', () => {
    render(<OutcomeBanner kind="failed" title="Couldn't delete the key" body="Gone" dismissWarned error={pendingFacts} onCheck={() => undefined} onDismiss={() => undefined} />);
    expect(screen.queryByText("Couldn't delete the key")).toBeNull();
    expect(screen.queryByText('Gone')).toBeNull();
    expect(screen.getByText(kitStrings['outcome.pending.title'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide this note' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(screen.getByRole('alertdialog', { name: 'Stop tracking this?' })).toBeInTheDocument();
  });
  it('a pending toast never carries the retry action, only the check', () => {
    render(<Toaster />);
    const retry = { label: 'Try again', onAction: vi.fn() };
    const check = { label: 'Check again', onAction: vi.fn() };
    act(() => {
      keysOf.push(showErrorToast('A', pendingFacts, { retry, pendingTitle: 'P1' }));
      keysOf.push(showErrorToast('B', { code: 'SCRUB_FAILED' }, { retry, check, pendingTitle: 'P2' }));
      keysOf.push(showErrorToast('C', rejection, { retry, check }));
    });
    const p1 = screen.getByText('P1').closest('[data-outcome]') as HTMLElement;
    expect(within(p1).queryByRole('button', { name: 'Try again' })).toBeNull();
    const p2 = screen.getByText('P2').closest('[data-outcome]') as HTMLElement;
    expect(within(p2).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(p2).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    const c = screen.getByText('C').closest('[data-outcome]') as HTMLElement;
    expect(within(c).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: 'Check again' })).toBeNull();
  });
  it('compact ErrorState and a Band without a sentence show the mapped sentence', () => {
    render(<ErrorState size="compact" title="Couldn't load keys" error={rejection} />);
    expect(screen.getByText(MAPPED_404)).toBeInTheDocument();
    render(<Band tone="danger" error={{ status: 500 }} />);
    expect(screen.getByText('The server had a problem. Try again in a moment.')).toBeInTheDocument();
  });
  it('body={null} keeps a compact ErrorState to its title', () => {
    render(<ErrorState size="compact" title="Couldn't load keys" body={null} error={rejection} />);
    expect(screen.queryByText(MAPPED_404)).toBeNull();
  });
});

describe('every surface follows pending facts, C9', () => {
  const pendingFacts = { pending: true, status: 502 };
  it('ErrorState under pending facts is the pending state: its title, no failure title, no Try again', () => {
    render(<ErrorState title="Couldn't delete the key" body="It failed" error={pendingFacts} onRetry={() => undefined} />);
    expect(screen.queryByText("Couldn't delete the key")).toBeNull();
    expect(screen.queryByText('It failed')).toBeNull();
    expect(screen.getByText(kitStrings['outcome.pending.title'])).toBeInTheDocument();
    expect(screen.getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
  it('compact ErrorState under pending facts drops the failure title, even with body={null}', () => {
    render(<ErrorState size="compact" title="Couldn't load keys" body={null} error={pendingFacts} onRetry={() => undefined} />);
    expect(screen.queryByText("Couldn't load keys")).toBeNull();
    expect(screen.getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
  it('a Band under pending facts shows the C9 sentence, only its read-back actions and no close', () => {
    render(
      <Band
        tone="danger"
        error={pendingFacts}
        actions={<button type="button">Try again</button>}
        pendingActions={<button type="button">Check again</button>}
        onDismiss={() => undefined}
      >
        The operation failed
      </Band>,
    );
    const band = screen.getByRole('alert');
    expect(band).toHaveAttribute('data-outcome', 'pending');
    expect(band.textContent).not.toMatch(/operation failed/);
    expect(within(band).getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
    expect(within(band).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(band).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(within(band).queryByRole('button', { name: 'Close' })).toBeNull();
  });
  it('an already-pending line with pending facts shows the C9 guidance, never its failure message', () => {
    render(<Outcome outcome={{ kind: 'pending', message: 'The operation failed' }} variant="block" error={pendingFacts} />);
    expect(screen.queryByText('The operation failed')).toBeNull();
    expect(screen.getByText('It may have gone through. Check before you try again.')).toBeInTheDocument();
  });
  it('B: without error=, a pending line keeps the page\'s own message', () => {
    render(<Outcome outcome={{ kind: 'pending', message: 'Check whether the key was made.' }} variant="block" />);
    expect(screen.getByText('Check whether the key was made.')).toBeInTheDocument();
  });
});

describe('ErrorState secondary under pending facts, C9', () => {
  it.each(['md', 'compact'] as const)('%s ErrorState drops its secondary (it may resend) and shows only pendingSecondary', (size) => {
    const send = vi.fn();
    render(
      <ErrorState
        size={size}
        title="Couldn't save"
        error={{ pending: true, status: 502 }}
        secondary={
          <button type="button" onClick={send}>
            Send it again
          </button>
        }
        pendingSecondary={<button type="button">Check again</button>}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Send it again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
  it('a definite failure keeps its secondary and never shows pendingSecondary', () => {
    render(<ErrorState title="Couldn't load" error={{ status: 500 }} secondary={<a href="/status">Status</a>} pendingSecondary={<button type="button">Check again</button>} />);
    expect(screen.getByRole('link', { name: 'Status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });
});
