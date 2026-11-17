// ComputerPicker's rules that are not drawing: the order of the rows and the flag as letters. No React, no DOM:
// the web picker and its terminal sibling both import it (a sibling never value-imports its own web twin).
import type { ComputerChoice } from './ComputerPicker';

export const kindOf = (c: ComputerChoice) => c.stateKind ?? (c.running ? 'running' : 'stopped');

/** The group of failed and unknown-state computers. Group identities never come from a realm's name alone, so a
 *  realm called "Not running" or "No realm" stays its own group. */
export const PARKED = 'parked';

/** The rows in the order drawn, each with its group identity and heading (see ComputerPicker's contract): `current`
 *  is the shell's realm name, if any. */
export function arrangeComputers(computers: readonly ComputerChoice[], current: string | undefined, words: { notRunning: string; noRealm: string }): Array<{ c: ComputerChoice; group?: string; groupLabel?: string; underRealm?: boolean }> {
  const live = computers.filter((c) => kindOf(c) !== 'attention');
  const parked = computers.filter((c) => kindOf(c) === 'attention');
  // Realms by first appearance, the current one first; computers with no realm after every realm.
  const realms: Array<string | null> = [];
  for (const c of live) if (!realms.includes(c.realm?.name ?? null)) realms.push(c.realm?.name ?? null);
  realms.sort((a, b) => (b === current ? 1 : 0) - (a === current ? 1 : 0) || (a === null ? 1 : 0) - (b === null ? 1 : 0));
  const titled = realms.length > 1;
  const rank = (c: ComputerChoice) => realms.indexOf(c.realm?.name ?? null) * 2 + (kindOf(c) === 'running' ? 0 : 1);
  const ordered = live.map((c, at) => ({ c, at })).sort((a, b) => rank(a.c) - rank(b.c) || a.at - b.at);
  return [
    ...ordered.map(({ c }) =>
      titled ? (c.realm ? { c, group: `realm:${c.realm.name}`, groupLabel: c.realm.name, underRealm: true } : { c, group: 'norealm', groupLabel: words.noRealm }) : { c },
    ),
    ...parked.map((c) => ({ c, group: PARKED, groupLabel: words.notRunning })),
  ];
}

/** A kit countryFlag back as its two letters (kit/flag.ts). */
export { flagCode } from '../flag';
