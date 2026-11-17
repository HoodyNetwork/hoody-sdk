// A Board's scroll mode as stored. Pure.
//
// Contract, in plain words:
//   - A Board is in Fit (the field absent) or Scroll (mode: 'scroll'). Only the exact value 'scroll' means Scroll;
//     anything else read from storage is Fit, so a save written before the field existed loads unchanged.
//   - withMode returns the Board with the field set for Scroll and removed for Fit: a Board put back to Fit
//     stores byte-equal to one that never left it.
export type BoardMode = 'scroll' | undefined;

/** The mode a stored value names: 'scroll', else Fit (undefined). */
export function parseMode(raw: unknown): BoardMode {
  return raw === 'scroll' ? 'scroll' : undefined;
}

/** The Board in this mode; the same object when it already is. */
export function withMode<B extends { readonly mode?: 'scroll' }>(b: B, mode: BoardMode): B {
  if (mode === 'scroll' ? b.mode === 'scroll' : !('mode' in b)) return b;
  const { mode: _old, ...rest } = b;
  void _old;
  return (mode === 'scroll' ? { ...rest, mode } : rest) as B;
}

/** The Board in this mode (the name the Board's model uses). */
export const setBoardMode = withMode;
