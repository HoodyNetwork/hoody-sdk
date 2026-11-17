// A page reads a computer list row on a subserver (server_name = the parent routing node, server.name = the
// subserver display name) with the flat server_name only; a row with only the display name has no node.
import { describe, expect, it } from 'vitest';
import { computerOf } from './computers';

const row = { id: 'c0ffee0000000000000000aa', name: 'atlas', status: 'running', project_id: '6a0000000000000000000001', server: { name: 'sunny-red-lemur' } };

describe('Board: a computer list row on a subserver', () => {
  it('routes to the parent node', () => {
    expect(computerOf({ ...row, server_name: 'n12' })?.server_name).toBe('n12');
  });
  it('has no node from the subserver name alone', () => {
    expect(computerOf(row)?.server_name).toBe('');
  });
});
