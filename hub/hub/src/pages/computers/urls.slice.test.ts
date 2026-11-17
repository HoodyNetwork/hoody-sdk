// Every address the Computers page builds is on the parent routing node (the flat server_name), never on
// the subserver's display name (server.name); a row with only the display name has no address.
import { describe, expect, it } from 'vitest';
import { proxyUrl } from './parts/ConnectProxy';
import type { Computer } from './types';
import { desktopUrl, desktopViewerUrl, portUrl, programUrl, temporaryTerminalUrl } from './urls';

const PID = '6a0000000000000000000001';
const CID = 'c0ffee0000000000000000aa';
const slice = { id: CID, name: 'atlas', status: 'running', project_id: PID, server_name: 'n12', server: { name: 'sunny-red-lemur' } } as Computer;
const nested = { id: CID, name: 'atlas', status: 'running', project_id: PID, server: { name: 'sunny-red-lemur' } } as Computer;

describe('computer addresses on a subserver', () => {
  it('are on the parent node, whichever builder made them', () => {
    const urls = [programUrl(slice, 'files'), temporaryTerminalUrl(slice), desktopUrl(slice, 1), desktopViewerUrl(slice, 1), portUrl(slice, 8080), proxyUrl(slice)];
    for (const u of urls) {
      expect(u).toContain('.n12.');
      expect(u).not.toContain('sunny-red-lemur');
    }
  });

  it('do not exist for a row that names only the subserver', () => {
    expect([programUrl(nested, 'files'), temporaryTerminalUrl(nested), desktopUrl(nested, 1), desktopViewerUrl(nested, 1), portUrl(nested, 8080), proxyUrl(nested)]).toEqual(['', '', '', '', '', '']);
  });
});
