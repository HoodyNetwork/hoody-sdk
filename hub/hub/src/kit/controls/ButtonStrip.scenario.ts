// Behaviour contract of ButtonStrip, run on the web and in the terminal (src/term/scenario).
import type { ReactElement } from 'react';
import { scenarios, type Html, type Spies } from '../scenario-types';
import { Button } from './Button';
import { ButtonStrip, type ButtonStripProps } from './ButtonStrip';

export default scenarios('ButtonStrip', ButtonStrip, {
  cases: [
    {
      name: 'a named group; each button inside keeps its own press',
      props: { label: 'Page actions', children: null },
      mount: (C: (p: ButtonStripProps) => ReactElement | null, p: ButtonStripProps, s: Spies, h: Html) =>
        h(C as (p: never) => ReactElement | null, { ...p }, h(Button as (p: never) => ReactElement | null, { onPress: s.fn('refresh') }, 'Refresh'), h(Button as (p: never) => ReactElement | null, { onPress: s.fn('share') }, 'Share')),
      steps: [{ press: { role: 'button', name: 'Share' } }],
      expect: { calls: { refresh: 0, share: 1 }, nodes: [{ target: { role: 'group', name: 'Page actions' } }] },
    },
  ],
});
