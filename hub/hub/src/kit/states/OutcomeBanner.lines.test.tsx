import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutcomeBanner } from './States';

// A "may have gone through" banner has one fixed shape. Title, then each fact on its own line:
// what we know, what Check again reads, what Stop tracking does. Pages pass the lines; they never join them.
describe('OutcomeBanner line props', () => {
  it('shows what we know, the Check again line and the Stop tracking line as separate lines, in that order', () => {
    render(
      <OutcomeBanner
        kind="pending"
        title="Saving the name may have gone through"
        known="The answer did not arrive. Nothing was sent again."
        checkLine="Check again: reads the name from your account."
        stopLine="Stop tracking: the Hub stops following this change. Doing it again may apply it twice."
        onCheck={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    const known = screen.getByText('The answer did not arrive. Nothing was sent again.');
    const check = screen.getByText('Check again: reads the name from your account.');
    const stop = screen.getByText('Stop tracking: the Hub stops following this change. Doing it again may apply it twice.');
    for (const el of [known, check, stop]) expect(el.textContent).not.toMatch(/Check again:.*Stop tracking:/);
    // Each line is its own body block: the block holding one line holds no other (a joined paragraph fails here).
    for (const el of [known, check, stop]) {
      const block = el.closest('[class*="outcomeBody"]');
      expect(block).not.toBeNull();
      expect(block!.textContent).toBe(el.textContent);
    }
    // The three are direct siblings in one text column, in order.
    const column = known.parentElement!;
    expect(check.parentElement).toBe(column);
    expect(stop.parentElement).toBe(column);
    const kids = Array.from(column.children);
    expect(kids.indexOf(known)).toBeLessThan(kids.indexOf(check));
    expect(kids.indexOf(check)).toBeLessThan(kids.indexOf(stop));
    expect(known).not.toBe(check);
    expect(check).not.toBe(stop);
    expect(known.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(check.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Lines replace the default pending body; the default is not shown under them.
    expect(screen.queryByText(/The server didn't confirm the result/)).toBeNull();
  });

  it('a banner given only what we know shows that line alone, without the default pending body', () => {
    render(<OutcomeBanner kind="pending" known="Known." />);
    expect(screen.getByText('Known.')).toBeInTheDocument();
    expect(screen.queryByText(/The server didn't confirm the result/)).toBeNull();
  });

  it('lines given with a body show in its place: the body is not shown', () => {
    render(<OutcomeBanner kind="pending" body="Joined old body." known="Known." stopLine="Stop line." onDismiss={() => undefined} />);
    expect(screen.queryByText(/Joined old body/)).toBeNull();
    expect(screen.getByText('Known.')).toBeInTheDocument();
    expect(screen.getByText('Stop line.')).toBeInTheDocument();
  });

  it('a promoted banner drops the lines written for its own kind', () => {
    render(<OutcomeBanner kind="failed" known="Refused: written for failed." error={{ pending: true, status: 502 }} />);
    expect(screen.queryByText('Refused: written for failed.')).toBeNull();
  });

  it('the close button and its dialog say Stop tracking', () => {
    render(<OutcomeBanner kind="pending" onCheck={() => undefined} onDismiss={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Stop tracking' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stop watching/ })).toBeNull();
  });

  it('a Check again result is its own line under the check line, in a status region; the check line stays', () => {
    const lines = (result: string | null) => (
      <OutcomeBanner kind="pending" known="Known." checkLine="Check again reads the list." result={result} stopLine="Stop line." onCheck={() => undefined} onDismiss={() => undefined} />
    );
    const { rerender } = render(lines(null));
    // Mounted empty before any result, so the first result is announced by a region that already exists.
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    rerender(lines('Not found (checked at 10:02).'));
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Not found (checked at 10:02).');
    const check = screen.getByText('Check again reads the list.');
    const stop = screen.getByText('Stop line.');
    expect(check.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.parentElement).toBe(check.parentElement);
  });

  it('a banner given no result has no status region (callers without one are unchanged)', () => {
    render(<OutcomeBanner kind="pending" known="Known." checkLine="Check line." onCheck={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a page that passes no lines keeps its body', () => {
    render(<OutcomeBanner kind="failed" body="It was refused." />);
    expect(screen.getByText('It was refused.')).toBeInTheDocument();
  });
});
