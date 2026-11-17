// C9 and realm views: computer.rename, computer.copy, computer.remove, computer.create and project.remove are filed
// under the realm they were sent in (the four computer locks and project.remove)
// (a cross-realm filing needs core fixes
// first, or an old realm-filed hold turns invisible after an update and a refused repeat can free a
// remove's hold). project.create and project.update keep a cross-realm filing. The SSH key and alias locks
// are shared with Keys and Scripts and keep those pages' scope.
import { describe, expect, it } from 'vitest';
import { computersTable } from './data';

const across = (k: string) => (computersTable.changes![k] as { acrossRealms?: boolean }).acrossRealms === true;

describe('computers: which locks are filed across realms', () => {
  it('rename, copy, remove, create and project remove are realm-filed', () => {
    for (const k of ['rename', 'copy', 'remove', 'create', 'projectRemove']) expect(across(k), k).toBe(false);
  });
  it('project create and update stay filed across realms', () => {
    for (const k of ['projectCreate', 'projectUpdate']) expect(across(k), k).toBe(true);
  });
  it('the locks shared with Keys and Scripts keep their sharers\' scope', () => {
    for (const k of ['sshKey', 'aliasCreate', 'aliasRemove']) expect(across(k), k).toBe(false);
  });
});
