// PickCard (web and terminal): standalone, the whole card is one button named by its title, tag and
// line, described by the note and the mono line; a press picks.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { PickCard } from './PickCard';

export default scenarios('PickCard', loose(PickCard), {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: { mark: 'a decorative mark (a Monogram): hidden from the tree on both' },
  cases: [
    {
      name: 'one press; named by title, tag and line; the note and mono line describe it',
      props: (s) => ({ title: 'Uptime Kuma', end: 'Web page', line: 'Uptime monitor', note: 'Watch your sites', meta: 'louislam/uptime-kuma · Node', here: 'You were here', onPress: s.fn('onPress') }),
      covers: ['title', 'end', 'line', 'note', 'meta', 'here', 'onPress'],
      steps: [{ press: { role: 'button', name: /^Uptime Kuma/ } }],
      expect: { calls: { onPress: 1 }, nodes: [{ target: { role: 'button', name: /Uptime Kuma.*Web page.*Uptime monitor/ }, description: /Watch your sites/ }] },
    },
    {
      name: 'the current choice of a set is said as pressed, and still presses',
      props: (s) => ({ title: 'Uptime Kuma', line: 'Uptime monitor', isSelected: true, onPress: s.fn('onPress') }),
      covers: ['isSelected'],
      steps: [{ press: { role: 'button', name: /^Uptime Kuma/ } }],
      expect: { calls: { onPress: 1 }, nodes: [{ target: { role: 'button', name: /^Uptime Kuma/ }, states: { pressed: true } }] },
    },
    {
      name: 'a card that cannot be picked says why and a press does nothing',
      props: (s) => ({ title: 'Uptime Kuma', line: 'Uptime monitor', meta: 'louislam/uptime-kuma', isDisabled: true, disabledReason: 'Start the computer first', onPress: s.fn('onPress') }),
      covers: ['isDisabled', 'disabledReason'],
      steps: [{ press: { role: 'button', name: /^Uptime Kuma/ }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: /^Uptime Kuma/ }, description: /Start the computer first/, states: { disabled: true } }] },
    },
  ],
});
