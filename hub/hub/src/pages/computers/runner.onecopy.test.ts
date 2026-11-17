// One copy of the change runner and the subject helpers: the computers page uses core's (core/storage), the
// copies Storage and Files use, never its own; only the page's change-key adapter (useRunner's `change`) is its own.
import * as core from '@core';
import { describe, expect, it } from 'vitest';
import { subjectOf, targetOf } from './data';
import * as runner from './parts/runner';

describe('the computers page runs changes with core\'s runner and names computers with core\'s helpers', () => {
  it('subjectOf and targetOf are core\'s', () => {
    expect(subjectOf).toBe(core.subjectOf);
    expect(targetOf).toBe(core.targetOf);
  });
  it('the runner\'s helpers are core\'s', () => {
    expect(runner.asUnknown).toBe(core.asUnknown);
    expect(runner.refusal).toBe(core.refusal);
    expect(runner.useHeldOf).toBe(core.useHeldOf);
    expect(runner.useHeldChangeOf).toBe(core.useHeldChangeOf);
    expect(runner.useShownRealm).toBe(core.useShownRealm);
  });
  it('targetOf still refuses a computer whose server is unknown', () => {
    expect(() => targetOf(subjectOf({ id: 'c', project_id: 'p' }))).toThrow('NO_TARGET');
    expect(targetOf(subjectOf({ id: 'c', project_id: 'p', server_name: 'n12' }))).toEqual({ project: { id: 'p' }, container: { id: 'c', server_name: 'n12' } });
  });
});
