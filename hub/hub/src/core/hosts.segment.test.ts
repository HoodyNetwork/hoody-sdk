// hostSegment is core's one t-{N} rule (the SDK's terminalHostLabel): exported from @core so the Board names a
// terminal tile's host the way buildPortUrl does, never a fork of the rule (Board terminal tiles 15001+).
import { describe, expect, it } from 'vitest';
import { buildPortUrl, hostSegment } from './index';
import { setProxyDomain } from './hosts';

const project = { id: '6a0000000000000000000001' };
const container = { id: 'c0a7150000000000000000a1', server_name: 'n12' };

describe('hostSegment from @core', () => {
  it('a terminal label of 63 characters keeps its protocol; one of 64 becomes t', () => {
    expect((project.id + '-' + container.id + '-terminal-' + '9999').length).toBe(63);
    expect(hostSegment(project.id, container.id, 'terminal', '9999')).toBe('terminal');
    expect(hostSegment(project.id, container.id, 'terminal', '15001')).toBe('t');
  });
  it('any other protocol is kept whatever the length', () => {
    const longCid = container.id + 'ffffffffff';
    expect((project.id + '-' + longCid + '-http-' + '15001').length).toBeGreaterThan(63);
    expect(hostSegment(project.id, longCid, 'http', '15001')).toBe('http');
  });
  it('agrees with the host label buildPortUrl builds', () => {
    setProxyDomain('proxy.example.test');
    try {
      for (const port of ['9999', '15001']) {
        const seg = hostSegment(project.id, container.id, 'terminal', port);
        expect(buildPortUrl(project, container, 'terminal', port)).toContain('//' + project.id + '-' + container.id + '-' + seg + '-' + port + '.');
      }
    } finally { setProxyDomain(null); }
  });
});
