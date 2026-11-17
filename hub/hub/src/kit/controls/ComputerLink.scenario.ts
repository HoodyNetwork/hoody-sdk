// Behaviour contract of ComputerLink, run on the web and in the terminal (src/term/scenario): the
// name is a link to the computer's page by its handle; without a handle or an id, or with `plain`, it is text. The
// full id is never shown.
import { scenarios } from '../scenario-types';
import { ComputerLink } from './ComputerLink';

const ID = '0123456789abcdef01234567';

const computerLink = scenarios('ComputerLink', ComputerLink, {
  ignored: { variant: 'read: look only (inline / nav): the terminal draws one link look', cut: 'read: look only: one line, cut at the end' },
  unsupported: {},
  cases: [
    { name: 'with a handle the name is a link', props: { name: 'ember', handle: 'ember.4567' }, steps: [], expect: { nodes: [{ target: { role: 'link', name: 'ember' } }] } },
    { name: 'with an id the name is a link and the id is never shown', props: { name: 'ember', id: ID }, steps: [], expect: { nodes: [{ target: { role: 'link', name: 'ember' } }], neverShown: [ID] } },
    { name: 'plain: the name is text, not a link', props: { name: 'ember', handle: 'ember.4567', plain: true }, steps: [], expect: { nodes: [{ target: { text: /ember/ } }, { target: { role: 'link' }, absent: true }] } },
    { name: 'no handle and no id: the name is text', props: { name: 'ember', cut: true }, steps: [], expect: { nodes: [{ target: { text: /ember/ } }, { target: { role: 'link' }, absent: true }] } },
  ],
});

export default [computerLink];
