// Behaviour contract of the chat composer (web and terminal). Nothing sends unless the host says it can
// (canSend) and the person sends; Stop is its own button; the host's notes are shown as given. The terminal key rule
// (Enter sends; Alt+Enter or Ctrl+J is a new line) and paste-as-attachment are pinned by Composer.term.test.tsx.
import { createRef } from 'react';
import { scenarios } from '../scenario-types';
import { Composer, type ComposerProps } from './Composer';
import strings from './Conversation.strings.en.json';

type S = { fn(n: string): (...a: unknown[]) => void };
const base = (s: S, o: Partial<ComposerProps> = {}): ComposerProps => ({
  draft: '', setDraft: s.fn('setDraft'), inputRef: createRef<HTMLTextAreaElement>(), placeholder: 'Message your agent', max: 8000,
  canSend: true, onSend: s.fn('onSend'), notes: [], attachments: [], onRemoveAttachment: s.fn('onRemoveAttachment'),
  flash: false, onTyping: s.fn('onTyping'), ...o,
});
const box = { role: 'textbox' as const, name: strings['agent.composer'] };

export default scenarios('Composer', Composer, {
  ignored: {
    flush: 'read: look only, the inset around the box',
    plate: 'look only: the web plate frames the box on three sides for the AI start page; the terminal composer keeps its own full frame',
    screenshot: 'web only: a screenshot of a display is a picture taken and previewed in a dialog, which a terminal cannot show, so the terminal add menu has no screenshot item',
  },
  unsupported: {},
  cases: [
    {
      name: 'typing changes the draft through the host',
      covers: ['draft', 'setDraft', 'onTyping'],
      props: (s) => base(s),
      control: { value: 'draft', onChange: 'setDraft' },
      steps: [{ type: [box, 'hello'] }],
      expect: { nodes: [{ target: box, value: 'hello' }] },
    },
    {
      name: 'Send sends when the host says it can',
      covers: ['onSend', 'canSend'],
      props: (s) => base(s, { draft: 'hello' }),
      steps: [{ press: { role: 'button', name: new RegExp(strings['agent.send']) } }],
      expect: { calls: { onSend: 1 } },
    },
    {
      name: 'Send sends nothing when the host says it cannot, and says why',
      covers: ['canSend', 'sendWhy'],
      props: (s) => base(s, { draft: 'hello', canSend: false, sendWhy: 'The agent is busy' }),
      steps: [{ press: { role: 'button', name: new RegExp(strings['agent.send']) }, force: true }],
      expect: { calls: { onSend: 0 }, nodes: [{ target: { role: 'button', name: /^Send/ }, description: /The agent is busy/ }] },
    },
    {
      name: 'Stop is its own button',
      covers: ['stop'],
      props: (s) => base(s, { stop: { busy: false, onPress: s.fn('stop') } }),
      steps: [{ press: { role: 'button', name: new RegExp(strings['agent.stop']) } }],
      expect: { calls: { stop: 1, onSend: 0 } },
    },
    {
      name: 'an attachment can be removed',
      covers: ['attachments', 'onRemoveAttachment'],
      props: (s) => base(s, { attachments: [{ id: 'a1', name: 'plan.md', kind: 'text', meta: '2 lines' }] }),
      steps: [{ press: { role: 'button', name: /Remove/ } }],
      expect: { calls: { onRemoveAttachment: [['a1']] } },
    },
    {
      name: 'the host notes are shown',
      covers: ['notes'],
      props: (s) => base(s, { notes: [{ key: 'n', text: 'Paused: messages wait until it resumes.' }] }),
      steps: [],
      expect: { nodes: [{ target: { text: /Paused: messages wait/ } }] },
    },
    {
      name: '"/" on an empty draft lists the commands; picking one runs it and sends nothing',
      covers: ['slash'],
      props: (s) => base(s, { slash: { items: [{ name: 'compact', description: 'Shorten the history', run: s.fn('compact') }] } }),
      control: { value: 'draft', onChange: 'setDraft' },
      steps: [{ type: [box, '/'] }, { expect: { nodes: [{ target: { role: 'option', name: /compact/ } }] } }, { key: 'enter' }],
      expect: { calls: { compact: [['']], onSend: 0 } },
    },
    {
      name: 'Escape on an empty draft asks the host to leave',
      covers: ['onEmptyEscape'],
      props: (s) => base(s, { onEmptyEscape: s.fn('onEmptyEscape') }),
      steps: [{ focus: box }, { key: 'escape' }],
      expect: { calls: { onEmptyEscape: 1, onSend: 0 } },
    },
    {
      name: 'terminal: files are attached by path, from the + button',
      covers: ['onAddFiles'],
      only: { platform: 'term', why: 'a terminal has no file dialog: the + button opens a path line (the web opens the browser picker)' },
      props: (s) => base(s, { onAddFiles: s.fn('onAddFiles') }),
      steps: [{ press: { role: 'button', name: /Attach a file/ } }],
      expect: { nodes: [{ target: { role: 'textbox', name: /Path of the file/ } }], calls: { onAddFiles: 0 } },
    },
  ],
});
