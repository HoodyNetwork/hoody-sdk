// Programs shows each port's aliases from core's alias list (aliasList). An alias create or remove proved on
// Computers names that read in its coreReads, so the list Programs shows is read again (programs/ports.aliases.test.tsx
// shows that reading it again reaches the Programs page).
import { aliasList } from '@core';
import { describe, expect, it } from 'vitest';
import { computersTable } from './data';

describe('alias changes read core\'s alias list again', () => {
  it('alias create and alias remove both name aliasList in coreReads', () => {
    const changes = computersTable.changes!;
    expect(changes.aliasCreate!.coreReads).toContain(aliasList);
    expect(changes.aliasRemove!.coreReads).toContain(aliasList);
  });
});
