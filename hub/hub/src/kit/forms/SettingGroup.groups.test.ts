// The structure SettingGroup draws between and inside groups, judged on the real stylesheet.
// - A titled group that follows another group is ruled off and takes one section gap above its title, only where
//   groups are bare (the surface sets --sg-bw to 0): groups are set apart more than the rows inside one.
// - A stacked row with no action cluster gives its value the whole row, in each of the three stacked layouts, so a
//   field ends on the same edge as the row rules and the switches around it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REAL = readFileSync(join(import.meta.dirname, 'SettingGroup.module.css'), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

/** The declarations of the first rule with exactly this selector, as `prop: value` pairs. */
function decls(css: string, selector: string): Record<string, string> {
  const text = strip(css);
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (squash(m[1] ?? '') !== selector) continue;
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = squash(d.slice(i + 1));
    }
    return out;
  }
  return out;
}

const GROUP = '.wrap ~ .wrap:has(> [data-hub-heading])';

/** What is wrong with the rule between sibling groups. */
export function groupRuleProblems(css: string): string[] {
  const d = decls(css, GROUP);
  const out: string[] = [];
  const border = d['border-block-start'];
  const pad = d['padding-block-start'];
  if (!border) out.push('no rule above a titled group that follows a group');
  else {
    if (!border.includes('var(--pop-sep)')) out.push(`rule colour: ${border}`);
    if (!border.includes('var(--sg-bw')) out.push('the rule shows on a framed group too');
  }
  if (!pad) out.push('no section gap above the title');
  else {
    if (!pad.includes('var(--sp-5)')) out.push(`section gap: ${pad}`);
    if (!pad.includes('var(--sg-bw')) out.push('the gap shows on a framed group too');
  }
  const above = d['margin-block-start'];
  if (!above || !above.includes('var(--sp-5)') || !above.includes('var(--form-gap')) out.push(`space above the rule: ${above ?? 'none'}`);
  else if (!above.includes('var(--sg-bw')) out.push('the space above shows on a framed group too');
  return out;
}

const STACKED = [
  '.group:not(.field) > .row:not(:has(> .action)) > .value',
  '.fieldWrap:where(:not([data-sg-fold])) > .field > .row:not(:has(> .action)) > .value',
  '[data-stack] > .group > .row:not(:has(> .action)) > .value',
];

/** The stacked layouts where a row without actions does not give its value the whole row. */
export function stackedValueProblems(css: string): string[] {
  return STACKED.filter((sel) => decls(css, sel)['grid-column'] !== '1 / -1');
}

const EMPTY = ':not(:has(> .control, > .actions > :not(.resetHidden)))';
const DROPPED = [
  `.fieldWrap > .field .row:not(.switchRow, .noValue) > .action${EMPTY}`,
  `.fieldWrap > .field > .row[data-sg-drop]:not(.switchRow, .noValue) > .action${EMPTY}`,
];

/** The dropped placements where a cluster holding only a hidden reset cell still takes a line. */
export function emptyDropProblems(css: string): string[] {
  return DROPPED.filter((sel) => decls(css, sel)['block-size'] !== '0' || decls(css, sel).overflow !== 'hidden');
}

describe('SettingGroup: groups and stacked rows', () => {
  it('a dropped action cluster with only a hidden reset cell takes no line', () => {
    expect(emptyDropProblems(REAL)).toEqual([]);
    expect(emptyDropProblems(`${DROPPED[0]} { block-size: 0; }`)).toEqual(DROPPED);
  });

  it('rules off a titled group that follows another group, on bare surfaces only', () => {
    expect(groupRuleProblems(REAL)).toEqual([]);
  });

  it('a stacked row with no actions gives its value the whole row', () => {
    expect(stackedValueProblems(REAL)).toEqual([]);
  });

  it('the judges see a missing rule, an always-on rule and a short value', () => {
    expect(groupRuleProblems('')).toEqual(['no rule above a titled group that follows a group', 'no section gap above the title', 'space above the rule: none']);
    expect(groupRuleProblems(`${GROUP} { border-block-start: 1px solid var(--pop-sep); padding-block-start: var(--sp-5); }`)).toEqual([
      'the rule shows on a framed group too',
      'the gap shows on a framed group too',
      'space above the rule: none',
    ]);
    expect(stackedValueProblems(`${STACKED[0]} { grid-column: 1; }`)).toEqual(STACKED);
  });
});
