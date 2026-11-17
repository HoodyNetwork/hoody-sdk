// ModelPickPanel, ModelPickField and ModelPickChip (web and terminal), mounted with no computer: the
// field and the chip always name their model and say what stops a change; the panel's footer commits the draft once
// and tells the host when it is done, and Cancel only asks the host. Picks from a read catalogue, the thinking step and
// the pending and refused outcomes need the account's stores: they are pinned in ModelPick.test.tsx.
import { providers } from '@core';
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { ModelPickChip, ModelPickField, ModelPickPanel } from './ModelPick';

const GPT = { spec: 'openai/gpt-5', thinking: '' };
const FREE = { spec: 'hoody-ai/hoody-free', thinking: '' };
const NEEDS_READ = 'a pick needs a read catalogue and the account preference store: pinned in ModelPick.test.tsx and on the AI page (default.chooser.test.tsx)';
const PANEL_ON_WEB = { platform: 'web' as const, why: 'the panel mounts the chooser, which binds to the signed-in context; the terminal scenario driver opens no session (the terminal panel is pinned in ModelPick.term.test.tsx over the fixture session)' };
type S = { fn(n: string): (...a: unknown[]) => void };
/** A commit that answers done, counted. */
const commit = (s: S) => (...a: unknown[]) => { s.fn('onCommit')(...a); return { kind: 'done' }; };
const shared = (s: S) => ({ label: 'Model', catalogue: null, computer: null, rules: providers.rulesFor('bot'), purpose: 'bot', value: GPT, onCommit: commit(s) });

export default [
  scenarios('ModelPickPanel', loose(ModelPickPanel), {
    ignored: {},
    unsupported: {
      onDraft: NEEDS_READ,
      away: 'ModelChooser\'s trip on the AI page itself: pinned in ModelChooser.test.tsx',
    },
    cases: [
      {
        name: 'Use this model commits the draft once and tells the host it is done',
        only: PANEL_ON_WEB,
        covers: ['value', 'draft', 'onCommit', 'onDone'],
        props: (s) => ({ ...shared(s), draft: FREE, onDraft: s.fn('onDraft'), mode: 'saved', onDone: s.fn('onDone'), onCancel: s.fn('onCancel') }),
        steps: [{ press: { role: 'button', name: 'Use this model' } }],
        expect: { calls: { onCommit: [[FREE, null]], onDone: 1, onCancel: 0 } },
      },
      {
        name: 'Cancel only asks the host; nothing is committed',
        only: PANEL_ON_WEB,
        covers: ['onCancel'],
        props: (s) => ({ ...shared(s), draft: FREE, onDraft: s.fn('onDraft'), mode: 'saved', onCancel: s.fn('onCancel') }),
        steps: [{ press: { role: 'button', name: 'Cancel' } }],
        expect: { calls: { onCancel: 1, onCommit: 0 }, nodes: [{ target: { text: 'Choose a computer first.' } }] },
      },
      {
        name: 'disabled, a changed draft cannot be committed',
        only: PANEL_ON_WEB,
        covers: ['isDisabled'],
        props: (s) => ({ ...shared(s), draft: FREE, onDraft: s.fn('onDraft'), mode: 'saved', isDisabled: true }),
        steps: [{ press: { role: 'button', name: 'Use this model' }, force: true }],
        expect: { calls: { onCommit: 0 }, nodes: [{ target: { role: 'button', name: 'Use this model' }, states: { disabled: true } }] },
      },
    ],
  }),
  scenarios('ModelPickField', loose(ModelPickField), {
    ignored: {},
    unsupported: { onCommit: NEEDS_READ, away: 'ModelChooser\'s trip on the AI page itself: pinned in ModelChooser.test.tsx' },
    cases: [
      {
        name: 'the row names its field and offers Change; with no computer it says to choose one',
        covers: ['value', 'label'],
        props: (s) => ({ ...shared(s), resizeKey: 'scenario-model' }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'Change Model' }, states: { disabled: false } }, { target: { text: 'Choose a computer' } }] },
      },
      {
        name: 'a reason disables Change and is shown',
        covers: ['disabledReason'],
        props: (s) => ({ ...shared(s), resizeKey: 'scenario-model', disabledReason: 'Start the computer to change the model.' }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'Change Model' }, states: { disabled: true } }, { target: { text: 'Start the computer to change the model.' } }] },
      },
      {
        name: 'disabled, Change cannot be pressed',
        covers: ['isDisabled'],
        props: (s) => ({ ...shared(s), resizeKey: 'scenario-model', isDisabled: true }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'Change Model' }, states: { disabled: true } }] },
      },
    ],
  }),
  scenarios('ModelPickChip', loose(ModelPickChip), {
    ignored: {},
    unsupported: { onCommit: NEEDS_READ, away: 'ModelChooser\'s trip on the AI page itself: pinned in ModelChooser.test.tsx' },
    cases: [
      {
        name: 'the chip is a button named by its field and model',
        covers: ['value', 'label'],
        props: (s) => shared(s),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: /^Model: / }, states: { disabled: false } }] },
      },
      {
        name: 'disabled, the chip cannot be pressed',
        covers: ['isDisabled'],
        props: (s) => ({ ...shared(s), isDisabled: true }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: /^Model: / }, states: { disabled: true } }] },
      },
    ],
  }),
];
