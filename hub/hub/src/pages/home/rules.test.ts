// Vitest: a page's fixture state answers the shell's own reads too. The shell reads the computer list
// through core's containers route; if the page used another route object for the same path, the state's
// rule would miss that read, the shell would fill the shared cache from core's default list, and a shot
// of "loading" or "failed" would show loaded data.
import { describe, expect, it } from 'vitest';
import { api, bootFixtureCore, containersRoute as shellRoute } from '@core';
import { loadCoreRules } from '@app/fixtures';
import { containersRoute } from './data';

describe('home fixture rules', () => {
  it('uses the containers route of core, so the shell read is slow in the loading state', async () => {
    expect(containersRoute).toBe(shellRoute);
    bootFixtureCore({ rules: await loadCoreRules(['home'], 'loading') });
    const quick = await Promise.race([api(shellRoute, { query: { page: 1, limit: 100 } }).then(() => 'answered'), new Promise((r) => setTimeout(() => r('waiting'), 150))]);
    expect(quick).toBe('waiting');
  });
});
