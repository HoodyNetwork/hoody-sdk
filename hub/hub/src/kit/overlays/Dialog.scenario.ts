// Behaviour contract of Dialog, ConfirmDialog and DangerConfirm (web and terminal).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { ConfirmDialog, DangerConfirm, Dialog } from './Dialog';

const FOCUS_DOM = 'focus is given back by each platform itself (the terminal opener keeps it: the page saw no key); a DOM element getter has no terminal meaning';
const LOOK = 'look only: each platform draws its own face';

const dialog = scenarios('Dialog', Dialog, {
  ignored: {
    className: 'no CSS classes in a terminal',
    portalContainer: 'a DOM node; the terminal draws every layer into its own root',
    overlayId: 'a DOM data attribute for the shell; the terminal stack keeps its own ids',
    describedBy: 'an aria-describedby id; the terminal names the dialog by its title and reads the body as text',
    returnFocus: FOCUS_DOM,
    closeFocus: FOCUS_DOM,
    primaryChip: LOOK,
  },
  unsupported: {
    initialFocus: 'where focus lands first is covered for confirms (Cancel) and fields by the terminal tests; scenarios cannot name the landing spot on both platforms',
    checking: 'a read-back in flight: drawn as busy text on Check again; covered by outcome cases',
  },
  cases: [
    {
      name: 'Cancel closes with false and never runs the primary',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary'), cancelLabel: 'Cancel', role: 'dialog', tone: 'default', body: 'Pick a new name.' }),
      steps: [{ press: { role: 'button', name: 'Cancel' } }],
      expect: { calls: { onOpenChange: [[false]], onPrimary: 0 }, nodes: [{ target: { role: 'dialog', name: 'Rename atlas' } }] },
    },
    {
      name: 'the primary runs once; the dialog stays open for its outcome',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary') }),
      steps: [{ press: { role: 'button', name: 'Rename' } }],
      expect: { calls: { onPrimary: 1, onOpenChange: 0 } },
    },
    {
      name: 'Escape closes a dismissable dialog',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'About keys', hideCancel: false, isDismissable: true }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'not dismissable: Escape does nothing',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Finish setup', primaryLabel: 'Done', onPrimary: s.fn('onPrimary'), isDismissable: false, hideCancel: true }),
      steps: [{ key: 'escape' }],
      expect: { calls: { onOpenChange: 0 }, nodes: [{ target: { role: 'button', name: 'Cancel' }, absent: true }] },
    },
    {
      name: 'busy: Escape and Cancel are refused and the primary does not run again',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary'), busy: true }),
      steps: [{ key: 'escape' }, { click: { role: 'button', name: 'Cancel' }, force: true }, { click: { role: 'button', name: /Rename/ }, force: true }],
      expect: { calls: { onOpenChange: 0, onPrimary: 0 } },
    },
    {
      name: 'a disabled primary is inert',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary'), primaryDisabled: true, primaryTone: 'default' }),
      steps: [{ click: { role: 'button', name: 'Rename' }, force: true }],
      expect: { calls: { onPrimary: 0 }, nodes: [{ target: { role: 'button', name: 'Rename' }, states: { disabled: true } }] },
    },
    {
      name: 'a done outcome closes it',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary'), outcome: { kind: 'done' } }),
      steps: [],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      name: 'a pending outcome offers Check again and never sends twice',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Rename atlas', primaryLabel: 'Rename', onPrimary: s.fn('onPrimary'), outcome: { kind: 'pending' }, onCheck: s.fn('onCheck', () => undefined) }),
      steps: [{ click: { role: 'button', name: 'Rename' }, force: true }, { press: { role: 'button', name: /Check again/ } }],
      expect: { calls: { onPrimary: 0, onCheck: 1 } },
    },
    {
      name: 'children are drawn inside',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Notes' }),
      mount: (C, p) => h(C, { ...(p as object), children: 'Inside the dialog' } as never),
      covers: ['children'],
      steps: [],
      expect: { nodes: [{ target: { text: 'Inside the dialog' } }] },
    },
  ],
});

const confirm = scenarios('ConfirmDialog', ConfirmDialog, {
  ignored: { titleMark: LOOK },
  unsupported: {},
  cases: [
    {
      name: 'a pending outcome offers Check again; the action is not sent twice',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete ping-api?', confirmLabel: 'Delete', tone: 'danger', onConfirm: s.fn('onConfirm'), outcome: { kind: 'pending' }, onCheck: s.fn('onCheck', () => undefined) }),
      steps: [{ click: { role: 'button', name: 'Delete' }, force: true }, { press: { role: 'button', name: /Check again/ } }],
      expect: { calls: { onConfirm: 0, onCheck: 1 } },
    },
    {
      name: 'Cancel closes with false; the action does not run',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete ping-api?', body: "It won't run again.", confirmLabel: 'Delete', tone: 'danger', onConfirm: s.fn('onConfirm') }),
      steps: [{ press: { role: 'button', name: 'Cancel' } }],
      expect: { calls: { onOpenChange: [[false]], onConfirm: 0 }, nodes: [{ target: { role: 'alertdialog', name: 'Delete ping-api?' } }] },
    },
    {
      name: 'the action runs once with no arguments',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Restart atlas?', confirmLabel: 'Restart', onConfirm: s.fn('onConfirm') }),
      steps: [{ press: { role: 'button', name: 'Restart' } }],
      expect: { calls: { onConfirm: [[]], onOpenChange: 0 } },
    },
    {
      name: 'busy: no close, no second run',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Restart atlas?', confirmLabel: 'Restart', onConfirm: s.fn('onConfirm'), busy: true }),
      steps: [{ key: 'escape' }, { click: { role: 'button', name: /Restart/ }, force: true }],
      expect: { calls: { onConfirm: 0, onOpenChange: 0 } },
    },
    {
      name: 'confirmDisabled keeps the action inert',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Restart atlas?', confirmLabel: 'Restart', onConfirm: s.fn('onConfirm'), confirmDisabled: true }),
      steps: [{ click: { role: 'button', name: 'Restart' }, force: true }],
      expect: { calls: { onConfirm: 0 }, nodes: [{ target: { role: 'button', name: 'Restart' }, states: { disabled: true } }] },
    },
    {
      name: 'consequences are listed; a done outcome closes',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete ping-api?', confirmLabel: 'Delete', onConfirm: s.fn('onConfirm'), consequences: ['The next run does not happen.'], outcome: { kind: 'done' } }),
      steps: [],
      expect: { calls: { onOpenChange: [[false]] } },
    },
  ],
});

const danger = scenarios('DangerConfirm', DangerConfirm, {
  ignored: { titleMark: LOOK },
  unsupported: {},
  cases: [
    {
      name: 'a pending outcome offers Check again; the action is not sent twice',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete computer atlas?', confirmText: 'atlas', confirmLabel: 'Delete computer', onConfirm: s.fn('onConfirm'), outcome: { kind: 'pending' }, onCheck: s.fn('onCheck', () => undefined) }),
      steps: [{ press: { role: 'button', name: /Check again/ } }],
      expect: { calls: { onConfirm: 0, onCheck: 1 } },
    },
    {
      name: 'the action arms only on the exact text',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete computer atlas?', confirmText: 'atlas', confirmLabel: 'Delete computer', onConfirm: s.fn('onConfirm') }),
      steps: [
        { type: [{ role: 'textbox' }, 'atla'] },
        { click: { role: 'button', name: 'Delete computer' }, force: true },
        { type: [{ role: 'textbox' }, 's'] },
        { press: { role: 'button', name: 'Delete computer' } },
      ],
      expect: { calls: { onConfirm: [[]] } },
    },
    {
      name: 'Enter in the field never confirms',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete computer atlas?', confirmText: 'atlas', confirmLabel: 'Delete computer', onConfirm: s.fn('onConfirm'), busy: false }),
      steps: [{ type: [{ role: 'textbox' }, 'atlas'] }, { key: 'enter' }],
      expect: { calls: { onConfirm: 0 } },
    },
    {
      name: 'busy: armed by the exact text, still no close and no second run',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'Delete computer atlas?', confirmText: 'atlas', confirmLabel: 'Delete computer', onConfirm: s.fn('onConfirm'), busy: true }),
      steps: [{ type: [{ role: 'textbox' }, 'atlas'] }, { key: 'escape' }, { click: { role: 'button', name: /Delete computer/ }, force: true }],
      expect: { calls: { onConfirm: 0, onOpenChange: 0 } },
    },
  ],
});

export default [dialog, confirm, danger];
