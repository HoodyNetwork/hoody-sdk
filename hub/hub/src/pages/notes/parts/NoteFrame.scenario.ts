// NoteFrame: the web draws the note (the Notes program's own page) in a browser frame; a terminal cannot, so its twin is
// a hand-off (kit Handoff) that says why and gives the web Hub's address. The frame's source, name and focus have
// nothing to land on here; the note's own address is the header's "Open in a new tab".
import { createElement as h } from 'react';
import { atRoute, loose } from '../../../kit/layouts/scenarioRoute';
import { scenarios } from '../../../kit/scenario-types';
import { NoteFrame } from './NoteFrame';

const TERM = { platform: 'term' as const, why: 'the web draws the note in a browser frame; the hand-off exists only in a terminal' };

export default scenarios('NoteFrame', loose(NoteFrame), {
  ignored: {
    src: 'the browser frame\'s page: a terminal draws no frame (its twin is a hand-off; tabUrl names the computer)',
    title: 'the browser frame\'s accessible name: a terminal draws no frame (its twin is a hand-off)',
    focus: 'moves the keyboard into the loaded browser frame: a terminal draws no frame, so there is nothing to type into',
  },
  unsupported: {},
  cases: [
    {
      name: 'a hand-off says why the note is not drawn here',
      only: TERM,
      props: { src: 'https://example.com/note', title: 'Shopping', tabUrl: 'https://example.com/note', focus: true },
      mount: ((C: unknown, p: Record<string, unknown>) => atRoute(() => h(C as never, p), '/notes')) as never,
      steps: [],
      expect: { nodes: [{ target: { text: 'A note is a page of the Notes program in a browser frame, which a terminal cannot draw.' } }] },
    },
  ],
});
