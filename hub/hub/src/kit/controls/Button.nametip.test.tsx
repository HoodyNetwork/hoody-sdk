// Vitest: `nameTooltip` makes a Button's tooltip its own accessible name, so a page
// adds no tooltip text (the Board's counted options button: its name "Options for X (N changed)" is the tooltip). An
// optional key hint shows in the tooltip only, never as a cap in the button. Off by default: nothing changes when unset.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

const NAME = 'Options for terminal-1 (2 changed)';

async function focusIt(name: string) {
  const b = screen.getByRole('button', { name });
  while (document.activeElement !== b) await userEvent.tab();
  return b;
}

describe('Button nameTooltip', () => {
  it('shows the accessible name as the tooltip on focus', async () => {
    render(<Button icon="sliders" variant="ghost" aria-label={NAME} nameTooltip>2</Button>);
    await focusIt(NAME);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe(NAME);
  });

  it('a key hint shows in the tooltip only: no cap inside the button, its keys on the element', async () => {
    render(<Button icon="sliders" variant="ghost" aria-label={NAME} aria-keyshortcuts="O" nameTooltip={{ shortcut: 'O' }}>2</Button>);
    const b = await focusIt(NAME);
    const tip = await screen.findByRole('tooltip');
    expect(tip.querySelector('kbd')?.textContent).toBe('O');
    expect(b.querySelector('kbd')).toBeNull();
    expect(b.textContent).toBe('2');
    expect(b.getAttribute('aria-keyshortcuts')).toBe('O');
  });

  it('unset: the bare button (no wrapper, no description), and no tooltip on focus', async () => {
    const { container } = render(<Button icon="sliders" variant="ghost" aria-label={NAME}>2</Button>);
    expect(container.children.length).toBe(1);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
    const b = await focusIt(NAME);
    expect(b.hasAttribute('aria-describedby')).toBe(false);
    await new Promise((r) => setTimeout(r, 900)); // reason: past the tooltip delay, so a tooltip would have shown
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('without an aria-label there is no name to show: no tooltip', async () => {
    render(<Button nameTooltip>Save</Button>);
    await focusIt('Save');
    await new Promise((r) => setTimeout(r, 900)); // reason: past the tooltip delay
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a disabled reason coming and going keeps the same focused element; the reason replaces the name tooltip', async () => {
    const REASON = 'Nothing to change yet';
    const r = render(<Button aria-label={NAME} nameTooltip>2</Button>);
    const b = await focusIt(NAME);
    expect((await screen.findByRole('tooltip')).textContent).toBe(NAME);
    act(() => r.rerender(<Button aria-label={NAME} nameTooltip isDisabled disabledReason={REASON}>2</Button>));
    expect(screen.getByRole('button', { name: NAME })).toBe(b);
    expect(document.activeElement).toBe(b);
    // The reason is its description (its own tooltip opens on the next focus or hover); the name tooltip is gone.
    await waitFor(() => expect(document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent).toContain(REASON));
    expect(screen.queryAllByRole('tooltip').some((x) => x.textContent === NAME)).toBe(false);
    act(() => r.rerender(<Button aria-label={NAME} nameTooltip>2</Button>));
    expect(screen.getByRole('button', { name: NAME })).toBe(b);
    expect(document.activeElement).toBe(b);
  });

  it('an aria-label coming and going keeps the same element', () => {
    const r = render(<Button nameTooltip>2</Button>);
    const b = screen.getByRole('button');
    r.rerender(<Button aria-label={NAME} nameTooltip>2</Button>);
    expect(screen.getByRole('button', { name: NAME })).toBe(b);
  });

  it('a press still reaches the button through the tooltip trigger', async () => {
    let n = 0;
    render(<Button aria-label={NAME} nameTooltip onPress={() => { n += 1; }}>2</Button>);
    await userEvent.click(screen.getByRole('button', { name: NAME }));
    await waitFor(() => expect(n).toBe(1));
  });
});
