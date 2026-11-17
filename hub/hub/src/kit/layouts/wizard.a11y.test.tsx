// The compact step line is readable (it was aria-hidden, so a
// phone screen reader heard no step at all; wide it is display:none, so it is never read twice: wizardfoot.spec.ts),
// a step change is announced politely ("Step 3 of 5: Build it"), notes sit under the body and never in the footer row,
// and the footer's Back keeps its name when only its arrow shows.
import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WizardFooter, WizardPage } from './Layouts';

const steps = [
  { id: 'what', label: 'What it does' },
  { id: 'where', label: 'Where it answers' },
  { id: 'build', label: 'Build it' },
];

function Page({ current, note, footer = true, extra }: { current: number; note?: string; footer?: boolean; extra?: string }) {
  return (
    <WizardPage
      header={{ title: 'New script' }}
      steps={steps}
      current={current}
      footNote={note ? <p>{note}</p> : undefined}
      footer={footer ? <WizardFooter back={{ onPress: () => undefined }} secondary={<button type="button">Keep</button>} primary={<button type="button">Next</button>} /> : undefined}
    >
      <p>{extra ?? 'body'}</p>
    </WizardPage>
  );
}

const region = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-wizard-announce]')!;

describe('wizard_compact_line_is_readable', () => {
  it('the compact line has no aria-hidden on it or above it', () => {
    render(<Page current={1} />);
    const line = screen.getByText(/Step 2 of 3/);
    expect(line.closest('[aria-hidden="true"]')).toBeNull();
    expect(line.textContent).toBe('Step 2 of 3 · Where it answers');
  });
});

describe('wizard_announces_a_step_change', () => {
  it('nothing on the first mount; the step on a change; nothing again on a re-render of the same step', () => {
    const { container, rerender } = render(<Page current={0} />);
    const r = region(container);
    expect(r.getAttribute('aria-live')).toBe('polite');
    expect(r.getAttribute('role')).toBe('status');
    expect(r.textContent).toBe('');
    act(() => rerender(<Page current={2} />));
    expect(r.textContent).toBe('Step 3 of 3: Build it');
    act(() => rerender(<Page current={2} extra="typed" />));
    expect(r.textContent).toBe('Step 3 of 3: Build it');
    act(() => rerender(<Page current={1} />));
    expect(r.textContent).toBe('Step 2 of 3: Where it answers');
  });
});

describe('wizard_footnote_is_outside_the_footer_row', () => {
  it('a note renders after the body and never inside the footer row', () => {
    const { container } = render(<Page current={1} note="Not sure it was sent" />);
    const note = screen.getByText('Not sure it was sent');
    const row = screen.getByRole('button', { name: 'Next' }).parentElement!.parentElement!;
    expect(row.contains(note)).toBe(false);
    const body = screen.getByText('body');
    expect(body.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('p').length).toBe(2);
  });
  it('no note, no note box', () => {
    render(<Page current={1} />);
    expect(screen.queryByText('Not sure it was sent')).toBeNull();
  });
});

describe('wizard_footer_back_keeps_its_name', () => {
  it('Back is a button named "Back"; secondary and primary sit together at the end', () => {
    render(<Page current={1} />);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.getAttribute('aria-label')).toBe('Back');
    const end = screen.getByRole('button', { name: 'Next' }).parentElement!;
    expect(within(end).getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(end.contains(back)).toBe(false);
  });
  it('without back the start stays empty and the actions keep the end', () => {
    render(<WizardFooter primary={<button type="button">Next</button>} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });
});
