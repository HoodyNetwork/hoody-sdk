// FileChooser: choosing a file as a person does it (web and terminal). The host reads; the chooser
// lists the folder asked for. A file pressed once is selected, pressed again it is chosen and handed to the host;
// Cancel asks the host to close; while the host works on a choice nothing more is handed over.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { FileChooser } from './FileChooser';

const READS = {
  folder: { place: { computer: null, dir: '' }, entries: [{ name: 'docs', dir: true }, { name: 'notes.md', dir: false, size: 1200 }] },
  want: () => undefined,
};
const NOTES = { role: 'option', name: /^notes\.md/ };
type S = { fn(n: string): (...a: unknown[]) => void };
const base = (s: S, more: Record<string, unknown> = {}) => ({
  isOpen: true, onClose: s.fn('onClose'), overlayId: 'scenario-chooser', mode: 'file', reads: READS, rootLabel: '/', onChoose: s.fn('onChoose'), ...more,
});

export default scenarios('FileChooser', loose(FileChooser), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the folder is listed; a file pressed once is only selected, pressed again it is handed to the host',
      covers: ['isOpen', 'reads', 'mode', 'onChoose'],
      props: (s) => base(s),
      steps: [{ click: NOTES }, { expect: { calls: { onChoose: 0 } } }, { click: NOTES }],
      expect: { calls: { onChoose: 1, onClose: 0 }, nodes: [{ target: { role: 'dialog', name: 'Choose a file' } }, { target: { role: 'option', name: /^docs, folder/ } }] },
    },
    {
      name: 'closed, nothing is drawn',
      covers: ['isOpen'],
      props: (s) => base(s, { isOpen: false }),
      steps: [],
      expect: { nodes: [{ target: { role: 'dialog', name: 'Choose a file' }, absent: true }, { target: NOTES, absent: true }] },
    },
    {
      name: 'Cancel asks the host to close and chooses nothing',
      covers: ['onClose'],
      props: (s) => base(s),
      steps: [{ press: { role: 'button', name: 'Cancel' } }],
      expect: { calls: { onClose: 1, onChoose: 0 } },
    },
    {
      name: 'while the host works on a choice, pressing a file twice hands nothing over',
      covers: ['busy'],
      props: (s) => base(s, { busy: true }),
      steps: [{ click: NOTES }, { click: NOTES }],
      expect: { calls: { onChoose: 0 } },
    },
  ],
});
