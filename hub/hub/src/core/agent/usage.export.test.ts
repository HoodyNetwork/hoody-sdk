// The usage api is a public core/agent export.
import { describe, expect, it } from 'vitest';
import * as agent from './index';

describe('core/agent exports for usage', () => {
  it('exports usageApi and usageRoutes', () => {
    expect(typeof agent.usageApi).toBe('function');
    expect(Object.keys(agent.usageRoutes)).toContain('session');
  });
});
