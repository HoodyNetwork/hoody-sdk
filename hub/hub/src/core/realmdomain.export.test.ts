// Vitest: pages read the realm API domain through @core, never by importing session.ts.
import { describe, expect, it } from 'vitest';
import * as core from './index';
import { realmDomain } from './session';

describe('@core exports realmDomain', () => {
  it('is the session helper itself', () => {
    expect(core.realmDomain).toBe(realmDomain);
  });
});
