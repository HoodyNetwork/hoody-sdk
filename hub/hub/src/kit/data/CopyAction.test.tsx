import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton, CopyField } from './Ids';

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});

const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('CopyButton variant="primary" (Referrals main link)', () => {
  it('is a labelled primary Button: the visible text is its name, no icon-only button', () => {
    render(<CopyButton variant="primary" text="https://hoody.com/r/abc" label="Copy link" />);
    const btn = screen.getByRole('button', { name: 'Copy link' });
    expect(btn).toHaveTextContent(/^Copy link$/);
    expect(btn).not.toHaveAttribute('aria-label');
    expect(btn.className).not.toMatch(/\bcopyBtn\b/);
  });

  it('copies the text; its visible label stays its name (label-in-name), its chip glyph turns into a check and the status line says it worked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CopyButton variant="primary" text="https://hoody.com/r/abc" label="Copy link" />);
      const btn = screen.getByRole('button', { name: 'Copy link' });
      const glyph = () => [...btn.querySelectorAll('svg path')].map((x) => x.getAttribute('d')).join('|');
      const before = glyph();
      await press('Copy link');
      expect(written).toEqual(['https://hoody.com/r/abc']);
      expect(btn).toHaveTextContent(/^Copy link$/);
      expect(glyph()).not.toBe(before);
      expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(glyph()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed copy shows no check, and the status line says it failed', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    render(<CopyButton variant="primary" text="x" label="Copy link" />);
    const btn = screen.getByRole('button', { name: 'Copy link' });
    const glyph = () => [...btn.querySelectorAll('svg path')].map((x) => x.getAttribute('d')).join('|');
    const before = glyph();
    await press('Copy link');
    expect(btn).toHaveTextContent(/^Copy link$/);
    expect(glyph()).toBe(before);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy");
  });

  it('getValue is read at press time here too, and isDisabled refuses the press', async () => {
    const { unmount } = render(<CopyButton variant="primary" getValue={() => 'late'} label="Copy link" />);
    await press('Copy link');
    expect(written).toEqual(['late']);
    unmount();
    render(<CopyButton variant="primary" text="x" label="Copy link" isDisabled />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeDisabled();
    await press('Copy link');
    expect(written).toEqual(['late']);
  });
});

describe('CopyField noCopy', () => {
  it('shows the value with no Copy inside the box; the page puts its one copy action beside it', () => {
    render(<CopyField label="Your link" value="https://hoody.com/r/abc" copyName="Copy the link" noCopy />);
    expect(screen.queryByRole('button', { name: 'Copy the link' })).toBeNull();
    expect(screen.getByText('Your link')).toBeInTheDocument();
  });

  it('without noCopy the box keeps its Copy', async () => {
    render(<CopyField label="Your link" value="abc" copyName="Copy the link" />);
    await press('Copy the link');
    expect(written).toEqual(['abc']);
  });
});
