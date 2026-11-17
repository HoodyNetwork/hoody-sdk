// Vitest: a SettingGroup reveal row opens its editor in place (Cancel and Save in its
// foot, Escape cancels, focus goes in and comes back to the button, a rejected save keeps it open), and the danger group
// (its title names it, tone marked, last and set apart).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { TextField } from './fields';
import { SettingGroup, type SettingReveal } from './SettingGroup';
import { FormStateProvider } from './lock';
import { SettingRow } from './SettingRow';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(() => {
  boot();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Reveal(over: Partial<SettingReveal> & { grouped?: boolean }) {
  const [draft, setDraft] = useState('');
  const { grouped = true, ...rest } = over;
  const row = (
    <SettingRow
      label="Webhook address"
      help="Replace it when you move the receiver."
      reveal={{ label: 'Replace…', onSave: () => undefined, editor: <TextField label="New address" value={draft} onChange={setDraft} />, ...rest }}
    >
      <code>https://hooks.example/1</code>
    </SettingRow>
  );
  return grouped ? <SettingGroup>{row}</SettingGroup> : row;
}

describe('SettingGroup reveal row', () => {
  it('a quiet button at the row end opens the editor under the row and moves focus into it', async () => {
    const u = userEvent.setup();
    render(<Reveal />);
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    const open = screen.getByRole('button', { name: 'Replace…' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await u.click(open);
    const editor = screen.getByRole('group', { name: 'Webhook address' });
    expect(editor.closest('[data-sg-row]')).not.toBeNull();
    expect(open).not.toBeInTheDocument();
    expect(within(editor).getByRole('textbox', { name: 'New address' })).toHaveFocus();
    expect(within(editor).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('Cancel and Escape close it without saving, call onCancel and give focus back to Replace…', async () => {
    const u = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<Reveal onSave={onSave} onCancel={onCancel} />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace…' })).toHaveFocus();
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace…' })).toHaveFocus();
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape in the editor stays in the editor: the surface around it never sees it', async () => {
    const u = userEvent.setup();
    const outer = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a test listener standing in for a drawer's Escape
      <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
        <Reveal />
      </div>,
    );
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    await u.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('Save closes it; Save is off while canSave is false', async () => {
    const u = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(<Reveal onSave={onSave} canSave={false} />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    rerender(<Reveal onSave={onSave} canSave />);
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace…' })).toHaveFocus();
  });

  it('a save promise keeps it open until it settles: resolved closes, rejected stays open', async () => {
    const u = userEvent.setup();
    let settle: { ok: () => void; no: () => void } = { ok: () => undefined, no: () => undefined };
    const onSave = () =>
      new Promise<void>((ok, no) => {
        settle = { ok: () => ok(), no: () => no(new Error('refused')) };
      });
    render(<Reveal onSave={onSave} />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('group', { name: 'Webhook address' })).toBeInTheDocument();
    await act(async () => settle.no());
    expect(screen.getByRole('group', { name: 'Webhook address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await u.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => settle.ok());
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
  });

  it('outside a group the reveal row is a one-row group (the editor needs its grid)', async () => {
    const u = userEvent.setup();
    const { container } = render(<Reveal grouped={false} />);
    expect(container.querySelector('[data-setting-group]')).not.toBeNull();
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    expect(screen.getByRole('group', { name: 'Webhook address' })).toBeInTheDocument();
  });

  it('a row with a pending outcome hides its Replace… with its other actions', () => {
    render(
      <SettingGroup>
        <SettingRow label="Webhook address" outcome="pending" onCheck={() => undefined} reveal={{ label: 'Replace…', onSave: () => undefined, editor: null }}>
          x
        </SettingRow>
      </SettingGroup>,
    );
    expect(screen.queryByRole('button', { name: 'Replace…' })).toBeNull();
  });
});

describe('SettingGroup reveal row under the form lock and focus edges', () => {
  const LOCKED = { locked: true, busy: false, outcome: null };
  const FREE = { locked: false, busy: false, outcome: null };

  it('a locked form disables Replace…: the editor cannot open while a change is in flight', () => {
    render(
      <FormStateProvider value={LOCKED}>
        <Reveal />
      </FormStateProvider>,
    );
    expect(screen.getByRole('button', { name: 'Replace…' })).toBeDisabled();
  });

  it('a lock taken while the editor is open turns Save off and Save sends nothing', async () => {
    const u = userEvent.setup();
    const onSave = vi.fn();
    let lock: (on: boolean) => void = () => undefined;
    function Host() {
      const [on, setOn] = useState(false);
      lock = setOn;
      return (
        <FormStateProvider value={on ? LOCKED : FREE}>
          <Reveal onSave={onSave} />
        </FormStateProvider>
      );
    }
    render(<Host />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    act(() => lock(true));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    // a plain click event (userEvent's pointer on a disabled button leaves its press half-done for the next click)
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    act(() => lock(false));
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('opening skips a disabled or hidden first control and focuses the first one a keyboard can reach', async () => {
    const u = userEvent.setup();
    render(
      <Reveal
        editor={
          <>
            <input aria-label="Old address" disabled />
            <input type="hidden" name="k" />
            <div hidden>
              <input aria-label="Hidden" />
            </div>
            <input aria-label="New address" />
          </>
        }
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    expect(screen.getByRole('textbox', { name: 'New address' })).toHaveFocus();
  });

  it('a first control hidden by CSS (visibility hidden) is skipped too', async () => {
    const u = userEvent.setup();
    render(
      <Reveal
        editor={
          <>
            <input aria-label="Ghost" style={{ visibility: 'hidden' }} />
            <input aria-label="New address" />
          </>
        }
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    expect(screen.getByRole('textbox', { name: 'New address' })).toHaveFocus();
  });

  it('closing while the form is locked keeps focus on the row, then gives it to Replace… when the lock clears', async () => {
    const u = userEvent.setup();
    let lock: (on: boolean) => void = () => undefined;
    function Host() {
      const [on, setOn] = useState(false);
      lock = setOn;
      return (
        <FormStateProvider value={on ? LOCKED : FREE}>
          <Reveal />
        </FormStateProvider>
      );
    }
    const { container } = render(<Host />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    act(() => lock(true));
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace…' })).toBeDisabled();
    expect(document.activeElement).toBe(container.querySelector('[data-sg-row]'));
    act(() => lock(false));
    expect(screen.getByRole('button', { name: 'Replace…' })).toHaveFocus();
  });

  it('an editor whose fields are all off still takes focus inside it (its first reachable control)', async () => {
    const u = userEvent.setup();
    render(<Reveal editor={<input aria-label="Old address" disabled />} />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    // the group itself is focused (the foot's buttons come after the body; nothing in the body can take focus)
    const group = screen.getByRole('group', { name: 'Webhook address' });
    expect(group.contains(document.activeElement)).toBe(true);
  });

  it('a save that settles while the row outcome is pending keeps focus on the row, then hands it to Replace… when it returns', async () => {
    const u = userEvent.setup();
    let setPending: (on: boolean) => void = () => undefined;
    let done: () => void = () => undefined;
    const onSave = () =>
      new Promise<void>((ok) => {
        done = ok;
      });
    function Host() {
      const [pending, setP] = useState(false);
      setPending = setP;
      return (
        <SettingGroup>
          <SettingRow label="Webhook address" outcome={pending ? 'pending' : undefined} onCheck={() => undefined} reveal={{ label: 'Replace…', onSave, editor: <input aria-label="New address" /> }}>
            x
          </SettingRow>
        </SettingGroup>
      );
    }
    const { container } = render(<Host />);
    await u.click(screen.getByRole('button', { name: 'Replace…' }));
    await u.click(screen.getByRole('button', { name: 'Save' }));
    act(() => setPending(true));
    await act(async () => done());
    expect(screen.queryByRole('group', { name: 'Webhook address' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace…' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(container.querySelector('[data-sg-row]'));
    act(() => setPending(false));
    expect(screen.getByRole('button', { name: 'Replace…' })).toHaveFocus();
  });
});

describe('SettingGroup title and danger tone', () => {
  it('a title is a heading above the frame and names the group', () => {
    render(
      <SettingGroup title="Credentials">
        <SettingRow label="Token">Set</SettingRow>
      </SettingGroup>,
    );
    const h = screen.getByRole('heading', { name: 'Credentials' });
    expect(screen.getByRole('group', { name: 'Credentials' })).toBeInTheDocument();
    expect(h.closest('[data-setting-group]')).not.toBeNull();
  });

  it('the danger group is marked danger and its title names it; a plain group is not', () => {
    const { container } = render(
      <>
        <SettingGroup title="Credentials">
          <SettingRow label="Token">Set</SettingRow>
        </SettingGroup>
        <SettingGroup title="Danger zone" tone="danger">
          <SettingRow
            label="Delete this Bot"
            actions={
              <Button size="sm" tone="danger">
                Delete…
              </Button>
            }
          />
        </SettingGroup>
      </>,
    );
    const groups = [...container.querySelectorAll('[data-setting-group]')];
    expect(groups.map((g) => g.getAttribute('data-sg-tone'))).toEqual([null, 'danger']);
    expect(within(screen.getByRole('group', { name: 'Danger zone' })).getByRole('button', { name: 'Delete…' })).toBeInTheDocument();
  });

  it('an explicit label wins over the title as the group name', () => {
    render(
      <SettingGroup title="Danger zone" label="Delete the Bot" tone="danger">
        <SettingRow label="Delete">x</SettingRow>
      </SettingGroup>,
    );
    expect(screen.getByRole('group', { name: 'Delete the Bot' })).toBeInTheDocument();
  });

  it('literal shows the opener and Save as written (data words, no theme case); off by default', async () => {
    const { unmount } = render(<Reveal />);
    expect(screen.getByRole('button', { name: 'Replace…' })).not.toHaveAttribute('data-literal');
    unmount();
    render(<Reveal label="Replace api.example.com…" saveLabel="Use api.example.com" literal />);
    const open = screen.getByRole('button', { name: 'Replace api.example.com…' });
    expect(open).toHaveAttribute('data-literal', '');
    await userEvent.click(open);
    expect(screen.getByRole('button', { name: 'Use api.example.com' })).toHaveAttribute('data-literal', '');
  });
});
