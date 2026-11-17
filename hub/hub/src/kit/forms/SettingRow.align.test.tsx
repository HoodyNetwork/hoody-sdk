// SettingRow align="start": in a group, a tall control's label sits at the top of the row; the default stays centred.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';
import s from './SettingGroup.module.css';

const css = readFileSync(join(import.meta.dirname, 'SettingGroup.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('SettingRow align', () => {
  it('start marks the row; a plain row is not marked and no align attribute reaches the DOM', () => {
    const { container } = render(
      <SettingGroup label="Realms">
        <SettingRow label="Other realms" align="start">
          <p>list</p>
        </SettingRow>
        <SettingRow label="Name">
          <p>value</p>
        </SettingRow>
      </SettingGroup>,
    );
    const rows = [...container.querySelectorAll('[data-sg-row]')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classList.contains(s.rowStart!)).toBe(true);
    expect(rows[1]!.classList.contains(s.rowStart!)).toBe(false);
    expect(rows[0]!.hasAttribute('align')).toBe(false);
  });

  it('the rule starts the row; the default row stays centred', () => {
    expect(/(?:^|\})\s*\.rowStart\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/align-items:\s*start/);
    expect(/(?:^|\})\s*\.row\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/align-items:\s*center/);
  });
});
