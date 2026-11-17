// UnreachableState: the one "this computer isn't reachable right now" state.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnreachableState } from './Unreachable';

const NOW = Date.parse('2026-10-29T12:00:00Z');

describe('UnreachableState', () => {
  it('names the computer, says what may be wrong, and offers Retry', () => {
    const retry = vi.fn();
    render(<UnreachableState computer="atlas" onRetry={retry} />);
    expect(screen.getByRole('heading', { name: "atlas isn't reachable right now" })).toBeInTheDocument();
    expect(screen.getByText(/It may be off, restarting or offline\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('without a name it says "This computer"', () => {
    render(<UnreachableState onRetry={() => undefined} />);
    expect(screen.getByRole('heading', { name: "This computer isn't reachable right now" })).toBeInTheDocument();
  });

  it('says when the computer last answered only when that is known', () => {
    const { rerender } = render(<UnreachableState computer="atlas" onRetry={() => undefined} lastSeen={NOW - 5 * 60_000} now={NOW} />);
    expect(screen.getByText(/It last answered 5 minutes ago\./)).toBeInTheDocument();
    rerender(<UnreachableState computer="atlas" onRetry={() => undefined} now={NOW} />);
    expect(screen.queryByText(/last answered/)).toBeNull();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, NOW + 60_000]) {
      rerender(<UnreachableState computer="atlas" onRetry={() => undefined} lastSeen={bad} now={NOW} />);
      expect(screen.queryByText(/last answered/)).toBeNull();
    }
  });

  it('never reads as nothing here: no empty wording, a status the screen reader hears', () => {
    render(<UnreachableState computer="atlas" onRetry={() => undefined} />);
    const root = screen.getByRole('status');
    expect(root).toHaveTextContent("atlas isn't reachable right now");
    expect(root.textContent).not.toMatch(/\bno |nothing|none|empty/i);
  });

  it('Retry works from the keyboard (Enter and Space) and from touch', async () => {
    const retry = vi.fn();
    render(<UnreachableState computer="atlas" onRetry={retry} />);
    const b = screen.getByRole('button', { name: 'Try again' });
    const user = userEvent.setup();
    b.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(retry).toHaveBeenCalledTimes(2);
    await user.pointer({ keys: '[TouchA]', target: b });
    expect(retry).toHaveBeenCalledTimes(3);
  });

  it('while retrying the button is busy and refuses presses', () => {
    const retry = vi.fn();
    render(<UnreachableState computer="atlas" onRetry={retry} retrying />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).not.toHaveBeenCalled();
  });

  it("the rejection's facts are one Details press away", () => {
    render(<UnreachableState computer="atlas" onRetry={() => undefined} error={{ kind: 'unreachable', status: 0, code: 'TIMEOUT' }} />);
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });

  it('a secondary action the page supplies sits beside Retry', () => {
    render(<UnreachableState computer="atlas" onRetry={() => undefined} secondary={<a href="#/computers">Open Computers</a>} />);
    expect(screen.getByRole('link', { name: 'Open Computers' })).toBeInTheDocument();
  });

  it('compact: one line with the title and a Try again text button, no heading', () => {
    const retry = vi.fn();
    render(<UnreachableState size="compact" computer="atlas" onRetry={retry} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent("atlas isn't reachable right now");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('its words live in the kit states strings (en)', () => {
    const strings = JSON.parse(readFileSync(join(__dirname, 'strings.en.json'), 'utf8')) as Record<string, string>;
    for (const k of ['unreach.title', 'unreach.titleNamed', 'unreach.lastSeen', 'unreach.why']) expect(typeof strings[k]).toBe('string');
  });
});
