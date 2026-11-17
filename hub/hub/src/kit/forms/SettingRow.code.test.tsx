// SettingRow `code`: the setting as it is written (a directive, a flag) is one mono line under the help, in a group, in
// a switch row and outside a group. It is drawn once, it is not part of the help, and a row without it draws no line.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingGroup, SettingSwitch } from './SettingGroup';
import { SettingRow } from './SettingRow';

const rule = (file: string): string => {
  const css = readFileSync(join(import.meta.dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return /(?:^|\})\s*\.code\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
};
const times = (text: string, part: string): number => text.split(part).length - 1;

describe('SettingRow code', () => {
  it('in a group: one mono line after the help, in the label cell; the control is described by the help alone', () => {
    const { container } = render(
      <SettingGroup variant="field" label="How it runs">
        <SettingRow label="Time limit" help="Give each request at most this long." code="@timeout">
          {(ids) => <input aria-labelledby={ids.nameId} aria-describedby={ids.helpId} />}
        </SettingRow>
        <SettingRow label="Name" help="Shown in lists.">
          <input aria-label="Name" />
        </SettingRow>
      </SettingGroup>,
    );
    const rows = [...container.querySelectorAll('[data-sg-row]')];
    const lines = rows[0]!.querySelectorAll('[data-sg-code]');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.tagName).toBe('CODE');
    expect(line.textContent).toBe('@timeout');
    expect(times(rows[0]!.textContent ?? '', '@timeout')).toBe(1);
    // After the help, beside the name: the label cell holds name, help, code in that order.
    const help = rows[0]!.querySelector(`#${CSS.escape(rows[0]!.querySelector('input')!.getAttribute('aria-describedby')!)}`)!;
    expect(help.textContent).toBe('Give each request at most this long.');
    expect(help.nextElementSibling).toBe(line);
    expect(line.parentElement).toBe(rows[0]!.firstElementChild);
    expect(line.hasAttribute('title')).toBe(false);
    expect(line.hasAttribute('aria-label')).toBe(false);
    expect(rows[1]!.querySelector('[data-sg-code]')).toBeNull();
  });

  it('a row with a code and no help still draws the line', () => {
    const { container } = render(
      <SettingGroup label="g">
        <SettingRow label="Mode" code="@mode">
          value
        </SettingRow>
      </SettingGroup>,
    );
    expect(container.querySelector('[data-sg-code]')?.textContent).toBe('@mode');
  });

  it('a switch row takes it too', () => {
    const { container } = render(<SettingSwitch label="Turned on" help="Off: it stops." code="@enabled" isSelected onChange={() => undefined} />);
    const row = container.querySelector('[data-sg-row]')!;
    expect(row.querySelectorAll('[data-sg-code]')).toHaveLength(1);
    expect(times(row.textContent ?? '', '@enabled')).toBe(1);
  });

  it('outside a group: the same line under the help', () => {
    const { container } = render(
      <SettingRow label="Time limit" help="Give each request at most this long." code="@timeout">
        <input aria-label="Time limit" />
      </SettingRow>,
    );
    expect(container.querySelector('[data-sg-row]')).toBeNull();
    const lines = container.querySelectorAll('[data-sg-code]');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe('@timeout');
    expect(lines[0]!.previousElementSibling?.textContent).toBe('Give each request at most this long.');
    expect(times(container.textContent ?? '', '@timeout')).toBe(1);
  });

  it.each(['SettingGroup.module.css', 'SettingRow.module.css'])('%s: the line is mono, in a text token, and breaks anywhere', (file) => {
    const body = rule(file);
    expect(body).toMatch(/font:\s*var\(--t-mono\)/);
    expect(body).toMatch(/color:\s*var\(--hx-muted\)/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
