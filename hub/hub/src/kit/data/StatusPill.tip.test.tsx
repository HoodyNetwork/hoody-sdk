// StatusPill `tip`: a state whose word is not the whole meaning ("Couldn't
// check") takes a sentence, as Tag's `tip`: the word becomes the InfoTip term, the dot or icon stays outside it.
// Without the prop the pill renders exactly as before. StatusToggle takes no tip (no button inside its button).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import ds from './Display.module.css';
import { StatusPill, type StatusToggleProps } from './Display';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(() => {
  boot();
});

describe('StatusPill tip', () => {
  it('without a tip the pill is the same span with its dot and word', () => {
    const { container } = render(<StatusPill tone="ok" dot>Installed</StatusPill>);
    expect(container.innerHTML).toBe(`<span class="${ds.pill} ${ds.ok}"><span class="${ds.dot}" aria-hidden="true"></span>Installed</span>`);
  });

  it('with a tip the word is the InfoTip term, named by the word, inside the pill; the dot stays outside it', () => {
    render(
      <StatusPill tone="warn" dot tip="The computer did not answer. Open it to check again.">
        Couldn't check
      </StatusPill>,
    );
    const b = screen.getByRole('button', { name: "Couldn't check" });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    const pill = b.closest(`.${ds.pill}`) as HTMLElement;
    expect(pill).not.toBeNull();
    expect(b.querySelector(`.${ds.dot}`)).toBeNull();
    expect(pill.querySelector(`.${ds.dot}`)).not.toBeNull();
  });

  it('a press shows the sentence and it describes the word', async () => {
    render(<StatusPill tip="The computer did not answer.">Couldn't check</StatusPill>);
    const b = screen.getByRole('button', { name: "Couldn't check" });
    await act(async () => fireEvent.click(b));
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('The computer did not answer.');
    const described = (b.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(described).toContain('The computer did not answer.');
  });

  it('StatusToggle takes no tip (its pill is already a button)', () => {
    // @ts-expect-error tip is not a StatusToggle prop
    const props: StatusToggleProps = { onPress: () => undefined, isPressed: true, children: 'On', tip: 'x' };
    expect(props).toBeTruthy();
  });
});
