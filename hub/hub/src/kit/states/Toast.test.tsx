import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from '../icons';
import { Toaster, closeToast, showToast } from './Toast';

const open: string[] = [];
const show = (...args: Parameters<typeof showToast>) => {
  const key = showToast(...args);
  open.push(key);
  return key;
};
afterEach(() => {
  for (const k of open.splice(0)) act(() => closeToast(k));
});

const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('Toast: a sticky Check again (C9)', () => {
  it('stays open while the read-back runs and closes once it answers', async () => {
    let answer: (v: boolean) => void = () => undefined;
    render(<Toaster />);
    act(() => {
      show({ tone: 'unknown', title: 'This may have gone through', action: { label: 'Check again', onAction: () => new Promise<boolean>((r) => (answer = r)) } });
    });
    await press('Check again');
    expect(screen.getByText('This may have gone through')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toHaveAttribute('data-pending', 'true');
    await act(async () => answer(true));
    expect(screen.queryByText('This may have gone through')).toBeNull();
  });

  it('a read-back that fails (offline) keeps the toast, says the check got no answer, and can run again', async () => {
    let calls = 0;
    render(<Toaster />);
    act(() => {
      show({
        tone: 'unknown',
        title: 'This may have gone through',
        action: {
          label: 'Check again',
          onAction: () => {
            calls += 1;
            return Promise.reject(new Error('offline'));
          },
        },
      });
    });
    await press('Check again');
    expect(screen.getByText('This may have gone through')).toBeInTheDocument();
    expect(screen.getByText("Couldn't check: no answer. Try again when you're back online.")).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Check again' });
    expect(btn).not.toHaveAttribute('data-pending', 'true');
    await press('Check again');
    expect(calls).toBe(2);
  });

  it.each([
    ['false (the read could not prove it)', false, true],
    ['nothing (no proof either way)', undefined, false],
  ])('a read-back that resolves %s keeps the toast and its Check again ready', async (_, value, saysNoAnswer) => {
    let calls = 0;
    render(<Toaster />);
    act(() => {
      show({
        tone: 'unknown',
        title: 'This may have gone through',
        action: {
          label: 'Check again',
          onAction: () => {
            calls += 1;
            return Promise.resolve(value);
          },
        },
      });
    });
    await press('Check again');
    expect(screen.getByText('This may have gone through')).toBeInTheDocument();
    const line = screen.queryByText("Couldn't check: no answer. Try again when you're back online.");
    if (saysNoAnswer) expect(line).toBeInTheDocument();
    else expect(line).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).not.toHaveAttribute('data-pending', 'true');
    await press('Check again');
    expect(calls).toBe(2);
  });

  it.each([
    ['nothing', undefined, false],
    ['false', false, true],
  ])('a Check again that returns %s at once (no promise) keeps the unknown toast', async (_, value, saysNoAnswer) => {
    render(<Toaster />);
    act(() => {
      show({ tone: 'unknown', title: 'This may have gone through', action: { label: 'Check again', onAction: () => value } });
    });
    await press('Check again');
    expect(screen.getByText('This may have gone through')).toBeInTheDocument();
    const line = screen.queryByText("Couldn't check: no answer. Try again when you're back online.");
    if (saysNoAnswer) expect(line).toBeInTheDocument();
    else expect(line).toBeNull();
  });

  it('a Check again that returns true at once closes the unknown toast', async () => {
    render(<Toaster />);
    act(() => {
      show({ tone: 'unknown', title: 'This may have gone through', action: { label: 'Check again', onAction: () => true } });
    });
    await press('Check again');
    expect(screen.queryByText('This may have gone through')).toBeNull();
  });

  it('a non-check toast whose action resolves closes once it answers', async () => {
    render(<Toaster />);
    act(() => {
      show({ title: 'Removed', action: { label: 'Undo', onAction: () => Promise.resolve() } });
    });
    await press('Undo');
    expect(screen.queryByText('Removed')).toBeNull();
  });

  it('an action that returns nothing (Undo) still closes the toast at once', async () => {
    let undone = false;
    render(<Toaster />);
    act(() => {
      show({ title: 'Removed', action: { label: 'Undo', onAction: () => void (undone = true) } });
    });
    await press('Undo');
    expect(undone).toBe(true);
    expect(screen.queryByText('Removed')).toBeNull();
  });
});

describe('Toast: placement and marks', () => {
  it('on phone widths the region sits above the bottom bar, safe area included', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'Toast.module.css'), 'utf8');
    const block = /@media \(width < 768px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    const region = /\.region\s*\{([^}]*)\}/.exec(block)?.[1] ?? '';
    expect(region).toMatch(/inset-block-end:\s*calc\(var\(--bottom-nav-h\)\s*\+\s*var\(--safe-bottom\)/);
  });

  it('an unknown ("may have gone through") toast shows the pending clock, not a warning', () => {
    const clock = render(<Icon name="clock" />).container.innerHTML;
    render(<Toaster />);
    act(() => {
      show({ tone: 'unknown', title: 'This may have gone through' });
    });
    const toast = screen.getByText('This may have gone through').closest('[data-outcome]');
    expect(toast?.querySelector('svg')?.innerHTML).toBe(new DOMParser().parseFromString(clock, 'text/html').querySelector('svg')?.innerHTML);
  });
});
