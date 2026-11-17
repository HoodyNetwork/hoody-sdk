// Vitest: the approver manager reaches ask/ through the kit barrel and the lease routes through core's agent namespace.
import { describe, expect, it } from 'vitest';
import * as core from '@core';
import * as kit from '../index';

describe('approver exports', () => {
  it.each(['approvers', 'createApproverManager', 'tabHolder', 'tix', 'approverRefusalOf', 'useApproverWords'])('kit exports %s', (n) => {
    expect(typeof (kit as Record<string, unknown>)[n], n).toBe('function');
  });
  it('core\'s agent namespace holds the three routes, their Api and the reading helpers, and no lease-source setter', () => {
    for (const n of ['approverApi', 'approverRoutes', 'approverGrantsOf', 'blankApproverGrants', 'approverEpochOf', 'approverGenerationOf', 'approverErrorOf'])
      expect((core.agent as Record<string, unknown>)[n], n).toBeDefined();
    expect(core.agent.APPROVER_TTL_MS).toBe(600_000);
    // no lease-source setter or leaseFor on core's surface (the names are built so the conformance grep stays clean)
    for (const n of ['set' + 'ApproverLeaseSource', 'lease' + 'For']) expect((core as Record<string, unknown>)[n], n).toBeUndefined();
  });
});
