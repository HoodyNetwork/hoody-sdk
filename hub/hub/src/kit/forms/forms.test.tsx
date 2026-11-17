import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, StrictMode, useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, holdSecret, type HeldSecret } from '@core';
import { bump, setView } from '@core/ctx';
import { boot } from '@core/test/env';
import { fromMutation, toOutcome } from '../outcome';
import { CodeEditor } from './CodeEditor';
import { RuleChecklist, Switch, TextField } from './fields';
import { Combobox, Form, FormFooter } from './more';
import { OtpField, otpDigits } from './OtpField';
import { Outcome, OutcomeSlot } from './Outcome';
import { SecretField, SecretInput, secretEdit, secretSplice, secretView } from './Secret';
import { SettingRow } from './SettingRow';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const toasts = vi.hoisted(() => [] as Array<{ title: string; tone?: string; action?: { label: string; onAction: () => void } }>);
const closed = vi.hoisted(() => [] as string[]);
vi.mock('../states/Toast', () => ({
  showToast: (c: { title: string; tone?: string; action?: { label: string; onAction: () => void } }) => {
    toasts.push(c);
    return `k${toasts.length}`;
  },
  closeToast: (key: string) => {
    closed.push(key);
  },
}));

const SECRET = 'hk_3f9a7c2e5b8d1a0f4e6c9b2a7d5e8f1c';
let written: string[] = [];

beforeEach(async () => {
  // Let the previous test's unmount toasts (a tick late by design) land before clearing them.
  await new Promise((r) => setTimeout(r, 5));
  boot();
  written = [];
  toasts.length = 0;
  closed.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function inRouter(Component: () => ReactElement, path = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [path] }) });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<RouterProvider router={router} />);
    await router.load();
  });
  return { router, view };
}

const press = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const html = () => document.body.innerHTML;

// ── outcome helpers ─────────────────────────────────────────────────────────────────

describe('outcome helpers', () => {
  it('toOutcome takes kinds, OutcomeLike and core mutation states', () => {
    expect(toOutcome('pending')).toEqual({ kind: 'pending' });
    expect(toOutcome('idle')).toBeNull();
    expect(toOutcome('running')).toBeNull();
    expect(toOutcome('read')).toBeNull();
    expect(toOutcome(undefined)).toBeNull();
    const o = { kind: 'failed' as const, message: 'x' };
    expect(toOutcome(o)).toBe(o);
  });

  it('fromMutation maps a core mutation; onCheck is the read-back', () => {
    const readBack = vi.fn();
    const p = fromMutation({ outcome: 'running', running: true, readBack });
    expect(p.busy).toBe(true);
    expect(p.outcome).toBeNull();
    p.onCheck?.();
    expect(readBack).toHaveBeenCalledTimes(1);
  });
});

// ── Outcome line + slot ─────────────────────────────────────────────────────────────

describe('Outcome line', () => {
  it('pending offers only Check again, which reads back', async () => {
    const onCheck = vi.fn();
    const onRetry = vi.fn();
    render(<Outcome outcome="pending" onCheck={onCheck} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('May have gone through');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('a check that returns a promise shows Checking… until it settles', async () => {
    let done!: () => void;
    const onCheck = () => new Promise<void>((r) => (done = r));
    render(<Outcome outcome="pending" onCheck={onCheck} />);
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByRole('button', { name: /Checking/ })).toBeInTheDocument();
    await act(async () => done());
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('a definite failure may offer Try again; block shows the long wording', () => {
    render(<Outcome outcome={{ kind: 'failed', message: 'The name is taken.' }} onRetry={() => undefined} variant="block" />);
    expect(screen.getByRole('alert')).toHaveTextContent("This didn't go through");
    expect(screen.getByText('The name is taken.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('nothing renders without an outcome', () => {
    const { container } = render(<Outcome outcome="idle" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('OutcomeSlot', () => {
  it('pending replaces the action, so it cannot be sent again', () => {
    render(
      <OutcomeSlot outcome="pending" onCheck={() => undefined}>
        <button type="button">Start</button>
      </OutcomeSlot>,
    );
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('failed shows the line and gives the action back', () => {
    render(
      <OutcomeSlot outcome="failed">
        <button type="button">Start</button>
      </OutcomeSlot>,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Didn't go through");
  });

  it('done shows for a moment, then the action returns', () => {
    vi.useFakeTimers();
    render(
      <OutcomeSlot outcome="done" doneText="Started">
        <button type="button">Start</button>
      </OutcomeSlot>,
    );
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('StrictMode mounting a pending place leaves no toast', async () => {
    render(
      <StrictMode>
        <OutcomeSlot outcome="pending" onCheck={() => undefined}>
          <button type="button">Start</button>
        </OutcomeSlot>
      </StrictMode>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(0);
  });

  it('a pending place that goes away leaves a sticky toast with Check again', async () => {
    const onCheck = vi.fn();
    const { unmount } = render(
      <OutcomeSlot outcome="pending" onCheck={onCheck}>
        <button type="button">Start</button>
      </OutcomeSlot>,
    );
    unmount();
    await new Promise((r) => setTimeout(r, 5));
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('unknown');
    expect(toasts[0]?.action?.label).toBe('Check again');
    toasts[0]?.action?.onAction();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});

describe('pending toast and the end of its context', () => {
  const leave = async () => {
    const { unmount } = render(
      <OutcomeSlot outcome="pending" onCheck={() => undefined}>
        <button type="button">Start</button>
      </OutcomeSlot>,
    );
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(1);
  };

  it('an account or realm switch closes the sticky toast (its Check again belongs to the old context)', async () => {
    await leave();
    act(() => {
      bump('switch');
    });
    expect(closed).toEqual(['k1']);
  });

  it("a 'late' bump keeps it", async () => {
    await leave();
    act(() => {
      bump('late');
    });
    expect(closed).toEqual([]);
  });
});

// ── Form lock + FormFooter ──────────────────────────────────────────────────────────

function SaveForm({ outcome, busy, onSubmit, onCheck, onCancel }: { outcome?: Parameters<typeof Form>[0]['outcome']; busy?: boolean; onSubmit: () => void; onCheck?: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('atlas');
  return (
    <Form onSubmit={onSubmit} outcome={outcome} busy={busy} onCheck={onCheck}>
      <TextField label="Name" value={name} onChange={setName} />
      <Switch label="Keep history" />
      <FormFooter dirty onCancel={onCancel} onDiscard={() => undefined} />
    </Form>
  );
}

describe('Form lock and FormFooter (C9)', () => {
  it('pending locks every field, refuses Enter and turns the primary into Check again', async () => {
    const onSubmit = vi.fn();
    const onCheck = vi.fn();
    const onCancel = vi.fn();
    render(<SaveForm outcome="pending" onSubmit={onSubmit} onCheck={onCheck} onCancel={onCancel} />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Keep history' })).toBeDisabled();
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.getByText('May have gone through')).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('in flight: fields locked, Saving… and nothing more to press', () => {
    const onSubmit = vi.fn();
    render(<SaveForm busy onSubmit={onSubmit} />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    const save = screen.getByRole('button', { name: /Saving/ });
    expect(save.getAttribute('aria-disabled')).toBe('true');
    fireEvent.submit(save.closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('after a definite failure the form is editable and can be sent again', async () => {
    const onSubmit = vi.fn();
    render(<SaveForm outcome={{ kind: 'failed', message: 'Too many tries.' }} onSubmit={onSubmit} />);
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toBeDisabled();
    expect(screen.getByText('Too many tries.')).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('busy or pending given only to the FormFooter locks the enclosing Form too (no caller can forget)', async () => {
    const onSubmit = vi.fn();
    function Host({ busy, outcome }: { busy?: boolean; outcome?: 'pending' }) {
      const [v, setV] = useState('atlas');
      return (
        <Form onSubmit={onSubmit}>
          <TextField label="Name" value={v} onChange={setV} />
          <FormFooter dirty busy={busy} outcome={outcome} onCheck={() => undefined} onSubmit={onSubmit} />
        </Form>
      );
    }
    const view = render(<Host outcome="pending" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toBeDisabled();
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    view.rerender(<Host busy />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name' }).closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    view.rerender(<Host />);
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toBeDisabled();
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name' }).closest('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('while Check again reads, Close is locked too', async () => {
    let finish!: () => void;
    const onCheck = () =>
      new Promise<void>((r) => {
        finish = r;
      });
    const onCancel = vi.fn();
    render(<FormFooter dirty outcome="pending" onCheck={onCheck} onSubmit={() => undefined} onCancel={onCancel} />);
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Close' })).not.toBeDisabled();
  });

  it('a footer outside the form (drawer) takes the outcome itself and never resends', async () => {
    const onSubmit = vi.fn();
    const onCheck = vi.fn();
    render(<FormFooter dirty outcome="pending" onCheck={onCheck} onSubmit={onSubmit} onCancel={() => undefined} pendingDetail="Check whether the key was made." />);
    expect(screen.getByText('Check whether the key was made.')).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('done shows Saved when nothing is dirty; a prefilled create form is sendable', () => {
    render(<FormFooter dirty={false} outcome="done" requireDirty={false} onSubmit={() => undefined} submitLabel="Create" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();
  });
});

describe('TextField slots and errors', () => {
  it('prefix and suffix render inside the field box', () => {
    render(<TextField label="Name" defaultValue="atlas" prefix={<span>https://</span>} suffix={<button type="button">Re-roll</button>} />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    const box = input.parentElement as HTMLElement;
    expect(box).toContainElement(screen.getByText('https://'));
    expect(box).toContainElement(screen.getByRole('button', { name: 'Re-roll' }));
  });

  it('focusOnError moves focus to the field the refusal is about', () => {
    const { rerender } = render(<TextField label="Current password" focusOnError />);
    rerender(<TextField label="Current password" focusOnError errorMessage="That password isn't right." />);
    expect(screen.getByRole('textbox', { name: 'Current password' })).toHaveFocus();
    expect(screen.getByText("That password isn't right.")).toBeInTheDocument();
  });

  it('the rule checklist marks met rules', () => {
    render(<RuleChecklist label="Rules" rules={[{ id: 'len', label: 'At least 12 characters', met: true }, { id: 'num', label: 'A number', met: false }]} />);
    expect(screen.getByText('At least 12 characters').closest('li')).toHaveAttribute('data-met', 'true');
    expect(screen.getByText('A number').closest('li')).not.toHaveAttribute('data-met');
  });
});

// ── SettingRow ──────────────────────────────────────────────────────────────────────

describe('TextField type="password"', () => {
  function Pw() {
    const [v, setV] = useState('');
    return <TextField label="Password" type="password" value={v} onChange={setV} />;
  }
  const typeIn = async (text: string) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: text } });
    });
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(text);
  };
  const field = () => screen.getByLabelText('Password') as HTMLInputElement;

  it('is a secret entry by default: cleared on route change, realm switch, view change and page hide', async () => {
    const { router } = await inRouter(() => <Pw />);
    await typeIn('pw-route');
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect(field().value).toBe('');
    await typeIn('pw-realm');
    await act(async () => {
      bump('realm');
    });
    expect(field().value).toBe('');
    await typeIn('pw-view');
    await act(async () => {
      setView('keys');
    });
    expect(field().value).toBe('');
    await typeIn('pw-hide');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(field().value).toBe('');
  });

  it('a plain text field keeps its value across those', async () => {
    await inRouter(() => {
      const [v, setV] = useState('');
      return <TextField label="Name" value={v} onChange={setV} />;
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'kept' } });
    });
    await act(async () => {
      bump('realm');
      window.dispatchEvent(new Event('pagehide'));
    });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('kept');
  });
});

describe('SettingRow', () => {
  it('a pending row that goes away leaves the sticky Check again toast', async () => {
    const onCheck = vi.fn();
    const { view } = await inRouter(() => (
      <SettingRow label="Two-step sign-in" outcome="pending" onCheck={onCheck}>
        <span>On</span>
      </SettingRow>
    ));
    view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.action?.label).toBe('Check again');
  });

  it('label, help and control; a pending change locks the control and hides its actions', async () => {
    const onCheck = vi.fn();
    render(
      <SettingRow label="Two-step sign-in" help="On · 8 backup codes left" outcome="pending" onCheck={onCheck} actions={<button type="button">Turn off…</button>}>
        <Switch label="Ask for a code" />
      </SettingRow>,
    );
    expect(screen.getByText('Two-step sign-in')).toBeInTheDocument();
    expect(screen.getByText('On · 8 backup codes left')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ask for a code' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Turn off…' })).toBeNull();
    await press(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('without an outcome the actions show and the control is live', () => {
    render(
      <SettingRow label="Password" actions={<button type="button">Change…</button>}>
        <Switch label="Keep" />
      </SettingRow>,
    );
    expect(screen.getByRole('button', { name: 'Change…' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Keep' })).not.toBeDisabled();
  });
});

// ── SecretField ─────────────────────────────────────────────────────────────────────

function held(value = SECRET): HeldSecret {
  const h = holdSecret(value, capture());
  if (!h) throw new Error('no held secret');
  return h;
}

describe('SecretField', () => {
  it('masked: the value is not in the page until Show; Copy works without Show', async () => {
    const onCopy = vi.fn();
    await inRouter(() => <SecretField label="New key" held={held()} onCopy={onCopy} />);
    expect(html()).not.toContain(SECRET);
    expect(screen.getByText('Hidden until you press Show')).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain(SECRET);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
    await press(screen.getByRole('button', { name: 'Hide' }));
    expect(html()).not.toContain(SECRET);
  });

  it('StrictMode keeps it (no wipe on the simulated remount)', async () => {
    const h = held();
    await inRouter(() => (
      <StrictMode>
        <SecretField label="New key" held={h} />
      </StrictMode>
    ));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(h.dropped).toBe(false);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
  });

  it('a visible prefix stays readable while the rest is masked', async () => {
    await inRouter(() => <SecretField label="New key" held={held()} visiblePrefix={7} />);
    expect(screen.getByText('hk_3f9a')).toBeInTheDocument();
    expect(html()).not.toContain(SECRET.slice(7, 14));
  });

  it('a route change wipes it: the held secret drops, the page is told, Copy has nothing', async () => {
    const h = held();
    const onWipe = vi.fn();
    const { router } = await inRouter(() => <SecretField label="New key" held={h} onWipe={onWipe} />);
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain(SECRET);
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect(h.dropped).toBe(true);
    expect(onWipe).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain(SECRET);
    expect(screen.getByText('It is no longer shown here.')).toBeInTheDocument();
  });

  it('a resetKey change (realm switch) wipes it', async () => {
    const h = held();
    let setKey!: (k: string) => void;
    await inRouter(() => {
      const [k, set] = useState('realm-a');
      setKey = set;
      return <SecretField label="New key" held={h} resetKey={k} />;
    });
    await act(async () => setKey('realm-b'));
    expect(h.dropped).toBe(true);
    expect(screen.getByText('It is no longer shown here.')).toBeInTheDocument();
  });

  it('page hide wipes it; the tab going to the background masks it again', async () => {
    const h = held();
    await inRouter(() => <SecretField label="New key" held={h} />);
    await press(screen.getByRole('button', { name: 'Show' }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(html()).not.toContain(SECRET);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(h.dropped).toBe(false);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(h.dropped).toBe(true);
  });

  it('closing (unmount) drops the held secret', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = held();
    const { view } = await inRouter(() => <SecretField label="New key" held={h} />);
    view.unmount();
    act(() => vi.runAllTimers());
    expect(h.dropped).toBe(true);
  });

  it('closing (unmount) tells the page nothing: a value it still holds shows again in its next field', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onWipe = vi.fn();
    const { view } = await inRouter(() => <SecretField label="New key" value={SECRET} onWipe={onWipe} />);
    view.unmount();
    act(() => vi.runAllTimers());
    expect(onWipe).not.toHaveBeenCalled();
    await inRouter(() => <SecretField label="New key" value={SECRET} onWipe={onWipe} />);
    expect(screen.queryByText('It is no longer shown here.')).toBeNull();
    await press(screen.getByRole('button', { name: 'Copy' }));
    expect(written).toEqual([SECRET]);
    expect(onWipe).not.toHaveBeenCalled();
  });

  it('a realm switch / sign-out (core generation move) wipes it and the page string too', async () => {
    const h = held();
    const onWipe = vi.fn();
    await inRouter(() => (
      <>
        <SecretField label="New key" held={h} />
        <SecretField label="Access code" value="ac-998877665544" onWipe={onWipe} />
      </>
    ));
    await act(async () => {
      bump('realm');
    });
    expect(h.dropped).toBe(true);
    expect(onWipe).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('It is no longer shown here.')).toHaveLength(2);
  });

  it('a view change (core setView) wipes it', async () => {
    const h = held();
    await inRouter(() => <SecretField label="New key" held={h} />);
    await act(async () => {
      setView('keys');
    });
    expect(h.dropped).toBe(true);
  });

  it('core dropping it (teardown) leaves the gone line and tells the page', async () => {
    const h = held();
    const onWipe = vi.fn();
    await inRouter(() => <SecretField label="New key" held={h} onWipe={onWipe} />);
    await act(async () => h.drop());
    expect(screen.getByText('It is no longer shown here.')).toBeInTheDocument();
    expect(onWipe).toHaveBeenCalledTimes(1);
  });

  it('Show is for the secret it was pressed on: a different value comes back masked', async () => {
    let pick!: (v: string) => void;
    await inRouter(() => {
      const [v, setV] = useState('code-app-a-111111');
      pick = setV;
      return <SecretField label="Access code" value={v} />;
    });
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain('code-app-a-111111');
    await act(async () => pick('code-app-b-222222'));
    expect(html()).not.toContain('code-app-b-222222');
    expect(html()).not.toContain('code-app-a-111111');
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
  });

  it('Show is for the held secret it was pressed on: a replaced held secret comes back masked', async () => {
    const a = held('held-a-333333');
    const b = held('held-b-444444');
    let pick!: (h: HeldSecret) => void;
    await inRouter(() => {
      const [h, setH] = useState<HeldSecret>(a);
      pick = setH;
      return <SecretField label="New key" held={h} />;
    });
    await press(screen.getByRole('button', { name: 'Show' }));
    expect(html()).toContain('held-a-333333');
    await act(async () => pick(b));
    expect(html()).not.toContain('held-b-444444');
  });

  // A copy whose clipboard call rejects shows and announces the failure, as CopyButton does (one status line,
  // the shared CopyStatus), in every layout; a working copy is announced too.
  describe('copy failure', () => {
    const FAILED = "Couldn't copy. Show it and copy it by hand.";
    const rejecting = () =>
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    const layouts = [
      { name: 'icon', el: () => <SecretField label="New key" held={held()} />, button: 'Copy' },
      { name: 'primary', el: () => <SecretField label="New key" held={held()} copyPrimary />, button: 'Copy' },
      { name: 'lines', el: () => <SecretField label="Backup codes" held={held('1111-2222\n3333-4444')} format="lines" />, button: 'Copy codes' },
    ] as const;
    // Seen, not only heard: the press closes the icon button's tooltip, so the field's note line says it, and keeps
    // saying it past the copy state's short reset until a copy works.
    it('icon: a rejected copy shows a visible line that stays until the next copy works', async () => {
      // user-event installs its own clipboard on setup: set it up first, then make the clipboard refuse.
      const user = userEvent.setup();
      rejecting();
      await inRouter(() => <SecretField label="New key" held={held()} description="Use the eye to show it." />);
      const visible = () => screen.queryAllByText(FAILED).filter((el) => !el.closest('[role="status"]') && !el.closest('button'));
      expect(visible()).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(visible()).toHaveLength(1));
      expect(visible()[0]).toBeVisible();
      expect(screen.queryByText('Use the eye to show it.')).toBeNull();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1300));
      });
      expect(visible()).toHaveLength(1);
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'));
      expect(visible()).toHaveLength(0);
      expect(screen.getByText('Use the eye to show it.')).toBeInTheDocument();
    });

    // The failure line belongs to the secret that was copied, as Show does: a replaced secret, or a refusal that
    // answers after the replacement, never shows it.
    const visibleFailure = () => screen.queryAllByText(FAILED).filter((el) => !el.closest('[role="status"]') && !el.closest('button'));
    it('a replaced held secret does not inherit the failure line', async () => {
      const user = userEvent.setup();
      rejecting();
      const a = held('held-a-555555');
      const b = held('held-b-666666');
      let pick!: (h: HeldSecret) => void;
      await inRouter(() => {
        const [h, setH] = useState<HeldSecret>(a);
        pick = setH;
        return <SecretField label="New key" held={h} description="Use the eye to show it." />;
      });
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(visibleFailure()).toHaveLength(1));
      await act(async () => pick(b));
      expect(visibleFailure()).toHaveLength(0);
      expect(screen.getByText('Use the eye to show it.')).toBeVisible();
    });
    it('a replaced value does not inherit the failure line', async () => {
      const user = userEvent.setup();
      rejecting();
      let pick!: (v: string) => void;
      await inRouter(() => {
        const [v, setV] = useState('code-app-a-777777');
        pick = setV;
        return <SecretField label="Access code" value={v} description="Use the eye to show it." />;
      });
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => expect(visibleFailure()).toHaveLength(1));
      await act(async () => pick('code-app-b-888888'));
      expect(visibleFailure()).toHaveLength(0);
    });
    it('a refusal that answers after the secret was replaced does not mark the new one', async () => {
      const user = userEvent.setup();
      let refuse!: () => void;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => new Promise<void>((_, rej) => (refuse = () => rej(new Error('denied')))) },
      });
      const a = held('held-a-999999');
      const b = held('held-b-000000');
      let pick!: (h: HeldSecret) => void;
      await inRouter(() => {
        const [h, setH] = useState<HeldSecret>(a);
        pick = setH;
        return <SecretField label="New key" held={h} description="Use the eye to show it." />;
      });
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await act(async () => pick(b));
      await act(async () => {
        refuse();
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(visibleFailure()).toHaveLength(0);
      expect(screen.getByText('Use the eye to show it.')).toBeVisible();
    });

    for (const l of layouts) {
      it(`${l.name}: a rejected clipboard call is announced and shown on the copy control`, async () => {
        rejecting();
        await inRouter(l.el);
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: l.button }));
          await new Promise((r) => setTimeout(r, 0));
        });
        expect(screen.getByRole('status')).toHaveTextContent(FAILED);
        expect(screen.getByRole('button', { name: FAILED })).toBeInTheDocument();
      });
      it(`${l.name}: a working copy is announced`, async () => {
        await inRouter(l.el);
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: l.button }));
          await new Promise((r) => setTimeout(r, 0));
        });
        expect(screen.getByRole('status')).toHaveTextContent('Copied');
      });
    }
  });

  it('masked backup codes: the bullet items are hidden from screen readers (the list says it is hidden)', async () => {
    await inRouter(() => <SecretField label="Backup codes" held={held('1111-2222\n3333-4444')} format="lines" />);
    const items = document.querySelectorAll('li');
    expect(items.length).toBe(2);
    for (const li of items) expect(li).toHaveAttribute('aria-hidden', 'true');
  });

  it('the masked hint is read out as text (no aria-label on a role-less span: axe aria-prohibited-attr)', async () => {
    await inRouter(() => <SecretField label="New key" held={held()} />);
    expect(screen.getByText('Hidden until you press Show')).toBeInTheDocument();
    expect(document.querySelector('span[aria-label]')).toBeNull();
  });

  it('a page string is held the same way and wiped on route change', async () => {
    const onWipe = vi.fn();
    const { router } = await inRouter(() => <SecretField label="Access code" value={SECRET} onWipe={onWipe} />);
    expect(html()).not.toContain(SECRET);
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect(onWipe).toHaveBeenCalledTimes(1);
    expect(screen.getByText('It is no longer shown here.')).toBeInTheDocument();
  });

  it('backup codes: one per line, masked to the same width, Copy codes, and the "I saved them" tick', async () => {
    const codes = ['1111-2222', '3333-4444', '5555-6666'];
    const onTick = vi.fn();
    await inRouter(() => <SecretField label="Backup codes" held={held(codes.join('\n'))} format="lines" confirm={{ checked: false, onChange: onTick }} />);
    expect(html()).not.toContain('1111');
    expect(screen.getByText('3 codes')).toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Copy codes' }));
    expect(written).toEqual([codes.join('\n')]);
    await press(screen.getByRole('button', { name: 'Show codes' }));
    expect(screen.getByText('3333-4444')).toBeInTheDocument();
    await press(screen.getByRole('checkbox', { name: 'I saved them' }));
    expect(onTick).toHaveBeenCalledWith(true);
  });
});

describe('SecretInput', () => {
  it('password-style, show on request, cleared on route change', async () => {
    const seen: string[] = [];
    const { router } = await inRouter(() => {
      const [v, setV] = useState('');
      seen.push(v);
      return <SecretInput label="API key" value={v} onChange={setV} />;
    });
    const input = screen.getByLabelText('API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-123' } });
    });
    expect(input.value).toBe('sk-123');
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    expect(input.type).toBe('text');
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('API key') as HTMLInputElement).type).toBe('password');
  });

  it('the end of its context (realm switch, view change) clears what was typed, with no opt-in', async () => {
    await inRouter(() => {
      const [v, setV] = useState('');
      return <SecretInput label="API key" value={v} onChange={setV} />;
    });
    const typed = async (text: string) => {
      await act(async () => {
        fireEvent.change(screen.getByLabelText('API key'), { target: { value: text } });
      });
      expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe(text);
    };
    await typed('sk-realm');
    await act(async () => {
      bump('realm');
    });
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    await typed('sk-view');
    await act(async () => {
      setView('keys');
    });
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    expect(html()).not.toContain('sk-view');
  });

  it('what was shown masks again once cleared (submit), when the tab is hidden and when locked', async () => {
    let set!: (v: string) => void;
    let lock!: (b: boolean) => void;
    await inRouter(() => {
      const [v, setV] = useState('sk-1');
      const [d, setD] = useState(false);
      set = setV;
      lock = setD;
      return <SecretInput label="API key" value={v} onChange={setV} isDisabled={d} />;
    });
    const type = () => (screen.getByLabelText('API key') as HTMLInputElement).type;
    const show = () => press(screen.getByRole('button', { name: 'Show what you typed' }));
    await show();
    expect(type()).toBe('text');
    await act(async () => set(''));
    await act(async () => set('sk-2'));
    expect(type()).toBe('password');
    await show();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(type()).toBe('password');
    await show();
    await act(async () => lock(true));
    expect(type()).toBe('password');
    await act(async () => lock(false));
    expect(type()).toBe('password');
  });

  it('reveal={false}: no Show toggle, always a password field', async () => {
    await inRouter(() => <SecretInput label="Provider key" value="sk-1" onChange={() => undefined} reveal={false} />);
    expect(screen.queryByRole('button', { name: 'Show what you typed' })).toBeNull();
    expect((screen.getByLabelText('Provider key') as HTMLInputElement).type).toBe('password');
  });

  it('inputMode reaches the input (a touch keyboard hint), absent unless asked', async () => {
    await inRouter(() => (
      <>
        <SecretInput label="Passcode" value="" onChange={() => undefined} reveal={false} inputMode="numeric" />
        <SecretInput label="API key" value="" onChange={() => undefined} />
      </>
    ));
    expect(screen.getByLabelText('Passcode')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('API key')).not.toHaveAttribute('inputmode');
  });

  it('locked inside a pending form', async () => {
    await inRouter(() => (
      <Form onSubmit={() => undefined} outcome="pending">
        <SecretInput label="API key" value="" onChange={() => undefined} />
      </Form>
    ));
    expect(screen.getByLabelText('API key')).toBeDisabled();
  });
});

describe('secretView / secretSplice / secretEdit (multiline SecretInput)', () => {
  const B = '•';
  it('hidden: one bullet per character, line ends kept; CRLF and a lone CR show as one LF', () => {
    expect(secretView('ab\ncd', true).text).toBe(`${B}${B}\n${B}${B}`);
    expect(secretView('a\r\nb\rc', true).text).toBe(`${B}\n${B}\n${B}`);
    expect(secretView('a\r\nb', true).at).toEqual([0, 1, 3, 4]);
    expect(secretView('x\u{1F511}y', true).text).toBe(`${B}${B}${B}`);
    expect(secretView('a\r\nb', false).text).toBe('a\nb');
    expect(secretView('x\u{1F511}y', false).text).toBe('x\u{1F511}y');
  });

  it('a splice puts text in byte for byte over the shown selection (paste, hidden Backspace/Delete)', () => {
    const pem = '-----BEGIN KEY-----\r\nMIIB\r\n-----END KEY-----\r\n';
    expect(secretSplice('', true, 0, 0, pem)).toEqual({ value: pem, caret: secretView(pem, true).text.length });
    expect(secretSplice('abcd', true, 1, 3, 'X\r\nY')).toEqual({ value: 'aX\r\nYd', caret: 4 });
    // One shown line end is the whole CR LF; one bullet is the whole astral character.
    expect(secretSplice('a\r\nb', true, 1, 2, '').value).toBe('ab');
    expect(secretSplice('x\u{1F511}y', true, 1, 2, '').value).toBe('xy');
    // A lone CR meeting an LF stays two line ends (the CR becomes an LF), never one CR LF.
    expect(secretSplice('a\rb', true, 2, 3, '\nc').value).toBe('a\n\nc');
  });

  it('shown edits start no later than the selection they began with', () => {
    expect(secretEdit('abc', 'aXbc', 2, { start: 1, end: 1 })).toEqual({ value: 'aXbc', caret: 2 });
    // A CR LF (or a lone CR) selected with what follows and replaced by Enter: the new LF only.
    expect(secretEdit('a\r\nb', 'a\n', 2, { start: 1, end: 3 })).toEqual({ value: 'a\n', caret: 2 });
    expect(secretEdit('a\rb', 'a\n', 2, { start: 1, end: 3 })).toEqual({ value: 'a\n', caret: 2 });
    // The line end alone replaced by Enter: the shown text did not change, the bytes did.
    expect(secretEdit('a\r\nb', 'a\nb', 2, { start: 1, end: 2 }).value).toBe('a\nb');
    // A character replaced by the same character is still a replacement (here of an astral one by itself).
    expect(secretEdit('x\u{1F511}y', 'xzy', 2, { start: 1, end: 3 }).value).toBe('xzy');
    // Backspace over a CR LF removes both bytes.
    expect(secretEdit('a\r\nb', 'ab', 1, { start: 2, end: 2 }).value).toBe('ab');
    // A replacement past the caret keeps the browser's caret where it was.
    expect(secretEdit('abcd', 'abXY', 2, { start: 2, end: 4 })).toEqual({ value: 'abXY', caret: 2 });
    // Without the selection (no beforeinput) the diff still maps it.
    expect(secretEdit('abcd', 'abXY', 2, null).value).toBe('abXY');
    expect(secretEdit('abc', 'abXc', 3, null).value).toBe('abXc');
  });
});

describe('SecretInput multiline', () => {
  const PEM = fake('-----BEGIN ', 'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nk3Zq9pLmXw==\n-----END PRIVATE KEY-----\n');
  const B = '•';
  function Host({ onValue, initial = '' }: { onValue?: (v: string) => void; initial?: string }) {
    const [v, setV] = useState(initial);
    onValue?.(v);
    return <SecretInput label="Key" value={v} onChange={setV} multiline rows={3} />;
  }
  const area = () => screen.getByRole('textbox', { name: 'Key' }) as HTMLTextAreaElement;
  const paste = async (text: string) => {
    await act(async () => {
      // false: the field took the paste itself, so the browser does not paste it a second time.
      expect(fireEvent.paste(area(), { clipboardData: { getData: (k: string) => (k === 'text/plain' ? text : '') } })).toBe(false);
    });
  };
  // Every value the textarea is given or holds: each write to .value, and .value at every input-related event.
  function watchValues() {
    const seen: string[] = [];
    const set = vi.spyOn(HTMLTextAreaElement.prototype, 'value', 'set');
    const events = ['keydown', 'keypress', 'beforeinput', 'input', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'drop', 'paste', 'change'];
    const look = (e: Event) => {
      if (e.target instanceof HTMLTextAreaElement && e.target.hasAttribute('data-secret-hidden')) seen.push(e.target.value);
    };
    for (const k of events) document.addEventListener(k, look, true);
    return {
      seen: () => [...seen, ...set.mock.calls.map((c) => String(c[0]))],
      stop: () => {
        for (const k of events) document.removeEventListener(k, look, true);
        set.mockRestore();
      },
    };
  }

  it('hidden: read-only, bullets and line ends only; typed keys go into the value and no DOM value ever holds a character', async () => {
    let got = '';
    await inRouter(() => <Host onValue={(v) => (got = v)} />);
    expect(area().tagName).toBe('TEXTAREA');
    expect(area()).toHaveAttribute('rows', '3');
    expect(area()).toHaveAttribute('readonly');
    expect(area()).toHaveAttribute('placeholder', 'Type or paste; on a touch keyboard, use the eye first');
    const w = watchValues();
    const user = userEvent.setup();
    await user.type(area(), 'sé€ret{Enter}x');
    expect(got).toBe('sé€ret\nx');
    // Composition and shortcuts type nothing while hidden.
    await act(async () => {
      fireEvent.compositionStart(area());
      fireEvent.compositionUpdate(area(), { data: 'ka' });
      fireEvent.compositionEnd(area(), { data: 'ka' });
    });
    await user.keyboard('{Control>}a{/Control}{Meta>}b{/Meta}{Tab}');
    expect(got).toBe('sé€ret\nx');
    // AltGr (Ctrl+Alt) types its character (Ctrl+A above selected everything; the caret goes back to the end).
    area().focus();
    area().setSelectionRange(8, 8);
    await act(async () => {
      fireEvent.keyDown(area(), { key: '@', ctrlKey: true, altKey: true });
    });
    expect(got).toBe('sé€ret\nx@');
    // A key while composing is not taken as text.
    await act(async () => {
      fireEvent.keyDown(area(), { key: 'k', isComposing: true });
    });
    expect(got).toBe('sé€ret\nx@');
    await user.type(area(), '{Backspace}', { initialSelectionStart: 0, initialSelectionEnd: 9 });
    expect(got).toBe('');
    await paste(PEM);
    expect(got).toBe(PEM);
    const seen = w.seen();
    w.stop();
    expect(seen.length).toBeGreaterThan(0);
    for (const v of seen) expect(v).toMatch(/^[•\n]*$/);
    expect(area().value).toBe(secretView(PEM, true).text);
    // A change that reaches the read-only field anyway (a browser bypass, written here by the test) is not taken as text,
    // and the field goes back to bullets.
    await act(async () => {
      fireEvent.change(area(), { target: { value: 'bypass' } });
    });
    expect(got).toBe(PEM);
    expect(area().value).toBe(secretView(PEM, true).text);
    expect(html()).not.toContain('MIIEvQ');
    expect(html()).not.toContain('PRIVATE');
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    expect(area().value).toBe(PEM);
    expect(area()).not.toHaveAttribute('readonly');
    await press(screen.getByRole('button', { name: 'Hide what you typed' }));
    expect(html()).not.toContain('MIIEvQ');
  });

  it('keeps CRLF line ends byte for byte from a paste', async () => {
    let got = '';
    await inRouter(() => <Host onValue={(v) => (got = v)} />);
    const crlf = PEM.replace(/\n/g, '\r\n');
    await paste(crlf);
    expect(got).toBe(crlf);
    expect(area().value).toBe(secretView(crlf, true).text);
  });

  it('hidden: Backspace and Delete remove the selection or one character (a CR LF as one); typing keeps its place', async () => {
    let got = '';
    await inRouter(() => <Host onValue={(v) => (got = v)} />);
    await paste('ab\r\ncd');
    const user = userEvent.setup();
    await user.type(area(), '{Backspace}', { initialSelectionStart: 5, initialSelectionEnd: 5 });
    expect(got).toBe('ab\r\nc');
    await user.type(area(), '{Delete}', { initialSelectionStart: 2, initialSelectionEnd: 2 });
    expect(got).toBe('abc');
    await user.type(area(), '{Backspace}', { initialSelectionStart: 0, initialSelectionEnd: 2 });
    expect(got).toBe('c');
    expect(area().value).toBe(B);
    // Two keys typed in front while hidden: the second follows the first only if the caret is put back after each.
    await user.type(area(), 'XY', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(got).toBe('XYc');
  });

  it('shown: typing and editing in the middle, and Enter over a CR LF, edit the value at the caret', async () => {
    let got = '';
    await inRouter(() => <Host onValue={(v) => (got = v)} />);
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    const user = userEvent.setup();
    await user.type(area(), 'abc{Enter}def');
    expect(got).toBe('abc\ndef');
    // Two keys in a row: the second lands after the first only if the caret is put back after each edit.
    await user.type(area(), 'XY', { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(got).toBe('aXYbc\ndef');
    await user.type(area(), '{Backspace}', { initialSelectionStart: 6, initialSelectionEnd: 6 });
    expect(got).toBe('aXYbcdef');
    // The same letter typed over itself is a replacement, not a no-op that leaves the old one in place.
    await user.type(area(), 'b', { initialSelectionStart: 3, initialSelectionEnd: 4 });
    expect(got).toBe('aXYbcdef');
    // Emptied by the person, the field stays shown (typing needs Show), unlike a clear from outside.
    await user.type(area(), '{Backspace}', { initialSelectionStart: 0, initialSelectionEnd: 8 });
    expect(got).toBe('');
    expect(area()).not.toHaveAttribute('data-secret-hidden');
    await user.type(area(), 'Q');
    expect(got).toBe('Q');
    await paste('1\r\n2');
    expect(got).toBe('Q1\r\n2');
    await user.type(area(), '{Enter}', { initialSelectionStart: 2, initialSelectionEnd: 4 });
    expect(got).toBe('Q1\n');
  });

  it('copy, cut, drag and drop do nothing while hidden, and copy works once shown', async () => {
    await inRouter(() => <Host initial={'k1\nk2'} />);
    const fire = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      area().dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(['copy', 'cut', 'dragstart', 'drop'].map(fire)).toEqual([true, true, true, true]);
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    expect(fire('copy')).toBe(false);
  });

  it('wiped as today: route change and end of context clear it; locked or a hidden tab masks it again', async () => {
    let got = '';
    let lock!: (b: boolean) => void;
    const whileLocked: string[] = [];
    const { router } = await inRouter(() => {
      const [v, setV] = useState('');
      const [d, setD] = useState(false);
      lock = setD;
      got = v;
      // The first commit after locking already shows bullets (not only after the effect that unsets Show).
      useLayoutEffect(() => {
        if (d) whileLocked.push(document.querySelector('textarea')?.value ?? '');
      });
      return <SecretInput label="Key" value={v} onChange={setV} isDisabled={d} multiline />;
    });
    await paste(PEM);
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    await act(async () => lock(true));
    expect(area()).toHaveAttribute('data-secret-hidden');
    expect(whileLocked.length).toBeGreaterThan(0);
    expect(whileLocked.join('')).not.toContain('MIIEvQ');
    await act(async () => lock(false));
    expect(area()).toHaveAttribute('data-secret-hidden');
    await press(screen.getByRole('button', { name: 'Show what you typed' }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(area()).toHaveAttribute('data-secret-hidden');
    expect(got).toBe(PEM);
    await act(async () => {
      bump('realm');
    });
    expect(got).toBe('');
    await paste(PEM);
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect(got).toBe('');
    expect(area().value).toBe('');
    expect(area()).toHaveAttribute('data-secret-hidden');
    expect(html()).not.toContain('MIIEvQ');
  });
});

describe('SecretInput multiline, edit sequences', () => {
  const area = () => screen.getByRole('textbox', { name: 'Key' }) as HTMLTextAreaElement;
  const show = () => press(screen.getByRole('button', { name: 'Show what you typed' }));
  const paste = async (text: string) => {
    await act(async () => {
      fireEvent.paste(area(), { clipboardData: { getData: (k: string) => (k === 'text/plain' ? text : '') } });
    });
  };
  let got = '';
  let setOutside!: (v: string) => void;
  function Host() {
    const [v, setV] = useState('');
    got = v;
    setOutside = setV;
    return <SecretInput label="Key" value={v} onChange={setV} multiline />;
  }

  it('shown: Enter over a CR LF alone (the text the field shows does not change) writes LF', async () => {
    await inRouter(() => <Host />);
    await show();
    await paste('a\r\nb');
    expect(got).toBe('a\r\nb');
    await userEvent.setup().type(area(), '{Enter}', { initialSelectionStart: 1, initialSelectionEnd: 2 });
    expect(got).toBe('a\nb');
  });

  it('hidden: typing or pasting a character over the same character leaves the caret after it', async () => {
    await inRouter(() => <Host />);
    await paste('abc');
    const user = userEvent.setup();
    await user.type(area(), 'bX', { initialSelectionStart: 1, initialSelectionEnd: 2 });
    expect(got).toBe('abXc');
    area().setSelectionRange(1, 2);
    await paste('b');
    await user.keyboard('Y');
    expect(got).toBe('abYXc');
  });

  it('a line end after several lone CRs keeps every line end, hidden and shown', async () => {
    await inRouter(() => <Host />);
    await paste('a\r\r');
    const user = userEvent.setup();
    await user.type(area(), '{Enter}', { initialSelectionStart: 3, initialSelectionEnd: 3 });
    expect(secretView(got, true).text).toBe('•\n\n\n');
    expect(got).toBe('a\n\n\n');
    await act(async () => setOutside('b\r\r'));
    await show();
    await user.type(area(), '{Enter}', { initialSelectionStart: 3, initialSelectionEnd: 3 });
    expect(secretView(got, false).text).toBe('b\n\n\n');
  });

  it('after the person empties it, a later clear from outside still masks it', async () => {
    await inRouter(() => <Host />);
    await show();
    const user = userEvent.setup();
    await user.type(area(), 'x{Backspace}');
    expect(got).toBe('');
    expect(area()).not.toHaveAttribute('data-secret-hidden');
    await act(async () => setOutside('from-outside'));
    await act(async () => setOutside(''));
    expect(area()).toHaveAttribute('data-secret-hidden');
  });

  it('hidden: Backspace or Delete with Ctrl, Alt or Cmd is a shortcut and deletes nothing', async () => {
    await inRouter(() => <Host />);
    await paste('word next');
    const user = userEvent.setup();
    await user.type(area(), '{Control>}{Backspace}{/Control}', { initialSelectionStart: 9, initialSelectionEnd: 9 });
    await user.type(area(), '{Alt>}{Backspace}{/Alt}{Meta>}{Delete}{/Meta}', { initialSelectionStart: 4, initialSelectionEnd: 4 });
    expect(got).toBe('word next');
    await user.type(area(), '{Shift>}{Backspace}{/Shift}', { initialSelectionStart: 9, initialSelectionEnd: 9 });
    expect(got).toBe('word nex');
  });
});

// ── OtpField ────────────────────────────────────────────────────────────────────────

describe('Combobox', () => {
  it('finds an option by its description as well as its label', async () => {
    render(
      <Combobox
        label="Server"
        value={undefined}
        onChange={() => undefined}
        options={[
          { value: 'a', label: 'Atlas', description: 'eu-frankfurt-7' },
          { value: 'b', label: 'Borealis', description: 'us-oregon-2' },
        ]}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByRole('combobox', { name: 'Server' });
    await user.type(input, 'oregon');
    expect(screen.getByRole('option', { name: /Borealis/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Atlas/ })).toBeNull();
    await user.clear(input);
    await user.type(input, 'atl');
    expect(screen.getByRole('option', { name: /Atlas/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Borealis/ })).toBeNull();
  });
});

describe('OtpField', () => {
  it('takes a pasted code with spaces, completes once, and keeps only digits', async () => {
    const onComplete = vi.fn();
    function Host() {
      const [v, setV] = useState('');
      return <OtpField value={v} onChange={setV} onComplete={onComplete} />;
    }
    render(<Host />);
    const input = screen.getByLabelText('Code') as HTMLInputElement;
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await act(async () => {
      fireEvent.change(input, { target: { value: '123 456' } });
    });
    expect(input.value).toBe('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(otpDigits('12-34-5678')).toBe('123456');
  });

  it('the code is wiped on route change, context end, page hide, submit and close, with no opt-in', async () => {
    let parentValue = '';
    let showField!: (b: boolean) => void;
    const onSubmit = vi.fn();
    const { router } = await inRouter(() => {
      const [v, setV] = useState('');
      const [open, setOpen] = useState(true);
      parentValue = v;
      showField = setOpen;
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(v);
          }}
        >
          {open && <OtpField value={v} onChange={setV} />}
        </form>
      );
    });
    const code = () => screen.getByLabelText('Code') as HTMLInputElement;
    const typeIn = async (digits: string) => {
      await act(async () => {
        fireEvent.change(code(), { target: { value: digits } });
      });
      expect(code().value).toBe(digits);
    };
    await typeIn('111111');
    await act(async () => {
      await router.navigate({ to: '/elsewhere' as never });
    });
    expect(code().value).toBe('');
    await typeIn('222222');
    await act(async () => {
      bump('realm');
    });
    expect(code().value).toBe('');
    await typeIn('333333');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(code().value).toBe('');
    await typeIn('444444');
    await act(async () => {
      fireEvent.submit(code().closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledWith('444444');
    // Wiped once the next task runs (the page read it first: the test below).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(code().value).toBe('');
    await typeIn('555555');
    await act(async () => showField(false));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(parentValue).toBe('');
  });

  it('the submit wipe waits for the page: a handler that runs a microtask after the submit still reads the code', async () => {
    // In a browser, microtasks run between the form's own submit listener and React's onSubmit (delegated
    // to the root); a reader one microtask late stands in for that here.
    // `held` is what the page holds (every onChange, the wipe's included), read one microtask late.
    let held = '';
    let late: string | undefined;
    function Host() {
      const [v, setV] = useState('');
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            queueMicrotask(() => {
              late = held;
            });
          }}
        >
          <OtpField
            value={v}
            onChange={(d) => {
              held = d;
              setV(d);
            }}
          />
        </form>
      );
    }
    render(<Host />);
    const input = screen.getByLabelText('Code') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '654321' } });
    });
    await act(async () => {
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(late).toBe('654321');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(input.value).toBe('');
  });

  it('a wrong code shows under the field', () => {
    render(<OtpField value="" onChange={() => undefined} errorMessage="That code didn't work." />);
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work.");
    expect(screen.getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('CodeEditor', () => {
  const CODE = 'const a = 1;\nconst b = a +;\nreturn b;\n';
  function Ed({ problems = [], onSave, locked }: { problems?: { line: number | null; message: string }[]; onSave?: (v: string) => void; locked?: boolean }) {
    const [v, setV] = useState(CODE);
    const ed = <CodeEditor value={v} onChange={setV} problems={problems} onSave={onSave} />;
    return locked ? (
      <Form onSubmit={() => undefined} outcome="pending" onCheck={() => undefined}>
        {ed}
      </Form>
    ) : (
      ed
    );
  }
  const area = () => screen.getByRole('textbox', { name: 'Code' }) as HTMLTextAreaElement;

  it('numbers every line and marks the lines with a problem', () => {
    render(<Ed problems={[{ line: 2, message: 'Unexpected token' }]} />);
    const nums = document.querySelectorAll('[aria-hidden="true"] > div > div');
    expect(nums).toHaveLength(4);
    expect(area().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('1 problem')).toBeTruthy();
  });

  it('a problem selects its line; one without a line cannot be pressed', async () => {
    render(<Ed problems={[{ line: 2, message: 'Unexpected token' }, { line: null, message: 'Script is too long' }]} />);
    await press(screen.getByRole('button', { name: /Unexpected token/ }));
    const el = area();
    expect(el.value.slice(el.selectionStart, el.selectionEnd)).toBe('const b = a +;');
    expect((screen.getByRole('button', { name: /too long/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a problem past the last line shows without a line', () => {
    render(<Ed problems={[{ line: 99, message: 'Far away' }]} />);
    expect((screen.getByRole('button', { name: /Far away/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Ctrl F finds, counts and steps through matches', async () => {
    render(<Ed />);
    fireEvent.keyDown(area(), { key: 'f', ctrlKey: true });
    const q = screen.getByRole('searchbox', { name: 'Find' });
    await act(async () => {
      fireEvent.change(q, { target: { value: 'const' } });
    });
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.keyDown(q, { key: 'Enter' });
    expect(screen.getByText('2 of 2')).toBeTruthy();
    const el = area();
    expect(el.selectionStart).toBe(CODE.indexOf('const b'));
    fireEvent.keyDown(q, { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('Ctrl S saves; a locked form makes it read-only and refuses save', () => {
    const onSave = vi.fn();
    const { unmount } = render(<Ed onSave={onSave} />);
    fireEvent.keyDown(area(), { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith(CODE);
    unmount();
    const locked = vi.fn();
    render(<Ed onSave={locked} locked />);
    expect(area().readOnly).toBe(true);
    fireEvent.keyDown(area(), { key: 's', ctrlKey: true });
    expect(locked).not.toHaveBeenCalled();
  });

  it('Tab moves focus until "Tab key indents" is on', async () => {
    render(<Ed />);
    const first = fireEvent.keyDown(area(), { key: 'Tab' });
    expect(first).toBe(true);
    await press(screen.getByRole('button', { name: /Tab moves focus/ }));
    const second = fireEvent.keyDown(area(), { key: 'Tab' });
    expect(second).toBe(false);
  });
});
