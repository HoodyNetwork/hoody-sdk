// child-group.ts: a runner's children live in their own process groups and stop with it. The test fence refuses
// subprocesses inside tests, so the live proof is scripts/term/child-group-proof.ts (SIGTERM to a fixture runner whose
// child ignores TERM; a runner that throws): run it after changing child-group.ts. This file pins that the runners use it.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

test('check.ts and goldens.ts start every child through child-group.ts (no Bun.spawn/spawnSync of their own)', () => {
  for (const f of ['check.ts', 'goldens.ts']) {
    const t = fs.readFileSync(path.join(import.meta.dir, f), 'utf8');
    expect(t).toContain("from './child-group'");
    expect(t).toContain('installGroupReaper()');
    expect(t.replace(/\/\/.*$/gm, '')).not.toMatch(/Bun\.spawn(Sync)?\(/);
  }
});
