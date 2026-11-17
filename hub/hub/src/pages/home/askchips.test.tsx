// Vitest: Home's Ask starter chips are this set, in this order, each one filling the box (never sending)
// with the cursor at the end; the Bots chip is open: it starts the sentence and leaves the rest to the person.
import { act, render, renderHook, screen, userEvent, waitFor } from '@app/testing';
import { setAskForFixtures, useAskDock } from '@kit/ask';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetActionHolds } from './data';
import { AskStrip } from './parts/AskStrip';
import strings from './strings.en.json';

const dock = () => renderHook(() => useAskDock()).result.current;
const box = () => screen.getByRole('textbox', { name: /atlas/ }) as HTMLInputElement;

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
  { const d = dock(); act(() => d.close()); }
});
afterEach(() => {
  { const d = dock(); act(() => d.close()); }
  setAskForFixtures(false);
});

describe('Home Ask starter chips', () => {
  it('shows this set, in this order', () => {
    render(<AskStrip name="atlas" />);
    const list = screen.getByRole('list', { name: strings['ask.chips'] });
    const names = Array.from(list.querySelectorAll('button')).map((b) => b.textContent);
    expect(names).toEqual([
      'Install the popular coding agents',
      'Keep my app running after restarts',
      'What is running on atlas?',
      'Back up my files daily',
      'Create a bot that…',
    ]);
    expect(names).not.toContain('Build me a website');
  });

  it.each([
    ['Install the popular coding agents', 'Install the popular coding agents'],
    ['Keep my app running after restarts', 'Keep my app running after restarts'],
    ['What is running on atlas?', 'What is running on atlas?'],
    ['Back up my files daily', 'Back up my files daily'],
    ['Create a bot that…', 'Create a bot that '],
  ])('the chip "%s" fills the box with %j, the cursor at the end, and sends nothing', async (label, fill) => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(box().value).toBe(fill);
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box().selectionStart).toBe(fill.length);
    expect(box().selectionEnd).toBe(fill.length);
    expect(dock().isOpen).toBe(false);
  });

  it.each([['an empty name', ''], ['a blank name', '   '], ['no name at all', undefined]])(
    'with %s the computer chip is left out, never shown with a raw {{name}}',
    (_what, name) => {
      render(<AskStrip name={name as string} />);
      const list = screen.getByRole('list', { name: strings['ask.chips'] });
      expect(Array.from(list.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
        'Install the popular coding agents',
        'Keep my app running after restarts',
        'Back up my files daily',
        'Create a bot that…',
      ]);
      expect(list.textContent).not.toMatch(/\{\{|running on/);
    },
  );

  it.each([['an empty name', ''], ['a blank name', '   '], ['no name at all', undefined]])(
    'with %s the box itself names no computer (never "Ask  to…" or a raw {{name}})',
    (_what, name) => {
      render(<AskStrip name={name as string} />);
      const field = screen.getByRole('textbox', { name: 'Ask your computer to do something' }) as HTMLInputElement;
      expect(field.placeholder).toBe('Ask your computer to…');
    },
  );
  it('with a name the box names it', () => {
    render(<AskStrip name="atlas" />);
    expect(box().placeholder).toBe('Ask atlas to…');
    expect(screen.getByRole('textbox', { name: 'Ask atlas to do something' })).toBe(box());
  });

  it('a chip pressed just before the strip goes away does nothing once it is gone', async () => {
    let later: FrameRequestCallback | undefined;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { later = cb; return 1; });
    try {
      const { unmount } = render(<AskStrip name="atlas" />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Back up my files daily' }));
      expect(later).toBeDefined();
      unmount();
      expect(() => later?.(0)).not.toThrow();
      expect(dock().isOpen).toBe(false);
    } finally {
      raf.mockRestore();
    }
  });

  it('the Bots chip starts the sentence and leaves the cursor after it', async () => {
    render(<AskStrip name="atlas" />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Create a bot that…' }));
    expect(box().value).toBe('Create a bot that ');
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box().selectionStart).toBe('Create a bot that '.length);
    await u.keyboard('answers my support mail');
    expect(box().value).toBe('Create a bot that answers my support mail');
    expect(dock().isOpen).toBe(false);
  });
});

