// The options of the page's pickers: sorted, each saying what it is. Pure.
import type { ComputerChoice, Option, ProgramChoice, RealmColor } from '@kit';

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

export interface PickComputer { id: string; name: string; running?: boolean; location?: string; flag?: string; color?: string }

/** The kit ComputerPicker's rows: name order with the current computer first; each says its realm, place and whether
 *  it runs (in words as well as the dot), and carries its colour as listed (the picker's mark normalises it). */
export function computerChoices(list: readonly PickComputer[], currentId: string, realm: { name: string; color?: RealmColor } | null, t: (k: 'pick.running' | 'pick.stopped') => string): ComputerChoice[] {
  return list
    .slice()
    .sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : byName(a.name, b.name)))
    .map((c) => ({
      id: c.id,
      name: c.name,
      running: c.running !== false,
      state: t(c.running === false ? 'pick.stopped' : 'pick.running'),
      ...(c.location ? { place: c.location } : {}),
      ...(c.flag ? { flag: c.flag } : {}),
      ...(c.color ? { color: c.color } : {}),
      ...(realm ? { realm: realm.color ? { name: realm.name, color: realm.color } : { name: realm.name } } : {}),
    }));
}

export interface PickModel { spec: string; label: string }

/** Provider (the part of the spec before the slash), then name. A model with no shown name is numbered, never "AI model" twice. */
export function modelOptions(rows: readonly PickModel[], unnamed: (n: number) => string): Option[] {
  const provider = (s: string): string => (s.includes('/') ? s.slice(0, s.indexOf('/')) : '');
  const sorted = rows
    .map((r) => ({ value: r.spec, label: r.label, p: provider(r.spec) }))
    .sort((a, b) => byName(a.p, b.p) || byName(a.label, b.label));
  let n = 0;
  return sorted.map(({ value, label }) => ({ value, label: label || unnamed(++n) }));
}

export interface PickProgram { id: string; name: string; range?: { start: number; end: number } | null; system?: boolean }

/** The user's programs by name under one heading, then the system programs by name under theirs (the kit Select draws
 *  a heading per group, and its search finds a group by name); a range names its ports. */
export function programOptions(list: readonly PickProgram[], t: (k: 'prog.groupYours' | 'prog.groupSystem' | 'prog.ports', v?: { start: string; end: string }) => string): Option[] {
  const one = (x: PickProgram): Option => ({
    value: x.id,
    label: x.name,
    group: t(x.system ? 'prog.groupSystem' : 'prog.groupYours'),
    // A port is an identifier: plain digits, never grouped.
    ...(x.range ? { description: t('prog.ports', { start: String(x.range.start), end: String(x.range.end) }) } : {}),
  });
  const sorted = list.slice().sort((a, b) => byName(a.name, b.name));
  return [...sorted.filter((x) => !x.system), ...sorted.filter((x) => x.system)].map(one);
}

/** The kit ProgramPicker's rows: the same order, headings and port line as programOptions. */
export function programChoices(list: readonly PickProgram[], t: Parameters<typeof programOptions>[1]): ProgramChoice[] {
  return programOptions(list, t).map((o) => ({ id: o.value, name: o.label, ...(o.group ? { group: o.group } : {}), ...(o.description ? { description: o.description } : {}) }));
}

/** Saved views by name. */
export function sortedViews<T extends { name?: string }>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => byName(a.name ?? '', b.name ?? ''));
}

/** Write the model pick into a pref store; false when the store refused or threw (nothing saved). */
export function savePick(st: { read(): object; write(p: never): boolean }, spec: string): boolean {
  try { return st.write({ ...st.read(), model: spec } as never); } catch { return false; }
}
