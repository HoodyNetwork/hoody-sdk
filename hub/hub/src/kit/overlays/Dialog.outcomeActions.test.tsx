// Vitest: a confirm's own pending outcome carries the page's recovery actions (`outcomeActions`, e.g. a warned Stop
// tracking), drawn on the outcome after Check again, so the page never adds a second unsure block in the body. Only with
// a pending outcome; the line's warning goes in `outcomeDetail`.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog } from './Dialog';

const dialog = (outcome: { kind: 'pending' } | { kind: 'failed' } | undefined) => (
  <ConfirmDialog
    isOpen
    onOpenChange={() => undefined}
    title="End this session?"
    confirmLabel="End session"
    tone="danger"
    onConfirm={() => undefined}
    outcome={outcome}
    onCheck={async () => false}
    outcomeDetail="It may have ended. Stop tracking only if you know it did not."
    outcomeActions={<button type="button">Stop tracking</button>}
  />
);

describe('ConfirmDialog outcomeActions', () => {
  it('pending: the actions sit on the dialog\'s own outcome, after Check again, with the detail line', () => {
    render(dialog({ kind: 'pending' }));
    const slot = document.querySelector<HTMLElement>('[data-dialog-outcome]')!;
    expect(slot).not.toBeNull();
    expect(slot).toHaveTextContent('Stop tracking only if you know it did not.');
    const names = within(slot).getAllByRole('button').map((b) => b.textContent);
    expect(names.indexOf('Stop tracking')).toBeGreaterThan(names.findIndex((n) => /Check again/.test(n ?? '')));
    expect(screen.getAllByRole('button', { name: 'Stop tracking' })).toHaveLength(1);
  });

  it('not pending: no actions drawn', () => {
    const { rerender } = render(dialog({ kind: 'failed' }));
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    rerender(dialog(undefined));
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
  });

  it('a function form gets the detail\'s id, so the action is described by the warning', () => {
    render(
      <ConfirmDialog
        isOpen
        onOpenChange={() => undefined}
        title="End this session?"
        onConfirm={() => undefined}
        outcome={{ kind: 'pending' }}
        outcomeDetail="Stop tracking only if you know it did not go through."
        outcomeActions={({ detailId }) => (
          <button type="button" aria-describedby={detailId}>
            Stop tracking
          </button>
        )}
      />,
    );
    expect(screen.getByRole('button', { name: 'Stop tracking' })).toHaveAccessibleDescription(/Stop tracking only if you know/);
  });

  it('outcomeNote: a polite live line after the actions, there (empty) before its words arrive', () => {
    const el = (note: string | null) => (
      <ConfirmDialog isOpen onOpenChange={() => undefined} title="End this session?" onConfirm={() => undefined} outcome={{ kind: 'pending' }} outcomeActions={<button type="button">Stop tracking</button>} outcomeNote={note} />
    );
    const { rerender } = render(el(null));
    const live = document.querySelector<HTMLElement>('[data-dialog-outcome-note]')!;
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('');
    const actions = document.querySelector('[data-dialog-outcome-actions]')!;
    expect(actions.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(el('Nothing was dismissed.'));
    expect(document.querySelector('[data-dialog-outcome-note]')).toBe(live);
    expect(live).toHaveTextContent('Nothing was dismissed.');
  });
});
