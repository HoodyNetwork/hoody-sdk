// The dock's first-use suggestions, by the page under the dock (its first path segment).
export type SKey = 'running' | 'space' | 'update' | 'site' | 'appsList' | 'appsFail' | 'scrWrite' | 'scrFail' | 'scrSched' | 'logErr' | 'logRepeat' | 'schFail' | 'schNext' | 'notesRecent' | 'notesFind';
const SUGGEST: Record<string, readonly SKey[]> = {
  home: ['running', 'space', 'update', 'site'],
  apps: ['appsList', 'appsFail'],
  scripts: ['scrWrite', 'scrFail', 'scrSched'],
  logs: ['logErr', 'logRepeat'],
  schedules: ['schFail', 'schNext'],
  notes: ['notesRecent', 'notesFind'],
};
const S_ICON: Record<string, 'computer' | 'apps' | 'scripts' | 'logs' | 'schedules' | 'notes'> = { home: 'computer', apps: 'apps', scripts: 'scripts', logs: 'logs', schedules: 'schedules', notes: 'notes' };
export function suggestionsFor(path: string): { list: readonly SKey[]; icon: 'computer' | 'apps' | 'scripts' | 'logs' | 'schedules' | 'notes' } {
  const seg = path.split('/').filter(Boolean)[0] ?? 'home';
  // Own entries only: a path like #/constructor names an inherited Object member, never a page.
  const k = Object.hasOwn(SUGGEST, seg) ? seg : 'home';
  return { list: SUGGEST[k] as readonly SKey[], icon: S_ICON[k] ?? 'computer' };
}
