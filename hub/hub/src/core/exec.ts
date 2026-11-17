// exec.ts: which of a computer's Exec script folders (execIds) the Hub may address.
//
// Contract:
//   - An Exec folder is a number, 1 to EXEC_MAX: the `-exec-<n>` address of the computer and the `default/<n>/` tree of
//     its scripts. Folder 1 is the default; the Hub reaches no other folder unless a page asks for one.
//   - execIndex(n) is the kit route index guard for routes that may reach any folder (defineRoute's `index`): true only
//     for an integer 1..EXEC_MAX. Such a route has no default index, so every call names its folder or is refused.
//   - execRoot(n) is the folder's tree, root-relative: `default/<n>/`. It throws for anything execIndex refuses, so a
//     bad folder never becomes a path.
//   - execOfParam(v) reads a folder from a URL value: digits only, no leading zero, 1..EXEC_MAX; anything else is null.
//     Folders named with letters (hoody-exec allows [a-z0-9]) are not addressable here yet.
export const EXEC_DEFAULT = 1;
export const EXEC_MAX = 9999;

export const execIndex = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= EXEC_MAX;

export function execRoot(n: number): string {
  if (!execIndex(n)) throw new RangeError('exec folder out of range');
  return `default/${n}/`;
}

export function execOfParam(v: unknown): number | null {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,3}$/.test(v)) return null;
  const n = Number(v);
  return execIndex(n) ? n : null;
}
