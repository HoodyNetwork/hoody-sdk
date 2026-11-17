// Dialog keyboard focus: when the control that had focus
// goes away inside an open dialog (the body swaps to an outcome, a field is disabled), focus moves to the
// outcome or a sensible control instead of falling to <body>; and a dialog that refuses Escape while it
// sends or checks says why in an announced line.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import { Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

type Phase = 'idle' | 'sending' | 'failed' | 'created';

/** Like notes' New note: the field is disabled while sending, the body swaps to the outcome or "created". */
function NewThing({ to, onCheck, checking }: { to: Phase; onCheck?: () => void; checking?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const outcome: OutcomeLike | undefined = phase === 'failed' ? { kind: 'failed', message: 'The name is taken.' } : undefined;
  return (
    <Dialog
      isOpen
      onOpenChange={() => undefined}
      title={phase === 'created' ? 'Note created' : 'New note'}
      primaryLabel={phase === 'created' ? 'Done' : 'Create'}
      onPrimary={() => setPhase(to)}
      busy={phase === 'sending'}
      {...(outcome ? { outcome } : {})}
      {...(onCheck ? { onCheck } : {})}
      {...(checking ? { checking } : {})}
    >
      {phase === 'created' ? <p>Saved on atlas.</p> : <input aria-label="Title" disabled={phase === 'sending'} defaultValue="plan" />}
    </Dialog>
  );
}

const inDialog = () => {
  const el = document.activeElement;
  return el !== null && el !== document.body && el.closest('[role="dialog"], [role="alertdialog"]') !== null;
};

describe('Dialog: focus never falls to the page while it is open', () => {
  it('a field that goes away (the body swaps to "created") hands focus to the primary', async () => {
    render(<NewThing to="created" />);
    await frames();
    screen.getByRole('textbox', { name: 'Title' }).focus();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Enter' });
    });
    await frames();
    expect(screen.getByText('Saved on atlas.')).toBeInTheDocument();
    expect(inDialog()).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }));
  });

  it('a failed outcome replacing the focused field takes focus itself, so it is read out', async () => {
    function Swap() {
      const [failed, setFailed] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => undefined} title="New note" primaryLabel="Create" onPrimary={() => setFailed(true)} {...(failed ? { outcome: { kind: 'failed', message: 'The name is taken.' } } : {})}>
          {!failed && <input aria-label="Title" defaultValue="plan" />}
        </Dialog>
      );
    }
    render(<Swap />);
    await frames();
    const field = screen.getByRole('textbox', { name: 'Title' });
    field.focus();
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    await frames();
    expect(inDialog()).toBe(true);
    expect(document.activeElement?.textContent).toContain('The name is taken.');
  });

  it('a field disabled while sending does not drop focus to the page', async () => {
    render(<NewThing to="sending" />);
    await frames();
    const field = screen.getByRole('textbox', { name: 'Title' });
    field.focus();
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    await act(async () => {
      field.blur();
    });
    await frames();
    expect(inDialog()).toBe(true);
  });
});

describe('Dialog: Escape refused while it works says why', () => {
  it('Escape while Check again reads leaves the dialog open and announces why', async () => {
    render(<NewThing to="idle" onCheck={() => undefined} checking />);
    await frames();
    await act(async () => {
      const el = document.activeElement ?? document.body;
      fireEvent.keyDown(el, { key: 'Escape' });
      fireEvent.keyUp(el, { key: 'Escape' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Still checking. You can close this once it finishes.')).toHaveAttribute('role', 'status');
  });

  it('Escape refused on a "may have gone through" outcome (not busy) says why too', async () => {
    render(
      <Dialog isOpen isDismissable={false} onOpenChange={() => undefined} title="New note" primaryLabel="Allow creating again anyway" onPrimary={() => undefined} outcome={{ kind: 'pending' }}>
        <p>body</p>
      </Dialog>,
    );
    await frames();
    await act(async () => {
      const el = document.activeElement ?? document.body;
      fireEvent.keyDown(el, { key: 'Escape' });
      fireEvent.keyUp(el, { key: 'Escape' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('This may have gone through. Choose an action to close this.')).toHaveAttribute('role', 'status');
  });

  it('no hint before anyone presses Escape', async () => {
    render(<NewThing to="idle" onCheck={() => undefined} checking />);
    await frames();
    expect(screen.queryByText('Still checking. You can close this once it finishes.')).toBeNull();
  });
});

describe('Dialog: the header x and text selection (OP-F, OP-G)', () => {
  const shell = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')!;

  it('the header x never takes the initial focus: the first field does, else Cancel', async () => {
    const { unmount } = render(<NewThing to="idle" />);
    await frames();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    unmount();
    render(<Dialog isOpen onOpenChange={() => undefined} title="Restart atlas?" body="Programs stop." primaryLabel="Restart" onPrimary={() => undefined} />);
    await frames();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Close' })).not.toBe(document.activeElement);
  });

  /** A press on the title's text, as a browser does it: pointerdown, then focus moves to the dialog itself. */
  const pressTitle = async () => {
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('heading'));
      shell().focus();
    });
  };

  it('a press on the dialog text (focus moves to the dialog itself) leaves focus there, so a drag can select', async () => {
    render(<NewThing to="idle" />);
    await frames();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    await pressTitle();
    await frames();
    expect(document.activeElement).toBe(shell());
  });

  it('a field that validates on blur (adds its error) does not pull focus back from the pressed text', async () => {
    function Validates() {
      const [touched, setTouched] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => undefined} title="Add a person" primaryLabel="Add" onPrimary={() => undefined}>
          <input aria-label="User ID" defaultValue="not an id" onBlur={() => setTouched(true)} />
          {touched && <p>Use the number from the app.</p>}
        </Dialog>
      );
    }
    render(<Validates />);
    await frames();
    expect(document.activeElement).toBe(screen.getByLabelText('User ID'));
    await pressTitle();
    await frames();
    expect(screen.getByText('Use the number from the app.')).toBeInTheDocument();
    expect(document.activeElement).toBe(shell());
    // A later change in the dialog (an outcome, a control disabled) leaves it there too.
    await act(async () => { screen.getByLabelText('User ID').setAttribute('disabled', ''); });
    await frames();
    expect(document.activeElement).toBe(shell());
  });

  it('focus moved to the dialog itself without a press on its text is still moved on to a control', async () => {
    render(<NewThing to="idle" />);
    await frames();
    await act(async () => { shell().focus(); });
    await frames();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('after a press on the text, focus that goes on to a control ends it: the rescue works again', async () => {
    render(<NewThing to="created" />);
    await frames();
    await pressTitle();
    await frames();
    await act(async () => { screen.getByLabelText('Title').focus(); });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter' }); });
    await frames();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }));
  });

  it('after a press on the text and then focus on a field, a send that parks focus on the dialog still hands it to the outcome', async () => {
    let step!: (p: 'sending' | 'failed') => void;
    function Sends() {
      const [phase, setPhase] = useState<'idle' | 'sending' | 'failed'>('idle');
      step = setPhase;
      return (
        <Dialog
          isOpen
          onOpenChange={() => undefined}
          title="New note"
          primaryLabel="Create"
          onPrimary={() => undefined}
          busy={phase === 'sending'}
          {...(phase === 'failed' ? { outcome: { kind: 'failed' as const, message: 'The name is taken.' } } : {})}
        >
          {phase === 'idle' && <input aria-label="Title" defaultValue="plan" />}
        </Dialog>
      );
    }
    render(<Sends />);
    await frames();
    await pressTitle();
    await frames();
    await act(async () => { screen.getByLabelText('Title').focus(); });
    await act(async () => { step('sending'); });
    await frames();
    expect(document.activeElement).toBe(shell());
    await act(async () => { step('failed'); });
    await frames();
    expect(document.activeElement).toBe(document.querySelector('[data-dialog-outcome]'));
  });

  it('a press on a control (the x, Cancel) is not a press on text', async () => {
    render(<NewThing to="idle" />);
    await frames();
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Cancel' }));
      shell().focus();
    });
    await frames();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('a control that goes away is still rescued (focus to the page is not the dialog)', async () => {
    render(<NewThing to="created" />);
    await frames();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create' })); });
    await frames();
    expect(inDialog()).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('closing with the header x returns focus to the button that opened the dialog', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Rename</button>
          <Dialog isOpen={open} onOpenChange={setOpen} title="Rename atlas" primaryLabel="Rename it" onPrimary={() => undefined} />
        </>
      );
    }
    render(<Host />);
    const invoker = screen.getByRole('button', { name: 'Rename' });
    await act(async () => { invoker.focus(); fireEvent.click(invoker); });
    await frames();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    await frames();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(invoker);
  });
});
