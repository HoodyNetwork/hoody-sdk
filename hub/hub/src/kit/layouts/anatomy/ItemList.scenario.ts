// ItemList (web and terminal): a plain list of rows named by its label. A row with `onOpen` opens
// through its title; a row with `href` is a link; the status, meta and an inline action are there.
import { createElement as h } from 'react';
import { scenarios } from '../../scenario-types';
import { atRoute, loose } from '../scenarioRoute';
import { ItemList } from './ItemList';

export default scenarios('ItemList', loose(ItemList), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a row opens through its title; an inline action reports; status and meta are shown',
      props: (s) => ({
        label: 'Steps',
        items: [
          { id: 's1', title: 'Build the image', mark: '1', onOpen: s.fn('open1'), status: { tone: 'ok', label: 'Done' }, meta: ['2 min', 'yesterday'],
            actions: { inline: [{ id: 'rerun', label: 'Run again', onPress: s.fn('rerun') }] } },
          { id: 's2', title: 'Deploy', mark: '2', href: '/schedules' },
        ],
      }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['label', 'items'],
      steps: [{ press: { role: 'button', name: 'Build the image' } }, { press: { role: 'button', name: 'Run again' } }],
      expect: {
        calls: { open1: 1, rerun: 1 },
        nodes: [{ target: { role: 'list', name: 'Steps' } }, { target: { text: /Done/ } }, { target: { text: /2 min/ } }, { target: { role: 'link', name: 'Deploy' } }],
      },
    },
  ],
});
