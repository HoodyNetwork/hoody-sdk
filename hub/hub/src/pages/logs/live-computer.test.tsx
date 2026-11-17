// Vitest: on a live transport the page never reads the fixture world for its computer (see also the
// term guard src/term/app/live-pages.term.test.tsx). A chosen computer the shell's list does not hold reads as
// unnamed and running, never as the fixture computer of the same id.
import { afterEach, describe, expect, it } from 'vitest';
import { chooseComputer, dropComputer, fixtureWorld } from '@core';
import { installTransport } from '@core/transport';
import type { ShellData } from '@kit';
import { liveComputer } from './data';

const base: ShellData = { realms: [], realmId: 'all', computers: [] };

afterEach(() => { installTransport(null); dropComputer(); });

describe('logs: the live computer read', () => {
  it('reads a chosen computer the list does not hold as unnamed and running, never from fixtures', () => {
    const w = fixtureWorld.computers[0]!;
    chooseComputer(w);
    installTransport(null);
    expect(liveComputer({ project: { id: String(w.project_id) }, container: { id: w.id } }, { ...base }).data).toEqual({ id: w.id, projectId: String(w.project_id), name: '', running: true });
  });
});
