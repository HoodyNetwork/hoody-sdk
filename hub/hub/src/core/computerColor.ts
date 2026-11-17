// A computer's own colour: the one normaliser every style that draws it reads (kit ComputerMark, the Board
// stripe, the computer page's band). A sink never trusts that its caller normalised.

/** The computer's own colour as `#RRGGBB`, or null when it has none or it is not a hex colour (the API keeps
 * `#RRGGBB`; a missing '#', lower case and the 3-digit form are accepted). Only this value reaches a style. */
export function computerColor(c: { color?: string | undefined }): string | null {
  const m = typeof c.color === 'string' ? /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.color) : null;
  if (!m?.[1]) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return `#${hex.toUpperCase()}`;
}
