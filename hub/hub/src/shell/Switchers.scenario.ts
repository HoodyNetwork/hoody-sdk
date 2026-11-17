// Behaviour contract of the shell's account trigger (AccountMenu), run on the web and in the terminal
// (src/term/scenario). The web draws the menu inside the component (react-aria MenuTrigger); the
// terminal draws every shell menu in one overlay (src/term/shell/Menus.tsx) that the trigger opens through the menu
// store, so the shared case holds what both do: a button named Account menu that opens its menu.
import { scenarios } from '../kit/scenario-types';
import { AccountMenu } from './Switchers';

export default scenarios('AccountMenu', AccountMenu, {
  unsupported: {
    onOpenShortcuts: "the terminal's Keyboard shortcuts row lives in the shell overlay (term/shell/Menus.tsx), not in the trigger; covered by src/term/app/shell.term.test.tsx 'account shortcuts'",
  },
  cases: [
    {
      name: 'the account button opens its menu',
      props: {},
      steps: [{ press: { role: 'button', name: 'Account menu' } }],
      expect: { nodes: [{ target: { role: 'button', name: 'Account menu' }, states: { expanded: true } }] },
    },
  ],
});
