// Pure functions of the __ID__ page (no React, no I/O): easy to unit-test.
import type { Region, Settings, SettingsDraft } from './data';

export const REGIONS: readonly Region[] = ['eu', 'us', 'asia'];

export function draftOf(s: Settings): SettingsDraft {
  return { name: s.name, region: s.region, emailAlerts: s.emailAlerts };
}

/** Whether the draft differs from what was read (names compared trimmed); the save bar shows while it does, or while an outcome is shown. */
export function isDirty(saved: SettingsDraft, draft: SettingsDraft): boolean {
  return saved.name !== draft.name.trim() || saved.region !== draft.region || saved.emailAlerts !== draft.emailAlerts;
}
