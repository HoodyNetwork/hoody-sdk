// The shell's global keys as data, shared by the web `?` sheet and Guide (shortcuts.ts) and the terminal
// (shortcuts.term.ts, src/term/shell/keymap.ts). 'Mod' is ⌘ on Apple platforms and Ctrl elsewhere. Data only: the
// keymaps bind each row's `msg` to its action, and their tests hold every row bound.
import type strings from './strings.en.json';

export type Label = keyof typeof strings & `keys.${string}`;

export const TABLE: readonly { id: string; title: Label; rows: readonly { keys: readonly string[]; msg: Label }[] }[] = [
  {
    id: 'everywhere',
    title: 'keys.group.everywhere',
    rows: [
      { keys: ['Mod K'], msg: 'keys.palette' },
      { keys: ['/'], msg: 'keys.search' },
      { keys: ['?'], msg: 'keys.help' },
      { keys: ['['], msg: 'keys.sidebar' },
      { keys: ['Mod J'], msg: 'keys.ask' },
      { keys: ['Alt R'], msg: 'keys.realm' },
      { keys: ['Alt C'], msg: 'keys.computer' },
    ],
  },
  {
    id: 'go',
    title: 'keys.group.go',
    rows: [
      { keys: ['g', 'h'], msg: 'keys.goHome' },
      { keys: ['g', 'c'], msg: 'keys.goComputers' },
      { keys: ['g', 'b'], msg: 'keys.goBots' },
      { keys: ['g', 'a'], msg: 'keys.goApps' },
      { keys: ['g', 'p'], msg: 'keys.goPrograms' },
      { keys: ['g', 's'], msg: 'keys.goSchedules' },
      { keys: ['g', 'l'], msg: 'keys.goLogs' },
      { keys: ['g', 'n'], msg: 'keys.goNotifications' },
      { keys: ['g', 't'], msg: 'keys.goScripts' },
    ],
  },
  {
    id: 'lists',
    title: 'keys.group.lists',
    rows: [
      { keys: ['j', 'k'], msg: 'keys.move' },
      { keys: ['Enter'], msg: 'keys.open' },
      { keys: ['Space'], msg: 'keys.select' },
      { keys: ['.'], msg: 'keys.rowMenu' },
      { keys: ['\\'], msg: 'keys.hideList' },
      { keys: ['Esc'], msg: 'keys.close' },
    ],
  },
];
