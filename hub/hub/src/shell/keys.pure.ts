// The shell's two-key jumps (`g` then a letter), shared by the web key handler (keys.ts), the `?` sheet
// (shortcuts.ts) and the terminal keymap (src/term/shell/keymap.ts). Data only.
export const JUMPS: Readonly<Record<string, string>> = {
  h: 'home',
  c: 'computers',
  b: 'bots',
  a: 'apps',
  p: 'programs',
  s: 'schedules',
  l: 'logs',
  n: 'notifications',
  t: 'scripts',
};

/** How long after `g` the next key is the jump's (ms). */
export const JUMP_MS = 1000;
