// @vitest-environment node
// On AI > Claude Code, a value group whose rows have no value (only actions) kept the
// empty 240 px value track, so one wide button ("Go back to my models") left the label under the 200 px floor, the
// group stacked and the button dropped under the help at the start, while the rows of the next group kept theirs at
// the end. Such a group keeps no value track; the stacking judge reads the same width from the group.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelTrackShort } from './SettingGroup';

const css = readFileSync(join(import.meta.dirname, 'SettingGroup.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tsx = readFileSync(join(import.meta.dirname, 'SettingGroup.tsx'), 'utf8');

/** The declarations of the rule whose whole selector is `sel`. */
function rule(sel: string): string | undefined {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

const NO_VALUE_GROUP = '.group:not(.field, :has(> .row:not(.noValue)))';

describe('a value group with no value in any row', () => {
  it('sets its value track to 0 (field groups keep theirs)', () => {
    const body = rule(NO_VALUE_GROUP);
    expect(body, `no rule ${NO_VALUE_GROUP}`).toBeDefined();
    expect(body).toMatch(/--setting-value-w\s*:\s*0px\s*;/);
  });

  it('lets the outcome take the row under label and action, not the 0 px track and the action alone', () => {
    expect(rule(`${NO_VALUE_GROUP} > .row > .outcome`)).toMatch(/grid-column\s*:\s*1\s*\/\s*-1\s*;/);
  });

  it('is judged on the same track: the stacking measure reads --setting-value-w from the group', () => {
    expect(tsx).toMatch(/value: px\(cs\.getPropertyValue\(variant === 'field' \? '--setting-field-w' : '--setting-value-w'\)\)/);
    // The Claude Code group at 1440: about 700 px wide, 21 px row insets, a 218 px button, 24 px gaps.
    const m = { content: 700, padStart: 21, padEnd: 21, action: 218, gap: 24 };
    expect(labelTrackShort({ ...m, value: 240 }), 'with the empty 240 px track the group stacks').toBe(true);
    expect(labelTrackShort({ ...m, value: 0 }), 'without it the label keeps its room').toBe(false);
  });
});
