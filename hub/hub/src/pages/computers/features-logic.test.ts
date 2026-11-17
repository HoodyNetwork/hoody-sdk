// The pure rules of the Features section: every feature is listed, a missing value is unknown (never off), the proof of
// a change is the asked value on the computer's row, and only turning the RAM disk off is confirmed.
import { describe, expect, it } from 'vitest';
import { FEATURES, TOGGLES, expiredOf, featureValue, featureVerdict, isFeatureIdentity, needsConfirm, toggleBlock } from './features-logic';
import strings from './strings.en.json';

const ID = 'c'.repeat(24);

describe('features: what is listed', () => {
  it('lists the six features the API keeps, each with a name and one line of help', () => {
    expect([...FEATURES].sort()).toEqual(['ai', 'autostart', 'dev_kit', 'hoody_kit', 'kvm', 'ramdisk']);
    const table = strings as Record<string, string>;
    for (const id of FEATURES) {
      expect(table[`feat.${id}`]).toBeTruthy();
      expect(table[`feat.${id}.help`]).toBeTruthy();
    }
  });

  it('the switches are AI, the RAM disk and start with its server; the kits never change after the computer is made', () => {
    expect([...TOGGLES].sort()).toEqual(['ai', 'autostart', 'ramdisk']);
  });

  it('the RAM disk scope is not a feature, a switch or a string of the section', () => {
    expect((FEATURES as readonly string[]).includes('ramdisk_scope')).toBe(false);
    expect((TOGGLES as readonly string[]).includes('ramdisk_scope')).toBe(false);
    const feat = Object.entries(strings as Record<string, string>).filter(([k]) => k.startsWith('feat.'));
    expect(feat.length).toBeGreaterThan(0);
    for (const [k, v] of feat) expect(`${k} ${v}`).not.toMatch(/scope|ramdisk_scope|shared with your other computers/i);
  });

  it('a value the row does not give is unknown, never off', () => {
    expect(featureValue({ ai: true }, 'ai')).toBe(true);
    expect(featureValue({ ai: false }, 'ai')).toBe(false);
    expect(featureValue({}, 'ai')).toBeNull();
    expect(featureValue({ ai: 'yes' }, 'ai')).toBeNull();
    expect(featureValue({ ai: null }, 'ai')).toBeNull();
  });
});

describe('features: what blocks a switch before anything is sent', () => {
  it('expired first, then the session, then the frame; else nothing', () => {
    expect(toggleBlock({ expired: true, canWrite: false, framed: true })).toBe('expired');
    expect(toggleBlock({ expired: false, canWrite: false, framed: true })).toBe('noRight');
    expect(toggleBlock({ expired: false, canWrite: true, framed: true })).toBe('framed');
    expect(toggleBlock({ expired: false, canWrite: true, framed: false })).toBeNull();
  });

  it('a project proven to be someone else\'s blocks after expiry and before the session; not proven, nothing', () => {
    expect(toggleBlock({ expired: true, canWrite: true, framed: false, notOwner: true })).toBe('expired');
    expect(toggleBlock({ expired: false, canWrite: false, framed: true, notOwner: true })).toBe('notOwner');
    expect(toggleBlock({ expired: false, canWrite: true, framed: false, notOwner: false })).toBeNull();
  });

  it('expired: the server ended or was reinstalled', () => {
    expect(expiredOf({ server_expired: true, status: 'stopped' })).toBe(true);
    expect(expiredOf({ status: 'host_reinstalled' })).toBe(true);
    expect(expiredOf({ status: 'running' })).toBe(false);
  });

  it('only turning the RAM disk off is confirmed', () => {
    expect(needsConfirm('ramdisk', false)).toBe(true);
    expect(needsConfirm('ramdisk', true)).toBe(false);
    for (const f of ['ai', 'autostart'] as const) for (const on of [true, false]) expect(needsConfirm(f, on)).toBe(false);
  });
});

describe('features: the proof of a change', () => {
  const idn = { computer: ID, feature: 'ai', on: false } as const;
  it('applied only when the computer\'s row shows the asked value', () => {
    expect(featureVerdict(idn, [{ id: ID, ai: false }])).toBe('applied');
    expect(featureVerdict({ ...idn, on: true }, [{ id: ID, ai: true }])).toBe('applied');
  });

  it('the old value, a missing row, a missing or malformed field prove nothing', () => {
    expect(featureVerdict(idn, [{ id: ID, ai: true }])).toBeUndefined();
    expect(featureVerdict(idn, [{ id: 'd'.repeat(24), ai: false }])).toBeUndefined();
    expect(featureVerdict(idn, [{ id: ID }])).toBeUndefined();
    expect(featureVerdict(idn, [{ id: ID, ai: 0 }])).toBeUndefined();
    expect(featureVerdict(idn, [null, 'x', []])).toBeUndefined();
  });

  it('judges only the feature the change names', () => {
    expect(featureVerdict({ computer: ID, feature: 'ramdisk', on: false }, [{ id: ID, ai: false, ramdisk: true }])).toBeUndefined();
  });

  it('an identity that is not a feature change proves nothing', () => {
    for (const bad of [null, {}, { computer: ID, feature: 'kvm', on: true }, { computer: ID, feature: 'ramdisk_scope', on: true }, { computer: '', feature: 'ai', on: true }, { computer: ID, feature: 'ai', on: 'true' }]) {
      expect(isFeatureIdentity(bad)).toBe(false);
      expect(featureVerdict(bad, [{ id: ID, ai: true, ramdisk: true }])).toBeUndefined();
    }
  });
});
