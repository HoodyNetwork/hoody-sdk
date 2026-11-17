// An address, a Target and an identity take the computer's flat `server_name` (the parent routing host,
// for a computer on a subserver too) and never the nested `server.name` (the subserver's own display name, a host the
// proxy does not serve). A row without the flat name has no address.
import { afterEach, describe, expect, it } from 'vitest';
import { runningTargets } from './bots';
import { agentBaseFor, portAddress, routingNode, setProxyDomain } from './hosts';
import { subjectOf } from './storage/subject';

const PID = '6a0000000000000000000001';
const CID = 'c0ffee0000000000000000aa';
const SLICE = { id: CID, project_id: PID, status: 'running', server_name: 'node-amber', server: { name: 'sunny-red-lemur' } };

afterEach(() => {
  setProxyDomain(null);
});

describe('routingNode', () => {
  it('is the flat server_name, whatever the nested server says', () => {
    expect(routingNode(SLICE)).toBe('node-amber');
    expect(routingNode({ server_name: 'n12' })).toBe('n12');
  });

  it('is empty for a row without a flat name, and for anything that is not a name', () => {
    expect(routingNode({ server: { name: 'sunny-red-lemur' } } as { server_name?: unknown })).toBe('');
    expect(routingNode({ server_name: '' })).toBe('');
    expect(routingNode({ server_name: 7 })).toBe('');
    expect(routingNode({ server_name: null })).toBe('');
    expect(routingNode(null)).toBe('');
    expect(routingNode(undefined)).toBe('');
  });
});

describe('a computer on a subserver', () => {
  it('has its address on the parent node: the port address and the agent base', () => {
    setProxyDomain('computers.test');
    const c = { id: CID, server_name: routingNode(SLICE) };
    expect(portAddress({ id: PID }, c, 8080)).toBe(`https://${PID}-${CID}-http-8080.node-amber.computers.test`);
    expect(agentBaseFor({ id: PID }, c)).toBe(`https://${PID}-${CID}-agent-1.node-amber.computers.test`);
  });

  it('has no address when the row names only the subserver', () => {
    setProxyDomain('computers.test');
    const row = { id: CID, project_id: PID, server: { name: 'sunny-red-lemur' } };
    expect(portAddress({ id: PID }, { id: CID, server_name: routingNode(row as { server_name?: unknown }) }, 1)).toBe('');
    expect(agentBaseFor({ id: PID }, { id: CID, server_name: routingNode(row as { server_name?: unknown }) })).toBe('');
  });

  it('is a Subject on the parent node (the programs, desktops and board reads), and none from the subserver name alone', () => {
    expect(subjectOf(SLICE)).toEqual({ id: CID, project: PID, server: 'node-amber' });
    expect(subjectOf({ id: CID, project_id: PID, server: { name: 'sunny-red-lemur' } } as Parameters<typeof subjectOf>[0]).server).toBe('');
  });

  it('is a Bots-badge target on the parent node, and none from the subserver name alone', () => {
    expect(runningTargets([SLICE])).toEqual([{ project: { id: PID }, container: { id: CID, server_name: 'node-amber' } }]);
    expect(runningTargets([{ id: CID, project_id: PID, status: 'running', server: { name: 'sunny-red-lemur' } } as never])).toEqual([]);
  });
});
