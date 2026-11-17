// Check's "Worth knowing" names the packages the computer's own check says it will install, when the
// check gave that list; until then (or when the check has no list) the code's own imports, built-ins left out.
import { render, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { StepCheck, type Check, type StepCheckProps } from './new/StepCheck';
import type { Snapshot } from './new/snapshot';
import type { Verdict } from './logic';
import strings from './strings.en.json';

const BYTES = "import { z } from 'zod';\nimport _ from 'lodash';\nimport fs from 'fs';\nexport default () => 1;\n";
const snap: Snapshot = { bytes: BYTES, hash: 'h', project: 'p', compId: 'c', exec: 1 };
const said = (detail: string) => strings['change.new_package'].replace('{{detail}}', detail);

function props(check: Check, holds = check.k === 'ready'): StepCheckProps {
  return {
    way: 'write', computer: 'atlas', description: '', summary: '', route: '/a', schedule: null, link: false, taken: false, snap,
    check: { check, holds, again: () => undefined },
    changed: [], code: BYTES, onCode: () => undefined, onFix: () => undefined, onBuildAgain: () => undefined, onKeep: () => undefined, codeEdited: false,
  };
}
const ready = (missing: string[]): Check => {
  const verdict: Verdict = { verdict: 'ready', errors: [], missing };
  return { k: 'ready', v: { hash: 'h', project: 'p', compId: 'c', exec: 1, verdict }, missing };
};

describe('Check: what it installs', () => {
  it('while the check runs: the code\'s imports, no built-in', () => {
    render(<StepCheck {...props({ k: 'checking' })} />);
    expect(screen.getByText(said('zod, lodash'))).toBeTruthy();
  });

  it('the check said only zod is missing: only zod', () => {
    render(<StepCheck {...props(ready(['zod']))} />);
    expect(screen.getByText(said('zod'))).toBeTruthy();
    expect(screen.queryByText(said('zod, lodash'))).toBeNull();
  });

  it('a ready check of the previous bytes (it holds no longer): the code\'s imports, not its list', () => {
    render(<StepCheck {...props(ready(['zod']), false)} />);
    expect(screen.getByText(said('zod, lodash'))).toBeTruthy();
  });

  it('the check said nothing is missing: no package line', () => {
    render(<StepCheck {...props(ready([]))} />);
    expect(screen.queryByText(/It installs a new package/)).toBeNull();
  });
});
