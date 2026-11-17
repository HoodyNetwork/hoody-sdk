// VM page words that name the controls they point at, and never leave a sentence open.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';
import { powerPlan } from './power-logic';

const S = strings as Record<string, string>;
const fill = (k: string, vars: Record<string, string> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, v: string) => vars[v] ?? '');

describe('VM page words', () => {
  it('a stalled VM band names the one action it offers', () => {
    const offered = powerPlan('running', true).primary;
    expect(offered).toBe('forceStop');
    expect(S['vm.stalled']).toContain(S['power.forceStop']);
    expect(S['vm.stalled']).not.toMatch(/Shutting it down/);
  });

  it('a held key press reads as a sentence for both key buttons', () => {
    for (const key of ['screen.keys.enter', 'screen.keys.ctrlAltDel'])
      expect(fill('screen.keys.heldText', { keys: S[key]!, vm: 'atlas' }), key).not.toMatch(/^Press /);
  });

  it('a snapshot that cannot be restored and gives no reason still gets a whole sentence', () => {
    expect(S['snap.why.blockedNoReason']).toMatch(/\.$/);
    expect(fill('snap.why.blocked', { reason: '' })).toMatch(/: $/);
  });

  it('the disc reason of a starting or stopping VM tells what to do, and the name rules give their unit', () => {
    expect(S['settings.chg.why.live.notRunning']).not.toMatch(/^Shut down:/);
    expect(S['snap.take.rule']).toMatch(/^Up to 63 lower-case letters, digits and hyphens/);
    // The take drawer is one explanation region: its subtitle and this rule stay within the 150-character budget.
    expect(S['snap.take.slow']!.length + S['snap.take.rule']!.length).toBeLessThanOrEqual(150);
    expect(S['create.error.nameInvalid']).toMatch(/63 characters\.$/);
    expect(S['settings.err.memory']).toMatch(/GiB/);
    expect(S['create.preflight.listUnread']).toContain(S['create.go']);
    expect(S['host.kvm']).toBe(S['kvm.switch']);
  });

  it('cancelling a download says it was cancelled (the row stays, as cancelled)', () => {
    expect(S['images.stop.cancelled']).toBe('Download cancelled');
    expect(S['images.stop.done']).toBe('Removed from the list');
  });
});
