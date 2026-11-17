// EnvRows `titled`: the legend is drawn as a group title (the SettingGroup title's type, --t-group), for env rows that sit
// among setting groups in one frame; without it the legend is a field label (TextField's, Fieldset's), not inset.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@app/testing';
import { EnvRows } from './EnvRows';
import s from './EnvRows.module.css';
import fields from './fields.module.css';

const labels = { key: (n: number) => `Name ${n}`, value: (n: number) => `Value ${n}`, remove: (n: number) => `Remove ${n}`, keyHint: 'NAME', valueHint: 'value', add: 'Add variable' };
const css = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const rule = (file: string, sel: string) => new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css(file))?.[1] ?? '';

describe('EnvRows titled', () => {
  const draw = (titled?: boolean) =>
    render(<EnvRows rows={[]} label="Environment variables" description="Help" labels={labels} onEdit={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} titled={titled} />);

  it('marks the set titled only when asked; the group keeps its legend as its name', () => {
    const { unmount } = draw(true);
    const set = screen.getByRole('group', { name: 'Environment variables' });
    expect(set.className).toContain(s.titled);
    unmount();
    draw();
    expect(screen.getByRole('group', { name: 'Environment variables' }).className).not.toContain(s.titled);
  });

  it('draws a titled legend in the type of a SettingGroup title', () => {
    const group = /font: (var\(--t-[a-z-]+\));/.exec(rule('SettingGroup.module.css', '.wrap > [data-hub-heading]'))?.[1];
    expect(group).toBe('var(--t-group)');
    expect(rule('EnvRows.module.css', '.titled legend')).toContain(`font: ${group};`);
  });

  it('untitled, the legend is a field label (the classes a TextField or Fieldset label wears), and the set is not inset', () => {
    draw();
    const legend = screen.getByRole('group', { name: 'Environment variables' }).querySelector('legend')!;
    expect(legend.className).toContain(fields.label);
    expect(legend.className).toContain(fields.legend);
    expect(rule('EnvRows.module.css', '.envEditor')).toMatch(/margin:\s*0;/);
    expect(rule('EnvRows.module.css', '.envEditor legend')).toBe('');
  });
});
