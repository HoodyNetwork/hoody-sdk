// WizardPage variant="flow" (New script): a step strip on top (nav "Steps" > ol; done steps are buttons
// "Go back to step N: Name", the current one aria-current="step", later ones aria-disabled), an optional aside beside the
// step, and the footer right under the step's content with an optional note above its row that the primary points at.
// The default variant keeps its left stepper (realms).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WizardFooter, WizardPage } from './Layouts';

const steps = [
  { id: 'what', label: 'What it does' },
  { id: 'where', label: 'Where it answers' },
  { id: 'build', label: 'Build it' },
];

function Flow({ current, onStep, aside, note }: { current: number; onStep?: (i: number) => void; aside?: boolean; note?: string }) {
  return (
    <WizardPage
      variant="flow"
      header={{ title: 'New script' }}
      steps={steps}
      current={current}
      onStep={onStep}
      aside={aside ? <p>so far</p> : undefined}
      asideTitle="Your script so far"
      footer={<WizardFooter back={{ onPress: () => undefined }} note={note} noteId="flow-note" primary={<button type="button" aria-describedby={note ? 'flow-note' : undefined}>Next</button>} />}
    >
      <p>body</p>
    </WizardPage>
  );
}

describe('wizard_flow_strip', () => {
  it('is a nav "Steps" holding an ordered list, one item per step', () => {
    render(<Flow current={1} />);
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
    expect(nav.querySelector('ol')).not.toBeNull();
  });

  it('done steps are buttons that go back; the current one is aria-current; later ones aria-disabled', () => {
    const onStep = vi.fn();
    render(<Flow current={1} onStep={onStep} />);
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Go back to step 1: What it does' }));
    expect(onStep).toHaveBeenCalledWith(0);
    const items = within(nav).getAllByRole('listitem');
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
    expect(items[1]!.textContent).toContain('Where it answers');
    expect(items[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(within(nav).queryByRole('button', { name: /Build it/ })).toBeNull();
  });

  it('has no left stepper list beside the body', () => {
    const { container } = render(<Flow current={0} />);
    expect(container.querySelectorAll('ol')).toHaveLength(1);
  });
});

describe('wizard_flow_aside', () => {
  it('draws the aside as a complementary region beside the step when given, none when not', () => {
    const { rerender } = render(<Flow current={0} aside />);
    expect(screen.getByRole('complementary', { name: 'Your script so far' }).textContent).toContain('so far');
    rerender(<Flow current={0} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('wizard_flow_footer', () => {
  it('comes after the step body, inside the page block (not at the window bottom)', () => {
    const { container } = render(<Flow current={0} />);
    const body = screen.getByText('body');
    const next = screen.getByRole('button', { name: 'Next' });
    expect(body.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[class*="wizardFooter"]')).not.toBeNull();
  });

  it('a note sits outside the button row, under the id the page points its primary at (aria-describedby)', () => {
    render(<Flow current={0} note="Next: where it answers" />);
    const note = screen.getByText('Next: where it answers');
    const row = screen.getByRole('button', { name: 'Next' }).parentElement!.parentElement!;
    expect(row.contains(note)).toBe(false);
    expect(note.id).toBe('flow-note');
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-describedby')).toBe('flow-note');
  });
});

describe('wizard_default_unchanged', () => {
  it('the default variant keeps its step list beside the body and no strip nav', () => {
    render(
      <WizardPage header={{ title: 'Realm' }} steps={steps} current={1} footer={<WizardFooter primary={<button type="button">Next</button>} />}>
        <p>body</p>
      </WizardPage>,
    );
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Steps' })).toBeTruthy();
  });
});
