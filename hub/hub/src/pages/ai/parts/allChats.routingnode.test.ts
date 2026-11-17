// A page reads a containers row on a subserver (server_name = the parent routing node, server.name = the
// subserver display name) with the flat server_name only; a row with only the display name has no node.
import { describe, expect, it } from 'vitest';
import { allComputerOf, followedComputers } from './allChats.logic';

const PID = '6a0000000000000000000001';
const CID = 'c0ffee0000000000000000aa';
const row = { id: CID, name: 'atlas', status: 'running', project_id: PID, server: { name: 'sunny-red-lemur' } };
const target = (c: unknown) => followedComputers([allComputerOf(c)!], null)[0]?.target;

describe('AI all chats: a containers row on a subserver', () => {
  it('has its followed target on the parent node', () => {
    expect(target({ ...row, server_name: 'calm-otter-node-xx' })).toEqual({ project: { id: PID }, container: { id: CID, server_name: 'calm-otter-node-xx' } });
  });
  it('has no node from the subserver name alone', () => {
    expect(target(row)).toEqual({ project: { id: PID }, container: { id: CID } });
  });
});
