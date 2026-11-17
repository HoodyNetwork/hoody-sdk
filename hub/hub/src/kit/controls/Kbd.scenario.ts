// Behaviour contract of Kbd and Shortcut, run on the web and in the terminal (src/term/scenario).
// Key names differ on purpose (the web may show ⌘ on Apple; the terminal always spells the keys), so the cases hold
// what both share: a hint is text, never something to press.
import { scenarios } from '../scenario-types';
import { Kbd, Shortcut } from './Kbd';

const kbd = scenarios('Kbd', Kbd, {
  cases: [{ name: 'a key is drawn as text', props: { children: 'Esc' }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } }],
});

const shortcut = scenarios('Shortcut', Shortcut, {
  ignored: { 'aria-hidden': 'the terminal hint is plain text beside its control; nothing reads it twice' },
  cases: [{ name: 'a shortcut hint is text, not a control', props: { keys: 'Mod+K' }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } }],
});

export default [kbd, shortcut];
