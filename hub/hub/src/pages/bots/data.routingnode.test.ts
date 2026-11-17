// A page reads a containers row on a subserver (server_name = the parent routing node, server.name = the
// subserver display name) with the flat server_name only; a row with only the display name has no node.
import { describe, expect, it } from 'vitest';
import { computerTarget, registerTargets } from './data';

const PID = '6a0000000000000000000001';
const CID = 'c0ffee0000000000000000aa';
const row = { id: CID, name: 'atlas', status: 'running', project_id: PID, server: { name: 'sunny-red-lemur' } };

describe('Bots: a containers row on a subserver', () => {
  it('has its remembered target on the parent node', () => {
    registerTargets([{ ...row, server_name: 'n12' }]);
    expect(computerTarget(CID)).toEqual({ project: { id: PID }, container: { id: CID, server_name: 'n12' } });
  });
  it('has no target from the subserver name alone', () => {
    registerTargets([row]);
    expect(computerTarget(CID)).toEqual({ project: { id: '' }, container: { id: CID } });
  });
});
