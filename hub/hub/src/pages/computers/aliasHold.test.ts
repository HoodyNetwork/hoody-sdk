// The Remove alias drawer's guess at who sent an alias hold core cannot attribute (recorded before core named
// senders); with a recorded sender, core's heldBy decides (core/locked.test.tsx).
import { describe, expect, it } from 'vitest';
import { aliasLock } from '@core';
import { links as scriptsLinks } from '../scripts/links';
import { aliasSender } from './parts/aliasHold';

describe('computers: an alias hold with no recorded sender', () => {
  it('a remove names only the alias: taken as this page’s', () => {
    expect(aliasSender(aliasLock.key('a1') as Record<string, unknown>)).toBeNull();
    expect(aliasSender({ alias: 'a1' })).toBeNull();
  });
  it("Scripts' enable or disable carries the new state: Scripts sent it", () => {
    expect(aliasSender({ alias: 'a1', enabled: false })).toEqual({ page: 'scripts', path: scriptsLinks.list });
    expect(aliasSender({ alias: 'a1', enabled: true })).toEqual({ page: 'scripts', path: scriptsLinks.list });
  });
});
