// Vitest: a setting row's reset-to-default cell (`reset`): one small icon button at the end of the row's action cell.
// While the value is the default it is hidden but keeps its place (visibility), so the rows' controls never shift; a
// pending outcome hides it like the row's other actions, and the form lock disables it.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';

describe('SettingRow reset', () => {
  it('shown: a "reset" button at the end of the row that calls onPress once', async () => {
    const onPress = vi.fn();
    render(
      <SettingGroup variant="field" label="Options">
        <SettingRow label="Font size" reset={{ shown: true, label: 'Reset to default', onPress }}>
          <input aria-label="Font size" />
        </SettingRow>
      </SettingGroup>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('not shown: no button to reach, but its cell keeps its place', () => {
    const { container } = render(
      <SettingGroup variant="field" label="Options">
        <SettingRow label="Font size" reset={{ shown: false, label: 'Reset to default', onPress: () => {} }}>
          <input aria-label="Font size" />
        </SettingRow>
      </SettingGroup>,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
    const cell = container.querySelector('[data-sg-reset]');
    expect(cell).not.toBeNull();
    expect(cell).toHaveAttribute('data-sg-reset', 'hidden');
  });

  it('outside a group the row draws as a one-row group, so the cell has its column', () => {
    render(
      <SettingRow label="Font size" reset={{ shown: true, label: 'Reset to default', onPress: () => {} }}>
        <input aria-label="Font size" />
      </SettingRow>,
    );
    expect(screen.getByRole('button', { name: 'Reset to default' }).closest('[data-sg-row]')).not.toBeNull();
  });

  it('a hidden reset is invisible and out of the tab order by visibility only', () => {
    const css = readFileSync(join(import.meta.dirname, 'SettingGroup.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/(?:^|\})\s*\.resetHidden\s*\{([^}]*)\}/.exec(css)?.[1] ?? '').toMatch(/visibility:\s*hidden/);
  });
});
