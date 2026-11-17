// A malformed overview never throws or borrows a prototype key: null instances drop, a status counts only as an
// own BUCKET key, and a non-string autorestart reads as no policy.
import { describe, expect, it } from 'vitest';
import { programModel, programProves } from './program-model';

describe('program-model: a malformed overview', () => {
  it('drops null instances, ignores prototype statuses and non-string autorestart', () => {
    const raw = {
      programs: [{ id: 1, name: 'web', status: 'running', states_known: true, autorestart: 5, port_range: { start: 3000, end: 3001 }, instances: [null, 7, { port: 3000, status: 'constructor' }] }],
      temporary: [{ temporary_id: 'quick_1', name: 't', status: 'toString' }],
    };
    const m = programModel(raw);
    const web = m?.rows.find((r) => r.key === 'prog:1');
    expect(web?.policy).toBeNull();
    expect(web?.parts.map((p) => p.state)).toEqual(['unknown']);
    expect(m?.rows.find((r) => r.key === 'temp:quick_1')?.state).toBe('unknown');
  });

  it('programProves reads a shaped answer through wireOf (a coreSource table caches its selected value)', () => {
    const wire = { programs: [{ id: 1, name: 'web', status: 'stopped', states_known: true, instances: [{ port: 3000, status: 'stopped' }] }] };
    const shaped = { rows: 'selected' };
    const back = new Map<unknown, unknown>([[shaped, wire]]);
    expect(programProves('stop', (a) => back.get(a))({ id: '1' }, [[shaped]])).toBe('applied');
    expect(programProves('stop')({ id: '1' }, [[wire]])).toBe('applied');
    expect(programProves('stop')({ id: '1' }, [[shaped]])).toBeUndefined();
  });
});
