// EnvRows (kit): name/value rows with masked values. The caller owns the rows and the words; Add and Remove report
// through callbacks; isDisabled holds every field and button; a value never reaches the legend, help or error line;
// as a field the help and the error stand under the control (rows, then Add); titled, the description is the group line.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@app/testing';
import { EnvRows, type EnvRow } from './EnvRows';
import css from './EnvRows.module.css';

const labels = { key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`, keyHint: 'NAME', valueHint: 'value', add: 'Add variable' };
const rows: EnvRow[] = [{ id: 7, key: 'TOKEN', value: 'tok-SECRET-9' }];

type Over = Partial<Pick<Parameters<typeof EnvRows>[0], 'rows' | 'helpBelow' | 'titled' | 'isDisabled' | 'labels'>> & { errorMessage?: string };

function draw(over: Over = {}) {
  const cb = { onEdit: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
  const r = render(<EnvRows rows={rows} label="Environment" description="Help text" labels={labels} {...cb} {...over} />);
  return { ...r, cb };
}

describe('EnvRows', () => {
  it('one row per variable, the value masked; edits, Remove and Add report by row id', async () => {
    const { cb } = draw();
    expect(screen.getByRole('group', { name: 'Environment' })).toBeInTheDocument();
    expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password');
    await userEvent.type(screen.getByRole('textbox', { name: 'Name 1' }), 'X');
    expect(cb.onEdit).toHaveBeenLastCalledWith(7, { key: 'TOKENX' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove 1' }));
    expect(cb.onRemove).toHaveBeenCalledWith(7);
    await userEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    expect(cb.onAdd).toHaveBeenCalledTimes(1);
  });

  it('as a field, the help and the error stand under the control (the rows and Add), help first, as under every kit field', () => {
    const { container } = draw({ errorMessage: 'Fix TOKEN.' });
    const kids = [...(container.querySelector('fieldset') as HTMLElement).children];
    const at = (el: Element | null) => kids.findIndex((k) => k === el || k.contains(el));
    const help = at(screen.getByText('Help text'));
    expect(at(container.querySelector('legend'))).toBe(0);
    expect(at(screen.getByRole('textbox', { name: 'Name 1' }))).toBe(1);
    expect(at(screen.getByRole('button', { name: 'Add variable' }))).toBe(2);
    expect(help).toBe(3);
    expect(at(screen.getByRole('alert'))).toBe(4);
    expect(kids).toHaveLength(5);
  });

  it('as a field, the label keeps the field label distance to its control (a legend takes no flex gap)', () => {
    const { container } = draw();
    expect(container.querySelector('legend')?.className).toContain(css.fieldLegend);
    const sheet = readFileSync(join(__dirname, 'EnvRows.module.css'), 'utf8');
    expect(/\.envEditor \.fieldLegend \{\s*margin-block-end: var\(--sp-1\);\s*\}/.test(sheet)).toBe(true);
    const titled = draw({ titled: true });
    expect(titled.container.querySelector('legend')?.className).not.toContain(css.fieldLegend);
  });

  it('with no rows the help still follows Add: it is never the line between the label and the control', () => {
    const { container } = draw({ rows: [] });
    const kids = [...(container.querySelector('fieldset') as HTMLElement).children];
    expect(kids.map((k) => k.tagName)).toEqual(['LEGEND', 'DIV', 'P']);
    expect(kids[2]).toHaveTextContent('Help text');
  });

  it('titled, the description is the group line under the title; helpBelow moves it under the control', () => {
    const pos = (c: HTMLElement) => (c.querySelector('p') as HTMLElement).compareDocumentPosition(screen.getByRole('textbox', { name: 'Name 1' }));
    const above = draw({ titled: true });
    expect(pos(above.container) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(above.container.querySelector('legend')?.nextElementSibling).toBe(above.container.querySelector('p'));
    above.unmount();
    const below = draw({ titled: true, helpBelow: true });
    expect(pos(below.container) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(below.container.querySelector('p')?.previousElementSibling).toBe(screen.getByRole('button', { name: 'Add variable' }).parentElement);
    expect(below.container.querySelectorAll('p')).toHaveLength(1);
  });

  it('isDisabled holds every field and button, and a press reports nothing', async () => {
    const { cb } = draw({ isDisabled: true });
    expect(screen.getByRole('textbox', { name: 'Name 1' })).toBeDisabled();
    expect(screen.getByLabelText('Value 1')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    expect(cb.onRemove).not.toHaveBeenCalled();
    expect(cb.onAdd).not.toHaveBeenCalled();
  });

  it('the error line is the caller’s words; no value shows outside its masked input', () => {
    const { container } = draw({ errorMessage: 'Fix TOKEN.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Fix TOKEN.');
    const shown = container.textContent ?? '';
    expect(shown).not.toContain('tok-SECRET-9');
  });
});

describe('EnvRows: the earlier word props still work while callers move', () => {
  it('legend, help and error render as label, description and errorMessage do', () => {
    const cb = { onEdit: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
    render(<EnvRows rows={[]} legend="Old name" help="Old help" error="Old error" labels={labels} {...cb} />);
    expect(screen.getByRole('group', { name: 'Old name' })).toBeInTheDocument();
    expect(screen.getByText('Old help')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Old error');
  });
});
