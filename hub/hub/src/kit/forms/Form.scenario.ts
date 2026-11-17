// Behaviour contract of Form and FormFooter, run on the web and in the terminal (src/term/scenario).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { TextField } from './fields';
import { Form, FormFooter } from './Form';

const SAVE = { role: 'button', name: 'Save' } as const;
const NAME = { role: 'textbox', name: 'Name' } as const;
/** A form with one field and a footer that may submit before an edit. */
const formBody = (C: unknown, p: Record<string, unknown>) =>
  h(C as never, p as never, h(TextField, { label: 'Name', name: 'name', defaultValue: 'ada' }), h(FormFooter, { dirty: false, requireDirty: false }));
const fm = scenarios('Form', Form, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the footer button submits the form',
      props: (s) => ({ onSubmit: s.fn('onSubmit') }),
      mount: formBody as never,
      covers: ['children'],
      steps: [{ press: SAVE }],
      expect: { calls: { onSubmit: 1 } },
    },
    {
      name: 'busy: fields lock, the button says Saving… and does not submit',
      props: (s) => ({ onSubmit: s.fn('onSubmit'), busy: true }),
      mount: formBody as never,
      steps: [{ press: { role: 'button', name: 'Saving…' }, force: true }],
      expect: { calls: { onSubmit: 0 }, nodes: [{ target: NAME, states: { disabled: true } }] },
    },
    {
      name: 'locked: nothing is sent',
      props: (s) => ({ onSubmit: s.fn('onSubmit'), locked: true }),
      mount: formBody as never,
      steps: [{ press: SAVE, force: true }],
      expect: { calls: { onSubmit: 0 }, nodes: [{ target: SAVE, states: { disabled: true } }] },
    },
    {
      name: 'a server error by field name shows on that field',
      props: (s) => ({ onSubmit: s.fn('onSubmit'), fieldErrors: { name: 'That name is taken.' } }),
      mount: formBody as never,
      steps: [],
      expect: { nodes: [{ target: NAME, states: { invalid: true }, description: 'That name is taken.' }] },
    },
    {
      name: 'an unknown outcome locks the form and offers Check again (a read, never a resend)',
      props: (s) => ({ onSubmit: s.fn('onSubmit'), outcome: 'pending', onCheck: s.fn('onCheck') }),
      mount: formBody as never,
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1, onSubmit: 0 }, nodes: [{ target: SAVE, absent: true }, { target: NAME, states: { disabled: true } }] },
    },
  ],
});

const ff = scenarios('FormFooter', FormFooter, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'dirty: says so, and Save sends',
      props: (s) => ({ dirty: true, onSubmit: s.fn('onSubmit') }),
      steps: [{ press: SAVE }],
      expect: { calls: { onSubmit: 1 }, nodes: [{ target: { text: 'Unsaved changes' } }] },
    },
    {
      name: 'not dirty: Save is unavailable',
      props: (s) => ({ dirty: false, onSubmit: s.fn('onSubmit') }),
      steps: [{ press: SAVE, force: true }],
      expect: { calls: { onSubmit: 0 }, nodes: [{ target: SAVE, states: { disabled: true } }] },
    },
    {
      name: 'submitDisabled holds Save even when dirty',
      props: (s) => ({ dirty: true, submitDisabled: true, onSubmit: s.fn('onSubmit') }),
      steps: [{ press: SAVE, force: true }],
      expect: { calls: { onSubmit: 0 } },
    },
    {
      name: 'Discard and Cancel call their handlers',
      props: (s) => ({ dirty: true, onSubmit: s.fn('onSubmit'), onDiscard: s.fn('onDiscard'), onCancel: s.fn('onCancel') }),
      steps: [{ press: { role: 'button', name: 'Discard' } }, { press: { role: 'button', name: 'Cancel' } }],
      expect: { calls: { onDiscard: 1, onCancel: 1, onSubmit: 0 } },
    },
    {
      name: 'busy: the label says Saving… and nothing is sent',
      props: (s) => ({ dirty: true, busy: true, busyLabel: 'Sending…', onSubmit: s.fn('onSubmit') }),
      steps: [{ press: { role: 'button', name: 'Sending…' }, force: true }],
      expect: { calls: { onSubmit: 0 } },
    },
    {
      name: 'pending: Check again only, Discard gone, Cancel becomes Close',
      props: (s) => ({ dirty: true, outcome: 'pending', onCheck: s.fn('onCheck'), onDiscard: s.fn('onDiscard'), onCancel: s.fn('onCancel'), onSubmit: s.fn('onSubmit') }),
      steps: [{ press: { role: 'button', name: 'Check again' } }],
      expect: { calls: { onCheck: 1, onSubmit: 0 }, nodes: [{ target: { role: 'button', name: 'Discard' }, absent: true }, { target: { role: 'button', name: 'Close' } }, { target: SAVE, absent: true }] },
    },
    {
      name: 'a custom submit label',
      props: (s) => ({ dirty: true, submitLabel: 'Create', tone: 'danger', onSubmit: s.fn('onSubmit') }),
      steps: [{ press: { role: 'button', name: 'Create' } }],
      expect: { calls: { onSubmit: 1 } },
    },
  ],
});

export default [fm, ff];
